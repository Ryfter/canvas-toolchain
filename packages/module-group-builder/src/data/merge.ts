import type { StudentRecord } from '../types.js';
import type { EnrollmentRow, SubmissionRow } from './canvas-client.js';
import type { RosterRow } from './roster.js';

const COMPLETED = new Set(['graded', 'submitted', 'pending_review']);

export interface MergeInput {
  enrollments: EnrollmentRow[];
  submissions?: SubmissionRow[];
  roster: RosterRow[];
}

export function buildStudentRecords(input: MergeInput): { records: StudentRecord[]; diagnostics: { missingPseudonyms: string[] } } {
  const rosterByCanvas = new Map(input.roster.map((r) => [r.canvasId, r]));
  const completedByUser = new Map<number, number>();
  for (const s of input.submissions ?? []) {
    if (COMPLETED.has(s.workflow_state)) completedByUser.set(s.user_id, (completedByUser.get(s.user_id) ?? 0) + 1);
  }
  const missingPseudonyms: string[] = [];
  const records: StudentRecord[] = input.enrollments.map((e) => {
    const canvasId = String(e.user_id);
    const r = rosterByCanvas.get(canvasId);
    if (!r) missingPseudonyms.push(canvasId);
    const metrics: Record<string, number> = { ...(r?.metrics ?? {}) };
    if (typeof e.grades?.current_score === 'number') metrics.overallGrade = e.grades.current_score;
    metrics.assignmentsCompleted = completedByUser.get(e.user_id) ?? 0;
    const rec: StudentRecord = { canvasId, pseudonym: r?.pseudonym ?? '', metrics };
    if (r?.major) rec.major = r.major;
    return rec;
  });
  return { records, diagnostics: { missingPseudonyms } };
}
