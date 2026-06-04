import type { PageType } from 'canvas-design-mcp/dist/course-types.js';

export type WarningKind = 'ferpa' | 'a11y' | 'validation';
export type WarningSeverity = 'block' | 'warn';

export interface Warning {
  kind: WarningKind;
  severity: WarningSeverity;
  message: string;
  line?: number;
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
  /** `ready` = both HTML and spec exist on disk; publish will attempt upload.
   *  `missing-html` / `missing-spec` = file not found; publish will record a
   *  per-widget failure and leave the iframe pointing at the local path. */
  status: 'ready' | 'missing-html' | 'missing-spec';
}

export interface PageEntry {
  filename: string;
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
