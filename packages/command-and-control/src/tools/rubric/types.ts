export interface DraftStudentRubricInput {
  /** Raw faculty-facing rubric text. Can be markdown, plain text, or pasted
   *  from Canvas/Word. The tool extracts criteria from this. */
  facultyRubricText: string;
  /** Optional context: what the assignment actually asks students to do.
   *  Used by the LLM to ground worked examples in concrete task language. */
  assignmentBrief?: string;
  /** Optional context: course title, level, modality, anything else useful
   *  for tailoring student-facing language. */
  courseContext?: string;
  /** Absolute path to write the generated markdown file. */
  outputPath: string;
  /** Front matter: week number for the page. */
  week?: number;
  /** Front matter: page title. Defaults to "Rubric — Assignment {assignmentNumber}". */
  title?: string;
  /** Front matter: total points for the assignment. */
  totalPoints?: number;
  /** Front matter: assignment number, e.g. "7.3". */
  assignmentNumber?: string;
}

export interface DraftStudentRubricResult {
  outputPath: string;
  /** Number of criteria the LLM extracted. */
  criteriaCount: number;
  /** Per-criterion summary the caller can inspect without re-reading the file. */
  criteria: Array<{ number: string; name: string; points: number }>;
  /** Token usage from the Anthropic API call, when available. */
  usage?: { inputTokens: number; outputTokens: number };
}

/** Shape the LLM must return as JSON. Validated before rendering. */
export interface RubricCriterionDraft {
  number: string;
  name: string;
  points: number;
  studentFacing: string;
  workedExample: string;
  facultyFacing: string;
}
