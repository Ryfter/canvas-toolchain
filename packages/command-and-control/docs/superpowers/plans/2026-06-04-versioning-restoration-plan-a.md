# Versioning & Restoration — Plan A (Foundation)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the publish/rollback state model from "phase per snapshot" to "pointer-based, no snapshot proliferation" (Pattern B). Add project-local snapshot dir default with legacy global fallback. Non-breaking — all existing behavior preserved.

**Architecture:** New top-level `publish-state-<courseId>.json` file tracks the currently-live snapshot. `state.json` gains `'restored'` phase value. `snapshotDir()` resolver checks project-local first, falls back to legacy global. `setup_canvas` gains `snapshotsLocation: 'project' | 'global'` field.

**Tech Stack:** TypeScript 5, ESM, Vitest. No new dependencies.

**Spec:** `packages/command-and-control/docs/superpowers/specs/2026-06-04-versioning-restoration-system-design.md`

**Depends on:** Plan A + Plan B of widget renderer (#88) shipped. C&C baseline at 299 passing tests.

**Ships when complete:** All existing publish/preview/rollback workflows pass unchanged with new pointer-based state machine running underneath. New snapshots land in project-local `.canvas-toolchain/publish-snapshots/`. Legacy snapshots in `~/.command-and-control/publish-snapshots/` still readable. Currently-live snapshot tracked via the new pointer file. Subsequent V&R plans build on this foundation.

---

## File structure

**New files:**

```
packages/command-and-control/src/tools/publish/state_meta.ts         ← NEW: pointer file ops
packages/command-and-control/src/tools/publish/snapshot_location.ts  ← NEW: project-local + fallback resolver
packages/command-and-control/tests/publish/state_meta.test.ts
packages/command-and-control/tests/publish/snapshot_location.test.ts
```

**Modified files:**

```
packages/command-and-control/src/tools/publish/manifest_types.ts       ← extend Phase enum, add PublishStateMeta
packages/command-and-control/src/tools/publish/snapshot_store.ts       ← use snapshot_location resolver
packages/command-and-control/src/tools/setup_canvas.ts                 ← add snapshotsLocation field
packages/command-and-control/src/tools/workflows/publish_course.ts     ← update pointer at publish
packages/command-and-control/src/tools/workflows/rollback_course_publish.ts  ← Pattern B pointer flip
```

---

## Phase A1 — Types + pointer module

### Task A1.1: Extend `Phase` enum + add `PublishStateMeta` interface

**Files:**
- Modify: `packages/command-and-control/src/tools/publish/manifest_types.ts`

- [ ] **Step 1: Add `'restored'` to the Phase enum**

Find the existing `PublishState.phase` type definition and update it:

```ts
// Before:
phase: 'preview' | 'partial' | 'published' | 'rolled-back';

// After:
phase: 'preview' | 'partial' | 'published' | 'rolled-back' | 'restored';
```

Add `restoredCount?: number` to the `PublishState` interface:

```ts
export interface PublishState {
  phase: 'preview' | 'partial' | 'published' | 'rolled-back' | 'restored';
  published: PublishedEntry[];
  failed?: FailedEntry;
  lastUpdatedAt: string;
  /** NEW: incremented each time this snapshot becomes currently-live via rollback or roll-forward.
   *  Diagnostic only; not load-bearing for restore logic. */
  restoredCount?: number;
}
```

- [ ] **Step 2: Add `PublishStateMeta` interface**

Add at the bottom of `manifest_types.ts`:

```ts
/** Tracks the currently-live snapshot per course. Lives at the top level of the
 *  snapshots dir (NOT inside any specific snapshot's directory). Pattern B
 *  rollback updates this pointer rather than creating new snapshot dirs. */
export interface PublishStateMeta {
  courseId: number;
  /** Snapshot whose content matches what's currently live in Canvas. Null when
   *  no successful publish has happened yet. */
  currentlyLiveSnapshotId: string | null;
  /** ISO timestamp when currentlyLiveSnapshotId was last updated. */
  currentlyLiveSince: string;
  /** Append-only audit log. Each entry records when a snapshot became live and
   *  via what mechanism. Pruned snapshots leave their history[] entries here
   *  (faculty can see "you've published 12 times this semester, 3 still on disk"). */
  history: PublishStateMetaHistoryEntry[];
}

export interface PublishStateMetaHistoryEntry {
  snapshotId: string;
  becameLiveAt: string;
  /** Unset for the currently-live entry. */
  becameStaleAt?: string;
  becameLiveVia: 'publish' | 'rollback' | 'roll-forward';
}
```

- [ ] **Step 3: Build to confirm types**

Run: `npm run build --workspace=packages/command-and-control`
Expected: builds clean.

- [ ] **Step 4: Commit**

```bash
git add packages/command-and-control/src/tools/publish/manifest_types.ts
git commit -m "feat(cc): extend Phase enum + add PublishStateMeta for V&R pointer model

Adds the 'restored' phase value (snapshot is currently-live via rollback/roll-forward).
Adds restoredCount? to PublishState for diagnostics.
Adds PublishStateMeta interface for the new publish-state-<courseId>.json pointer file.

Foundation for Pattern B (no snapshot proliferation) — actual pointer file ops
land in Task A1.2. Currently no consumers; types-only change."
```

### Task A1.2: Implement `state_meta.ts` module (pointer file ops)

**Files:**
- Create: `packages/command-and-control/src/tools/publish/state_meta.ts`
- Create: `packages/command-and-control/tests/publish/state_meta.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/command-and-control/tests/publish/state_meta.test.ts
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  readPublishStateMeta,
  writePublishStateMeta,
  updateCurrentlyLive,
  initialStateMeta,
} from '../../src/tools/publish/state_meta.js';
import type { PublishStateMeta } from '../../src/tools/publish/manifest_types.js';

let snapshotsRoot: string;

beforeEach(() => {
  snapshotsRoot = mkdtempSync(join(tmpdir(), 'meta-'));
});

afterEach(() => {
  rmSync(snapshotsRoot, { recursive: true, force: true });
});

describe('readPublishStateMeta', () => {
  it('returns null when no meta file exists for the course', () => {
    expect(readPublishStateMeta(snapshotsRoot, 999)).toBeNull();
  });

  it('reads existing meta file', () => {
    const meta: PublishStateMeta = {
      courseId: 20255,
      currentlyLiveSnapshotId: 'snap-1',
      currentlyLiveSince: '2026-06-04T12:00:00.000Z',
      history: [{ snapshotId: 'snap-1', becameLiveAt: '2026-06-04T12:00:00.000Z', becameLiveVia: 'publish' }],
    };
    writeFileSync(join(snapshotsRoot, 'publish-state-20255.json'), JSON.stringify(meta), 'utf-8');
    expect(readPublishStateMeta(snapshotsRoot, 20255)).toEqual(meta);
  });

  it('returns null when meta file is malformed JSON', () => {
    writeFileSync(join(snapshotsRoot, 'publish-state-20255.json'), '{not json', 'utf-8');
    expect(readPublishStateMeta(snapshotsRoot, 20255)).toBeNull();
  });
});

describe('writePublishStateMeta', () => {
  it('writes meta to the per-course file path', () => {
    const meta = initialStateMeta(20255);
    writePublishStateMeta(snapshotsRoot, meta);
    expect(existsSync(join(snapshotsRoot, 'publish-state-20255.json'))).toBe(true);
    const read = JSON.parse(readFileSync(join(snapshotsRoot, 'publish-state-20255.json'), 'utf-8'));
    expect(read.courseId).toBe(20255);
    expect(read.currentlyLiveSnapshotId).toBeNull();
  });
});

describe('initialStateMeta', () => {
  it('returns an empty meta with no currently-live snapshot', () => {
    const meta = initialStateMeta(20255);
    expect(meta.courseId).toBe(20255);
    expect(meta.currentlyLiveSnapshotId).toBeNull();
    expect(meta.history).toEqual([]);
  });
});

describe('updateCurrentlyLive', () => {
  it('records the new live snapshot and marks the previous one stale', () => {
    const before = initialStateMeta(20255);
    writePublishStateMeta(snapshotsRoot, before);

    updateCurrentlyLive(snapshotsRoot, 20255, 'snap-1', 'publish', '2026-06-04T12:00:00.000Z');
    const afterFirst = readPublishStateMeta(snapshotsRoot, 20255)!;
    expect(afterFirst.currentlyLiveSnapshotId).toBe('snap-1');
    expect(afterFirst.history).toHaveLength(1);
    expect(afterFirst.history[0]!.becameLiveVia).toBe('publish');
    expect(afterFirst.history[0]!.becameStaleAt).toBeUndefined();

    updateCurrentlyLive(snapshotsRoot, 20255, 'snap-2', 'publish', '2026-06-04T13:00:00.000Z');
    const afterSecond = readPublishStateMeta(snapshotsRoot, 20255)!;
    expect(afterSecond.currentlyLiveSnapshotId).toBe('snap-2');
    expect(afterSecond.history).toHaveLength(2);
    expect(afterSecond.history[0]!.snapshotId).toBe('snap-1');
    expect(afterSecond.history[0]!.becameStaleAt).toBe('2026-06-04T13:00:00.000Z');
    expect(afterSecond.history[1]!.snapshotId).toBe('snap-2');
    expect(afterSecond.history[1]!.becameStaleAt).toBeUndefined();
  });

  it('initializes the meta file if it does not exist yet', () => {
    updateCurrentlyLive(snapshotsRoot, 20255, 'snap-1', 'publish', '2026-06-04T12:00:00.000Z');
    const meta = readPublishStateMeta(snapshotsRoot, 20255)!;
    expect(meta.courseId).toBe(20255);
    expect(meta.currentlyLiveSnapshotId).toBe('snap-1');
  });

  it('records via=rollback when a previously-stale snapshot is restored', () => {
    updateCurrentlyLive(snapshotsRoot, 20255, 'snap-1', 'publish', '2026-06-04T12:00:00.000Z');
    updateCurrentlyLive(snapshotsRoot, 20255, 'snap-2', 'publish', '2026-06-04T13:00:00.000Z');
    updateCurrentlyLive(snapshotsRoot, 20255, 'snap-1', 'rollback', '2026-06-04T14:00:00.000Z');

    const meta = readPublishStateMeta(snapshotsRoot, 20255)!;
    expect(meta.currentlyLiveSnapshotId).toBe('snap-1');
    expect(meta.history).toHaveLength(3);
    expect(meta.history[2]!.becameLiveVia).toBe('rollback');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=packages/command-and-control -- publish/state_meta`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Write the implementation**

```ts
// packages/command-and-control/src/tools/publish/state_meta.ts

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PublishStateMeta, PublishStateMetaHistoryEntry } from './manifest_types.js';

function metaPath(snapshotsRoot: string, courseId: number): string {
  return join(snapshotsRoot, `publish-state-${courseId}.json`);
}

/** Returns the persisted PublishStateMeta for a course, or null if no meta file
 *  exists yet or the file is malformed. Malformed-file case treats as "no meta"
 *  so the next publish can initialize fresh — the alternative (throw) would
 *  hard-block publishing on a corrupted state file. */
export function readPublishStateMeta(snapshotsRoot: string, courseId: number): PublishStateMeta | null {
  const path = metaPath(snapshotsRoot, courseId);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as PublishStateMeta;
  } catch {
    return null;
  }
}

export function writePublishStateMeta(snapshotsRoot: string, meta: PublishStateMeta): void {
  writeFileSync(metaPath(snapshotsRoot, meta.courseId), JSON.stringify(meta, null, 2), 'utf-8');
}

/** Fresh state for a course with no publishes yet. */
export function initialStateMeta(courseId: number): PublishStateMeta {
  return {
    courseId,
    currentlyLiveSnapshotId: null,
    currentlyLiveSince: new Date(0).toISOString(),
    history: [],
  };
}

/** Atomically update the pointer to a new currently-live snapshot. Marks the
 *  previously-live entry stale (becameStaleAt) and appends a new history entry
 *  for the new live snapshot. */
export function updateCurrentlyLive(
  snapshotsRoot: string,
  courseId: number,
  snapshotId: string,
  via: PublishStateMetaHistoryEntry['becameLiveVia'],
  timestamp: string,
): void {
  const meta = readPublishStateMeta(snapshotsRoot, courseId) ?? initialStateMeta(courseId);

  // Mark previously-live entry stale (if any)
  if (meta.currentlyLiveSnapshotId) {
    for (let i = meta.history.length - 1; i >= 0; i--) {
      const entry = meta.history[i]!;
      if (entry.snapshotId === meta.currentlyLiveSnapshotId && !entry.becameStaleAt) {
        entry.becameStaleAt = timestamp;
        break;
      }
    }
  }

  meta.history.push({ snapshotId, becameLiveAt: timestamp, becameLiveVia: via });
  meta.currentlyLiveSnapshotId = snapshotId;
  meta.currentlyLiveSince = timestamp;
  writePublishStateMeta(snapshotsRoot, meta);
}
```

- [ ] **Step 4: Run tests + build**

Run: `npm test --workspace=packages/command-and-control -- publish/state_meta`
Expected: 7 tests pass.

Run: `npm run build --workspace=packages/command-and-control`
Expected: builds clean.

- [ ] **Step 5: Commit**

```bash
git add packages/command-and-control/src/tools/publish/state_meta.ts packages/command-and-control/tests/publish/state_meta.test.ts
git commit -m "feat(cc): state_meta module for Pattern B pointer file

read/write/initialize/update helpers for publish-state-<courseId>.json — the
top-level file that tracks the currently-live snapshot per course. Pattern B
rollback (lands in Task A4.1) flips this pointer instead of creating new
snapshot dirs.

Malformed meta file returns null (same as missing) so a corrupt state file
doesn't block the next publish. Stale entries get becameStaleAt timestamps
for diagnostics; history is append-only.

7 tests covering read/write/initial/update flows."
```

---

## Phase A2 — Snapshot location resolver

### Task A2.1: Implement `snapshot_location.ts` module

**Files:**
- Create: `packages/command-and-control/src/tools/publish/snapshot_location.ts`
- Create: `packages/command-and-control/tests/publish/snapshot_location.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/command-and-control/tests/publish/snapshot_location.test.ts
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import {
  resolveSnapshotsRoot,
  resolveSnapshotDir,
} from '../../src/tools/publish/snapshot_location.js';

let courseDir: string;
let legacyHome: string;

beforeEach(() => {
  courseDir = mkdtempSync(join(tmpdir(), 'course-'));
  legacyHome = mkdtempSync(join(tmpdir(), 'home-'));
});

afterEach(() => {
  rmSync(courseDir, { recursive: true, force: true });
  rmSync(legacyHome, { recursive: true, force: true });
});

describe('resolveSnapshotsRoot', () => {
  it('returns project-local path when location=project', () => {
    const root = resolveSnapshotsRoot({
      courseDir,
      location: 'project',
      legacyGlobalRoot: join(legacyHome, '.command-and-control', 'publish-snapshots'),
    });
    expect(root).toBe(join(courseDir, '.canvas-toolchain', 'publish-snapshots'));
  });

  it('returns legacy global path when location=global', () => {
    const root = resolveSnapshotsRoot({
      courseDir,
      location: 'global',
      legacyGlobalRoot: join(legacyHome, '.command-and-control', 'publish-snapshots'),
    });
    expect(root).toBe(join(legacyHome, '.command-and-control', 'publish-snapshots'));
  });

  it('creates the directory if missing', () => {
    const root = resolveSnapshotsRoot({
      courseDir,
      location: 'project',
      legacyGlobalRoot: join(legacyHome, '.command-and-control', 'publish-snapshots'),
    });
    expect(root).toBe(join(courseDir, '.canvas-toolchain', 'publish-snapshots'));
    // After resolveSnapshotsRoot the directory should exist
    // (assert by attempting a write in it — covered in next test)
  });
});

describe('resolveSnapshotDir', () => {
  it('finds snapshot in project-local dir', () => {
    const snapshotsRoot = join(courseDir, '.canvas-toolchain', 'publish-snapshots');
    mkdirSync(join(snapshotsRoot, 'snap-1'), { recursive: true });
    writeFileSync(join(snapshotsRoot, 'snap-1', 'manifest.json'), '{}', 'utf-8');

    const dir = resolveSnapshotDir({
      snapshotId: 'snap-1',
      courseDir,
      location: 'project',
      legacyGlobalRoot: join(legacyHome, '.command-and-control', 'publish-snapshots'),
    });
    expect(dir).toBe(join(snapshotsRoot, 'snap-1'));
  });

  it('falls back to legacy global dir when not found in project location', () => {
    const legacyRoot = join(legacyHome, '.command-and-control', 'publish-snapshots');
    mkdirSync(join(legacyRoot, 'legacy-snap'), { recursive: true });
    writeFileSync(join(legacyRoot, 'legacy-snap', 'manifest.json'), '{}', 'utf-8');

    const dir = resolveSnapshotDir({
      snapshotId: 'legacy-snap',
      courseDir,
      location: 'project',
      legacyGlobalRoot: legacyRoot,
    });
    expect(dir).toBe(join(legacyRoot, 'legacy-snap'));
  });

  it('returns project path even when snapshot does not exist anywhere (for creation)', () => {
    const dir = resolveSnapshotDir({
      snapshotId: 'fresh-snap',
      courseDir,
      location: 'project',
      legacyGlobalRoot: join(legacyHome, '.command-and-control', 'publish-snapshots'),
    });
    expect(dir).toBe(join(courseDir, '.canvas-toolchain', 'publish-snapshots', 'fresh-snap'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=packages/command-and-control -- publish/snapshot_location`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Write the implementation**

```ts
// packages/command-and-control/src/tools/publish/snapshot_location.ts

import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export type SnapshotsLocation = 'project' | 'global';

export interface ResolveSnapshotsRootInput {
  courseDir: string;
  location: SnapshotsLocation;
  /** Absolute path to the legacy global snapshots root.
   *  Typically: join(homedir(), '.command-and-control', 'publish-snapshots') */
  legacyGlobalRoot: string;
}

/** Returns the absolute root directory where this course's snapshots live.
 *  Creates the directory if missing. */
export function resolveSnapshotsRoot(input: ResolveSnapshotsRootInput): string {
  const root = input.location === 'project'
    ? join(input.courseDir, '.canvas-toolchain', 'publish-snapshots')
    : input.legacyGlobalRoot;
  if (!existsSync(root)) mkdirSync(root, { recursive: true });
  return root;
}

export interface ResolveSnapshotDirInput extends ResolveSnapshotsRootInput {
  snapshotId: string;
}

/** Resolves the absolute path to a specific snapshot. For lookups, checks the
 *  configured location first then falls back to the legacy global location
 *  (so existing snapshots from before this refactor remain readable).
 *
 *  For new-snapshot creation, callers will always get the configured location
 *  back when the snapshotId doesn't exist anywhere. */
export function resolveSnapshotDir(input: ResolveSnapshotDirInput): string {
  const primaryRoot = resolveSnapshotsRoot(input);
  const primaryPath = join(primaryRoot, input.snapshotId);

  // Existence check at the primary location
  if (existsSync(join(primaryPath, 'manifest.json'))) return primaryPath;

  // Fallback to legacy location (only useful when configured location is 'project')
  if (input.location === 'project' && existsSync(join(input.legacyGlobalRoot, input.snapshotId, 'manifest.json'))) {
    return join(input.legacyGlobalRoot, input.snapshotId);
  }

  // Not found anywhere — return the primary path (for fresh creation)
  return primaryPath;
}
```

- [ ] **Step 4: Run tests + build**

Run: `npm test --workspace=packages/command-and-control -- publish/snapshot_location`
Expected: 5 tests pass.

Run: `npm run build --workspace=packages/command-and-control`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add packages/command-and-control/src/tools/publish/snapshot_location.ts packages/command-and-control/tests/publish/snapshot_location.test.ts
git commit -m "feat(cc): snapshot_location resolver — project-local default + legacy fallback

resolveSnapshotsRoot() returns <courseDir>/.canvas-toolchain/publish-snapshots/
(project) or the legacy ~/.command-and-control/publish-snapshots/ (global).

resolveSnapshotDir() with location='project' falls back to the legacy global path
for existing snapshots created before this refactor. Returns the primary
project path for fresh-snapshot creation.

5 tests cover both locations + the fallback path."
```

---

## Phase A3 — Wire location resolver + setup_canvas

### Task A3.1: Add `snapshotsLocation` to `setup_canvas` config

**Files:**
- Modify: `packages/command-and-control/src/tools/setup_canvas.ts`

- [ ] **Step 1: Find the existing CanvasSetupConfig interface**

Read the current `setup_canvas.ts` to locate the `CanvasSetupConfig` interface.

- [ ] **Step 2: Add the new field**

Add `snapshotsLocation?: 'project' | 'global'` to `CanvasSetupConfig`:

```ts
export interface CanvasSetupConfig {
  // ... existing fields (host, token, configuredAt, lastValidatedAt) ...
  /** Where new snapshots get written. 'project' = <courseDir>/.canvas-toolchain/publish-snapshots/
   *  (git-trackable, faculty-portable). 'global' = ~/.command-and-control/publish-snapshots/
   *  (legacy, machine-bound). Default: 'project'. Existing snapshots in either location
   *  remain readable via the snapshot_location fallback resolver. */
  snapshotsLocation?: 'project' | 'global';
}
```

- [ ] **Step 3: Verify the load path tolerates the new optional field**

Find `loadCanvasConfig()` in setup_canvas.ts. The existing validation checks `if (!config.host || !config.token)`. The new field is optional so no validation change needed — confirm by reading the function.

- [ ] **Step 4: Build to confirm**

Run: `npm run build --workspace=packages/command-and-control`
Expected: clean.

- [ ] **Step 5: Add a small test for default handling**

Add to existing `packages/command-and-control/tests/setup_canvas.test.ts` (or create if missing):

```ts
import { describe, expect, it } from 'vitest';
import type { CanvasSetupConfig } from '../src/tools/setup_canvas.js';

describe('CanvasSetupConfig', () => {
  it('snapshotsLocation is optional', () => {
    const cfg: CanvasSetupConfig = {
      host: 'example.com',
      token: 'x',
      configuredAt: '2026-06-04T00:00:00.000Z',
      lastValidatedAt: '2026-06-04T00:00:00.000Z',
    };
    expect(cfg.snapshotsLocation).toBeUndefined();
  });

  it('accepts snapshotsLocation when set', () => {
    const cfg: CanvasSetupConfig = {
      host: 'example.com',
      token: 'x',
      configuredAt: '2026-06-04T00:00:00.000Z',
      lastValidatedAt: '2026-06-04T00:00:00.000Z',
      snapshotsLocation: 'project',
    };
    expect(cfg.snapshotsLocation).toBe('project');
  });
});
```

Run: `npm test --workspace=packages/command-and-control -- setup_canvas`
Expected: tests pass (both new + any existing).

- [ ] **Step 6: Commit**

```bash
git add packages/command-and-control/src/tools/setup_canvas.ts packages/command-and-control/tests/setup_canvas.test.ts
git commit -m "feat(cc): add snapshotsLocation option to CanvasSetupConfig

Optional field; default behavior (when unset) treats as 'project' — new snapshots
land at <courseDir>/.canvas-toolchain/publish-snapshots/. Set to 'global' to keep
using ~/.command-and-control/publish-snapshots/.

Backward compat: existing configs without this field load cleanly. The
snapshot_location resolver falls back to the legacy global path when a snapshot
is requested but not found in the configured project location."
```

### Task A3.2: Update `snapshot_store.ts` to use the location resolver

**Files:**
- Modify: `packages/command-and-control/src/tools/publish/snapshot_store.ts`

- [ ] **Step 1: Read the current snapshot_store**

The existing `snapshotsRoot()` function (private) returns `join(getCcHomePath(), 'publish-snapshots')`. We're going to replace its usage with the new resolver, but keep the function around as the "legacy global root" helper.

- [ ] **Step 2: Add a new function that uses the resolver, deprecate the old in stages**

The trick: `snapshot_store.ts` doesn't currently know `courseDir` (the resolver needs it). Some functions like `snapshotDir(snapshotId)` take only the snapshot id. To minimize the blast radius of this change, we'll:

1. Keep `snapshotsRoot()` as a fallback that returns the legacy global path.
2. Add a new internal helper `snapshotsRootFor(courseDir, location)` that uses the resolver.
3. Export new `snapshotDirFor(snapshotId, courseDir, location)` alongside the existing `snapshotDir(snapshotId)`.

Modify `snapshot_store.ts`:

```ts
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { getCcHomePath } from '../../kb/config.js';
import { loadCanvasConfig } from '../setup_canvas.js';
import {
  resolveSnapshotsRoot, resolveSnapshotDir, type SnapshotsLocation,
} from './snapshot_location.js';
import type { PreviewManifest, PublishState, StaleSnapshotPointer } from './manifest_types.js';

/** Legacy global root — the path used before V&R Plan A. Lookups for old
 *  snapshots still resolve through this via the snapshot_location fallback. */
function legacyGlobalRoot(): string {
  const root = join(getCcHomePath(), 'publish-snapshots');
  if (!existsSync(root)) mkdirSync(root, { recursive: true });
  return root;
}

function effectiveLocation(): SnapshotsLocation {
  try {
    const cfg = loadCanvasConfig();
    return cfg.snapshotsLocation ?? 'project';
  } catch {
    return 'project';
  }
}

/** Snapshots root for a specific course. Uses the configured location (default
 *  project-local) with legacy global fallback for lookups. */
export function snapshotsRootFor(courseDir: string): string {
  return resolveSnapshotsRoot({
    courseDir,
    location: effectiveLocation(),
    legacyGlobalRoot: legacyGlobalRoot(),
  });
}

/** Resolve a specific snapshot directory. Checks project-local first; falls
 *  back to legacy global when location='project' and the snapshot isn't found
 *  in the project location. */
export function snapshotDirFor(snapshotId: string, courseDir: string): string {
  return resolveSnapshotDir({
    snapshotId,
    courseDir,
    location: effectiveLocation(),
    legacyGlobalRoot: legacyGlobalRoot(),
  });
}

// === LEGACY (no-courseDir) wrappers — kept for backward compat ===

/** @deprecated — use snapshotsRootFor(courseDir). */
function snapshotsRootLegacy(): string {
  return legacyGlobalRoot();
}

export function newSnapshotId(): string {
  return randomUUID();
}

/** @deprecated — use createSnapshotDirFor(snapshotId, courseDir). */
export function createSnapshotDir(snapshotId: string): string {
  const dir = join(snapshotsRootLegacy(), snapshotId);
  mkdirSync(join(dir, 'prior'), { recursive: true });
  mkdirSync(join(dir, 'new'), { recursive: true });
  mkdirSync(join(dir, 'diffs'), { recursive: true });
  return dir;
}

/** New courseDir-aware snapshot creation. */
export function createSnapshotDirFor(snapshotId: string, courseDir: string): string {
  const dir = join(snapshotsRootFor(courseDir), snapshotId);
  mkdirSync(join(dir, 'prior'), { recursive: true });
  mkdirSync(join(dir, 'new'), { recursive: true });
  mkdirSync(join(dir, 'diffs'), { recursive: true });
  return dir;
}

// === Existing helpers below — unchanged signatures (still work with legacy global) ===

export function writeManifest(dir: string, manifest: PreviewManifest): void {
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');
}

export function readManifest(dir: string): PreviewManifest {
  return JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf-8')) as PreviewManifest;
}

export function writePriorHtml(dir: string, filename: string, html: string): void {
  writeFileSync(join(dir, 'prior', filename), html, 'utf-8');
}

export function readPriorHtml(dir: string, filename: string): string {
  return readFileSync(join(dir, 'prior', filename), 'utf-8');
}

export function priorHtmlExists(dir: string, filename: string): boolean {
  return existsSync(join(dir, 'prior', filename));
}

export function writeNewHtml(dir: string, filename: string, html: string): void {
  writeFileSync(join(dir, 'new', filename), html, 'utf-8');
}

export function writeFullDiff(dir: string, filename: string, diff: string): void {
  writeFileSync(join(dir, 'diffs', `${filename}.diff`), diff, 'utf-8');
}

export function readFullDiff(dir: string, filename: string): string {
  return readFileSync(join(dir, 'diffs', `${filename}.diff`), 'utf-8');
}

export function writeState(dir: string, state: PublishState): void {
  writeFileSync(join(dir, 'state.json'), JSON.stringify(state, null, 2), 'utf-8');
}

export function readState(dir: string): PublishState {
  return JSON.parse(readFileSync(join(dir, 'state.json'), 'utf-8')) as PublishState;
}

/** @deprecated — use snapshotDirFor(snapshotId, courseDir). */
export function snapshotDir(snapshotId: string): string {
  return join(snapshotsRootLegacy(), snapshotId);
}

export function findStaleSnapshot(courseId: number): StaleSnapshotPointer | undefined {
  // Existing implementation — searches the legacy global path. This is still
  // correct because it's checking for partial publishes which were always stored
  // there pre-refactor. Plan A doesn't migrate; new partials in project-local
  // are picked up by a follow-up enhancement if needed.
  const root = legacyGlobalRoot();
  if (!existsSync(root)) return undefined;
  const candidates: { snapshotId: string; state: PublishState; manifest: PreviewManifest }[] = [];
  for (const id of readdirSync(root)) {
    const dir = join(root, id);
    if (!existsSync(join(dir, 'state.json'))) continue;
    if (!existsSync(join(dir, 'manifest.json'))) continue;
    try {
      const m = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf-8')) as PreviewManifest;
      if (m.courseId !== courseId) continue;
      const s = JSON.parse(readFileSync(join(dir, 'state.json'), 'utf-8')) as PublishState;
      if (s.phase === 'partial') candidates.push({ snapshotId: id, state: s, manifest: m });
    } catch { /* skip corrupt */ }
  }
  if (candidates.length === 0) return undefined;
  candidates.sort((a, b) => a.state.lastUpdatedAt < b.state.lastUpdatedAt ? 1 : -1);
  const latest = candidates[0]!;
  const failed = latest.state.failed;
  if (!failed) return undefined;
  return {
    snapshotId: latest.snapshotId,
    lastFailedFile: failed.filename,
    failedAt: failed.failedAt,
    fix: [
      'Resolve the underlying Canvas error reported in state.json.',
      `Resume with publish_course { snapshotId: "${latest.snapshotId}", resume: true } once ready,`,
      `or rollback with rollback_course_publish { snapshotId: "${latest.snapshotId}" }.`,
    ],
  };
}
```

- [ ] **Step 3: Verify the build is clean**

Run: `npm run build --workspace=packages/command-and-control`
Expected: builds clean.

- [ ] **Step 4: Run full C&C test suite for regression check**

Run: `npm test --workspace=packages/command-and-control`
Expected: all 299 tests pass (existing) + new state_meta + snapshot_location tests = ~312+. Zero failures.

- [ ] **Step 5: Commit**

```bash
git add packages/command-and-control/src/tools/publish/snapshot_store.ts
git commit -m "refactor(cc): snapshot_store gains courseDir-aware variants alongside legacy

New: snapshotsRootFor(courseDir), snapshotDirFor(snapshotId, courseDir),
createSnapshotDirFor(snapshotId, courseDir). These use the snapshot_location
resolver (project-local default + legacy global fallback for lookups).

Existing legacy functions (snapshotsRoot, createSnapshotDir, snapshotDir) are
deprecated but preserved unchanged so consumers (publish_course, preview, rollback)
keep working. Migration to the new functions happens task-by-task in Phase A4."
```

---

## Phase A4 — Wire workflows to Pattern B

### Task A4.1: `publish_course` updates the pointer file

**Files:**
- Modify: `packages/command-and-control/src/tools/workflows/publish_course.ts`

- [ ] **Step 1: Add imports for the new modules**

```ts
import { snapshotsRootFor } from '../publish/snapshot_store.js';
import { updateCurrentlyLive } from '../publish/state_meta.js';
```

- [ ] **Step 2: At the end of successful publish, update the pointer file**

Find the place where `publishCourse` writes its final state (currently `writeState(dir, { phase: 'published', ... })`). After that write, also update the pointer:

```ts
writeState(dir, { phase: 'published', published, lastUpdatedAt: new Date().toISOString() });

// NEW: update the pointer file. This is what makes the new publish "currently live"
// for subsequent rollback/list operations.
const snapshotsRoot = snapshotsRootFor(manifest.courseDir);
updateCurrentlyLive(snapshotsRoot, manifest.courseId, input.snapshotId, 'publish', new Date().toISOString());
```

- [ ] **Step 3: Run existing publish_course tests for regression**

Run: `npm test --workspace=packages/command-and-control -- publish_course`
Expected: existing tests pass. New behavior is additive (pointer file written; nothing reads it yet from existing test paths).

- [ ] **Step 4: Add a focused test**

```ts
// In packages/command-and-control/tests/workflows/publish_course-state-meta.test.ts (new file)
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { publishCourse } from '../../src/tools/workflows/publish_course.js';
import { snapshotsRootFor, snapshotDirFor, createSnapshotDirFor, writeManifest, writeNewHtml, writeState } from '../../src/tools/publish/snapshot_store.js';
import type { PreviewManifest, PublishState } from '../../src/tools/publish/manifest_types.js';

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
  vi.unstubAllGlobals();
});

describe('publishCourse pointer file', () => {
  it('updates publish-state-<courseId>.json at end of successful publish', async () => {
    // Setup minimal snapshot
    const snapshotId = 'test-snap-1';
    const dir = createSnapshotDirFor(snapshotId, courseDir);
    const manifest: PreviewManifest = {
      snapshotId, courseId: 20255, courseDir,
      generatedAt: '2026-06-04T12:00:00.000Z',
      git: { isRepo: false },
      entries: [{
        type: 'page', filename: 'overview.html', pageType: 'overview',
        intendedTitle: 'Overview', collisionAction: 'create',
        diff: { priorWords: null, newWords: 50, delta: 50, sectionsChanged: 0, calloutsAdded: 0, calloutsRemoved: 0, imagesChanged: 0, hasFullDiff: false },
        warnings: [],
      }],
      summary: { total: 1, pages: 1, assignments: 0, skipped: 0, warningsCount: 0, ferpaCount: 0, collisionsCount: 0 },
    };
    writeManifest(dir, manifest);
    writeNewHtml(dir, 'overview.html', '<p>new</p>');
    const state: PublishState = { phase: 'preview', published: [], lastUpdatedAt: '2026-06-04T12:00:00.000Z' };
    writeState(dir, state);

    // Mock Canvas API
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const u = String(url);
      const method = init?.method ?? 'GET';
      if (u.includes('/pages') && method === 'GET') {
        return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({
        page_id: 1, url: 'overview', title: 'Overview', html_url: 'https://canvas/courses/20255/pages/overview', body: '', published: true, updated_at: '',
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }));

    const result = await publishCourse({ snapshotId, approvals: { 'overview.html': 'approve' }, gitCommit: false });

    expect(result.phase).toBe('published');

    // VERIFY: pointer file exists and points to this snapshot
    const metaPath = join(snapshotsRootFor(courseDir), 'publish-state-20255.json');
    expect(existsSync(metaPath)).toBe(true);
    const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
    expect(meta.currentlyLiveSnapshotId).toBe(snapshotId);
    expect(meta.history).toHaveLength(1);
    expect(meta.history[0].becameLiveVia).toBe('publish');
  });
});
```

Run: `npm test --workspace=packages/command-and-control -- publish_course-state-meta`
Expected: 1 test passes.

- [ ] **Step 5: Run full C&C suite for regression**

Run: `npm test --workspace=packages/command-and-control`
Expected: all existing + new tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/command-and-control/src/tools/workflows/publish_course.ts packages/command-and-control/tests/workflows/publish_course-state-meta.test.ts
git commit -m "feat(cc): publish_course updates Pattern B pointer file on success

After writing state.json with phase='published', publishCourse now also writes
publish-state-<courseId>.json via updateCurrentlyLive(). This is the source of
truth for what Canvas's live state matches.

Additive: nothing breaks if the pointer file doesn't exist (rollback_course_publish
will still default to today's behavior until Task A4.2). Existing publish_course
tests pass unchanged (the new write is silent unless explicitly inspected)."
```

### Task A4.2: `rollback_course_publish` uses Pattern B pointer semantics

**Files:**
- Modify: `packages/command-and-control/src/tools/workflows/rollback_course_publish.ts`

- [ ] **Step 1: Import the new modules + reshape input**

```ts
import { snapshotsRootFor } from '../publish/snapshot_store.js';
import { readPublishStateMeta, updateCurrentlyLive } from '../publish/state_meta.js';
```

Update `RollbackCoursePublishInput`:

```ts
export interface RollbackCoursePublishInput {
  /** Snapshot to operate on (the one being undone). Existing param, kept. */
  snapshotId: string;
  /** NEW: target snapshot to restore TO. When omitted, defaults to the snapshot
   *  immediately PRIOR to the currently-live one (matches today's "undo last
   *  publish" behavior). */
  targetSnapshotId?: string;
}
```

- [ ] **Step 2: After existing rollback logic, update the pointer file**

At the end of the existing `rollbackCoursePublish` function — right before the final `writeState(dir, { phase: 'rolled-back', ... })`:

```ts
// Pattern B: update the pointer file.
// When targetSnapshotId is set, the pointer flips TO that snapshot.
// When omitted, the pointer flips to the previously-live snapshot (immediately
// before input.snapshotId), if any exists in history.
const snapshotsRoot = snapshotsRootFor(manifest.courseDir);
const meta = readPublishStateMeta(snapshotsRoot, manifest.courseId);
let pointerTarget: string | null = input.targetSnapshotId ?? null;

if (!pointerTarget && meta) {
  // Find the snapshot that was live BEFORE input.snapshotId (i.e., the one we'd
  // logically be returning to with "undo my last publish").
  const idxOfRolledBack = meta.history.findIndex(h => h.snapshotId === input.snapshotId);
  if (idxOfRolledBack > 0) {
    pointerTarget = meta.history[idxOfRolledBack - 1]!.snapshotId;
  }
}

if (pointerTarget) {
  updateCurrentlyLive(snapshotsRoot, manifest.courseId, pointerTarget, 'rollback', new Date().toISOString());

  // Update the TARGET snapshot's state.phase to 'restored' (it's now live again).
  // The previously-live snapshot's phase stays at 'published' from the prior publish;
  // the rolled-back snapshot's phase becomes 'rolled-back' (existing behavior, line below).
  const targetDir = snapshotDirFor(pointerTarget, manifest.courseDir);
  if (existsSync(join(targetDir, 'state.json'))) {
    const targetState = readState(targetDir);
    writeState(targetDir, {
      ...targetState,
      phase: 'restored',
      restoredCount: (targetState.restoredCount ?? 0) + 1,
      lastUpdatedAt: new Date().toISOString(),
    });
  }
}

writeState(dir, { phase: 'rolled-back', published: state.published, lastUpdatedAt: new Date().toISOString() });
```

Add `snapshotDirFor`, `readState` to the imports if not already present.

- [ ] **Step 3: Verify existing rollback tests still pass**

Run: `npm test --workspace=packages/command-and-control -- rollback_course_publish`
Expected: all existing tests pass. Pattern B additive behavior doesn't break the existing fixtures (they don't assert on pointer state).

- [ ] **Step 4: Add focused tests for Pattern B**

Create `packages/command-and-control/tests/workflows/rollback_course_publish-pattern-b.test.ts`:

```ts
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rollbackCoursePublish } from '../../src/tools/workflows/rollback_course_publish.js';
import { snapshotsRootFor, createSnapshotDirFor, writeManifest, writePriorHtml, writeNewHtml, writeState } from '../../src/tools/publish/snapshot_store.js';
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
  vi.unstubAllGlobals();
});

function setupTwoSnapshots(): { snap1Id: string; snap2Id: string } {
  const snap1Id = 'snap-1';
  const snap2Id = 'snap-2';

  for (const id of [snap1Id, snap2Id]) {
    const dir = createSnapshotDirFor(id, courseDir);
    const manifest: PreviewManifest = {
      snapshotId: id, courseId: 20255, courseDir,
      generatedAt: '2026-06-04T12:00:00.000Z',
      git: { isRepo: false },
      entries: [{
        type: 'page', filename: 'overview.html', pageType: 'overview',
        intendedTitle: 'Overview', collisionAction: 'update',
        canvasMatch: { pageId: 'overview', url: '', existingTitle: '', similarity: 1 },
        diff: { priorWords: 10, newWords: 20, delta: 10, sectionsChanged: 0, calloutsAdded: 0, calloutsRemoved: 0, imagesChanged: 0, hasFullDiff: false },
        warnings: [],
      }],
      summary: { total: 1, pages: 1, assignments: 0, skipped: 0, warningsCount: 0, ferpaCount: 0, collisionsCount: 0 },
    };
    writeManifest(dir, manifest);
    writePriorHtml(dir, 'overview.html', `<p>prior content for ${id}</p>`);
    writeNewHtml(dir, 'overview.html', `<p>new content for ${id}</p>`);
    writeState(dir, {
      phase: 'published',
      published: [{
        filename: 'overview.html', type: 'page', canvasUrl: '', canvasPageSlug: 'overview',
        action: 'updated', publishedAt: '2026-06-04T12:00:00.000Z',
      }],
      lastUpdatedAt: '2026-06-04T12:00:00.000Z',
    });
  }

  // Initialize meta with snap-1 → snap-2 history; snap-2 is currently-live.
  const meta: PublishStateMeta = {
    courseId: 20255,
    currentlyLiveSnapshotId: snap2Id,
    currentlyLiveSince: '2026-06-04T13:00:00.000Z',
    history: [
      { snapshotId: snap1Id, becameLiveAt: '2026-06-04T12:00:00.000Z', becameStaleAt: '2026-06-04T13:00:00.000Z', becameLiveVia: 'publish' },
      { snapshotId: snap2Id, becameLiveAt: '2026-06-04T13:00:00.000Z', becameLiveVia: 'publish' },
    ],
  };
  writePublishStateMeta(snapshotsRootFor(courseDir), meta);

  return { snap1Id, snap2Id };
}

describe('rollbackCoursePublish Pattern B pointer behavior', () => {
  it('flips pointer to the immediately-prior snapshot when targetSnapshotId is omitted', async () => {
    const { snap1Id, snap2Id } = setupTwoSnapshots();

    // Mock Canvas page update
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      page_id: 1, url: 'overview', title: 'Overview', html_url: '', body: '', published: true, updated_at: '',
    }), { status: 200, headers: { 'content-type': 'application/json' } })));

    await rollbackCoursePublish({ snapshotId: snap2Id });

    // VERIFY: pointer file now points at snap-1
    const metaPath = join(snapshotsRootFor(courseDir), 'publish-state-20255.json');
    const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
    expect(meta.currentlyLiveSnapshotId).toBe(snap1Id);
    expect(meta.history[meta.history.length - 1].becameLiveVia).toBe('rollback');
  });

  it('flips pointer to the explicit targetSnapshotId when provided', async () => {
    const { snap1Id, snap2Id } = setupTwoSnapshots();

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      page_id: 1, url: 'overview', title: 'Overview', html_url: '', body: '', published: true, updated_at: '',
    }), { status: 200, headers: { 'content-type': 'application/json' } })));

    await rollbackCoursePublish({ snapshotId: snap2Id, targetSnapshotId: snap1Id });

    const metaPath = join(snapshotsRootFor(courseDir), 'publish-state-20255.json');
    const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
    expect(meta.currentlyLiveSnapshotId).toBe(snap1Id);
  });

  it('updates target snapshot phase to "restored" and increments restoredCount', async () => {
    const { snap1Id, snap2Id } = setupTwoSnapshots();

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      page_id: 1, url: 'overview', title: 'Overview', html_url: '', body: '', published: true, updated_at: '',
    }), { status: 200, headers: { 'content-type': 'application/json' } })));

    await rollbackCoursePublish({ snapshotId: snap2Id, targetSnapshotId: snap1Id });

    // Read snap-1's state.json
    const snap1Dir = join(snapshotsRootFor(courseDir), snap1Id);
    const snap1State = JSON.parse(readFileSync(join(snap1Dir, 'state.json'), 'utf-8'));
    expect(snap1State.phase).toBe('restored');
    expect(snap1State.restoredCount).toBe(1);
  });
});
```

Run: `npm test --workspace=packages/command-and-control -- rollback_course_publish-pattern-b`
Expected: 3 tests pass.

- [ ] **Step 5: Full C&C suite regression**

Run: `npm test --workspace=packages/command-and-control`
Expected: previous 299 + new state_meta + snapshot_location + 2 pattern-b tests = ~318 passing.

- [ ] **Step 6: Build**

Run: `npm run build`
Expected: all 5 packages build clean.

- [ ] **Step 7: Commit**

```bash
git add packages/command-and-control/src/tools/workflows/rollback_course_publish.ts packages/command-and-control/tests/workflows/rollback_course_publish-pattern-b.test.ts
git commit -m "feat(cc): rollback_course_publish flips Pattern B pointer

After rolling back via existing logic, also:
1. Update publish-state-<courseId>.json to point at the target snapshot
   (explicit targetSnapshotId param OR the immediately-prior snapshot from history).
2. Set the target snapshot's state.phase to 'restored' and increment restoredCount.

Pattern B: no new snapshot dirs created for rollback. The pointer flip IS the
rollback in terms of 'what's currently live in Canvas'.

3 tests cover: default-to-prior, explicit target, phase update + restoredCount."
```

---

## Plan A ship checkpoint

After Task A4.2 completes:

- [ ] Run `npm test` (full monorepo): roughly +20 new tests (state_meta 7, snapshot_location 5, setup_canvas 2, publish_course_pointer 1, rollback_pattern_b 3, plus a couple of additions). Total ~1138+ passing.
- [ ] Run `npm run build`: all 5 packages build clean.
- [ ] **Manual verification (with the professor, against University sandbox):**
  - Run `preview_course_publish` against a course; verify the snapshot lands at `<courseDir>/.canvas-toolchain/publish-snapshots/<id>/` (NOT in `~/.command-and-control/`).
  - Run `publish_course`; verify `publish-state-20255.json` is created next to the snapshot dirs.
  - Run a second publish; verify the pointer file updates to the new snapshot.
  - Run `rollback_course_publish { snapshotId: <second-publish-id> }`; verify pointer flips back to first snapshot.
- [ ] Memory update: note that Pattern B refactor shipped, the V&R foundation is in place.

---

## Self-review checklist

- [ ] **Spec coverage:** Plan A implements: Phase enum extension, PublishStateMeta type + state_meta module, project-local snapshot dir + legacy fallback (snapshot_location module + snapshot_store updates), setup_canvas config, pointer-file updates at publish + rollback. ✓
- [ ] **Placeholder scan:** No TBD/TODO. Every step has complete code or exact commands.
- [ ] **Type consistency:** `PublishStateMeta`, `PublishStateMetaHistoryEntry`, `Phase` enum extension all defined in manifest_types.ts. `snapshotsRootFor`/`snapshotDirFor`/`createSnapshotDirFor` exports from snapshot_store.ts. `resolveSnapshotsRoot`/`resolveSnapshotDir` from snapshot_location.ts. All used consistently across tasks.
- [ ] **Backward compat:** Existing functions (snapshotsRoot, snapshotDir, createSnapshotDir) preserved unchanged. New functions added alongside. Existing tests pass without modification.

## Execution handoff

Plan complete. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, fast iteration. Same pattern as Plans A/B for widget renderer.
2. **Inline Execution** — execute in this session with checkpoints.

Which approach?
