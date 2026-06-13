import { describe, it, expect } from 'vitest';
import { buildStudentRecords } from '../../src/data/merge.js';

describe('buildStudentRecords', () => {
  it('keys by canvasId, pulls overallGrade + assignmentsCompleted, merges roster pseudonym/major/metrics', () => {
    const enrollments = [
      { user_id: 1, grades: { current_score: 91 } },
      { user_id: 2, grades: { current_score: 80 } },
    ];
    const submissions = [
      { user_id: 1, assignment_id: 10, workflow_state: 'graded' },
      { user_id: 1, assignment_id: 11, workflow_state: 'submitted' },
      { user_id: 2, assignment_id: 10, workflow_state: 'unsubmitted' },
    ];
    const roster = [
      { canvasId: '1', pseudonym: 'SU26-001', major: 'IT Management', metrics: { priorReview: 4.2 } },
    ];
    const { records, diagnostics } = buildStudentRecords({ enrollments, submissions, roster });
    const s1 = records.find((r) => r.canvasId === '1')!;
    expect(s1.pseudonym).toBe('SU26-001');
    expect(s1.major).toBe('IT Management');
    expect(s1.metrics.overallGrade).toBe(91);
    expect(s1.metrics.assignmentsCompleted).toBe(2); // graded + submitted count as completed
    expect(s1.metrics.priorReview).toBe(4.2);
    const s2 = records.find((r) => r.canvasId === '2')!;
    expect(s2.metrics.assignmentsCompleted).toBe(0); // unsubmitted not counted
    expect(diagnostics.missingPseudonyms).toContain('2'); // not in roster
  });
});
