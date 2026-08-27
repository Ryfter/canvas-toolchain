import { describe, it, expect, vi } from 'vitest';
import { deterministicFindings, validateQuizItems } from '../../../src/tools/quiz/validate.js';
import type { LiveQuizPayload } from '../../../src/tools/quiz/types.js';
import type { LlmClient } from '@canvas-toolchain/shared-llm';

function live(partial: Partial<LiveQuizPayload> & { meta: LiveQuizPayload['meta'] }): LiveQuizPayload {
  return {
    items: [],
    itemsAvailable: false,
    ...partial,
  };
}

describe('deterministicFindings', () => {
  it('flags EMPTY_QUIZ when published with no items', () => {
    const findings = deterministicFindings({
      source: 'canvas',
      live: live({
        meta: { quizId: '1', published: true, questionCount: 0, title: 'Empty' },
        items: [],
        itemsAvailable: false,
      }),
    });
    expect(findings.some((f) => f.code === 'EMPTY_QUIZ')).toBe(true);
  });

  it('flags MISSING_KEY', () => {
    const findings = deterministicFindings({
      source: 'canvas',
      live: live({
        meta: { quizId: '1', title: 'T' },
        itemsAvailable: true,
        items: [
          {
            id: '1',
            type: 'multiple_choice_question',
            stem: 'Hello?',
            choices: ['A', 'B', 'C', 'D'],
          },
        ],
      }),
    });
    expect(findings.some((f) => f.code === 'MISSING_KEY')).toBe(true);
  });

  it('flags WEEK_MAP_MISMATCH when due outside Mon–Sun window', () => {
    const findings = deterministicFindings({
      source: 'canvas',
      weekStartMonday: '2026-09-07',
      live: live({
        meta: {
          quizId: '1',
          title: 'T',
          dueAt: '2026-09-20T23:59:00Z',
        },
        itemsAvailable: true,
        items: [
          {
            id: '1',
            type: 'multiple_choice_question',
            stem: 'Q?',
            choices: ['a', 'b', 'c', 'd'],
            key: 'A',
          },
        ],
      }),
    });
    expect(findings.some((f) => f.code === 'WEEK_MAP_MISMATCH')).toBe(true);
  });

  it('flags NEW_QUIZZES_LIMITED and ITEMS_UNAVAILABLE', () => {
    const findings = deterministicFindings({
      source: 'canvas',
      live: live({
        meta: { quizId: '1', title: 'N', questionCount: 5, quizType: 'quizzes.next' },
        items: [],
        itemsAvailable: false,
        newQuizzesLimited: true,
      }),
    });
    expect(findings.some((f) => f.code === 'NEW_QUIZZES_LIMITED')).toBe(true);
    expect(findings.some((f) => f.code === 'ITEMS_UNAVAILABLE')).toBe(true);
  });

  it('flags PUBLISH_STATE when due but unpublished', () => {
    const findings = deterministicFindings({
      source: 'canvas',
      live: live({
        meta: {
          quizId: '1',
          title: 'T',
          published: false,
          dueAt: '2026-09-10T23:59:00Z',
        },
        itemsAvailable: true,
        items: [
          {
            id: '1',
            type: 'multiple_choice_question',
            stem: 'Q?',
            choices: ['a', 'b', 'c', 'd'],
            key: 'A',
          },
        ],
      }),
    });
    expect(findings.some((f) => f.code === 'PUBLISH_STATE')).toBe(true);
  });

  it('flags SCHEDULE_INCONSISTENT when lock before due', () => {
    const findings = deterministicFindings({
      source: 'canvas',
      live: live({
        meta: {
          quizId: '1',
          title: 'T',
          dueAt: '2026-09-10T23:59:00Z',
          lockAt: '2026-09-08T23:59:00Z',
        },
        itemsAvailable: true,
        items: [
          {
            id: '1',
            type: 'multiple_choice_question',
            stem: 'Q?',
            choices: ['a', 'b', 'c', 'd'],
            key: 'A',
          },
        ],
      }),
    });
    expect(findings.some((f) => f.code === 'SCHEDULE_INCONSISTENT')).toBe(true);
  });
});

describe('validateQuizItems verdict', () => {
  it('returns needs-review for New Quizzes limited surface', async () => {
    const report = await validateQuizItems({
      source: 'canvas',
      llmTriage: false,
      live: live({
        meta: { quizId: '1', title: 'N', questionCount: 5, quizType: 'quizzes.next' },
        items: [],
        itemsAvailable: false,
        newQuizzesLimited: true,
      }),
    });
    expect(report.verdict).toBe('needs-review');
  });
});

describe('validateQuizItems triage', () => {
  it('runs LLM triage on primary pass', async () => {
    const llm: LlmClient = {
      complete: vi.fn(async () => ({
        text: JSON.stringify({
          findings: [
            { code: 'AMBIGUOUS_KEY', questionId: '1', message: 'Two answers work', severity: 'warning' },
          ],
        }),
      })),
    };
    const report = await validateQuizItems(
      {
        source: 'canvas',
        horizonPass: 'primary',
        live: live({
          meta: { quizId: '1', title: 'T' },
          itemsAvailable: true,
          items: [
            {
              id: '1',
              type: 'multiple_choice_question',
              stem: 'Pick one',
              choices: ['a', 'b', 'c', 'd'],
              key: 'A',
            },
          ],
        }),
      },
      { llm },
    );
    expect(llm.complete).toHaveBeenCalled();
    expect(report.findings.some((f) => f.code === 'AMBIGUOUS_KEY')).toBe(true);
  });

  it('skips LLM on secondary pass by default', async () => {
    const llm: LlmClient = {
      complete: vi.fn(async () => ({ text: '{"findings":[]}' })),
    };
    await validateQuizItems(
      {
        source: 'canvas',
        horizonPass: 'secondary',
        live: live({
          meta: { quizId: '1', title: 'T' },
          itemsAvailable: true,
          items: [
            {
              id: '1',
              type: 'multiple_choice_question',
              stem: 'Pick one',
              choices: ['a', 'b', 'c', 'd'],
              key: 'A',
            },
          ],
        }),
      },
      { llm },
    );
    expect(llm.complete).not.toHaveBeenCalled();
  });
});
