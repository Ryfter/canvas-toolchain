/** A Canvas user as read from a group membership or the course roster (live). */
export interface PaCanvasUser {
  /** Canvas internal user id, stringified. */
  canvasId: string;
  /** Display name, e.g. "Jane Q. Public". */
  name: string;
  /** Canvas sortable_name ("Last, First"); the preferred source for first/last split. */
  sortableName?: string;
  email?: string;
  /** Canvas login_id — only present when the token may read logins. */
  loginId?: string;
  /** Canvas sis_user_id — only present when the token may read SIS ids. */
  sisUserId?: string;
}

/** One Canvas group plus its members. */
export interface PaGroup {
  name: string;
  members: PaCanvasUser[];
}

/** One output row, 1:1 with PeerAssessment.com's import columns. */
export interface PeerAssessmentRow {
  team: string;
  loginId: string;
  email: string;
  firstName: string;
  lastName: string;
  studentId: string;
}

/** A grouped student missing one or more required import columns. */
export interface IncompleteStudent {
  name: string;
  canvasId: string;
  /** Human labels of the blank columns, e.g. ["Login ID", "Student ID #"]. */
  missing: string[];
}

/** A student enrolled in the course but in no group in the named set. */
export interface UngroupedStudent {
  name: string;
  canvasId: string;
}

/** An email shared by more than one output row (PeerAssessment keys on email). */
export interface DuplicateEmail {
  email: string;
  names: string[];
}

/** A student (one canvas_id) who appears in more than one group of the set. */
export interface MultiGroupedStudent {
  name: string;
  canvasId: string;
  teams: string[];
}

/** The pre-upload report returned by buildPeerAssessmentImport. */
export interface ImportReport {
  /** Path written, or null when dryRun or zero rows. */
  outputPath: string | null;
  rowsWritten: number;
  totalStudents: number;
  incomplete: IncompleteStudent[];
  ungrouped: UngroupedStudent[];
  duplicateEmails: DuplicateEmail[];
  multiGrouped: MultiGroupedStudent[];
  /** Non-fatal advisories (FERPA note + sourcing caveats). */
  warnings: string[];
}
