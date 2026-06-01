/** Auto-managed section identifiers. Each section is delimited in the
 *  snapshot markdown by HTML comment markers:
 *
 *    <!-- AUTO:start id="<sectionId>" -->
 *    ...regenerated content...
 *    <!-- AUTO:end -->
 *
 *  Re-running snapshot_course finds these markers and replaces ONLY the
 *  content between them. Prose outside any marker block is preserved
 *  verbatim across runs.
 */
export type SectionId =
  | 'update-log'
  | 'identifiers'
  | 'assignment-groups'
  | 'modules';

export const SECTION_IDS: SectionId[] = [
  'update-log',
  'identifiers',
  'assignment-groups',
  'modules',
];

export interface SnapshotInput {
  /** Canvas course numeric ID. */
  courseId: number;
  /** Absolute path to the markdown file. Created on first run; updated on re-runs. */
  outputPath: string;
  /** Optional override for the canvas-config.json location.
   *  Defaults to ~/.command-and-control/canvas-config.json */
  canvasConfigPath?: string;
  /** Optional ISO timestamp to use for the Update Log row. Defaults to now.
   *  Exists for testability — production callers should omit. */
  now?: string;
}

export interface SnapshotResult {
  outputPath: string;
  /** true if this was the first run (file didn't exist before); false on re-runs. */
  firstRun: boolean;
  /** Number of sections regenerated (will equal SECTION_IDS.length when all are touched). */
  sectionsWritten: number;
  /** True if a new Update Log row was prepended. False on first run (no prior state to log against). */
  updateLogAppended: boolean;
}

export interface CourseSnapshot {
  course: {
    id: number;
    title: string;
    courseCode: string;
    workflowState: string;
    startAt: string | null;
    endAt: string | null;
    termName?: string;
  };
  assignmentGroups: Array<{
    id: number;
    name: string;
    position: number;
    publishedCount: number;
    unpublishedCount: number;
  }>;
  modules: Array<{
    id: number;
    name: string;
    position: number;
    itemCount: number;
    itemTypes: string[];
    workflowState?: string;
  }>;
}
