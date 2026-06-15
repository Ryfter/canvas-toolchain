// tests/tools/rubric/sync_types.test.ts
import { describe, it, expect } from 'vitest';
import type { PulledRubric, ReviewReport } from '../../../src/tools/rubric/sync_types.js';
import { isNeedsUpdate } from '../../../src/tools/rubric/sync_types.js';

describe('sync_types', () => {
  it('isNeedsUpdate is true only for the needs-update verdict', () => {
    const base: ReviewReport['triage'] = { verdict: 'acceptable', flags: [], rationale: 'ok' };
    expect(isNeedsUpdate(base)).toBe(false);
    expect(isNeedsUpdate({ ...base, verdict: 'needs-update', proposedFacultyRubric: 'x' })).toBe(true);
  });

  it('PulledRubric criteria carry name + points + description', () => {
    const r: PulledRubric = {
      source: { kind: 'assignment', courseId: '1', assignmentId: '2', title: 'A' },
      criteria: [{ id: 'c1', name: 'Clarity', points: 10, description: 'Be clear' }],
    };
    expect(r.criteria[0].points).toBe(10);
  });
});
