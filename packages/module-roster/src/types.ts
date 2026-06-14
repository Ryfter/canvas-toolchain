/** A student row parsed from a PeopleSoft CSV export, after column mapping. */
export interface PeopleSoftRow {
  studentNumber: string;
  email: string;
  /** Campus username / NetID — Canvas login_id. */
  userId: string;
  name: string;
  /** Raw primary major string as it appears in PeopleSoft. */
  rawMajor: string;
  /** Raw secondary major, if the export carried one. */
  secondMajor?: string;
}

/** Which PeopleSoft column maps to which logical field. Values are header names. */
export interface ColumnMapping {
  studentNumber: string;
  email: string;
  userId: string;
  name: string;
  major: string;
  /** Optional second-major column header. */
  secondMajor?: string;
}

/** A Canvas student from the course users endpoint, fields normalized. */
export interface CanvasUser {
  /** Canvas internal user id, stringified. */
  canvasId: string;
  name: string;
  loginId?: string;
  sisUserId?: string;
  email?: string;
}

/** One persistent identity-vault record. The ONLY place identity links live. */
export interface VaultRecord {
  studentNumber: string;
  canvasId: string;
  pseudonym: string;
  firstSeenTerm: string;
}

/** How a PeopleSoft row matched a Canvas user. */
export type MatchKey = 'student_number' | 'email' | 'userId' | 'name';

export interface MatchedStudent {
  ps: PeopleSoftRow;
  canvas: CanvasUser;
  matchedOn: MatchKey;
}

export interface AmbiguousStudent {
  ps: PeopleSoftRow;
  candidates: CanvasUser[];
}

export interface MatchResult {
  matched: MatchedStudent[];
  ambiguous: AmbiguousStudent[];
  /** In PeopleSoft, no Canvas hit on any key. */
  unmatchedPeopleSoft: PeopleSoftRow[];
  /** In Canvas, never referenced by any PeopleSoft row. */
  unmatchedCanvas: CanvasUser[];
}

/** A vault/SIS collision: same student_number already mapped to a different canvas id. */
export interface VaultCollision {
  studentNumber: string;
  vaultCanvasId: string;
  incomingCanvasId: string;
}

/** One row of the proposed roster (matched + pseudonymed + normalized). */
export interface ProposalRow {
  studentNumber: string;
  canvasId: string;
  pseudonym: string;
  returning: boolean;
  matchedOn: MatchKey;
  rawMajor: string;
  canonicalMajor: string;
  secondMajor?: string;
}

/** The full read-only proposal returned by proposeRoster. */
export interface ProposalReport {
  term: string;
  courseId: string;
  rows: ProposalRow[];
  ambiguous: AmbiguousStudent[];
  unmatchedPeopleSoft: PeopleSoftRow[];
  unmatchedCanvas: CanvasUser[];
  /** raw major -> canonical major, as applied. */
  majorMap: Record<string, string>;
  collisions: VaultCollision[];
  /** True when an LLM produced the canonical majors; false on passthrough. */
  llmUsed: boolean;
}
