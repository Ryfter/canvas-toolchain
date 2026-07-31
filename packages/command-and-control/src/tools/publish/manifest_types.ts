import type { PageType } from '@canvas-toolchain/canvas-design-studio/dist/course-types.js';

export type WarningKind = 'ferpa' | 'a11y' | 'validation';
export type WarningSeverity = 'block' | 'warn';

export interface Warning {
  kind: WarningKind;
  severity: WarningSeverity;
  message: string;
  line?: number;
  /** a11y warnings only: WCAG success criterion id, e.g. "1.4.3". */
  sc?: string;
  /** a11y warnings only: clear failure (gates with a named-SC acknowledgment) vs borderline (gates with true). */
  a11yTier?: 'clear' | 'borderline';
  /** a11y warnings only: measured/required ratio for measurable criteria (e.g. contrast),
   *  same formula as CDS's `records.ts` review-queue sort. Drives worst-first sorting once
   *  it reaches the queue via publish_course (#111). Absent when the finding has no margin. */
  marginRatio?: number;
}

export interface DiffSummary {
  priorWords: number | null;
  newWords: number;
  delta: number;
  sectionsChanged: number;
  calloutsAdded: number;
  calloutsRemoved: number;
  imagesChanged: number;
  hasFullDiff: boolean;
  /** Inline unified diff text. Set only when the entry's filename appears in
   *  preview_course_publish's `fullDiffFor` input. Otherwise read the .diff
   *  file from the snapshot directory. */
  fullDiff?: string;
}

export interface WidgetPreviewStatus {
  /** Widget id (basename of the iframe src, e.g. "data-types-categorize"). */
  id: string;
  /** Page slug — first path segment of the iframe src (e.g. "assignment"). */
  slug: string;
  /** Local HTML file path the publisher will try to upload. */
  htmlPath: string;
  /** Local spec.json path used to derive iframe dimensions + title. */
  specPath: string;
  /** V&R Plan B enum:
   *  - 'new'           — page is new OR no prior widget iframe found referencing this id.
   *  - 'unchanged'     — prior content hash matches new content hash; nothing to publish.
   *  - 'changed'       — prior content hash differs from new; will publish + rewrite iframe src.
   *  - 'missing-html'  — local widget HTML file absent (publish will record failed widget).
   *  - 'missing-spec'  — local widget spec.json absent.
   *  The first three values replace #88 Plan B's single 'ready' value. */
  status: 'new' | 'unchanged' | 'changed' | 'missing-html' | 'missing-spec';
}

export interface PageEntry {
  filename: string;
  /** Output-relative path of the generated HTML (forward-slashed, e.g. "week-01/overview.html").
   *  The canonical `.a11y/review-queue.json` page key — matches the key
   *  audit_course_accessibility derives, so both writers de-duplicate (#111).
   *  Absent on pre-#111 snapshots; consumers fall back to `filename`. */
  relPath?: string;
  pageType: PageType;
  intendedTitle: string;
  /** Optional: pages may be newly created when no Canvas match exists (collisionAction:'create'). */
  canvasMatch?: { pageId: string; url: string; existingTitle: string; similarity: number };
  collisionAction: 'update' | 'create';
  diff: DiffSummary;
  warnings: Warning[];
  /** Widget references found in the rendered HTML (from {{ widget:<id> }} placeholders
   *  expanded by generate_course). Each lists its on-disk paths and a readiness status.
   *  Omitted when the page has no widget references. */
  widgets?: WidgetPreviewStatus[];
}

export interface AssignmentEntry {
  filename: string;
  /** Output-relative path of the generated HTML — same semantics as PageEntry.relPath (#111). */
  relPath?: string;
  pageType: PageType;
  intendedTitle: string;
  /** Required: per spec C1, unmatched assignments are emitted as SkippedEntry instead — never as AssignmentEntry. */
  canvasMatch: { assignmentId: number; name: string; similarity: number };
  diff: DiffSummary;
  warnings: Warning[];
}

export interface SkippedEntry {
  filename: string;
  pageType: PageType;
  reason: 'out-of-scope-v0.9' | 'unmatched-assignment';
  recommendation: string;
}

export type ManifestEntry =
  | ({ type: 'page' } & PageEntry)
  | ({ type: 'assignment' } & AssignmentEntry)
  | ({ type: 'skipped' } & SkippedEntry);

export interface GitState {
  isRepo: boolean;
  clean?: boolean;
  remote?: string;
  nudge?: 'init-suggested' | 'dirty-tree-warning';
}

export interface StaleSnapshotPointer {
  snapshotId: string;
  lastFailedFile: string;
  failedAt: string;
  fix: string[];
}

export interface PreviewManifest {
  snapshotId: string;
  courseId: number;
  courseDir: string;
  generatedAt: string;
  git: GitState;
  staleSnapshot?: StaleSnapshotPointer;
  entries: ManifestEntry[];
  summary: {
    total: number;
    pages: number;
    assignments: number;
    skipped: number;
    warningsCount: number;
    ferpaCount: number;
    collisionsCount: number;
  };
  /** NEW (V&R Plan C): backup recommendation surfaced at preview time. */
  backup?: BackupStatus;
}

export interface WidgetPublishResult {
  /** Widget id from the iframe src (e.g., "data-types-categorize"). */
  id: string;
  /** Per-widget status — fail-soft: one widget's failure does not abort
   *  the rest of the page or sibling widgets. */
  status: 'published' | 'failed';
  /** Set on success — the Canvas Files API file_id (changes on every overwrite,
   *  per Phase 0 finding 2026-06-03; iframe src is rewritten in lockstep). */
  canvasFileId?: number;
  /** Set on failure — human-readable reason. */
  error?: string;
}

export interface PublishedEntry {
  filename: string;
  type: 'page' | 'assignment';
  canvasUrl?: string;
  /** Raw Canvas API slug for pages (from canvasMatch.pageId at publish time).
   *  Stored here so rollback doesn't have to re-derive it from html_url,
   *  which Canvas may have already percent-encoded — re-encoding produces a 404. */
  canvasPageSlug?: string;
  action: 'updated' | 'created';
  publishedAt: string;
  /** Per-widget results when the page contained {{ widget:<id> }} placeholders
   *  rendered into local-relative <iframe> by generate_course. Each widget was
   *  uploaded via publish_widget and the iframe src rewritten to the Canvas
   *  Files URL before the page HTML was pushed. Omitted when no widgets. */
  widgets?: WidgetPublishResult[];
}

export interface FailedEntry {
  filename: string;
  type: 'page' | 'assignment';
  reason: string;
  code: string;
  failedAt: string;
}

export interface PublishState {
  phase: 'preview' | 'partial' | 'published' | 'rolled-back' | 'restored';
  published: PublishedEntry[];
  /** Singular by design: spec R2 (stop-on-failure) halts publishing on the first failure, so at most one entry is recorded here. */
  failed?: FailedEntry;
  lastUpdatedAt: string;
  /** NEW: incremented each time this snapshot becomes currently-live via rollback or roll-forward.
   *  Diagnostic only; not load-bearing for restore logic. */
  restoredCount?: number;
}

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

/** Per-snapshot widget tracking. Lives at <snapshot>/widgets-meta.json. Records
 *  enough metadata that rollback can find prior content, re-upload it, and
 *  rewrite the host page's iframe src.
 *
 *  Key format: `<slug>__<id>` (double underscore so single-hyphen slugs and ids
 *  don't collide — both are common in catalog kind names like 'data-types'). */
export interface WidgetsMeta {
  widgets: Record<string, WidgetMetaEntry>;
}

export interface WidgetMetaEntry {
  /** Canvas Files file_id of the widget HTML that was live at preview time.
   *  Null when the widget reference didn't exist in the prior Canvas page HTML. */
  priorCanvasFileId: number | null;
  /** SHA-256 of the prior widget HTML content. Null when no prior file. */
  priorContentHash: string | null;
  /** SHA-256 of the local widget HTML the publish is about to upload. */
  newContentHash: string;
  /** Set after publish_course succeeds — Canvas Files file_id assigned at upload.
   *  Distinct from priorCanvasFileId because Phase 0 finding: overwrite changes
   *  the id. Rollback uses this to know which file the publish created. */
  publishedCanvasFileId?: number;
  /** Canvas breadcrumb metadata — reserved for the V&R breadcrumb plan; unused here. */
  canvasBreadcrumb?: { folderId: number; filePath: string; breadcrumbFileId: number };
}

/** Per-snapshot page tracking. Lives at <snapshot>/pages-meta.json. Drift
 *  detection (a later V&R plan) compares priorContentHash against a fresh
 *  fetch at rollback time to surface "page changed in Canvas since preview". */
export interface PagesMeta {
  pages: Record<string, PageMetaEntry>;
}

export interface PageMetaEntry {
  /** Canvas page slug that was live at preview time. Null when the page is new. */
  priorCanvasPageSlug: string | null;
  /** SHA-256 of the prior page HTML at preview time. Null when no prior. */
  priorContentHash: string | null;
  /** SHA-256 of the new page HTML the publish is about to push. */
  newContentHash: string;
  publishedAt?: string;
  /** Reserved for breadcrumb plan. */
  canvasBreadcrumb?: { archivedPageSlug: string; archivedPageId: string };
}

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
