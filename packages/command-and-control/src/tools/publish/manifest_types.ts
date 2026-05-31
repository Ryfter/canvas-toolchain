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

export interface PageEntry {
  filename: string;
  pageType: PageType;
  intendedTitle: string;
  /** Optional: pages may be newly created when no Canvas match exists (collisionAction:'create'). */
  canvasMatch?: { pageId: string; url: string; existingTitle: string; similarity: number };
  collisionAction: 'update' | 'create';
  diff: DiffSummary;
  warnings: Warning[];
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
}

export interface FailedEntry {
  filename: string;
  type: 'page' | 'assignment';
  reason: string;
  code: string;
  failedAt: string;
}

export interface PublishState {
  phase: 'preview' | 'partial' | 'published' | 'rolled-back';
  published: PublishedEntry[];
  /** Singular by design: spec R2 (stop-on-failure) halts publishing on the first failure, so at most one entry is recorded here. */
  failed?: FailedEntry;
  lastUpdatedAt: string;
}
