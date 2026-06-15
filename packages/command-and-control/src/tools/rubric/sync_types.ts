// src/tools/rubric/sync_types.ts
export interface PulledRubricCriterion {
  id: string;
  name: string;
  points: number;
  description: string;
  longDescription?: string;
  ratings?: Array<{ points: number; description: string }>;
}

export interface PulledRubric {
  source: {
    kind: 'assignment' | 'course-rubric';
    courseId: string;
    assignmentId?: string;
    rubricId?: string;
    title: string;
  };
  criteria: PulledRubricCriterion[];
  /** Present when sourced from an assignment (its description). */
  assignmentBrief?: string;
  /** Present only on the list-fallback path when no single rubric was chosen. */
  choices?: Array<{ rubricId: string; title: string }>;
}

export interface RubricChangeReport {
  status: 'first-draft' | 'unchanged' | 'changed';
  added: string[];
  removed: string[];
  modified: Array<{ name: string; before: string; after: string }>;
}

export interface RubricTriageReport {
  verdict: 'acceptable' | 'needs-update' | 'needs-review';
  flags: Array<{
    criterion: string;
    issue: string;
    evidence: 'assignment-drift' | 'vague-language' | 'change-detected';
  }>;
  proposedFacultyRubric?: string;
  rationale: string;
}

export interface ReviewReport {
  source: PulledRubric['source'];
  change: RubricChangeReport;
  triage: RubricTriageReport;
}

export function isNeedsUpdate(t: RubricTriageReport): boolean {
  return t.verdict === 'needs-update';
}
