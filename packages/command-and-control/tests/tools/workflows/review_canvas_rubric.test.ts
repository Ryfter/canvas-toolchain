// tests/tools/workflows/review_canvas_rubric.test.ts
import { describe, it, expect } from 'vitest';
import { reviewCanvasRubric } from '../../../src/tools/workflows/review_canvas_rubric.js';
import type { PulledRubric } from '../../../src/tools/rubric/sync_types.js';

const pulled: PulledRubric = {
  source: { kind: 'assignment', courseId: '1', assignmentId: '2', title: 'Essay' },
  criteria: [{ id: 'c1', name: 'Thesis', points: 10, description: 'Clear arguable thesis' }],
  assignmentBrief: 'Write a 5-page argumentative essay.',
};

describe('reviewCanvasRubric', () => {
  it('wires fetch -> change-detect -> triage into one report', async () => {
    const report = await reviewCanvasRubric(
      { courseId: '1', assignmentId: '2' },
      {
        pull: async () => pulled,
        readPriorMd: () => undefined,
        llm: { complete: async () => ({ text: '{"verdict":"acceptable","flags":[],"rationale":"fits"}' }) },
      },
    );
    expect(report.source.kind).toBe('assignment');
    expect(report.change.status).toBe('first-draft');
    expect(report.triage.verdict).toBe('acceptable');
  });

  it('throws when a resolved rubric has no criteria', async () => {
    const empty = { source: { kind: 'course-rubric' as const, courseId: '1', rubricId: '9', title: 'Empty' }, criteria: [] };
    await expect(
      reviewCanvasRubric(
        { courseId: '1', rubricId: '9' },
        { pull: async () => empty, readPriorMd: () => undefined, llm: { complete: async () => ({ text: '{}' }) } },
      ),
    ).rejects.toThrow(/no criteria/);
  });

  it('returns the pick-list (no triage) when fetch yields choices', async () => {
    const choices: PulledRubric = { source: { kind: 'course-rubric', courseId: '1', title: 'Course rubrics' }, criteria: [], choices: [{ rubricId: '7', title: 'R' }] };
    const report = await reviewCanvasRubric(
      { courseId: '1' },
      { pull: async () => choices, readPriorMd: () => undefined, llm: { complete: async () => ({ text: '{}' }) } },
    );
    expect(report.source.kind).toBe('course-rubric');
    expect(report.choices).toEqual([{ rubricId: '7', title: 'R' }]);
    expect(report.triage).toBeUndefined();
    expect(report.change).toBeUndefined();
  });
});
