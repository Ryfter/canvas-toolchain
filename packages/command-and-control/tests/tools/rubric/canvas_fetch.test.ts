// tests/tools/rubric/canvas_fetch.test.ts
import { describe, it, expect } from 'vitest';
import { pullRubric } from '../../../src/tools/rubric/canvas_fetch.js';

const cfg = { canvasUrl: 'https://canvas.test', apiToken: 't' };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('pullRubric', () => {
  it('assignment-first: reads the rubric attached to the assignment', async () => {
    const fetchFn = async (url: string) => {
      expect(url).toBe('https://canvas.test/api/v1/courses/5/assignments/9');
      return jsonResponse({
        id: 9, name: 'Essay 1', description: '<p>Write an essay</p>',
        rubric: [
          { id: 'c1', description: 'Thesis', long_description: 'Clear arguable thesis', points: 10,
            ratings: [{ points: 10, description: 'Full' }] },
        ],
      });
    };
    const r = await pullRubric({ courseId: '5', assignmentId: '9' }, { cfg, fetchFn: fetchFn as typeof fetch });
    expect(r.source.kind).toBe('assignment');
    expect(r.criteria).toEqual([
      { id: 'c1', name: 'Thesis', points: 10, description: 'Clear arguable thesis',
        ratings: [{ points: 10, description: 'Full' }] },
    ]);
    expect(r.assignmentBrief).toBe('<p>Write an essay</p>');
  });

  it('falls back to the course rubric list when the assignment has no rubric', async () => {
    const fetchFn = async (url: string) => {
      if (url.endsWith('/assignments/9')) return jsonResponse({ id: 9, name: 'Essay 1', rubric: null });
      if (url.endsWith('/courses/5/rubrics')) return jsonResponse([{ id: 21, title: 'Standalone Rubric' }]);
      throw new Error(`unexpected url ${url}`);
    };
    const r = await pullRubric({ courseId: '5', assignmentId: '9' }, { cfg, fetchFn: fetchFn as typeof fetch });
    expect(r.source.kind).toBe('course-rubric');
    expect(r.choices).toEqual([{ rubricId: '21', title: 'Standalone Rubric' }]);
    expect(r.criteria).toEqual([]);
  });

  it('fetches a specific course rubric when rubricId is given', async () => {
    const fetchFn = async (url: string) => {
      expect(url).toBe('https://canvas.test/api/v1/courses/5/rubrics/21');
      return jsonResponse({
        id: 21, title: 'Standalone Rubric',
        data: [{ id: 'r1', description: 'Evidence', long_description: 'Cites sources', points: 5 }],
      });
    };
    const r = await pullRubric({ courseId: '5', rubricId: '21' }, { cfg, fetchFn: fetchFn as typeof fetch });
    expect(r.source.kind).toBe('course-rubric');
    expect(r.source.rubricId).toBe('21');
    expect(r.criteria).toEqual([
      { id: 'r1', name: 'Evidence', points: 5, description: 'Cites sources', ratings: undefined },
    ]);
  });

  it('throws a structured error when the course has zero rubrics', async () => {
    const fetchFn = async (url: string) => {
      if (url.endsWith('/assignments/9')) return jsonResponse({ id: 9, name: 'Essay 1', rubric: null });
      if (url.endsWith('/courses/5/rubrics')) return jsonResponse([]);
      throw new Error(`unexpected url ${url}`);
    };
    await expect(pullRubric({ courseId: '5', assignmentId: '9' }, { cfg, fetchFn: fetchFn as typeof fetch }))
      .rejects.toThrow(/NO_RUBRICS/);
  });
});
