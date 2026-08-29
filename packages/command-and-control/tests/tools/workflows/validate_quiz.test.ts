import { describe, it, expect, vi } from 'vitest';
import { validateQuiz } from '../../../src/tools/workflows/validate_quiz.js';
import type { LiveQuizPayload } from '../../../src/tools/quiz/types.js';

describe('validateQuiz workflow', () => {
  it('returns structured error when source missing', async () => {
    const r = await validateQuiz({});
    expect('error' in r && r.error).toBe('QUIZ_VALIDATE_SOURCE');
  });

  it('validates live quiz via injected fetch', async () => {
    const live: LiveQuizPayload = {
      meta: {
        quizId: '9',
        title: 'Week 2 Quiz',
        published: true,
        dueAt: '2026-09-10T23:59:00Z',
        questionCount: 1,
        pointsPossible: 1,
      },
      itemsAvailable: true,
      items: [
        {
          id: '1',
          type: 'multiple_choice_question',
          stem: 'What is 2+2?',
          choices: ['3', '4', '5', '6'],
          key: 'B',
          points: 1,
        },
      ],
    };
    const r = await validateQuiz(
      {
        courseId: '101',
        quizId: '9',
        weekStartMonday: '2026-09-07',
        horizonPass: 'primary',
        llmTriage: false,
      },
      { fetchLiveQuiz: async () => live },
    );
    expect('verdict' in r).toBe(true);
    if ('verdict' in r) {
      expect(r.source).toBe('canvas');
      expect(r.verdict).toBe('ok');
    }
  });

  it('parses local-draft markdown', async () => {
    const md = `---
schema: canvas-toolchain.quiz/v1
---

## Q1
- **stem:** Hello world?
- **choices:**
  - A. One
  - B. Two
  - C. Three
  - D. Four
- **key:** A
`;
    const r = await validateQuiz({ quizMarkdown: md });
    expect('source' in r && r.source).toBe('local-draft');
    if ('findings' in r) {
      expect(r.findings.some((f) => f.code === 'MISSING_KEY')).toBe(false);
    }
  });

  it('maps QuizFetchError to structured result', async () => {
    const { QuizFetchError } = await import('../../../src/tools/quiz/canvas_fetch.js');
    const r = await validateQuiz(
      { courseId: '1', quizId: '2', llmTriage: false },
      {
        fetchLiveQuiz: async () => {
          throw new QuizFetchError('CANVAS_UNAUTHORIZED', 'bad token');
        },
      },
    );
    expect('error' in r && r.error).toBe('CANVAS_UNAUTHORIZED');
    const serialized = JSON.stringify(r);
    expect(serialized).not.toMatch(/sk-|Bearer |instructure\.com\/login/i);
  });

  it('scrub fixtures use EXAMPLE101 / example.instructure.com only', async () => {
    const live: LiveQuizPayload = {
      meta: { quizId: '9', title: 'EXAMPLE101 Quiz', published: true },
      itemsAvailable: true,
      items: [
        {
          id: '1',
          type: 'multiple_choice_question',
          stem: 'Example stem?',
          choices: ['a', 'b', 'c', 'd'],
          key: 'A',
          points: 1,
        },
      ],
    };
    const r = await validateQuiz(
      { courseId: 'EXAMPLE101', quizId: '9', llmTriage: false },
      { fetchLiveQuiz: async () => live },
    );
    const text = JSON.stringify(r);
    expect(text).toContain('EXAMPLE101');
    expect(text).not.toMatch(/uc\.edu|exampleu|real-institution/i);
  });
});
