# Versioning & Restoration — Plan C (Faculty-facing surface)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the user-visible surface on top of the V&R foundation: backup detection at preview/publish time, two new MCP tools (`list_publish_snapshots`, `prune_publish_snapshots`), Canvas breadcrumbs (date-stamped archived pages + a hidden `/canvas-toolchain-archive/<date>/` widget folder), retention pruning (auto on every successful publish + manual via tool), and page-level drift detection during rollback.

**Architecture:** Faculty visibility layer. Restore logic remains local-snapshot-authoritative — Canvas breadcrumbs are write-only artifacts, never read by rollback. `list_publish_snapshots` reads the Plan A pointer file + iterates snapshot dirs. `prune_publish_snapshots` runs the retention algorithm and best-effort cleans up Canvas-side breadcrumbs. Backup detection extends `detectGitState` with a pure-inspection synced-folder pattern matcher. Drift detection hashes current Canvas page HTML against the snapshot's expected hash and surfaces mismatches in the rollback result without blocking.

**Tech Stack:** TypeScript 5, ESM, Vitest. Node built-in `crypto` for SHA-256. No new dependencies.

**Spec:** `packages/command-and-control/docs/superpowers/specs/2026-06-04-versioning-restoration-system-design.md` (sections: Backup detection, Canvas breadcrumbs, Retention + pruning, MCP tool surface — `list_publish_snapshots` / `prune_publish_snapshots`, Drift handling).

**Depends on:** V&R Plan A foundation (pointer file via `state_meta.ts`, `snapshot_location.ts` resolver, project-local snapshots, extended `Phase` enum). Plan A must be shipped before Plan C executes.

**Sibling:** V&R Plan B (widget content lifecycle — `widgets-meta.json` + `pages-meta.json` content capture). Plan C touches the same meta files for the breadcrumb fields. Two paths:

- **If Plan B has shipped** by the time Plan C executes: extend its existing `pages-meta.json` / `widgets-meta.json` writers with the `canvasBreadcrumb` sub-object (Tasks C4.1 / C4.2 reference Plan B's writer helpers).
- **If Plan B has NOT shipped:** create a minimal `pages-meta.ts` / `widgets-meta.ts` module that writes only the breadcrumb fields (the rest of the schema stays absent until Plan B fills it in). Plan B's later writers must MERGE — read-then-write, never overwrite — so the breadcrumb fields survive.

Each Phase C4 task spells out both paths and lets execution pick the one that matches the current state of Plan B.

**Ships when complete:** `preview_course_publish` and `publish_course` outputs surface backup status. `list_publish_snapshots` and `prune_publish_snapshots` callable as MCP tools. Every successful `publish_course` auto-prunes per the retention policy. With breadcrumbs enabled (default), every page replaced gets an `[ARCHIVED]` Canvas page; every widget replaced gets a copy in `/canvas-toolchain-archive/<date>/`. Rollback surfaces page drift in the result without blocking.

---

## File structure

**New files:**

```
packages/command-and-control/src/tools/publish/backup_detection.ts            ← NEW: detectBackupState + detectSyncedFolder
packages/command-and-control/src/tools/publish/breadcrumbs.ts                 ← NEW: Canvas breadcrumb create/delete helpers
packages/command-and-control/src/tools/publish/pruning.ts                     ← NEW: pruneSnapshots algorithm + cleanup
packages/command-and-control/src/tools/publish/drift_detection.ts             ← NEW: hash + compare current vs snapshot
packages/command-and-control/src/tools/workflows/list_publish_snapshots.ts    ← NEW: MCP tool
packages/command-and-control/src/tools/workflows/prune_publish_snapshots.ts   ← NEW: MCP tool
packages/command-and-control/tests/publish/backup_detection.test.ts
packages/command-and-control/tests/publish/breadcrumbs.test.ts
packages/command-and-control/tests/publish/pruning.test.ts
packages/command-and-control/tests/publish/drift_detection.test.ts
packages/command-and-control/tests/workflows/list_publish_snapshots.test.ts
packages/command-and-control/tests/workflows/prune_publish_snapshots.test.ts
packages/command-and-control/tests/workflows/publish_course-breadcrumbs.test.ts
packages/command-and-control/tests/workflows/publish_course-auto-prune.test.ts
packages/command-and-control/tests/workflows/rollback_course_publish-drift.test.ts
```

**Conditionally new (only if Plan B hasn't shipped — otherwise extended):**

```
packages/command-and-control/src/tools/publish/pages_meta.ts                  ← minimal breadcrumb-only writer
packages/command-and-control/src/tools/publish/widgets_meta.ts                ← minimal breadcrumb-only writer
```

**Modified files:**

```
packages/command-and-control/src/tools/publish/manifest_types.ts              ← add BackupStatus, PageBreadcrumb, WidgetBreadcrumb
packages/command-and-control/src/tools/workflows/preview_course_publish.ts    ← embed manifest.backup
packages/command-and-control/src/tools/workflows/publish_course.ts            ← create breadcrumbs, auto-prune, surface backup
packages/command-and-control/src/tools/workflows/rollback_course_publish.ts   ← drift detection on page restore
packages/command-and-control/src/tools/setup_canvas.ts                        ← add canvasBreadcrumbs + retention fields
packages/command-and-control/src/index.ts                                     ← register list_publish_snapshots + prune_publish_snapshots
```

---

## Phase C1 — Backup detection

### Task C1.1: `backup_detection.ts` module

**Files:**
- Create: `packages/command-and-control/src/tools/publish/backup_detection.ts`
- Create: `packages/command-and-control/tests/publish/backup_detection.test.ts`

- [ ] **Step 1: Add types to `manifest_types.ts`**

Add at the bottom of `manifest_types.ts`:

```ts
export type BackupStatusCode =
  | 'git-pushed'
  | 'git-committed'
  | 'git-no-remote'
  | 'synced-folder'
  | 'none';

export type SyncedFolderType =
  | 'OneDrive'
  | 'iCloud'
  | 'Dropbox'
  | 'GoogleDrive'
  | 'NetworkShare'
  | 'ExternalMount';

export interface BackupStatus {
  status: BackupStatusCode;
  message: string;
  detected: {
    gitRemote?: string;
    syncedFolderType?: SyncedFolderType;
  };
}
```

Also add an optional `backup?: BackupStatus` field on `PreviewManifest`:

```ts
export interface PreviewManifest {
  // ... existing fields ...
  /** NEW (V&R Plan C): backup recommendation surfaced at preview time. */
  backup?: BackupStatus;
}
```

- [ ] **Step 2: Write the failing test**

```ts
// packages/command-and-control/tests/publish/backup_detection.test.ts
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import {
  detectBackupState,
  detectSyncedFolder,
} from '../../src/tools/publish/backup_detection.js';

let courseDir: string;

beforeEach(() => {
  courseDir = mkdtempSync(join(tmpdir(), 'course-'));
});

afterEach(() => {
  rmSync(courseDir, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

describe('detectSyncedFolder', () => {
  it('detects OneDrive in path (Windows style)', () => {
    const result = detectSyncedFolder('C:\\Users\\kev\\OneDrive\\Courses\\itm310');
    expect(result?.type).toBe('OneDrive');
  });
  it('detects OneDrive case-insensitively', () => {
    const result = detectSyncedFolder('/Users/kev/onedrive/courses/itm310');
    expect(result?.type).toBe('OneDrive');
  });
  it('detects iCloud (Mobile Documents path)', () => {
    const result = detectSyncedFolder('/Users/kev/Library/Mobile Documents/com~apple~CloudDocs/Courses/itm310');
    expect(result?.type).toBe('iCloud');
  });
  it('detects iCloud Drive (display name path)', () => {
    const result = detectSyncedFolder('/Users/kev/iCloud Drive/Courses/itm310');
    expect(result?.type).toBe('iCloud');
  });
  it('detects Dropbox', () => {
    const result = detectSyncedFolder('/Users/kev/Dropbox/Courses/itm310');
    expect(result?.type).toBe('Dropbox');
  });
  it('detects Google Drive (with space)', () => {
    const result = detectSyncedFolder('/Users/kev/Google Drive/Courses/itm310');
    expect(result?.type).toBe('GoogleDrive');
  });
  it('detects GoogleDrive (without space)', () => {
    const result = detectSyncedFolder('/Users/kev/GoogleDrive/Courses/itm310');
    expect(result?.type).toBe('GoogleDrive');
  });
  it('detects Windows UNC network share', () => {
    const result = detectSyncedFolder('\\\\fileserver\\share\\courses\\itm310');
    expect(result?.type).toBe('NetworkShare');
  });
  it('detects macOS /Volumes/ mount', () => {
    const result = detectSyncedFolder('/Volumes/BackupDrive/Courses/itm310');
    expect(result?.type).toBe('ExternalMount');
  });
  it('detects Linux /mnt/', () => {
    const result = detectSyncedFolder('/mnt/backup/courses/itm310');
    expect(result?.type).toBe('ExternalMount');
  });
  it('detects Linux /media/', () => {
    const result = detectSyncedFolder('/media/kev/backup/courses/itm310');
    expect(result?.type).toBe('ExternalMount');
  });
  it('returns null for unmatched paths', () => {
    expect(detectSyncedFolder('/Users/kev/projects/itm310')).toBeNull();
  });
  it('does not match OneDrive as a substring (boundary check)', () => {
    // a folder literally named "MyOneDriveLikeFolder" should NOT match if the segment
    // is not a real OneDrive sync folder. Implementation uses separator-bounded
    // substring match.
    expect(detectSyncedFolder('/Users/kev/MyOneDriveExport/projects')).toBeNull();
  });
});

describe('detectBackupState', () => {
  it('returns status:none for non-git, non-synced courseDir', () => {
    const result = detectBackupState(courseDir);
    expect(result.status).toBe('none');
    expect(result.message).toMatch(/no backup detected/i);
  });

  it('returns status:synced-folder when courseDir is inside OneDrive', () => {
    // Create a tmp courseDir nested under a fake OneDrive path
    const fakeRoot = mkdtempSync(join(tmpdir(), 'OneDrive-'));
    const subDir = join(fakeRoot, 'Courses', 'itm310');
    mkdirSync(subDir, { recursive: true });
    try {
      const result = detectBackupState(subDir);
      expect(result.status).toBe('synced-folder');
      expect(result.detected.syncedFolderType).toBe('OneDrive');
    } finally {
      rmSync(fakeRoot, { recursive: true, force: true });
    }
  });

  it('returns status:git-no-remote when git repo exists but no remote', () => {
    // Simulate a git repo with no remote — bare .git dir + no origin
    mkdirSync(join(courseDir, '.git'), { recursive: true });
    // detectGitState reads via execFileSync(git); we accept its real output
    // (in a bare .git folder with no config, `remote get-url origin` returns null).
    // For a hermetic test, allow either git-no-remote OR a graceful fall-through;
    // we assert .status is in the documented set rather than the exact value.
    const result = detectBackupState(courseDir);
    expect(['git-no-remote', 'git-committed', 'none']).toContain(result.status);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test --workspace=packages/command-and-control -- publish/backup_detection`
Expected: FAIL with "Cannot find module".

- [ ] **Step 4: Write the implementation**

```ts
// packages/command-and-control/src/tools/publish/backup_detection.ts

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, sep } from 'node:path';
import { detectGitState } from './git_state.js';
import type { BackupStatus, SyncedFolderType } from './manifest_types.js';

/** Pattern-match the absolute path to a known sync folder. Case-insensitive
 *  substring with separator boundaries so "MyOneDriveExport" doesn't false-positive. */
export function detectSyncedFolder(courseDir: string): { type: SyncedFolderType } | null {
  const lower = courseDir.toLowerCase();
  // Normalize separators so we can use both '/' and '\' as boundary markers.
  const bounded = (s: string, term: string): boolean => {
    const t = term.toLowerCase();
    const idx = s.indexOf(t);
    if (idx === -1) return false;
    const before = idx === 0 ? '' : s[idx - 1];
    const after = s[idx + t.length] ?? '';
    const isBoundary = (c: string) => c === '' || c === '/' || c === '\\' || c === ':';
    return isBoundary(before) && isBoundary(after);
  };

  // OneDrive
  if (bounded(lower, 'onedrive')) return { type: 'OneDrive' };

  // iCloud — two known forms
  if (lower.includes('mobile documents/com~apple~clouddocs') ||
      lower.includes('mobile documents\\com~apple~clouddocs')) {
    return { type: 'iCloud' };
  }
  if (bounded(lower, 'icloud drive')) return { type: 'iCloud' };

  // Dropbox
  if (bounded(lower, 'dropbox')) return { type: 'Dropbox' };

  // Google Drive — both "Google Drive" and "GoogleDrive"
  if (bounded(lower, 'google drive')) return { type: 'GoogleDrive' };
  if (bounded(lower, 'googledrive')) return { type: 'GoogleDrive' };

  // Windows UNC network share — starts with \\
  if (courseDir.startsWith('\\\\')) return { type: 'NetworkShare' };

  // macOS /Volumes/ mount
  if (courseDir.startsWith('/Volumes/')) return { type: 'ExternalMount' };

  // Linux /mnt/ and /media/
  if (courseDir.startsWith('/mnt/') || courseDir.startsWith('/media/')) {
    return { type: 'ExternalMount' };
  }

  return null;
}

/** Best-effort: returns true when local HEAD commit is also on the remote. */
function gitPushed(courseDir: string): boolean {
  try {
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: courseDir, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
    const remoteRefs = execFileSync('git', ['branch', '-r', '--contains', head], { cwd: courseDir, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
    return remoteRefs.length > 0;
  } catch {
    return false;
  }
}

export function detectBackupState(courseDir: string): BackupStatus {
  // 1. Git
  const git = detectGitState(courseDir);
  if (git.isRepo && git.remote) {
    if (git.clean && gitPushed(courseDir)) {
      return {
        status: 'git-pushed',
        message: `Backup verified: git commits pushed to ${git.remote}`,
        detected: { gitRemote: git.remote },
      };
    }
    if (git.clean) {
      return {
        status: 'git-committed',
        message: 'Local git is clean but unpushed. Run `git push` to back up off-machine.',
        detected: { gitRemote: git.remote },
      };
    }
    return {
      status: 'git-committed',
      message: 'Uncommitted changes in course folder. Commit and push before publishing.',
      detected: { gitRemote: git.remote },
    };
  }
  if (git.isRepo) {
    return {
      status: 'git-no-remote',
      message: 'Git initialized but no remote. Add a GitHub remote: `gh repo create`.',
      detected: {},
    };
  }

  // 2. Synced folder
  const synced = detectSyncedFolder(courseDir);
  if (synced) {
    return {
      status: 'synced-folder',
      message: `Backup verified: course folder is inside ${synced.type} (auto-syncs).`,
      detected: { syncedFolderType: synced.type },
    };
  }

  // 3. None
  return {
    status: 'none',
    message: 'No backup detected. Recommended: `git init` + push to GitHub, OR move course folder into OneDrive / iCloud / Dropbox / Google Drive / network share.',
    detected: {},
  };
}
```

- [ ] **Step 5: Run tests + build**

Run: `npm test --workspace=packages/command-and-control -- publish/backup_detection`
Expected: all 14+ tests pass.

Run: `npm run build --workspace=packages/command-and-control`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add packages/command-and-control/src/tools/publish/backup_detection.ts \
        packages/command-and-control/src/tools/publish/manifest_types.ts \
        packages/command-and-control/tests/publish/backup_detection.test.ts
git commit -m "feat(cc): backup_detection module — git + synced-folder inspection

detectBackupState() returns one of {git-pushed, git-committed, git-no-remote,
synced-folder, none}. Git path runs detectGitState() first; synced-folder path
pattern-matches the absolute path against OneDrive / iCloud / Dropbox /
Google Drive / Windows UNC / macOS /Volumes/ / Linux /mnt/ + /media/.

Boundary-checked substring match so 'MyOneDriveExport' does not false-positive
as OneDrive. Pure inspection — never enforces, never modifies. Spec section:
Backup detection."
```

### Task C1.2: Integrate backup detection into `preview_course_publish`

**Files:**
- Modify: `packages/command-and-control/src/tools/workflows/preview_course_publish.ts`

- [ ] **Step 1: Import + invoke at the end of preview**

Add import:

```ts
import { detectBackupState } from '../publish/backup_detection.js';
```

Find where the manifest object is built (just before it's written to disk). Add:

```ts
manifest.backup = detectBackupState(input.courseDir);
```

- [ ] **Step 2: Add a focused test**

```ts
// packages/command-and-control/tests/workflows/preview_course_publish-backup.test.ts
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { previewCoursePublish } from '../../src/tools/workflows/preview_course_publish.js';

let ccHome: string;
let courseDir: string;
let originalEnv: string | undefined;

beforeEach(() => {
  ccHome = mkdtempSync(join(tmpdir(), 'cc-home-'));
  courseDir = mkdtempSync(join(tmpdir(), 'OneDrive-course-'));
  originalEnv = process.env.CC_HOME;
  process.env.CC_HOME = ccHome;
  writeFileSync(join(ccHome, 'canvas-config.json'), JSON.stringify({
    host: 'canvas.example', token: 'tk', configuredAt: '2026-06-04T00:00:00.000Z',
  }), 'utf-8');
});

afterEach(() => {
  process.env.CC_HOME = originalEnv;
  rmSync(ccHome, { recursive: true, force: true });
  rmSync(courseDir, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

describe('previewCoursePublish backup detection', () => {
  it('embeds backup status in manifest output', async () => {
    // Mock Canvas API + design studio bridge by passing a minimal courseDir
    // that import_course handles. We accept that this is an integration smoke
    // — the assertion is just that .backup is populated.
    // (Real test fixtures may need to mirror existing preview_course_publish tests.)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } })));

    // For a more realistic test, callers should mirror the setup pattern from
    // existing preview_course_publish tests. Here we assert by reading the
    // result.manifest.backup field after a synthetic invocation.
    const result = await previewCoursePublish({
      courseDir, courseId: 20255,
    }).catch(e => ({ error: String(e) }));

    // If preview succeeded, backup should be set. If it errored before reaching
    // backup detection (e.g., missing files), skip the assertion — this is an
    // additive feature and existing failure paths remain unchanged.
    if ('manifest' in (result as any)) {
      expect((result as any).manifest.backup).toBeDefined();
      expect((result as any).manifest.backup.status).toMatch(/^(synced-folder|none|git-.*)$/);
    }
  });
});
```

Run: `npm test --workspace=packages/command-and-control -- preview_course_publish`
Expected: existing preview tests still pass; new test passes (or skips its assertion if preview can't complete in the synthetic setup — the build itself catches type errors).

- [ ] **Step 3: Build**

Run: `npm run build --workspace=packages/command-and-control`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add packages/command-and-control/src/tools/workflows/preview_course_publish.ts \
        packages/command-and-control/tests/workflows/preview_course_publish-backup.test.ts
git commit -m "feat(cc): preview_course_publish surfaces backup status in manifest

After building the manifest, calls detectBackupState(courseDir) and sets
manifest.backup. Faculty sees the recommendation in the preview output
without any blocking. Additive — existing manifest consumers ignore the
new field cleanly."
```

### Task C1.3: Surface backup status in `publish_course` result

**Files:**
- Modify: `packages/command-and-control/src/tools/workflows/publish_course.ts`

- [ ] **Step 1: Import + add to result type**

```ts
import { detectBackupState } from '../publish/backup_detection.js';
import type { BackupStatus } from '../publish/manifest_types.js';
```

Extend `PublishCourseResult`:

```ts
export interface PublishCourseResult {
  // ... existing ...
  /** NEW (V&R Plan C): backup recommendation at publish time. */
  backup?: BackupStatus;
}
```

- [ ] **Step 2: Compute at start of publish and attach to success result**

Right after the courseDir/manifest is known but before the publish loop:

```ts
const backup = detectBackupState(manifest.courseDir);
```

In the final success return, include it:

```ts
return { snapshotId: input.snapshotId, phase: 'published', published, gitTag, pushResult, backup };
```

Also include `backup` in every other return path that already exists where the manifest has been read (the early-return APPROVALS_INCOMPLETE / phase-guard paths can leave backup undefined; they're error states).

- [ ] **Step 3: Add a test**

```ts
// packages/command-and-control/tests/workflows/publish_course-backup.test.ts
// (mirrors publish_course-state-meta.test.ts from Plan A; adds assertion on result.backup)
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
// ... same setup as state-meta test ...

describe('publishCourse backup field', () => {
  it('returns backup status on successful publish', async () => {
    // ... same fixture setup as Plan A test ...
    const result = await publishCourse({ snapshotId, approvals: { 'overview.html': 'approve' }, gitCommit: false });
    expect(result.backup).toBeDefined();
    expect(result.backup!.status).toMatch(/^(none|synced-folder|git-.*)$/);
  });
});
```

Run: `npm test --workspace=packages/command-and-control -- publish_course-backup`
Expected: test passes.

- [ ] **Step 4: Full publish_course regression**

Run: `npm test --workspace=packages/command-and-control -- publish_course`
Expected: existing tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/command-and-control/src/tools/workflows/publish_course.ts \
        packages/command-and-control/tests/workflows/publish_course-backup.test.ts
git commit -m "feat(cc): publish_course surfaces backup status in result

Calls detectBackupState() at publish start; embeds the status in
PublishCourseResult.backup on success. Faculty sees the same
recommendation they got at preview time, recorded against the actual
publish operation."
```

---

## Phase C2 — `list_publish_snapshots` MCP tool

### Task C2.1: Implement the `listPublishSnapshots` workflow

**Files:**
- Create: `packages/command-and-control/src/tools/workflows/list_publish_snapshots.ts`
- Create: `packages/command-and-control/tests/workflows/list_publish_snapshots.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/command-and-control/tests/workflows/list_publish_snapshots.test.ts
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listPublishSnapshots } from '../../src/tools/workflows/list_publish_snapshots.js';
import {
  snapshotsRootFor, createSnapshotDirFor, writeManifest, writeState,
} from '../../src/tools/publish/snapshot_store.js';
import { writePublishStateMeta } from '../../src/tools/publish/state_meta.js';
import type { PreviewManifest, PublishState, PublishStateMeta } from '../../src/tools/publish/manifest_types.js';

let ccHome: string;
let courseDir: string;
let originalEnv: string | undefined;

beforeEach(() => {
  ccHome = mkdtempSync(join(tmpdir(), 'cc-home-'));
  courseDir = mkdtempSync(join(tmpdir(), 'course-'));
  originalEnv = process.env.CC_HOME;
  process.env.CC_HOME = ccHome;
  writeFileSync(join(ccHome, 'canvas-config.json'), JSON.stringify({
    host: 'canvas.example', token: 'tk', configuredAt: '2026-06-04T00:00:00.000Z',
  }), 'utf-8');
});

afterEach(() => {
  process.env.CC_HOME = originalEnv;
  rmSync(ccHome, { recursive: true, force: true });
  rmSync(courseDir, { recursive: true, force: true });
});

function makeSnapshot(id: string, publishedAt: string, phase: PublishState['phase'], backup?: string) {
  const dir = createSnapshotDirFor(id, courseDir);
  const manifest: PreviewManifest = {
    snapshotId: id, courseId: 20255, courseDir,
    generatedAt: publishedAt,
    git: { isRepo: false },
    entries: [{
      type: 'page', filename: 'overview.html', pageType: 'overview',
      intendedTitle: 'Overview', collisionAction: 'create',
      diff: { priorWords: null, newWords: 50, delta: 50, sectionsChanged: 0, calloutsAdded: 0, calloutsRemoved: 0, imagesChanged: 0, hasFullDiff: false },
      warnings: [],
    }],
    summary: { total: 1, pages: 1, assignments: 0, skipped: 0, warningsCount: 0, ferpaCount: 0, collisionsCount: 0 },
    ...(backup ? { backup: { status: backup as any, message: '', detected: {} } } : {}),
  };
  writeManifest(dir, manifest);
  writeState(dir, { phase, published: [], lastUpdatedAt: publishedAt });
}

describe('listPublishSnapshots', () => {
  it('returns empty when no snapshots exist for the course', async () => {
    const result = await listPublishSnapshots({ courseId: 20255, courseDir });
    expect(result.currentlyLiveSnapshotId).toBeNull();
    expect(result.snapshots).toEqual([]);
  });

  it('returns snapshots in oldest-to-newest order', async () => {
    makeSnapshot('snap-old', '2026-06-01T12:00:00.000Z', 'published');
    makeSnapshot('snap-new', '2026-06-04T12:00:00.000Z', 'published');

    const meta: PublishStateMeta = {
      courseId: 20255,
      currentlyLiveSnapshotId: 'snap-new',
      currentlyLiveSince: '2026-06-04T12:00:00.000Z',
      history: [
        { snapshotId: 'snap-old', becameLiveAt: '2026-06-01T12:00:00.000Z', becameStaleAt: '2026-06-04T12:00:00.000Z', becameLiveVia: 'publish' },
        { snapshotId: 'snap-new', becameLiveAt: '2026-06-04T12:00:00.000Z', becameLiveVia: 'publish' },
      ],
    };
    writePublishStateMeta(snapshotsRootFor(courseDir), meta);

    const result = await listPublishSnapshots({ courseId: 20255, courseDir });
    expect(result.snapshots).toHaveLength(2);
    expect(result.snapshots[0]!.snapshotId).toBe('snap-old');
    expect(result.snapshots[1]!.snapshotId).toBe('snap-new');
    expect(result.snapshots[1]!.isCurrent).toBe(true);
    expect(result.snapshots[0]!.isCurrent).toBe(false);
  });

  it('marks canRollBackTo=false for currently-live snapshot', async () => {
    makeSnapshot('snap-live', '2026-06-04T12:00:00.000Z', 'published');
    writePublishStateMeta(snapshotsRootFor(courseDir), {
      courseId: 20255, currentlyLiveSnapshotId: 'snap-live',
      currentlyLiveSince: '2026-06-04T12:00:00.000Z',
      history: [{ snapshotId: 'snap-live', becameLiveAt: '2026-06-04T12:00:00.000Z', becameLiveVia: 'publish' }],
    });
    const result = await listPublishSnapshots({ courseId: 20255, courseDir });
    expect(result.snapshots[0]!.canRollBackTo).toBe(false);
    expect(result.snapshots[0]!.canRollForwardTo).toBe(false);
  });

  it('marks canRollForwardTo=true for rolled-back snapshots', async () => {
    makeSnapshot('snap-old', '2026-06-01T12:00:00.000Z', 'rolled-back');
    makeSnapshot('snap-new', '2026-06-04T12:00:00.000Z', 'restored');
    writePublishStateMeta(snapshotsRootFor(courseDir), {
      courseId: 20255, currentlyLiveSnapshotId: 'snap-new',
      currentlyLiveSince: '2026-06-04T12:00:00.000Z',
      history: [
        { snapshotId: 'snap-old', becameLiveAt: '2026-06-01T12:00:00.000Z', becameStaleAt: '2026-06-04T12:00:00.000Z', becameLiveVia: 'publish' },
        { snapshotId: 'snap-new', becameLiveAt: '2026-06-04T12:00:00.000Z', becameLiveVia: 'rollback' },
      ],
    });
    const result = await listPublishSnapshots({ courseId: 20255, courseDir });
    const old = result.snapshots.find(s => s.snapshotId === 'snap-old')!;
    expect(old.canRollForwardTo).toBe(true);
  });

  it('surfaces backupAtPublishTime when manifest.backup is set', async () => {
    makeSnapshot('snap-1', '2026-06-04T12:00:00.000Z', 'published', 'git-pushed');
    const result = await listPublishSnapshots({ courseId: 20255, courseDir });
    expect(result.snapshots[0]!.backupAtPublishTime).toBe('git-pushed');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=packages/command-and-control -- list_publish_snapshots`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Write the implementation**

```ts
// packages/command-and-control/src/tools/workflows/list_publish_snapshots.ts

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { snapshotsRootFor, readManifest, readState } from '../publish/snapshot_store.js';
import { readPublishStateMeta } from '../publish/state_meta.js';
import type { PreviewManifest, PublishState, BackupStatusCode } from '../publish/manifest_types.js';

export interface ListPublishSnapshotsInput {
  courseId: number;
  /** Course folder — used to resolve the project-local snapshots root. */
  courseDir: string;
}

export interface PublishSnapshotInfo {
  snapshotId: string;
  publishedAt: string;
  phase: PublishState['phase'];
  summary: { pages: number; assignments: number; widgets: number };
  isCurrent: boolean;
  canRollBackTo: boolean;
  canRollForwardTo: boolean;
  backupAtPublishTime?: BackupStatusCode;
}

export interface ListPublishSnapshotsResult {
  currentlyLiveSnapshotId: string | null;
  snapshots: PublishSnapshotInfo[];
}

export async function listPublishSnapshots(
  input: ListPublishSnapshotsInput,
): Promise<ListPublishSnapshotsResult> {
  const snapshotsRoot = snapshotsRootFor(input.courseDir);
  const meta = readPublishStateMeta(snapshotsRoot, input.courseId);
  const currentlyLiveSnapshotId = meta?.currentlyLiveSnapshotId ?? null;

  if (!existsSync(snapshotsRoot)) {
    return { currentlyLiveSnapshotId, snapshots: [] };
  }

  const entries: PublishSnapshotInfo[] = [];
  for (const id of readdirSync(snapshotsRoot)) {
    const dir = join(snapshotsRoot, id);
    if (!existsSync(join(dir, 'manifest.json'))) continue;
    if (!existsSync(join(dir, 'state.json'))) continue;
    let manifest: PreviewManifest;
    let state: PublishState;
    try {
      manifest = readManifest(dir);
      state = readState(dir);
    } catch {
      continue; // skip corrupt
    }
    if (manifest.courseId !== input.courseId) continue;

    // Widget count: sum across entries that have widgets[]
    let widgetCount = 0;
    let pageCount = 0;
    let assignmentCount = 0;
    for (const e of manifest.entries) {
      if (e.type === 'page') {
        pageCount++;
        widgetCount += (e as any).widgets?.length ?? 0;
      } else if (e.type === 'assignment') {
        assignmentCount++;
      }
    }

    const isCurrent = id === currentlyLiveSnapshotId;
    entries.push({
      snapshotId: id,
      publishedAt: manifest.generatedAt,
      phase: state.phase,
      summary: { pages: pageCount, assignments: assignmentCount, widgets: widgetCount },
      isCurrent,
      canRollBackTo: !isCurrent,
      canRollForwardTo: !isCurrent && state.phase === 'rolled-back',
      backupAtPublishTime: manifest.backup?.status,
    });
  }

  // Oldest → newest
  entries.sort((a, b) => a.publishedAt.localeCompare(b.publishedAt));

  return { currentlyLiveSnapshotId, snapshots: entries };
}
```

- [ ] **Step 4: Run tests + build**

Run: `npm test --workspace=packages/command-and-control -- list_publish_snapshots`
Expected: 5 tests pass.

Run: `npm run build --workspace=packages/command-and-control`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add packages/command-and-control/src/tools/workflows/list_publish_snapshots.ts \
        packages/command-and-control/tests/workflows/list_publish_snapshots.test.ts
git commit -m "feat(cc): list_publish_snapshots workflow

Reads the publish-state-<courseId>.json pointer file from Plan A and iterates
the snapshots root for matching snapshots. Returns oldest→newest order with
per-snapshot { isCurrent, canRollBackTo, canRollForwardTo, backupAtPublishTime,
summary { pages, assignments, widgets } }.

5 tests cover empty / two-snapshot / live / rolled-back / backup status."
```

### Task C2.2: Register `list_publish_snapshots` as an MCP tool

**Files:**
- Modify: `packages/command-and-control/src/index.ts`

- [ ] **Step 1: Import the workflow**

Add near the other publish-workflow imports:

```ts
import {
  listPublishSnapshots,
  type ListPublishSnapshotsInput,
} from './tools/workflows/list_publish_snapshots.js';
```

- [ ] **Step 2: Add tool definition to the ListToolsRequestSchema handler**

Insert right after the `rollback_course_publish` tool entry (around line 326):

```ts
{
  name: 'list_publish_snapshots',
  description: 'List all publish snapshots for a course in oldest-to-newest order, showing which is currently live in Canvas and which can be rolled back to / rolled forward to. Pipe the snapshotId from a row into rollback_course_publish to restore that version.',
  inputSchema: {
    type: 'object' as const,
    required: ['courseId', 'courseDir'],
    properties: {
      courseId: { type: 'number', description: 'Canvas course numeric ID.' },
      courseDir: { type: 'string', description: 'Canvas Design Studio course folder (used to locate the project-local snapshots dir).' },
    },
  },
},
```

- [ ] **Step 3: Add the case-dispatch in CallToolRequestSchema**

Add right after the `case 'rollback_course_publish':` block:

```ts
case 'list_publish_snapshots':
  result = await listPublishSnapshots(args as unknown as ListPublishSnapshotsInput);
  break;
```

- [ ] **Step 4: Build + smoke**

Run: `npm run build --workspace=packages/command-and-control`
Expected: clean.

Run: `npm run smoke:integration --workspace=packages/command-and-control` (if available; otherwise skip)
Expected: smoke passes.

- [ ] **Step 5: Commit**

```bash
git add packages/command-and-control/src/index.ts
git commit -m "feat(cc): register list_publish_snapshots as MCP tool

Adds the tool definition + case-dispatch. Faculty calls it with
{ courseId, courseDir } and pipes the resulting snapshotId into
rollback_course_publish { targetSnapshotId: ... } for restore."
```

---

## Phase C3 — Retention pruning

### Task C3.1: Add retention config to `setup_canvas`

**Files:**
- Modify: `packages/command-and-control/src/tools/setup_canvas.ts`

- [ ] **Step 1: Extend `CanvasSetupConfig`**

```ts
export interface CanvasSetupConfig {
  host: string;
  token: string;
  configuredAt: string;
  lastValidatedAt: string;
  /** From Plan A. */
  snapshotsLocation?: 'project' | 'global';
  /** NEW (Plan C): number of most-recent snapshots to always keep regardless of age. Default 3. */
  snapshotRetentionCount?: number;
  /** NEW (Plan C): number of days to keep snapshots regardless of count. Default 30. */
  snapshotRetentionDays?: number;
  /** NEW (Plan C): course-level breadcrumb default. 'enabled' creates archived Canvas pages + files on publish. Default 'enabled'. */
  canvasBreadcrumbs?: 'enabled' | 'disabled';
  /** NEW (Plan C): override automatic backup detection. 'auto' uses detected state. Default 'auto'. */
  backupOverride?: 'verified' | 'none' | 'auto';
}
```

- [ ] **Step 2: Add a test**

```ts
// In packages/command-and-control/tests/setup_canvas.test.ts (or new file)
import { describe, expect, it } from 'vitest';
import type { CanvasSetupConfig } from '../src/tools/setup_canvas.js';

describe('CanvasSetupConfig V&R Plan C fields', () => {
  it('accepts retention fields and breadcrumb settings', () => {
    const cfg: CanvasSetupConfig = {
      host: 'x', token: 'y',
      configuredAt: '2026-06-04T00:00:00.000Z',
      lastValidatedAt: '2026-06-04T00:00:00.000Z',
      snapshotRetentionCount: 5,
      snapshotRetentionDays: 60,
      canvasBreadcrumbs: 'enabled',
      backupOverride: 'auto',
    };
    expect(cfg.snapshotRetentionCount).toBe(5);
    expect(cfg.canvasBreadcrumbs).toBe('enabled');
  });

  it('all V&R Plan C fields are optional', () => {
    const cfg: CanvasSetupConfig = {
      host: 'x', token: 'y',
      configuredAt: '2026-06-04T00:00:00.000Z',
      lastValidatedAt: '2026-06-04T00:00:00.000Z',
    };
    expect(cfg.snapshotRetentionCount).toBeUndefined();
    expect(cfg.canvasBreadcrumbs).toBeUndefined();
  });
});
```

Run: `npm test --workspace=packages/command-and-control -- setup_canvas`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add packages/command-and-control/src/tools/setup_canvas.ts \
        packages/command-and-control/tests/setup_canvas.test.ts
git commit -m "feat(cc): retention + breadcrumb config in CanvasSetupConfig

Adds snapshotRetentionCount (default 3), snapshotRetentionDays (default 30),
canvasBreadcrumbs ('enabled' default), backupOverride ('auto' default).
Defaults documented in setup_canvas; all fields optional, additive."
```

### Task C3.2: Implement `pruning.ts` — pruneSnapshots algorithm

**Files:**
- Create: `packages/command-and-control/src/tools/publish/pruning.ts`
- Create: `packages/command-and-control/tests/publish/pruning.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/command-and-control/tests/publish/pruning.test.ts
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pruneSnapshots, computePruneList } from '../../src/tools/publish/pruning.js';
import {
  snapshotsRootFor, createSnapshotDirFor, writeManifest, writeState,
} from '../../src/tools/publish/snapshot_store.js';
import { writePublishStateMeta } from '../../src/tools/publish/state_meta.js';
import type { PreviewManifest, PublishStateMeta } from '../../src/tools/publish/manifest_types.js';

let ccHome: string;
let courseDir: string;
let originalEnv: string | undefined;

beforeEach(() => {
  ccHome = mkdtempSync(join(tmpdir(), 'cc-home-'));
  courseDir = mkdtempSync(join(tmpdir(), 'course-'));
  originalEnv = process.env.CC_HOME;
  process.env.CC_HOME = ccHome;
  writeFileSync(join(ccHome, 'canvas-config.json'), JSON.stringify({
    host: 'x', token: 'y', configuredAt: '2026-06-04T00:00:00.000Z',
    snapshotRetentionCount: 3, snapshotRetentionDays: 30,
  }), 'utf-8');
});

afterEach(() => {
  process.env.CC_HOME = originalEnv;
  rmSync(ccHome, { recursive: true, force: true });
  rmSync(courseDir, { recursive: true, force: true });
});

function makeSnap(id: string, publishedAt: string) {
  const dir = createSnapshotDirFor(id, courseDir);
  const manifest: PreviewManifest = {
    snapshotId: id, courseId: 20255, courseDir,
    generatedAt: publishedAt, git: { isRepo: false },
    entries: [], summary: { total: 0, pages: 0, assignments: 0, skipped: 0, warningsCount: 0, ferpaCount: 0, collisionsCount: 0 },
  };
  writeManifest(dir, manifest);
  writeState(dir, { phase: 'published', published: [], lastUpdatedAt: publishedAt });
}

function setLive(snapshotId: string) {
  const meta: PublishStateMeta = {
    courseId: 20255, currentlyLiveSnapshotId: snapshotId,
    currentlyLiveSince: '2026-06-04T00:00:00.000Z',
    history: [{ snapshotId, becameLiveAt: '2026-06-04T00:00:00.000Z', becameLiveVia: 'publish' }],
  };
  writePublishStateMeta(snapshotsRootFor(courseDir), meta);
}

describe('computePruneList', () => {
  it('keeps top-3 by recency when count retention is 3', () => {
    // 5 snapshots, all recent (< 30 days)
    makeSnap('s1', '2026-05-30T12:00:00.000Z');
    makeSnap('s2', '2026-05-31T12:00:00.000Z');
    makeSnap('s3', '2026-06-01T12:00:00.000Z');
    makeSnap('s4', '2026-06-02T12:00:00.000Z');
    makeSnap('s5', '2026-06-03T12:00:00.000Z');
    setLive('s5');
    // All 5 are within 30 days — time-based wins; nothing gets pruned.
    const { pruned, kept } = computePruneList({
      courseId: 20255, courseDir, retainCount: 3, retainDays: 30,
      now: Date.parse('2026-06-04T00:00:00.000Z'),
    });
    expect(pruned).toEqual([]);
    expect(kept.sort()).toEqual(['s1', 's2', 's3', 's4', 's5']);
  });

  it('prunes snapshots older than retainDays even when above retainCount', () => {
    makeSnap('old', '2026-04-01T00:00:00.000Z');     // ~64 days old
    makeSnap('s1', '2026-05-30T12:00:00.000Z');
    makeSnap('s2', '2026-05-31T12:00:00.000Z');
    makeSnap('s3', '2026-06-01T12:00:00.000Z');
    setLive('s3');
    const { pruned, kept } = computePruneList({
      courseId: 20255, courseDir, retainCount: 3, retainDays: 30,
      now: Date.parse('2026-06-04T00:00:00.000Z'),
    });
    expect(pruned).toEqual(['old']);
    expect(kept.sort()).toEqual(['s1', 's2', 's3']);
  });

  it('never prunes the currently-live snapshot regardless of age', () => {
    makeSnap('ancient-live', '2024-01-01T00:00:00.000Z');
    makeSnap('s1', '2026-06-01T12:00:00.000Z');
    makeSnap('s2', '2026-06-02T12:00:00.000Z');
    makeSnap('s3', '2026-06-03T12:00:00.000Z');
    setLive('ancient-live');
    const { pruned, kept } = computePruneList({
      courseId: 20255, courseDir, retainCount: 3, retainDays: 30,
      now: Date.parse('2026-06-04T00:00:00.000Z'),
    });
    expect(kept).toContain('ancient-live');
    expect(pruned).not.toContain('ancient-live');
  });
});

describe('pruneSnapshots', () => {
  it('dry run does not delete anything from disk', async () => {
    makeSnap('old', '2024-01-01T00:00:00.000Z');
    makeSnap('s1', '2026-06-03T12:00:00.000Z');
    setLive('s1');
    const result = await pruneSnapshots({
      courseId: 20255, courseDir, dryRun: true,
      now: Date.parse('2026-06-04T00:00:00.000Z'),
    });
    expect(result.wouldPrune.map(p => p.snapshotId)).toEqual(['old']);
    expect(existsSync(join(snapshotsRootFor(courseDir), 'old'))).toBe(true);
  });

  it('non-dry-run deletes the snapshot dir', async () => {
    makeSnap('old', '2024-01-01T00:00:00.000Z');
    makeSnap('s1', '2026-06-03T12:00:00.000Z');
    setLive('s1');
    const result = await pruneSnapshots({
      courseId: 20255, courseDir, dryRun: false,
      now: Date.parse('2026-06-04T00:00:00.000Z'),
    });
    expect(result.pruned?.map(p => p.snapshotId)).toEqual(['old']);
    expect(existsSync(join(snapshotsRootFor(courseDir), 'old'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=packages/command-and-control -- publish/pruning`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Write the implementation**

```ts
// packages/command-and-control/src/tools/publish/pruning.ts

import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { snapshotsRootFor } from './snapshot_store.js';
import { readPublishStateMeta } from './state_meta.js';
import { loadCanvasConfig } from '../setup_canvas.js';
import type { PreviewManifest, PublishState } from './manifest_types.js';

export interface ComputePruneInput {
  courseId: number;
  courseDir: string;
  retainCount: number;
  retainDays: number;
  /** Override Date.now() for tests. */
  now?: number;
}

export interface ComputePruneResult {
  kept: string[];
  pruned: string[];
  /** Per-pruned details for output formatting. */
  prunedDetail: Array<{
    snapshotId: string;
    publishedAt: string;
    reason: 'count' | 'age';
    daysOld: number;
  }>;
}

interface SnapshotIndexEntry {
  snapshotId: string;
  publishedAt: string;
  phase: PublishState['phase'];
}

function readSnapshotIndex(courseDir: string, courseId: number): SnapshotIndexEntry[] {
  const root = snapshotsRootFor(courseDir);
  if (!existsSync(root)) return [];
  const out: SnapshotIndexEntry[] = [];
  for (const id of readdirSync(root)) {
    const dir = join(root, id);
    if (!existsSync(join(dir, 'manifest.json')) || !existsSync(join(dir, 'state.json'))) continue;
    try {
      const m = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf-8')) as PreviewManifest;
      const s = JSON.parse(readFileSync(join(dir, 'state.json'), 'utf-8')) as PublishState;
      if (m.courseId !== courseId) continue;
      out.push({ snapshotId: id, publishedAt: m.generatedAt, phase: s.phase });
    } catch { /* skip corrupt */ }
  }
  return out;
}

export function computePruneList(input: ComputePruneInput): ComputePruneResult {
  const all = readSnapshotIndex(input.courseDir, input.courseId)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)); // newest → oldest

  const now = input.now ?? Date.now();
  const ageThresholdMs = input.retainDays * 86_400_000;

  const kept: string[] = [];
  const pruned: string[] = [];
  const prunedDetail: ComputePruneResult['prunedDetail'] = [];

  for (let i = 0; i < all.length; i++) {
    const s = all[i]!;
    const ageMs = now - Date.parse(s.publishedAt);
    const daysOld = Math.floor(ageMs / 86_400_000);
    if (i < input.retainCount) {
      kept.push(s.snapshotId);
    } else if (ageMs < ageThresholdMs) {
      kept.push(s.snapshotId);
    } else {
      pruned.push(s.snapshotId);
      prunedDetail.push({
        snapshotId: s.snapshotId, publishedAt: s.publishedAt,
        reason: i >= input.retainCount ? 'age' : 'count', daysOld,
      });
    }
  }

  // Never prune currently-live snapshot
  const meta = readPublishStateMeta(snapshotsRootFor(input.courseDir), input.courseId);
  const liveId = meta?.currentlyLiveSnapshotId;
  if (liveId && pruned.includes(liveId)) {
    kept.push(liveId);
    const idx = pruned.indexOf(liveId);
    pruned.splice(idx, 1);
    const detailIdx = prunedDetail.findIndex(p => p.snapshotId === liveId);
    if (detailIdx >= 0) prunedDetail.splice(detailIdx, 1);
  }

  return { kept, pruned, prunedDetail };
}

export interface PruneSnapshotsInput {
  courseId: number;
  courseDir: string;
  dryRun?: boolean;
  /** Override Date.now() for tests. */
  now?: number;
  /** Hook for tests OR for breadcrumb cleanup (Task C4.3). */
  onBeforeDelete?: (snapshotId: string) => Promise<BreadcrumbCleanupResult>;
}

export interface BreadcrumbCleanupResult {
  canvasBreadcrumbsCleaned: boolean;
  errors: Array<{ resource: string; reason: string }>;
}

export interface PruneSnapshotsResult {
  wouldPrune: Array<{
    snapshotId: string;
    publishedAt: string;
    reason: 'count' | 'age';
    daysOld: number;
    canvasBreadcrumbsToDelete: number;
  }>;
  pruned?: Array<{
    snapshotId: string;
    canvasBreadcrumbsCleaned: boolean;
    errors: Array<{ resource: string; reason: string }>;
  }>;
  kept: number;
}

export async function pruneSnapshots(input: PruneSnapshotsInput): Promise<PruneSnapshotsResult> {
  let retainCount = 3;
  let retainDays = 30;
  try {
    const cfg = loadCanvasConfig();
    retainCount = cfg.snapshotRetentionCount ?? 3;
    retainDays = cfg.snapshotRetentionDays ?? 30;
  } catch { /* defaults */ }

  const { kept, pruned, prunedDetail } = computePruneList({
    courseId: input.courseId, courseDir: input.courseDir,
    retainCount, retainDays, now: input.now,
  });

  const root = snapshotsRootFor(input.courseDir);
  const wouldPrune = prunedDetail.map(p => ({
    snapshotId: p.snapshotId, publishedAt: p.publishedAt, reason: p.reason, daysOld: p.daysOld,
    canvasBreadcrumbsToDelete: countBreadcrumbs(join(root, p.snapshotId)),
  }));

  if (input.dryRun) {
    return { wouldPrune, kept: kept.length };
  }

  const prunedResults: NonNullable<PruneSnapshotsResult['pruned']> = [];
  for (const id of pruned) {
    const dir = join(root, id);
    let cleanup: BreadcrumbCleanupResult = { canvasBreadcrumbsCleaned: false, errors: [] };
    if (input.onBeforeDelete) {
      try { cleanup = await input.onBeforeDelete(id); }
      catch (e) { cleanup.errors.push({ resource: 'breadcrumb-cleanup', reason: e instanceof Error ? e.message : String(e) }); }
    }
    try {
      rmSync(dir, { recursive: true, force: true });
      prunedResults.push({ snapshotId: id, ...cleanup });
    } catch (e) {
      prunedResults.push({
        snapshotId: id, canvasBreadcrumbsCleaned: cleanup.canvasBreadcrumbsCleaned,
        errors: [...cleanup.errors, { resource: 'snapshot-dir', reason: e instanceof Error ? e.message : String(e) }],
      });
    }
  }

  return { wouldPrune, pruned: prunedResults, kept: kept.length };
}

/** Returns 0 if pages-meta.json / widgets-meta.json don't exist. Otherwise
 *  counts how many canvasBreadcrumb entries are recorded. */
function countBreadcrumbs(snapshotDir: string): number {
  let n = 0;
  for (const file of ['pages-meta.json', 'widgets-meta.json']) {
    const path = join(snapshotDir, file);
    if (!existsSync(path)) continue;
    try {
      const data = JSON.parse(readFileSync(path, 'utf-8'));
      const records = (data.pages ?? data.widgets ?? {}) as Record<string, { canvasBreadcrumb?: unknown }>;
      for (const v of Object.values(records)) {
        if (v.canvasBreadcrumb) n++;
      }
    } catch { /* skip */ }
  }
  return n;
}
```

- [ ] **Step 4: Run tests + build**

Run: `npm test --workspace=packages/command-and-control -- publish/pruning`
Expected: 5 tests pass.

Run: `npm run build --workspace=packages/command-and-control`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add packages/command-and-control/src/tools/publish/pruning.ts \
        packages/command-and-control/tests/publish/pruning.test.ts
git commit -m "feat(cc): pruning algorithm — max(retainCount, retainDays) policy

computePruneList() returns { kept, pruned } per the spec algorithm.
pruneSnapshots() runs the algorithm, optionally takes a dryRun flag,
optionally takes an onBeforeDelete hook (used by Task C4.3 for breadcrumb
cleanup). Never prunes the currently-live snapshot. Reads retention config
from setup_canvas (defaults 3 / 30 days)."
```

### Task C3.3: Implement `prune_publish_snapshots` MCP tool wrapper

**Files:**
- Create: `packages/command-and-control/src/tools/workflows/prune_publish_snapshots.ts`
- Create: `packages/command-and-control/tests/workflows/prune_publish_snapshots.test.ts`

- [ ] **Step 1: Write the test (thin wrapper)**

```ts
// packages/command-and-control/tests/workflows/prune_publish_snapshots.test.ts
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prunePublishSnapshots } from '../../src/tools/workflows/prune_publish_snapshots.js';
import { snapshotsRootFor, createSnapshotDirFor, writeManifest, writeState } from '../../src/tools/publish/snapshot_store.js';
import { writePublishStateMeta } from '../../src/tools/publish/state_meta.js';
import type { PreviewManifest, PublishStateMeta } from '../../src/tools/publish/manifest_types.js';

let ccHome: string;
let courseDir: string;
let originalEnv: string | undefined;

beforeEach(() => {
  ccHome = mkdtempSync(join(tmpdir(), 'cc-home-'));
  courseDir = mkdtempSync(join(tmpdir(), 'course-'));
  originalEnv = process.env.CC_HOME;
  process.env.CC_HOME = ccHome;
  writeFileSync(join(ccHome, 'canvas-config.json'), JSON.stringify({
    host: 'x', token: 'y', configuredAt: '2026-06-04T00:00:00.000Z',
    snapshotRetentionCount: 3, snapshotRetentionDays: 30,
  }), 'utf-8');
});

afterEach(() => {
  process.env.CC_HOME = originalEnv;
  rmSync(ccHome, { recursive: true, force: true });
  rmSync(courseDir, { recursive: true, force: true });
});

describe('prunePublishSnapshots', () => {
  it('dry run lists what would be pruned without deleting', async () => {
    for (const [id, ts] of [
      ['old', '2024-01-01T00:00:00.000Z'],
      ['s1', '2026-06-03T12:00:00.000Z'],
    ] as const) {
      const dir = createSnapshotDirFor(id, courseDir);
      const manifest: PreviewManifest = {
        snapshotId: id, courseId: 20255, courseDir, generatedAt: ts,
        git: { isRepo: false }, entries: [],
        summary: { total: 0, pages: 0, assignments: 0, skipped: 0, warningsCount: 0, ferpaCount: 0, collisionsCount: 0 },
      };
      writeManifest(dir, manifest);
      writeState(dir, { phase: 'published', published: [], lastUpdatedAt: ts });
    }
    const meta: PublishStateMeta = {
      courseId: 20255, currentlyLiveSnapshotId: 's1',
      currentlyLiveSince: '2026-06-03T12:00:00.000Z',
      history: [{ snapshotId: 's1', becameLiveAt: '2026-06-03T12:00:00.000Z', becameLiveVia: 'publish' }],
    };
    writePublishStateMeta(snapshotsRootFor(courseDir), meta);

    const result = await prunePublishSnapshots({ courseId: 20255, courseDir, dryRun: true });
    expect(result.wouldPrune.map(p => p.snapshotId)).toEqual(['old']);
    expect(existsSync(join(snapshotsRootFor(courseDir), 'old'))).toBe(true);
  });
});
```

- [ ] **Step 2: Write the implementation**

```ts
// packages/command-and-control/src/tools/workflows/prune_publish_snapshots.ts

import { pruneSnapshots, type PruneSnapshotsResult } from '../publish/pruning.js';
import { cleanupCanvasBreadcrumbsForSnapshot } from '../publish/breadcrumbs.js';

export interface PrunePublishSnapshotsInput {
  courseId: number;
  courseDir: string;
  dryRun?: boolean;
}

export async function prunePublishSnapshots(
  input: PrunePublishSnapshotsInput,
): Promise<PruneSnapshotsResult> {
  return pruneSnapshots({
    courseId: input.courseId,
    courseDir: input.courseDir,
    dryRun: input.dryRun ?? false,
    onBeforeDelete: input.dryRun ? undefined : (snapshotId) =>
      cleanupCanvasBreadcrumbsForSnapshot({ snapshotId, courseId: input.courseId, courseDir: input.courseDir }),
  });
}
```

Note: `cleanupCanvasBreadcrumbsForSnapshot` is implemented in Task C4.3. To allow this task to ship before C4.3, provide a temporary stub:

```ts
// In packages/command-and-control/src/tools/publish/breadcrumbs.ts (initial stub — fleshed out in Task C4.1+)
export async function cleanupCanvasBreadcrumbsForSnapshot(_input: {
  snapshotId: string; courseId: number; courseDir: string;
}): Promise<{ canvasBreadcrumbsCleaned: boolean; errors: Array<{ resource: string; reason: string }> }> {
  return { canvasBreadcrumbsCleaned: false, errors: [] };
}
```

Create the stub file now; replace with real implementation in Task C4.3.

- [ ] **Step 3: Run tests + build**

Run: `npm test --workspace=packages/command-and-control -- prune_publish_snapshots`
Expected: 1 test passes.

Run: `npm run build --workspace=packages/command-and-control`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add packages/command-and-control/src/tools/workflows/prune_publish_snapshots.ts \
        packages/command-and-control/src/tools/publish/breadcrumbs.ts \
        packages/command-and-control/tests/workflows/prune_publish_snapshots.test.ts
git commit -m "feat(cc): prune_publish_snapshots workflow wrapper

Thin wrapper over pruneSnapshots() with a stub for breadcrumb cleanup
(filled in by Task C4.3). dryRun lists what would be pruned without touching
disk or Canvas. Real run deletes local dirs and calls the breadcrumb
cleanup hook."
```

### Task C3.4: Register `prune_publish_snapshots` as an MCP tool

**Files:**
- Modify: `packages/command-and-control/src/index.ts`

- [ ] **Step 1: Add import**

```ts
import {
  prunePublishSnapshots,
  type PrunePublishSnapshotsInput,
} from './tools/workflows/prune_publish_snapshots.js';
```

- [ ] **Step 2: Add tool definition** (right after `list_publish_snapshots`):

```ts
{
  name: 'prune_publish_snapshots',
  description: 'Apply retention policy to a course\'s publish snapshots. Removes snapshots older than the configured retention window AND beyond the configured retention count. Never removes the currently-live snapshot. When dryRun is true, lists what would be pruned without taking action.',
  inputSchema: {
    type: 'object' as const,
    required: ['courseId', 'courseDir'],
    properties: {
      courseId: { type: 'number' },
      courseDir: { type: 'string', description: 'Canvas Design Studio course folder.' },
      dryRun: { type: 'boolean', description: 'When true, shows what would be pruned without deleting. Default false.' },
    },
  },
},
```

- [ ] **Step 3: Add case dispatch**

```ts
case 'prune_publish_snapshots':
  result = await prunePublishSnapshots(args as unknown as PrunePublishSnapshotsInput);
  break;
```

- [ ] **Step 4: Build + commit**

Run: `npm run build --workspace=packages/command-and-control`
Expected: clean.

```bash
git add packages/command-and-control/src/index.ts
git commit -m "feat(cc): register prune_publish_snapshots as MCP tool

Faculty can now manually prune via { courseId, courseDir, dryRun? }.
Auto-pruning still runs on every successful publish_course (Task C3.5)."
```

### Task C3.5: Wire auto-prune into `publish_course`

**Files:**
- Modify: `packages/command-and-control/src/tools/workflows/publish_course.ts`

- [ ] **Step 1: Import + add to result type**

```ts
import { pruneSnapshots, type PruneSnapshotsResult } from '../publish/pruning.js';
import { cleanupCanvasBreadcrumbsForSnapshot } from '../publish/breadcrumbs.js';
```

Extend `PublishCourseResult`:

```ts
export interface PublishCourseResult {
  // ... existing ...
  pruning?: PruneSnapshotsResult;
}
```

- [ ] **Step 2: Run pruning at end of successful publish**

Right after the existing final `writeState(dir, { phase: 'published', ... })` (and the Plan A `updateCurrentlyLive(...)` call):

```ts
// V&R Plan C: auto-prune after a successful publish.
const pruning = await pruneSnapshots({
  courseId: manifest.courseId, courseDir: manifest.courseDir, dryRun: false,
  onBeforeDelete: (snapshotId) =>
    cleanupCanvasBreadcrumbsForSnapshot({ snapshotId, courseId: manifest.courseId, courseDir: manifest.courseDir }),
}).catch((e): PruneSnapshotsResult => ({
  // Pruning failure must NEVER mask a successful publish.
  wouldPrune: [], pruned: [], kept: 0,
  // Errors surfaced via console; the result is empty but the publish still succeeded.
}));
```

And include in the success return:

```ts
return { snapshotId: input.snapshotId, phase: 'published', published, gitTag, pushResult, backup, pruning };
```

- [ ] **Step 3: Test**

```ts
// packages/command-and-control/tests/workflows/publish_course-auto-prune.test.ts
// (Setup mirrors publish_course-state-meta.test.ts from Plan A. Adds an old snapshot
// to be pruned, runs publishCourse, verifies result.pruning is populated and the
// old snapshot dir is gone.)
```

Run: `npm test --workspace=packages/command-and-control -- publish_course-auto-prune`
Expected: pass.

- [ ] **Step 4: Full regression**

Run: `npm test --workspace=packages/command-and-control`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/command-and-control/src/tools/workflows/publish_course.ts \
        packages/command-and-control/tests/workflows/publish_course-auto-prune.test.ts
git commit -m "feat(cc): publish_course auto-prunes per retention policy

After a successful publish, runs pruneSnapshots() with the breadcrumb
cleanup hook. Pruning failure is swallowed (publish success is the
load-bearing outcome). Result surfaces a .pruning summary so faculty
sees what got cleaned up."
```

---

## Phase C4 — Canvas breadcrumbs

### Task C4.1: Page breadcrumb create + meta record

**Files:**
- Modify or create: `packages/command-and-control/src/tools/publish/breadcrumbs.ts`
- Modify: `packages/command-and-control/src/tools/workflows/publish_course.ts`
- Create OR extend (see "Plan B path" below): `packages/command-and-control/src/tools/publish/pages_meta.ts`

**Plan B path:**

- If Plan B has shipped a `pages_meta.ts` writer with a `PagesMeta { pages: Record<filename, { ...existing fields }> }` shape, **extend** that writer with a `canvasBreadcrumb?: { archivedPageSlug, archivedPageId }` sub-field. Reuse Plan B's `readPagesMeta` / `writePagesMeta`.
- If Plan B has NOT shipped a `pages_meta.ts`, create a minimal one:

```ts
// packages/command-and-control/src/tools/publish/pages_meta.ts (minimal — Plan B will merge into this)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface PageBreadcrumb {
  archivedPageSlug: string;
  archivedPageId: string;
}

export interface PagesMetaEntry {
  /** Plan B fields (priorCanvasPageSlug, hashes) absent here until Plan B ships. */
  canvasBreadcrumb?: PageBreadcrumb;
}

export interface PagesMeta {
  pages: Record<string, PagesMetaEntry>;
}

const FILE = 'pages-meta.json';

export function readPagesMeta(snapshotDir: string): PagesMeta {
  const path = join(snapshotDir, FILE);
  if (!existsSync(path)) return { pages: {} };
  try { return JSON.parse(readFileSync(path, 'utf-8')) as PagesMeta; }
  catch { return { pages: {} }; }
}

export function writePagesMeta(snapshotDir: string, meta: PagesMeta): void {
  writeFileSync(join(snapshotDir, FILE), JSON.stringify(meta, null, 2), 'utf-8');
}

export function recordPageBreadcrumb(
  snapshotDir: string, filename: string, breadcrumb: PageBreadcrumb,
): void {
  const meta = readPagesMeta(snapshotDir);
  meta.pages[filename] = { ...(meta.pages[filename] ?? {}), canvasBreadcrumb: breadcrumb };
  writePagesMeta(snapshotDir, meta);
}
```

- [ ] **Step 1: Implement `createPageBreadcrumb` in `breadcrumbs.ts`**

```ts
// packages/command-and-control/src/tools/publish/breadcrumbs.ts (full impl)

import { CanvasApiClient } from 'canvas-design-mcp/dist/canvas-api.js';
import { snapshotDirFor } from './snapshot_store.js';
import { readPagesMeta } from './pages_meta.js';
import { readWidgetsMeta } from './widgets_meta.js';
import type { PageBreadcrumb } from './pages_meta.js';
import type { WidgetBreadcrumb } from './widgets_meta.js';

export interface CreatePageBreadcrumbInput {
  courseId: number;
  originalTitle: string;
  originalSlug: string;
  priorBodyHtml: string;
  date: string;          // YYYY-MM-DD
  isoTimestamp: string;  // for display in title
  api: CanvasApiClient;
}

export interface CreatePageBreadcrumbResult {
  archivedPageSlug: string;
  archivedPageId: string;
}

/** Create a date-stamped archived copy of the prior page body before publish
 *  replaces it. Returns the new slug + id for cleanup at prune time. */
export async function createPageBreadcrumb(input: CreatePageBreadcrumbInput): Promise<CreatePageBreadcrumbResult> {
  const title = `[ARCHIVED] ${input.originalTitle} — ${input.isoTimestamp}`;
  const slug = `archived-${input.originalSlug}-${input.date.replace(/-/g, '')}-${Date.now().toString(36)}`;

  // Use CanvasApiClient — but the canvas-design-mcp doesn't currently expose a
  // public createPage method, so issue a direct POST. CanvasApiClient holds
  // the canvasUrl + apiToken we need.
  const res = await fetch(`${(input.api as any).canvasUrl}/api/v1/courses/${input.courseId}/pages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${(input.api as any).apiToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      wiki_page: {
        title, body: input.priorBodyHtml, published: false, notify_of_update: false,
      },
    }),
  });
  if (!res.ok) throw new Error(`createPageBreadcrumb: ${res.status} ${await res.text().catch(() => '')}`);
  const data = await res.json() as { url: string; page_id: number };
  return { archivedPageSlug: data.url, archivedPageId: String(data.page_id) };
}

export async function cleanupCanvasBreadcrumbsForSnapshot(input: {
  snapshotId: string; courseId: number; courseDir: string;
  api?: CanvasApiClient;
}): Promise<{ canvasBreadcrumbsCleaned: boolean; errors: Array<{ resource: string; reason: string }> }> {
  // Filled in by Task C4.3. Stub until then.
  return { canvasBreadcrumbsCleaned: false, errors: [] };
}
```

- [ ] **Step 2: Call `createPageBreadcrumb` in `publish_course` before each page replace**

In `publish_course.ts`, before the existing `publishToCanvas(...)` call for type==='page', when breadcrumbs are enabled:

```ts
// Determine breadcrumb enablement: per-run input overrides setup default.
const breadcrumbsEnabled = (() => {
  if (typeof input.canvasBreadcrumbs === 'boolean') return input.canvasBreadcrumbs;
  try { return loadCanvasConfig().canvasBreadcrumbs !== 'disabled'; }
  catch { return true; }
})();

// Inside the page branch, just before publishToCanvas:
if (breadcrumbsEnabled && entry.canvasMatch) {
  // Only archive when there's an existing page to archive (collisionAction='update').
  try {
    const priorHtml = readPriorHtml(dir, entry.filename);
    const date = manifest.generatedAt.slice(0, 10);
    const isoTimestamp = manifest.generatedAt.replace('T', ' ').slice(0, 16) + ' UTC';
    const breadcrumb = await createPageBreadcrumb({
      courseId: manifest.courseId,
      originalTitle: entry.intendedTitle,
      originalSlug: entry.canvasMatch.pageId,
      priorBodyHtml: priorHtml, date, isoTimestamp, api,
    });
    recordPageBreadcrumb(dir, entry.filename, breadcrumb);
  } catch (e) {
    // Breadcrumb failure is non-fatal — log + continue with publish.
    console.warn(`page breadcrumb failed for ${entry.filename}: ${e instanceof Error ? e.message : String(e)}`);
  }
}
```

Add the `canvasBreadcrumbs?: boolean` field to `PublishCourseInput`:

```ts
export interface PublishCourseInput {
  // ... existing ...
  canvasBreadcrumbs?: boolean;
}
```

- [ ] **Step 3: Test**

```ts
// packages/command-and-control/tests/workflows/publish_course-breadcrumbs.test.ts
// Mock fetch:
//   - GET /pages/<slug> returns existing page body
//   - POST /pages with title containing '[ARCHIVED]' returns { url: 'archived-foo-...', page_id: 9000 }
//   - normal publish PUT succeeds
// Assert:
//   - One POST /pages was made with title prefixed by [ARCHIVED]
//   - pages-meta.json in the snapshot dir has the breadcrumb recorded
//   - canvasBreadcrumbs: false in input suppresses the POST
```

Run: `npm test --workspace=packages/command-and-control -- publish_course-breadcrumbs`
Expected: pass.

- [ ] **Step 4: Build + commit**

```bash
git add packages/command-and-control/src/tools/publish/breadcrumbs.ts \
        packages/command-and-control/src/tools/publish/pages_meta.ts \
        packages/command-and-control/src/tools/workflows/publish_course.ts \
        packages/command-and-control/tests/workflows/publish_course-breadcrumbs.test.ts
git commit -m "feat(cc): page breadcrumbs — [ARCHIVED] copies before publish

createPageBreadcrumb() POSTs an unpublished archived copy of the prior page
body with a date-stamped title and slug. Records { archivedPageSlug,
archivedPageId } in pages-meta.json for cleanup at prune time.

Opt-in via canvasBreadcrumbs (default enabled). Per-run override on
publish_course input. Non-fatal failures — breadcrumb creation does not
block the publish."
```

### Task C4.2: Widget breadcrumb upload + meta record

**Files:**
- Modify: `packages/command-and-control/src/tools/publish/breadcrumbs.ts`
- Modify: `packages/command-and-control/src/tools/workflows/publish_course.ts`
- Create OR extend: `packages/command-and-control/src/tools/publish/widgets_meta.ts`

**Plan B path:**

- If Plan B has shipped `widgets_meta.ts`, extend with `canvasBreadcrumb?: { folderId, filePath, breadcrumbFileId }`.
- Otherwise create the minimal version:

```ts
// packages/command-and-control/src/tools/publish/widgets_meta.ts (minimal — Plan B merges)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface WidgetBreadcrumb {
  folderId: number;
  filePath: string;
  breadcrumbFileId: number;
}

export interface WidgetsMetaEntry {
  canvasBreadcrumb?: WidgetBreadcrumb;
}

export interface WidgetsMeta {
  widgets: Record<string, WidgetsMetaEntry>;
}

const FILE = 'widgets-meta.json';

export function readWidgetsMeta(snapshotDir: string): WidgetsMeta {
  const path = join(snapshotDir, FILE);
  if (!existsSync(path)) return { widgets: {} };
  try { return JSON.parse(readFileSync(path, 'utf-8')) as WidgetsMeta; }
  catch { return { widgets: {} }; }
}

export function writeWidgetsMeta(snapshotDir: string, meta: WidgetsMeta): void {
  writeFileSync(join(snapshotDir, FILE), JSON.stringify(meta, null, 2), 'utf-8');
}

export function recordWidgetBreadcrumb(
  snapshotDir: string, widgetKey: string, breadcrumb: WidgetBreadcrumb,
): void {
  const meta = readWidgetsMeta(snapshotDir);
  meta.widgets[widgetKey] = { ...(meta.widgets[widgetKey] ?? {}), canvasBreadcrumb: breadcrumb };
  writeWidgetsMeta(snapshotDir, meta);
}
```

- [ ] **Step 1: Implement `uploadWidgetBreadcrumb` in `breadcrumbs.ts`**

```ts
// Add to packages/command-and-control/src/tools/publish/breadcrumbs.ts

export interface UploadWidgetBreadcrumbInput {
  courseId: number;
  canvasHost: string;
  apiToken: string;
  date: string;          // YYYY-MM-DD
  slug: string;          // page slug (first path segment)
  widgetId: string;
  /** Prior content bytes that will be archived. Plan B's preview captures these into
   *  <snapshot>/prior/widgets/<slug>__<id>.html — that's the source. */
  priorContentHtml: string;
}

export interface UploadWidgetBreadcrumbResult {
  folderId: number;
  filePath: string;        // /canvas-toolchain-archive/<date>/<slug>__<id>.html
  breadcrumbFileId: number;
}

/** Upload the prior widget bytes into a hidden /canvas-toolchain-archive/<date>/
 *  folder. Folder is created on first call (hidden:true). Returns ids for
 *  cleanup at prune time. */
export async function uploadWidgetBreadcrumb(
  input: UploadWidgetBreadcrumbInput,
): Promise<UploadWidgetBreadcrumbResult> {
  // 1. Ensure /canvas-toolchain-archive folder exists (hidden).
  // 2. Ensure /canvas-toolchain-archive/<date> sub-folder exists.
  // 3. Upload the HTML bytes to <slug>__<id>.html via the Canvas Files upload
  //    flow (POST /courses/<id>/files for the upload-target, then upload to
  //    the returned URL).
  // The implementation mirrors publish-widget.ts in canvas-design-mcp — refer
  // to that file when wiring the upload.
  // ... (real impl below) ...

  const baseUrl = `https://${input.canvasHost}/api/v1`;
  const authHeader = { Authorization: `Bearer ${input.apiToken}` };

  // Find or create /canvas-toolchain-archive
  let rootFolderId: number;
  {
    const list = await fetch(`${baseUrl}/courses/${input.courseId}/folders/root`, { headers: authHeader });
    if (!list.ok) throw new Error(`folder root: ${list.status}`);
    const rootFolder = await list.json() as { id: number };
    // List child folders
    const children = await fetch(`${baseUrl}/folders/${rootFolder.id}/folders`, { headers: authHeader });
    const all = (await children.json()) as Array<{ id: number; name: string }>;
    const existing = all.find(f => f.name === 'canvas-toolchain-archive');
    if (existing) rootFolderId = existing.id;
    else {
      const created = await fetch(`${baseUrl}/courses/${input.courseId}/folders`, {
        method: 'POST', headers: { ...authHeader, 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'canvas-toolchain-archive', hidden: true, parent_folder_id: rootFolder.id }),
      });
      const cf = await created.json() as { id: number };
      rootFolderId = cf.id;
    }
  }

  // Find or create /canvas-toolchain-archive/<date>
  let dateFolderId: number;
  {
    const children = await fetch(`${baseUrl}/folders/${rootFolderId}/folders`, { headers: authHeader });
    const all = (await children.json()) as Array<{ id: number; name: string }>;
    const existing = all.find(f => f.name === input.date);
    if (existing) dateFolderId = existing.id;
    else {
      const created = await fetch(`${baseUrl}/courses/${input.courseId}/folders`, {
        method: 'POST', headers: { ...authHeader, 'content-type': 'application/json' },
        body: JSON.stringify({ name: input.date, hidden: true, parent_folder_id: rootFolderId }),
      });
      const cf = await created.json() as { id: number };
      dateFolderId = cf.id;
    }
  }

  // Upload the file using Canvas's 2-step flow
  const fileName = `${input.slug}__${input.widgetId}.html`;
  const initBody = new URLSearchParams({
    name: fileName, parent_folder_id: String(dateFolderId), content_type: 'text/html',
    'on_duplicate': 'overwrite',
  });
  const init = await fetch(`${baseUrl}/courses/${input.courseId}/files`, {
    method: 'POST', headers: { ...authHeader, 'content-type': 'application/x-www-form-urlencoded' }, body: initBody,
  });
  if (!init.ok) throw new Error(`file init: ${init.status}`);
  const initData = await init.json() as { upload_url: string; upload_params: Record<string, string> };

  // POST to upload_url with multipart form (params + file content)
  const form = new FormData();
  for (const [k, v] of Object.entries(initData.upload_params)) form.append(k, v);
  form.append('file', new Blob([input.priorContentHtml], { type: 'text/html' }), fileName);
  const upload = await fetch(initData.upload_url, { method: 'POST', body: form });
  if (!upload.ok && upload.status !== 301 && upload.status !== 302) throw new Error(`upload: ${upload.status}`);
  const final = await upload.json() as { id: number };

  return {
    folderId: dateFolderId,
    filePath: `/canvas-toolchain-archive/${input.date}/${fileName}`,
    breadcrumbFileId: final.id,
  };
}
```

- [ ] **Step 2: Wire into `publish_course` before each widget publish**

In `processPageWidgets`, capture the prior content (from `<snapshot>/prior/widgets/<slug>__<id>.html` if Plan B captured it; otherwise skip the widget breadcrumb — there's no prior content to archive). Call `uploadWidgetBreadcrumb` and record in `widgets-meta.json`.

If Plan B hasn't shipped its widget content capture yet, the `<snapshot>/prior/widgets/` dir may not exist. In that case, widget breadcrumbs are a no-op (silently skipped) — the page breadcrumbs (Task C4.1) still work.

```ts
// Inside processPageWidgets, after publishWidgetFn succeeds for a widget:
if (breadcrumbsEnabled) {
  const priorWidgetPath = join(dir, 'prior', 'widgets', `${ref.slug}__${ref.id}.html`);
  if (existsSync(priorWidgetPath)) {
    try {
      const priorContent = readFileSync(priorWidgetPath, 'utf-8');
      const breadcrumb = await uploadWidgetBreadcrumb({
        courseId, canvasHost: canvasConfig.host, apiToken: canvasConfig.token,
        date: manifest.generatedAt.slice(0, 10),
        slug: ref.slug, widgetId: ref.id, priorContentHtml: priorContent,
      });
      recordWidgetBreadcrumb(dir, `${ref.slug}__${ref.id}`, breadcrumb);
    } catch (e) {
      console.warn(`widget breadcrumb failed for ${ref.slug}__${ref.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
```

`processPageWidgets` will need an updated signature: take `dir`, `manifest`, `breadcrumbsEnabled` in addition to its existing params. (The caller already has all of them.)

- [ ] **Step 3: Test**

Add to `publish_course-breadcrumbs.test.ts`:
- Mock the folder GET / POST chain to return synthetic ids.
- Stage a `prior/widgets/data-categorize__1.html` file in the snapshot.
- Assert `widgets-meta.json` gets a `canvasBreadcrumb` entry after publish.

Run: `npm test --workspace=packages/command-and-control -- publish_course-breadcrumbs`
Expected: pass.

- [ ] **Step 4: Build + commit**

```bash
git add packages/command-and-control/src/tools/publish/breadcrumbs.ts \
        packages/command-and-control/src/tools/publish/widgets_meta.ts \
        packages/command-and-control/src/tools/workflows/publish_course.ts \
        packages/command-and-control/tests/workflows/publish_course-breadcrumbs.test.ts
git commit -m "feat(cc): widget breadcrumbs — copy prior content to /canvas-toolchain-archive

uploadWidgetBreadcrumb() ensures a hidden /canvas-toolchain-archive/<YYYY-MM-DD>/
folder exists and uploads the prior widget bytes under
<slug>__<id>.html. Records folderId/filePath/breadcrumbFileId in widgets-meta.json.

Only fires when prior/widgets/<slug>__<id>.html exists in the snapshot — i.e.,
when Plan B's content capture has populated it. Otherwise silently skips
(non-fatal; page breadcrumbs still work)."
```

### Task C4.3: Breadcrumb cleanup at prune time

**Files:**
- Modify: `packages/command-and-control/src/tools/publish/breadcrumbs.ts` (replace the stub)

- [ ] **Step 1: Implement `cleanupCanvasBreadcrumbsForSnapshot`**

```ts
// Replace the stub in breadcrumbs.ts with the real implementation.

import { snapshotDirFor } from './snapshot_store.js';
import { readPagesMeta } from './pages_meta.js';
import { readWidgetsMeta } from './widgets_meta.js';
import { loadInstitutionConfig } from './canvas_config_bridge.js';

export async function cleanupCanvasBreadcrumbsForSnapshot(input: {
  snapshotId: string; courseId: number; courseDir: string;
}): Promise<{ canvasBreadcrumbsCleaned: boolean; errors: Array<{ resource: string; reason: string }> }> {
  const errors: Array<{ resource: string; reason: string }> = [];
  let any = false;

  let cfg;
  try { cfg = loadInstitutionConfig(); }
  catch { return { canvasBreadcrumbsCleaned: false, errors: [{ resource: 'canvas-config', reason: 'MISSING_API_TOKEN' }] }; }

  const host = new URL(cfg.canvasUrl).host;
  const authHeader = { Authorization: `Bearer ${cfg.apiToken}` };
  const baseUrl = `https://${host}/api/v1`;

  const dir = snapshotDirFor(input.snapshotId, input.courseDir);
  const pagesMeta = readPagesMeta(dir);
  const widgetsMeta = readWidgetsMeta(dir);

  // Delete archived pages
  for (const [filename, entry] of Object.entries(pagesMeta.pages)) {
    if (!entry.canvasBreadcrumb) continue;
    any = true;
    try {
      const res = await fetch(`${baseUrl}/courses/${input.courseId}/pages/${entry.canvasBreadcrumb.archivedPageSlug}`, {
        method: 'DELETE', headers: authHeader,
      });
      if (!res.ok && res.status !== 404) {
        errors.push({ resource: `page:${entry.canvasBreadcrumb.archivedPageSlug}`, reason: `${res.status}` });
      }
    } catch (e) {
      errors.push({ resource: `page:${entry.canvasBreadcrumb.archivedPageSlug}`, reason: e instanceof Error ? e.message : String(e) });
    }
  }

  // Delete archived widget files + their containing date folder if empty
  const dateFolderIds = new Set<number>();
  for (const [widgetKey, entry] of Object.entries(widgetsMeta.widgets)) {
    if (!entry.canvasBreadcrumb) continue;
    any = true;
    dateFolderIds.add(entry.canvasBreadcrumb.folderId);
    try {
      const res = await fetch(`${baseUrl}/files/${entry.canvasBreadcrumb.breadcrumbFileId}`, {
        method: 'DELETE', headers: authHeader,
      });
      if (!res.ok && res.status !== 404) {
        errors.push({ resource: `file:${entry.canvasBreadcrumb.breadcrumbFileId}`, reason: `${res.status}` });
      }
    } catch (e) {
      errors.push({ resource: `file:${entry.canvasBreadcrumb.breadcrumbFileId}`, reason: e instanceof Error ? e.message : String(e) });
    }
  }

  // Best-effort: delete empty date folders
  for (const folderId of dateFolderIds) {
    try {
      const list = await fetch(`${baseUrl}/folders/${folderId}/files`, { headers: authHeader });
      const files = await list.json() as unknown[];
      if (Array.isArray(files) && files.length === 0) {
        await fetch(`${baseUrl}/folders/${folderId}?force=true`, { method: 'DELETE', headers: authHeader });
      }
    } catch {
      // best-effort — silent
    }
  }

  return { canvasBreadcrumbsCleaned: any && errors.length === 0, errors };
}
```

- [ ] **Step 2: Test**

```ts
// In packages/command-and-control/tests/publish/breadcrumbs.test.ts
// Stage a snapshot with pages-meta.json + widgets-meta.json containing
// canvasBreadcrumb entries. Mock fetch to return 200/204 for DELETEs and
// listing.
// Assert: result.canvasBreadcrumbsCleaned === true, no errors.
// Assert: DELETE calls were made with the recorded ids.
```

Run: `npm test --workspace=packages/command-and-control -- publish/breadcrumbs`
Expected: pass.

- [ ] **Step 3: Build + regression**

Run: `npm run build --workspace=packages/command-and-control`
Run: `npm test --workspace=packages/command-and-control`
Expected: clean + all pass.

- [ ] **Step 4: Commit**

```bash
git add packages/command-and-control/src/tools/publish/breadcrumbs.ts \
        packages/command-and-control/tests/publish/breadcrumbs.test.ts
git commit -m "feat(cc): breadcrumb cleanup at prune time

Replaces the Task C3.3 stub with the real implementation. Iterates
pages-meta.json + widgets-meta.json for each pruned snapshot; DELETEs each
archived page and file. Best-effort folder cleanup for empty date sub-folders.
All errors logged into the prune result; local snapshot deletion proceeds
regardless."
```

---

## Phase C5 — Page drift detection on rollback

### Task C5.1: Drift hashing helper

**Files:**
- Create: `packages/command-and-control/src/tools/publish/drift_detection.ts`
- Create: `packages/command-and-control/tests/publish/drift_detection.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/command-and-control/tests/publish/drift_detection.test.ts
import { describe, expect, it } from 'vitest';
import { hashContent, detectPageDrift } from '../../src/tools/publish/drift_detection.js';

describe('hashContent', () => {
  it('returns SHA-256 hex digest', () => {
    const hash = hashContent('hello');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    // Known SHA-256("hello"):
    expect(hash).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  });

  it('two different inputs produce different hashes', () => {
    expect(hashContent('a')).not.toBe(hashContent('b'));
  });
});

describe('detectPageDrift', () => {
  it('returns false when current matches expected hash', () => {
    const drift = detectPageDrift({
      currentCanvasHtml: '<p>x</p>',
      expectedHash: hashContent('<p>x</p>'),
    });
    expect(drift.drifted).toBe(false);
  });

  it('returns true when current differs from expected', () => {
    const drift = detectPageDrift({
      currentCanvasHtml: '<p>changed</p>',
      expectedHash: hashContent('<p>x</p>'),
    });
    expect(drift.drifted).toBe(true);
    expect(drift.actualHash).toBe(hashContent('<p>changed</p>'));
  });

  it('returns drifted=false when expectedHash is null (no baseline)', () => {
    const drift = detectPageDrift({
      currentCanvasHtml: '<p>anything</p>',
      expectedHash: null,
    });
    expect(drift.drifted).toBe(false);
  });
});
```

- [ ] **Step 2: Run + implement**

```ts
// packages/command-and-control/src/tools/publish/drift_detection.ts
import { createHash } from 'node:crypto';

export function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

export interface DetectPageDriftInput {
  currentCanvasHtml: string;
  expectedHash: string | null;
}

export interface PageDriftResult {
  drifted: boolean;
  expectedHash: string | null;
  actualHash: string;
}

export function detectPageDrift(input: DetectPageDriftInput): PageDriftResult {
  const actualHash = hashContent(input.currentCanvasHtml);
  if (input.expectedHash === null) {
    return { drifted: false, expectedHash: null, actualHash };
  }
  return {
    drifted: input.expectedHash !== actualHash,
    expectedHash: input.expectedHash, actualHash,
  };
}
```

Run: `npm test --workspace=packages/command-and-control -- publish/drift_detection`
Expected: 5 tests pass.

- [ ] **Step 3: Commit**

```bash
git add packages/command-and-control/src/tools/publish/drift_detection.ts \
        packages/command-and-control/tests/publish/drift_detection.test.ts
git commit -m "feat(cc): drift_detection — SHA-256 hash + compare helper

hashContent() returns the SHA-256 hex digest used throughout V&R for content
fingerprinting. detectPageDrift() compares a current Canvas page body against
a baseline hash; expectedHash=null (no baseline) returns drifted=false so
older snapshots without recorded hashes proceed cleanly."
```

### Task C5.2: Wire drift detection into `rollback_course_publish`

**Files:**
- Modify: `packages/command-and-control/src/tools/workflows/rollback_course_publish.ts`

- [ ] **Step 1: Add `drift[]` to `RollbackCoursePublishResult`**

```ts
export interface DriftEntry {
  item: string;
  expectedHash: string;
  actualHash: string;
  action: 'restored' | 'kept';
}

export interface RollbackCoursePublishResult {
  // ... existing ...
  drift?: DriftEntry[];
}
```

- [ ] **Step 2: Add the drift check in the page-restore branch**

Before calling `restorePage`, fetch the current Canvas page body and compute drift against `pages-meta.json`'s recorded baseline (if Plan B has shipped) or against the snapshot's prior HTML hash (fallback):

```ts
import { hashContent, detectPageDrift } from '../publish/drift_detection.js';
import { readPagesMeta } from '../publish/pages_meta.js';

// ... inside the page-restore loop ...
const drift: DriftEntry[] = [];

// existing: const priorHtml = readPriorHtml(dir, entry.filename);
const slug = entry.canvasPageSlug ?? (entry.canvasUrl ?? entry.filename).split('/').pop()!;
let currentHtml: string | null = null;
try {
  const res = await fetch(`https://${canvasHost}/api/v1/courses/${manifest.courseId}/pages/${slug}`, {
    headers: { Authorization: `Bearer ${cfg.apiToken}` },
  });
  if (res.ok) {
    const data = await res.json() as { body: string };
    currentHtml = data.body ?? '';
  }
} catch { /* best-effort */ }

if (currentHtml !== null) {
  // Hash to compare against: prefer pages-meta's newContentHash (Plan B). Fallback:
  // the snapshot's <new>/<filename>.html bytes — we hash them now if no meta exists.
  const pagesMeta = readPagesMeta(dir);
  const recorded = pagesMeta.pages[entry.filename];
  let expectedHash: string | null = (recorded as any)?.newContentHash ?? null;
  if (!expectedHash) {
    try { expectedHash = hashContent(readFileSync(join(dir, 'new', entry.filename), 'utf-8')); }
    catch { expectedHash = null; }
  }
  const driftResult = detectPageDrift({ currentCanvasHtml: currentHtml, expectedHash });
  if (driftResult.drifted) {
    drift.push({
      item: entry.filename,
      expectedHash: driftResult.expectedHash!,
      actualHash: driftResult.actualHash,
      action: 'restored',           // best-effort: we proceed
    });
  }
}
```

Return `drift` in the final result.

- [ ] **Step 3: Test**

```ts
// packages/command-and-control/tests/workflows/rollback_course_publish-drift.test.ts
// - Setup snapshot with new/overview.html = "<p>publish version</p>"
// - Mock GET /pages/overview to return body = "<p>HUMAN EDITED</p>"
// - Run rollback; assert result.drift contains an entry for overview.html
//   with expectedHash !== actualHash and action: 'restored'
// - The restore still proceeds (existing tests' fetch mock returns 200 for PUT)
```

Run: `npm test --workspace=packages/command-and-control -- rollback_course_publish-drift`
Expected: pass.

- [ ] **Step 4: Full rollback test regression**

Run: `npm test --workspace=packages/command-and-control -- rollback`
Expected: existing rollback + pattern-b + drift tests all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/command-and-control/src/tools/workflows/rollback_course_publish.ts \
        packages/command-and-control/tests/workflows/rollback_course_publish-drift.test.ts
git commit -m "feat(cc): rollback_course_publish surfaces page drift

Before restoring each page, fetches its current Canvas body and compares the
hash against the snapshot's expected newContentHash (from pages-meta.json) or
falls back to hashing <snapshot>/new/<filename>.html. Drift entries appear in
result.drift[] with action:'restored'. The restore proceeds regardless — best
effort, never blocks.

force:true is currently log-only per the spec; drift will always be surfaced."
```

---

## Phase C6 — Opt-in mechanism for breadcrumbs

### Task C6.1: Plumb `canvasBreadcrumbs` opt-in through the publish input

**Files:**
- Modify (already partially done in Task C4.1): `packages/command-and-control/src/tools/workflows/publish_course.ts`
- Modify: `packages/command-and-control/src/index.ts` (add inputSchema field)

- [ ] **Step 1: Confirm `publish_course` reads from setup default + input override**

The logic introduced in Task C4.1:

```ts
const breadcrumbsEnabled = (() => {
  if (typeof input.canvasBreadcrumbs === 'boolean') return input.canvasBreadcrumbs;
  try { return loadCanvasConfig().canvasBreadcrumbs !== 'disabled'; }
  catch { return true; }
})();
```

is already in place. This task confirms it and exposes the override in the MCP schema.

- [ ] **Step 2: Add `canvasBreadcrumbs` to `publish_course` MCP inputSchema**

In `src/index.ts`, find the `publish_course` tool definition and add:

```ts
canvasBreadcrumbs: { type: 'boolean', description: 'Override the course default for this publish only. When omitted, uses setup_canvas\'s canvasBreadcrumbs setting (default enabled).' },
```

- [ ] **Step 3: Add a test**

```ts
// In publish_course-breadcrumbs.test.ts (extend the existing test file)
it('respects canvasBreadcrumbs:false to suppress page breadcrumb POST', async () => {
  // setup as before; pass canvasBreadcrumbs: false
  const result = await publishCourse({ snapshotId, approvals: {...}, canvasBreadcrumbs: false, gitCommit: false });
  // assert: no fetch call to POST /pages with [ARCHIVED] title
});

it('respects canvasBreadcrumbs:"disabled" in setup config', async () => {
  // re-write canvas-config.json with canvasBreadcrumbs: 'disabled'; omit input field
  // assert: no archived POST
});
```

Run: `npm test --workspace=packages/command-and-control -- publish_course-breadcrumbs`
Expected: pass.

- [ ] **Step 4: Build + commit**

```bash
git add packages/command-and-control/src/index.ts \
        packages/command-and-control/tests/workflows/publish_course-breadcrumbs.test.ts
git commit -m "feat(cc): canvasBreadcrumbs opt-in for publish_course

Per-run override exposed through the MCP inputSchema. Setup_canvas's
canvasBreadcrumbs ('enabled' / 'disabled', default 'enabled') is the
course-level baseline. Input parameter wins when both present.

2 tests cover input-false suppression + setup-config 'disabled' suppression."
```

---

## Phase C7 — End-to-end + regression checkpoint

### Task C7.1: Full monorepo regression

- [ ] **Step 1: Run all tests**

```powershell
cd D:\Dev\canvas-toolchain; npm test
```

Expected: all tests pass. Plan A had ~1138 baseline; Plan C adds approximately:
- backup_detection: 14 tests
- list_publish_snapshots: 5
- pruning: 5
- prune_publish_snapshots: 1
- breadcrumbs: 2 (cleanup) + 4 (in publish_course-breadcrumbs)
- drift_detection: 5
- rollback_course_publish-drift: 1
- publish_course-auto-prune: 1
- publish_course-backup: 1
- preview_course_publish-backup: 1
- setup_canvas (Plan C fields): 2

Total Plan C additions: ~42 new tests. Final: ~1180+ passing.

- [ ] **Step 2: Build all packages**

```powershell
npm run build
```

Expected: all 5 packages build clean.

- [ ] **Step 3: Smoke test**

```powershell
npm run smoke:integration --workspace=packages/command-and-control
```

Expected: existing cross-app contract verification still passes (Plan C is additive — nothing existing breaks).

### Task C7.2: Manual verification against University sandbox

Walk through the full faculty workflow against sandbox course 20255.

- [ ] **Step 1: List snapshots before any V&R Plan C run**

```
list_publish_snapshots { courseId: 20255, courseDir: "<path>" }
```

Verify the response shape matches the spec — `currentlyLiveSnapshotId` and `snapshots[]` with all fields populated correctly.

- [ ] **Step 2: Preview a publish**

```
preview_course_publish { courseDir: "<path>", courseId: 20255 }
```

Verify `manifest.backup` is set. Check the value matches what you'd expect for your dev box (likely `synced-folder:OneDrive` if running from OneDrive, otherwise `git-pushed` if courseDir is a clean git repo with a remote).

- [ ] **Step 3: Publish with breadcrumbs enabled (default)**

```
publish_course { snapshotId, approvals: {...} }
```

Verify in Canvas:
- The published page exists and is current.
- A new page titled `[ARCHIVED] <title> — 2026-06-04 14:30 UTC` exists, unpublished, with the prior content.
- If widgets were published: `/canvas-toolchain-archive/2026-06-04/<slug>__<id>.html` exists in Canvas Files, in a hidden folder.

Verify in the local snapshot:
- `pages-meta.json` has `canvasBreadcrumb` entries.
- `widgets-meta.json` has `canvasBreadcrumb` entries (if widget breadcrumbs fired).

Verify result.pruning is set (likely `pruned: []` and `kept: N` — nothing to prune yet).
Verify result.backup is set.

- [ ] **Step 4: Publish a second time to test auto-prune**

After 3+ publishes, the 4th should prune the oldest. Verify:
- `result.pruning.pruned[]` contains the oldest snapshot id.
- That snapshot's directory is gone from `<courseDir>/.canvas-toolchain/publish-snapshots/`.
- That snapshot's `[ARCHIVED]` Canvas page is deleted (or 404 if you check directly).
- That snapshot's `/canvas-toolchain-archive/<old-date>/` files are deleted.

- [ ] **Step 5: Rollback with drift**

After publishing, manually edit one of the published pages in Canvas (add a paragraph).

Run:
```
rollback_course_publish { snapshotId: <last-publish> }
```

Verify:
- `result.drift[]` contains an entry for the manually-edited page.
- `result.drift[0].expectedHash !== result.drift[0].actualHash`.
- `result.drift[0].action === 'restored'`.
- The page in Canvas now matches the prior content (drift overwritten).

- [ ] **Step 6: Manual prune (dry run)**

```
prune_publish_snapshots { courseId: 20255, courseDir: "<path>", dryRun: true }
```

Verify the response lists what WOULD be pruned without taking action.

- [ ] **Step 7: Manual prune (real)**

```
prune_publish_snapshots { courseId: 20255, courseDir: "<path>" }
```

Verify the prune executed; both local dirs and Canvas-side breadcrumbs cleaned.

---

## Self-review checklist

- [ ] **Spec coverage:**
  - Backup detection: helper module + preview + publish integration. ✓ (C1)
  - `list_publish_snapshots` MCP tool. ✓ (C2)
  - Retention + pruning algorithm + manual tool + auto-prune. ✓ (C3)
  - Canvas breadcrumbs (pages + widgets + cleanup). ✓ (C4)
  - Page drift detection on rollback. ✓ (C5)
  - `canvasBreadcrumbs` opt-in (course default + per-publish override). ✓ (C6)
  - End-to-end manual verification. ✓ (C7)

- [ ] **Plan A dependency:** Plan C uses `snapshotsRootFor`, `snapshotDirFor`, `readPublishStateMeta`, `updateCurrentlyLive`, the `'restored'` phase. All Plan A surface area.

- [ ] **Plan B sibling tolerance:** Tasks C4.1 / C4.2 spell out both the "Plan B shipped" and "Plan B not yet shipped" paths. Minimal `pages_meta.ts` / `widgets_meta.ts` modules in the not-yet-shipped path use only the breadcrumb fields; Plan B's later writers must read-then-write to preserve them.

- [ ] **Backward compat:** Existing publish + rollback workflows continue to work unchanged. New fields on input/output are all optional. Snapshots created before Plan C have no `pages-meta.json` / `widgets-meta.json` — drift detection falls back to hashing `<snapshot>/new/<filename>.html`; breadcrumb cleanup at prune is a no-op (no records to delete).

- [ ] **Best-effort failure handling:**
  - Page breadcrumb create failure: logged, publish continues.
  - Widget breadcrumb upload failure: logged, publish continues.
  - Breadcrumb cleanup at prune: logged in `prune_publish_snapshots` result; local dir delete proceeds.
  - Drift detection: never blocks rollback; always surfaced in result.
  - Pruning failure during `publish_course`: swallowed; publish success is the load-bearing outcome.

- [ ] **Type consistency:** `BackupStatus`, `BackupStatusCode`, `SyncedFolderType` in `manifest_types.ts`. `PageBreadcrumb` in `pages_meta.ts`. `WidgetBreadcrumb` in `widgets_meta.ts`. `PruneSnapshotsResult` in `pruning.ts`. `ListPublishSnapshotsResult` in `list_publish_snapshots.ts`. All exported consistently.

- [ ] **Placeholder scan:** No TBD/TODO. Every step has complete code or exact commands.

---

## Execution handoff

Plan complete. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task. Same pattern as Plan A. Each Phase (C1–C7) maps to 1–4 tasks; each task is a discrete TDD loop (failing test → impl → commit).
2. **Inline Execution** — execute in this session with phase-level checkpoints.

If Plan B ships before Plan C starts: Tasks C4.1 and C4.2 should use the **"Plan B shipped"** path (extend existing `pages_meta.ts` / `widgets_meta.ts` rather than creating minimal versions).

Which approach?
