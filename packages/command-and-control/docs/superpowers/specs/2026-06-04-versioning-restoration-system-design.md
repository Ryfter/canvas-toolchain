# Versioning & Restoration System Design

**Status:** Design approved 2026-06-04
**Author:** Claude + the professor (brainstormed 2026-06-04)
**Depends on:** Plan A + Plan B of widget renderer (#88) shipped; touches the same snapshot/publish surfaces.

## Goal

Replace the current one-shot publish-then-rollback model with a **persistent versioned publish history** that lets faculty:

1. Roll back any publish (course-wide or per-item) to any prior snapshot.
2. Roll forward to any later snapshot — including ones that were previously rolled back.
3. Browse prior versions in Canvas itself, not just inside the toolchain.
4. Get smart backup recommendations before publishing.
5. Have widget content actually restored on rollback (closing the Plan B gap).

## Background

Plan B (the widget renderer) shipped 2026-06-03. Two known gaps were documented for deferral:

- **Preview status granularity** — widget preview shows `'ready' / 'missing-html' / 'missing-spec'`, but the original spec called for `'new' / 'changed' / 'unchanged'` based on content comparison.
- **Rollback is delete-only** — `rollback_course_publish` removes the widget files this publish created but cannot restore the prior content (Canvas Files `on_duplicate=overwrite` semantics: file_id changes on every overwrite per Phase 0 finding 2026-06-03).

Faculty workflow review surfaced that the rollback gap is significant — and the right fix isn't a widget-specific patch; it's a properly-designed versioning layer for the whole publish system. This spec is that layer.

## Locked design decisions (from brainstorming Q1-Q5 + section reviews)

1. **Hybrid rollback granularity.** Both atomic course-wide rollback (entire course state) AND surgical per-item rollback (single page or single widget) are supported.
2. **Local-authoritative storage with opt-in Canvas breadcrumbs.** Local snapshot dir is the technical archive used by all restore operations. Canvas-side date-stamped archive pages and a hidden archive folder are opt-in faculty-facing visibility — never read by restore.
3. **Retention: `max(last 3 publishes, last 30 days)`, configurable.** Whichever is more generous wins. Never prunes the currently-live snapshot regardless of age.
4. **Backup detection without enforcement.** Smart-detected status (git, OneDrive/iCloud/Dropbox/Google Drive, network shares) surfaced as a recommendation in `preview_course_publish` and `publish_course` output. Faculty sees the status but is never blocked.
5. **MCP tool surface: minimal extension.** Existing three tools (`preview_course_publish`, `publish_course`, `rollback_course_publish`) gain optional params. Two new tools added: `list_publish_snapshots`, `prune_publish_snapshots`. No deprecations.
6. **Snapshot dir location: project-local default.** `<courseDir>/.canvas-toolchain/publish-snapshots/` by default (git-trackable, faculty-portable). Legacy `~/.command-and-control/publish-snapshots/` continues to work for existing snapshots. `setup_canvas` adds `snapshotsLocation: 'project' | 'global'` (default `'project'`).
7. **Drift handling: best-effort-with-warning.** Restore proceeds regardless of Canvas-side drift; the result lists which items had drifted so faculty can review what got overwritten. `force: true` is accepted but no longer required.
8. **Pattern B for state: pointer-based, not snapshot proliferation.** Rollback does NOT create a new snapshot dir. Instead, a `currentlyLiveSnapshotId` pointer flips. Snapshot count = publish count exactly. Each snapshot's `state.phase` updates to reflect its role (`'restored'` when currently live; `'rolled-back'` when previously live and now superseded).

## Architecture overview

```
                         ┌──────────────────────────────────────────────┐
                         │       Local Snapshot Archive (authoritative)  │
                         │   <courseDir>/.canvas-toolchain/publish-      │
                         │   snapshots/<snapshotId>/                     │
                         │     manifest.json                             │
                         │     state.json                                │
                         │     prior/<filename>.html                     │
                         │     prior/widgets/<slug>__<id>.html  ← NEW    │
                         │     new/<filename>.html                       │
                         │     new/widgets/<slug>__<id>.html    ← NEW    │
                         │     diffs/<filename>.diff                     │
                         │     diffs/widgets/<slug>__<id>.diff  ← NEW    │
                         │     widgets-meta.json                ← NEW    │
                         │     pages-meta.json                  ← NEW    │
                         └──────────────────────────────────────────────┘
                                            │
                                            │  + publish-state-<courseId>.json
                                            │    { currentlyLiveSnapshotId,
                                            │      currentlyLiveSince,
                                            │      restoredAt? }
                                            │
                ┌───────────────────────────┼───────────────────────────┐
                │                           │                           │
                ▼                           ▼                           ▼
preview_course_publish        publish_course                  rollback_course_publish
   captures prior content         new snapshot,                 { targetSnapshotId?, items?,
   from Canvas (pages +           Canvas breadcrumb,             force? }
   widgets), computes diffs       pointer update,                pointer flip; per-item
   + new/changed/unchanged         retention prune                drift detection
   status, runs backup
   detection
                                            │
                                            ▼
                        ┌───────────────────────────────────┐
                        │       Canvas (live state)         │
                        │  Pages: current + [ARCHIVED]      │
                        │         [ARCHIVED] Wk3 — 2026-06-04│
                        │  Files: current + /canvas-         │
                        │         toolchain-archive/         │
                        │         2026-06-04/                │
                        └───────────────────────────────────┘

                              list_publish_snapshots(courseId) ← NEW
                              prune_publish_snapshots(courseId, dryRun?) ← NEW
```

## Data model

### Per-snapshot directory layout

```
<snapshotsDir>/<snapshotId>/
  manifest.json              PreviewManifest (existing + new fields below)
  state.json                 PublishState (existing + new phase values)
  prior/
    <filename>.html          prior page HTML (existing)
    widgets/                                                  NEW
      <slug>__<id>.html      prior widget HTML, fetched from Canvas at preview
  new/
    <filename>.html          new page HTML (existing)
    widgets/                                                  NEW
      <slug>__<id>.html      new widget HTML, copied from courseDir
  diffs/
    <filename>.diff          page diff (existing)
    widgets/                                                  NEW
      <slug>__<id>.diff      widget diff (computed during preview)
  widgets-meta.json          NEW: per-widget upload tracking
  pages-meta.json            NEW: per-page metadata for drift detection
```

The `__` (double underscore) separator between `<slug>` and `<id>` is intentional — both slugs and ids may contain single hyphens (catalog kind names use them).

### `widgets-meta.json` schema

```ts
interface WidgetsMeta {
  widgets: Record<string, {                       // key = `<slug>__<id>`
    priorCanvasFileId: number | null;             // null if widget is new
    priorContentHash: string | null;              // sha256 of prior content
    newContentHash: string;                       // sha256 of new content
    publishedCanvasFileId?: number;               // set after publish_course succeeds
    canvasBreadcrumb?: {
      folderId: number;
      filePath: string;                           // /canvas-toolchain-archive/<date>/<slug>__<id>.html
      breadcrumbFileId: number;                   // for cleanup at prune time
    };
  }>;
}
```

### `pages-meta.json` schema

```ts
interface PagesMeta {
  pages: Record<string, {                         // key = filename (e.g., "wk3-overview.html")
    priorCanvasPageSlug: string | null;           // null if page is new
    priorContentHash: string | null;
    newContentHash: string;
    publishedAt?: string;
    canvasBreadcrumb?: {
      archivedPageSlug: string;                   // archived-<original>-<date>
      archivedPageId: string;                     // for cleanup at prune time
    };
  }>;
}
```

### `state.json` extended

```ts
type Phase =
  | 'preview'        // snapshot exists, never published
  | 'published'      // historical: was live at some point, has been superseded
  | 'restored'       // current: live state of Canvas matches this snapshot
  | 'rolled-back'    // historical: was restored, now superseded by another
  | 'partial';       // existing — publish stopped mid-loop

interface PublishState {
  phase: Phase;
  published: PublishedEntry[];                    // existing
  failed?: FailedEntry;                           // existing
  lastUpdatedAt: string;
  restoredCount?: number;                         // NEW: how many times this snapshot has been restored
}
```

### `publish-state-<courseId>.json` (new top-level file)

Lives at `<snapshotsDir>/publish-state-<courseId>.json` — outside any specific snapshot dir.

```ts
interface PublishStateMeta {
  courseId: number;
  currentlyLiveSnapshotId: string | null;         // null if no publishes yet
  currentlyLiveSince: string;                     // ISO date
  history: Array<{
    snapshotId: string;
    becameLiveAt: string;
    becameStaleAt?: string;                       // unset for the current one
    becameLiveVia: 'publish' | 'rollback' | 'roll-forward';
  }>;
}
```

This is the SOURCE OF TRUTH for "what's currently live in Canvas." Pruning preserves this file across snapshot deletes; the `history[]` keeps entries for pruned snapshots so faculty can see "you've published 12 times this semester, 3 are still on disk."

### `manifest.json` field additions

```ts
interface PreviewManifest {
  // ... existing fields ...
  backup?: {                                      // NEW: backup detection result
    status: 'git-pushed' | 'git-committed' | 'git-no-remote' | 'synced-folder' | 'none';
    message: string;
    detected: {
      gitRemote?: string;
      syncedFolderType?: 'OneDrive' | 'iCloud' | 'Dropbox' | 'GoogleDrive' | 'NetworkShare' | 'ExternalMount';
    };
  };
}
```

### `WidgetPreviewStatus.status` enum (extends Plan B's `'ready'/'missing-*'`)

```ts
type Status =
  | 'new'           // no prior version in Canvas (page is new OR widget didn't exist before)
  | 'unchanged'     // prior content hash matches new content hash
  | 'changed'       // prior content hash differs from new
  | 'missing-html'  // local widget HTML file not found
  | 'missing-spec'; // local widget spec.json not found
```

### `PublishedEntry.widgets[]` extends

```ts
interface WidgetPublishResult {
  id: string;
  status: 'published' | 'failed';
  canvasFileId?: number;
  priorCanvasFileId?: number;                     // NEW: from widgets-meta for cleanup
  error?: string;
}
```

## MCP tool surface

Three existing tools gain optional parameters. Two new tools added. No deprecations.

### `preview_course_publish` — extended

**Input** (unchanged):
```ts
{ courseDir: string; courseId: number; outputDir?: string; fullDiffFor?: string[] }
```

**Output additions:**
- `manifest.backup` — backup detection result (schema above).
- Each page entry's `widgets[]` items use the upgraded status enum.

**New behavior at preview time:**
1. For each widget reference in each rendered page, fetch the prior Canvas page HTML (already happens for page diffs), scan it for matching widget iframe references, fetch each prior widget file via `getFileContent(fileId)`, save to `prior/widgets/`, hash it, compare against the local `new/widgets/<id>.html` hash, set status accordingly.
2. Run backup detection (`detectBackupState(courseDir)`) and embed result in manifest.

### `publish_course` — extended

**Input additions:**
```ts
{
  // ... existing ...
  forcePublishOnDrift?: boolean;                 // default false; reserved for v1.x — currently no-op
  canvasBreadcrumbs?: boolean;                   // overrides setup default for this run
}
```

**Output additions:**
```ts
{
  // ... existing ...
  snapshot: {
    snapshotId: string;                          // the snapshot just published
    replacedSnapshotId?: string;                 // previously-live snapshot, if any
    currentlyLiveSnapshotId: string;             // pointer state after publish
  };
  backup: {                                       // same shape as preview
    status: ...;
    message: string;
    detected: {...};
  };
  pruning?: {
    pruned: Array<{ snapshotId: string; publishedAt: string; canvasBreadcrumbsCleaned: boolean }>;
    kept: number;
    errors: Array<{ snapshotId: string; resource: string; reason: string }>;
  };
}
```

**New behavior:**
1. After successful page+widget publish, create Canvas breadcrumbs if enabled.
2. Update `publish-state-<courseId>.json` to point at the new snapshot.
3. Run retention pruning (Section 7); attach result to output.

### `rollback_course_publish` — re-shaped

**Input** (now):
```ts
{
  snapshotId: string;                            // existing — kept for backward compat
  targetSnapshotId?: string;                     // NEW: when present, becomes the restoration target
  items?: string[];                              // NEW: file-path strings within snapshot tree
  force?: boolean;                               // NEW: log-only flag, drift always proceeds
}
```

**Note:** `snapshotId` (existing) is the "owner" of the rollback operation — usually the most recent publish you're undoing. `targetSnapshotId` (new) is where you want to land. When omitted, `targetSnapshotId` defaults to the snapshot immediately PRIOR to currently-live (matching today's "undo my last publish" behavior).

**`items[]` path syntax:**
- `'wk3-overview.html'` — restore just this page from the snapshot
- `'wk3-overview/widgets/data-types-categorize'` — restore just this widget (no extension; both `.html` and the metadata travel together)

Implementation walks the snapshot's `prior/`, `new/`, and widget dirs; matches each items[] string against any of them.

**Output additions:**
```ts
{
  // ... existing restored, restoreFailed, phase, error, fix ...
  widgetsCleaned: WidgetRollbackResult[];        // existing from Plan B Task B4.4
  drift?: Array<{                                // NEW: items whose Canvas state had drifted
    item: string;
    expectedHash: string;
    actualHash: string;
    action: 'restored' | 'kept';
  }>;
  pointerUpdate?: {                              // NEW: present when full course rollback
    previouslyLiveSnapshotId: string;
    nowLiveSnapshotId: string;
    becameLiveVia: 'rollback' | 'roll-forward';
  };
}
```

**Pointer semantics:**
- Full course restore (no `items[]`): updates `currentlyLiveSnapshotId` to `targetSnapshotId`. Snapshot's `state.phase` becomes `'restored'` (idempotent — staying 'restored' on a repeat restore is fine; `restoredCount++` for diagnostics). Previously-live snapshot's phase becomes `'rolled-back'` (also idempotent — a snapshot can cycle `'published' → 'restored' → 'rolled-back' → 'restored' → ...` freely as the pointer flips).
- Partial restore (`items[]` provided): pointer does NOT move. The partial restore is explicit drift the user owns. Subsequent rollback calls will detect that drift normally and surface it in the `drift[]` output.

### `list_publish_snapshots` — NEW

```ts
list_publish_snapshots({ courseId: number }): {
  currentlyLiveSnapshotId: string | null;
  snapshots: Array<{
    snapshotId: string;
    publishedAt: string;
    phase: Phase;
    summary: { pages: number; assignments: number; widgets: number };
    isCurrent: boolean;
    canRollBackTo: boolean;                      // false if isCurrent
    canRollForwardTo: boolean;                   // true if isCurrent === false AND phase === 'rolled-back'
    backupAtPublishTime?: 'git-pushed' | 'git-committed' | 'synced-folder' | 'none';
  }>;
}
```

Returns oldest → newest. Faculty pipes this output to a follow-up `rollback_course_publish { targetSnapshotId }` to restore a specific snapshot.

### `prune_publish_snapshots` — NEW

```ts
prune_publish_snapshots({ courseId: number; dryRun?: boolean }): {
  wouldPrune: Array<{
    snapshotId: string;
    publishedAt: string;
    reason: 'count' | 'age';
    daysOld: number;
    canvasBreadcrumbsToDelete: number;
  }>;
  pruned?: Array<{                               // present when dryRun is false
    snapshotId: string;
    canvasBreadcrumbsCleaned: boolean;
    errors: Array<{ resource: string; reason: string }>;
  }>;
}
```

`dryRun: true` shows what WOULD be pruned without taking action — useful before increasing retention config.

## Backup detection

Runs at the end of `preview_course_publish` and the start of `publish_course`. Pure inspection — no actions, no enforcement.

### Detection logic

```ts
function detectBackupState(courseDir: string): BackupStatus {
  // 1. Git state
  const git = detectGitState(courseDir);
  if (git.isRepo && git.remote && git.cleanAndPushed) {
    return {
      status: 'git-pushed',
      message: `Backup verified: git commits pushed to ${git.remote}`,
      detected: { gitRemote: git.remote },
    };
  }
  if (git.isRepo && git.remote && git.clean) {
    return {
      status: 'git-committed',
      message: 'Local git is clean but unpushed. Run `git push` to back up off-machine.',
      detected: { gitRemote: git.remote },
    };
  }
  if (git.isRepo && git.remote) {
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

  // 2. Synced folder — pattern-match the absolute path
  const synced = detectSyncedFolder(courseDir);
  if (synced) {
    return {
      status: 'synced-folder',
      message: `Backup verified: course folder is inside ${synced.type} (auto-syncs).`,
      detected: { syncedFolderType: synced.type },
    };
  }

  // 3. Nothing detected
  return {
    status: 'none',
    message: 'No backup detected. Recommended: `git init` + push to GitHub, OR move course folder into OneDrive / iCloud / Dropbox / Google Drive / network share.',
    detected: {},
  };
}
```

### `detectSyncedFolder` patterns

Case-insensitive substring match on the absolute path:

| Pattern | Type |
|---|---|
| `OneDrive` (with separator boundary) | `OneDrive` |
| `iCloud Drive`, `Mobile Documents/com~apple~CloudDocs` | `iCloud` |
| `Dropbox` (with separator boundary) | `Dropbox` |
| `Google Drive`, `GoogleDrive` | `GoogleDrive` |
| Windows UNC path (`\\\\server\\share\\...`) | `NetworkShare` |
| macOS `/Volumes/<non-system-volume>/` | `ExternalMount` |
| Linux `/mnt/`, `/media/` | `ExternalMount` |

Detection is best-effort. Faculty can override via `setup_canvas`:

```ts
backupOverride: 'verified' | 'none' | 'auto'   // default 'auto'
```

`'verified'` forces a "backup-verified" message regardless of detection (faculty knows their setup works). `'none'` suppresses the recommendation entirely.

## Widget content capture mechanics

The technical work that closes the Plan B `'ready'/'missing-*'` → `'new'/'changed'/'unchanged'` gap and enables real widget restore.

### At preview time, for each widget reference in each rendered page

```
1. Discover widget refs in the locally-rendered HTML
   (existing — Plan B widget_discovery)

2. Fetch the prior Canvas page HTML
   (existing — already happens for page diffs via api.getPageBody)

3. Scan the prior HTML for matching widget iframe references
   (use widget_discovery, regex variant matches Canvas Files URLs:
    src="/courses/<courseId>/files/<fileId>/preview" or absolute equivalent)

4. For each prior widget reference found:
   a. Extract the file_id from the iframe src
   b. Fetch the file content via getFileContent(fileId)
   c. Save to <snapshot>/prior/widgets/<slug>__<id>.html
   d. Record { priorCanvasFileId: <fileId>, priorContentHash: sha256(content) }
      in widgets-meta.json

5. Hash the LOCAL widget HTML (the version about to be published):
   newContentHash = sha256(readFileSync(courseDir/<slug>/widgets/<id>.html))

6. Compare hashes:
   - no prior file found → status: 'new'
   - priorContentHash === newContentHash → status: 'unchanged'
   - priorContentHash !== newContentHash → status: 'changed'

7. Copy the local widget HTML to <snapshot>/new/widgets/<slug>__<id>.html
   (parallel to existing page snapshot in <snapshot>/new/<filename>.html)

8. Compute unified diff between prior and new widget HTML;
   save to <snapshot>/diffs/widgets/<slug>__<id>.diff
```

### New `CanvasApiClient` surface

```ts
async getFileContent(fileId: number): Promise<string> {
  // 1. GET /api/v1/files/<fileId> — returns metadata including `url` (signed S3 link)
  // 2. GET that URL — returns raw file bytes
  // 3. Decode as UTF-8 (widgets are always HTML; non-text files would fail loudly here)
}
```

### Rollback path (uses the captured prior content)

```
For each item being restored (item-by-item):
  - If item is a page:
    1. Read <snapshot>/prior/<filename>.html (existing)
    2. Compute hash, compare to current Canvas page hash (drift detection)
    3. Restore via api.updatePage (existing pattern)

  - If item is a widget:
    1. Read <snapshot>/prior/widgets/<slug>__<id>.html
    2. Re-upload via publish_widget (existing) → gets a NEW file_id (Phase 0 finding)
    3. Find the host page that contains this widget reference
       (cross-reference widgets-meta.json's slug to the page)
    4. Fetch current host page HTML from Canvas
    5. Substitute the iframe src that currently points at the publish-time file_id
       with the new file_id from step 2
    6. PUT the rewritten page HTML to Canvas
```

The page-HTML-rewrite step (5-6) is the key mechanism that makes restore work despite Phase 0. Clean substitution: regex over the page HTML, swap each `/files/<old>/preview` with `/files/<new>/preview` for the corresponding widget.

### Storage cost

~5-20KB per widget × widget count per snapshot. For a 30-page course with ~3 widgets per page, ~1MB additional per snapshot. Max 3 snapshots = ~3MB additional. Negligible.

## Canvas breadcrumbs (opt-in, visibility-only)

Canvas breadcrumbs are **purely for faculty visibility**. They do NOT participate in restore — the local snapshot is the authoritative bytes for any rollback. This keeps restore logic clean (re-upload from local → new file_id → rewrite page HTML) while still giving faculty the "browse my history inside Canvas" experience.

### Page breadcrumbs

Before each publish replaces a page, the publisher:

1. Fetches the current Canvas page body (already happens today).
2. Creates a new Canvas page in the same course:
   - **Title:** `[ARCHIVED] <Original Title> — 2026-06-04 14:30 UTC`
   - **Slug:** `archived-<original-slug>-2026-06-04-1430`
   - **`published: false`** — invisible to students.
   - **Body:** the previously-fetched current HTML.
   - **Not added to any module.**
3. Publishes the new content to the original page slug as normal.

Records `{ archivedPageSlug, archivedPageId }` in `pages-meta.json` for cleanup at prune time.

### Widget breadcrumbs

Before each publish replaces a widget file:

1. The publisher reads the current Canvas Files version (already fetched at preview time and stored in `prior/widgets/`).
2. Uploads a copy to `/canvas-toolchain-archive/<YYYY-MM-DD>/<slug>__<id>.html`.
3. The folder `/canvas-toolchain-archive/` is created on first publish (set `hidden: true`).
4. Records `{ folderId, filePath, breadcrumbFileId }` in `widgets-meta.json`.

The original file location gets overwritten via standard `publish_widget` flow — Phase 0 semantics apply (file_id changes), exactly as today.

### Opt-in mechanism

Course-level default in `setup_canvas`:

```ts
canvasBreadcrumbs: 'enabled' | 'disabled'    // default 'enabled'
```

Per-publish override on `publish_course`:

```ts
canvasBreadcrumbs?: boolean   // overrides setup default for this run only
```

### Cleanup when retention prunes snapshots

When a local snapshot S gets pruned, the corresponding Canvas breadcrumbs are also deleted. Otherwise faculty would see archived pages from months ago that can no longer be restored.

For each pruned snapshot, iterate `widgets-meta.json` and `pages-meta.json` and issue:

- `DELETE /api/v1/courses/<courseId>/pages/<archivedPageSlug>` per archived page.
- `DELETE /api/v1/files/<breadcrumbFileId>` per archived widget file.
- After deleting all files in `/canvas-toolchain-archive/<date>/`, if the folder is empty: `DELETE /api/v1/folders/<folderId>`.

All Canvas deletes are best-effort. Failures logged to the pruning result; local snapshot deletion proceeds regardless.

## Retention + pruning

### Policy (from Q3)

`max(last 3 publishes, last 30 days)`, both configurable in `setup_canvas`:

```ts
snapshotRetentionCount: number   // default 3
snapshotRetentionDays: number    // default 30
```

### When pruning runs

Automatically at the end of every **successful** `publish_course`. A failed publish (state `'partial'`) does NOT trigger pruning — history is preserved until faculty resumes or rolls back.

Also runnable manually via `prune_publish_snapshots` with `dryRun: true` for preview.

### Pruning algorithm

```ts
function pruneSnapshots(courseId: number): PruneResult {
  const cfg = loadSetupConfig();
  const retainCount = cfg.snapshotRetentionCount ?? 3;
  const retainDays = cfg.snapshotRetentionDays ?? 30;

  const allSnapshots = readSnapshotIndex(courseId)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));   // newest → oldest

  const now = Date.now();
  const ageThresholdMs = retainDays * 86400_000;

  const kept: string[] = [];
  const pruned: string[] = [];

  for (let i = 0; i < allSnapshots.length; i++) {
    const s = allSnapshots[i];
    const ageMs = now - Date.parse(s.publishedAt);

    if (i < retainCount) {
      kept.push(s.snapshotId);          // within count-based retention
    } else if (ageMs < ageThresholdMs) {
      kept.push(s.snapshotId);          // within time-based retention
    } else {
      pruned.push(s.snapshotId);
    }
  }

  // NEVER prune the currently-live snapshot, regardless of age or count position.
  const liveId = readPublishStateMeta(courseId).currentlyLiveSnapshotId;
  if (liveId && pruned.includes(liveId)) {
    kept.push(liveId);
    pruned.splice(pruned.indexOf(liveId), 1);
  }

  return { kept, pruned };
}
```

### What gets deleted per pruned snapshot

1. Local snapshot dir — recursive delete.
2. Canvas breadcrumb pages (if breadcrumbs were enabled and recorded in `pages-meta.json`).
3. Canvas breadcrumb files (recorded in `widgets-meta.json`).
4. Empty archive folder cleanup.

## Error handling

| Code | Trigger | Recovery |
|---|---|---|
| `SNAPSHOT_NOT_FOUND` | `targetSnapshotId` doesn't exist | Run `list_publish_snapshots` to find a valid id. |
| `ITEM_NOT_IN_SNAPSHOT` | `items[]` references a path not in the snapshot tree | Listed in error message; valid items also listed. |
| `DRIFT_DETECTED` (with `force: false`) | Currently a warning, not an error per Section 3 drift handling | Restore proceeds; drift listed in `drift[]` output. |
| `PUBLISH_STATE_CORRUPT` | `publish-state-<courseId>.json` malformed | Manual recovery: delete the file; next publish recreates it. |
| `BREADCRUMB_CLEANUP_FAILED` | Canvas DELETE call failed during prune | Logged; faculty can manually delete via Canvas UI. |
| `WIDGET_FETCH_FAILED` | `getFileContent` errored at preview time | Widget status falls back to `'new'` (no prior content). Logged warning. |

## Migration / backward compatibility

- **Existing snapshots in `~/.command-and-control/publish-snapshots/<id>/`** continue to work via the legacy-fallback path lookup.
- **Existing `state.json` without `restoredCount`** treated as `restoredCount: 0`.
- **Snapshots created BEFORE `pages-meta.json` and `widgets-meta.json` existed** have empty meta; drift detection falls back to "no baseline, proceed without check."
- **First publish after upgrade** creates the new project-local `<courseDir>/.canvas-toolchain/publish-snapshots/`. Older snapshots remain readable in their global location but new snapshots land in the project location. No automatic migration; faculty can manually copy if they want one location.

## Open follow-ups (intentionally deferred)

| Item | Tier | Why deferred |
|---|---|---|
| `forcePublishOnDrift` parameter actually does something | v1.x | Today's design only treats drift at restore time. Publish-time drift detection (page changed in Canvas since preview) is a separate feature. |
| Snapshot-to-snapshot diff tool | v1.x | "What changed between snapshot S and snapshot T?" — useful for "did my last 3 publishes drift this page?" but not blocking v1. |
| External backup integration (auto-push to GitHub, Drive sync trigger) | v2 | Beyond the recommendation scope of this design. Real integration with cloud providers needs separate per-provider design. |
| Cross-machine snapshot sharing | v2 | Snapshots in `<courseDir>/.canvas-toolchain/` become git-trackable, which gives faculty cross-machine sync IF they use git. No additional design needed beyond the project-local default in this spec. |
| Per-student widget state persistence | v2 | Out of scope for versioning entirely. |
| Restore from Canvas breadcrumb manually | v1.x | Faculty can already do this via Canvas UI today (copy archived page → paste). Adding tool support is a quality-of-life feature. |

## Decisions log

| Decision | Choice | Source |
|---|---|---|
| Rollback granularity | Hybrid (course-wide + per-item) | Q1 |
| Storage model | Local-authoritative + opt-in Canvas breadcrumbs | Q2 |
| Retention policy | max(last 3 publishes, last 30 days), configurable | Q3 |
| Backup detection enforcement | Recommendation only, no blocking | Q4 |
| MCP tool surface | Minimal extension + 2 new tools | Q5 |
| Snapshot dir location | Project-local default, legacy global fallback | Section 2 Q1 |
| Widgets-meta storage | Separate `widgets-meta.json` file | Section 2 Q2 |
| Rollback state model | Pattern B: pointer-based, no snapshot proliferation | Section 2 Q3 |
| Drift handling | Best-effort with warning, `force` flag is log-only | Section 3 Q1 |
| `items[]` path syntax | File-path strings matching snapshot tree | Section 3 Q2 |
| Partial-restore pointer | Stays on previously-live; partial is explicit drift | Section 3 Q3 |
| Page breadcrumb prefix | `[ARCHIVED] <title> — <date>` | Section 6 Q2 |
| Widget archive folder | `/canvas-toolchain-archive/<date>/` | Section 6 Q1 |
| Breadcrumb default | Enabled by default | Section 6 Q3 |
| Pruning trigger | End of every successful `publish_course` | Section 7 |
| Currently-live preservation | Never prune the currently-live snapshot regardless of retention | Section 7 |
| Hash algorithm | SHA-256 (Node built-in `crypto`) | Section 5 |
