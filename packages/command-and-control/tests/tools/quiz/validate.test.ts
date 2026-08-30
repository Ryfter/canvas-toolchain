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

  it('flags MIGRATION_RISK for a Classic multiple-dropdowns question', () => {
    const findings = deterministicFindings({
      source: 'canvas',
      live: live({
        meta: { quizId: '1', title: 'Classic', quizType: 'assignment' },
        itemsAvailable: true,
        items: [
          {
            id: '42',
            type: 'multiple_dropdowns_question',
            stem: 'Pick the matching terms.',
            key: 'A',
          },
        ],
      }),
    });
    const hit = findings.filter((f) => f.code === 'MIGRATION_RISK');
    expect(hit).toHaveLength(1);
    expect(hit[0]!.severity).toBe('warning');
    expect(hit[0]!.questionId).toBe('42');
    expect(hit[0]!.message).toMatch(/Fill in the Blank/i);
    expect(hit[0]!.fixHint).toMatch(/Fill in the Blank/i);
  });

  it('does not flag MIGRATION_RISK on a Classic quiz with only safe question types', () => {
    const findings = deterministicFindings({
      source: 'canvas',
      live: live({
        meta: { quizId: '1', title: 'Classic', quizType: 'assignment' },
        itemsAvailable: true,
        items: [
          {
            id: '1',
            type: 'multiple_choice_question',
            stem: 'Pick one',
            choices: ['a', 'b', 'c', 'd'],
            key: 'A',
          },
          {
            id: '2',
            type: 'true_false_question',
            stem: 'The sky is blue.',
            key: 'true',
          },
          {
            id: '3',
            type: 'text_only_question',
            stem: 'Read this intro.',
            key: 'n/a',
          },
          {
            id: '4',
            type: 'file_upload_question',
            stem: 'Upload your work.',
            key: 'n/a',
          },
        ],
      }),
    });
    expect(findings.filter((f) => f.code === 'MIGRATION_RISK')).toEqual([]);
  });

  it('never flags MIGRATION_RISK on New Quizzes regardless of question types', () => {
    const findings = deterministicFindings({
      source: 'canvas',
      live: live({
        meta: { quizId: '1', title: 'N', questionCount: 2, quizType: 'quizzes.next' },
        itemsAvailable: true,
        newQuizzesLimited: true,
        items: [
          {
            id: '1',
            type: 'multiple_dropdowns_question',
            stem: 'Dropdown',
            key: 'A',
          },
          {
            id: '2',
            type: 'fill_in_multiple_blanks_question',
            stem: 'Blanks',
            key: 'A',
          },
        ],
      }),
    });
    expect(findings.filter((f) => f.code === 'MIGRATION_RISK')).toEqual([]);
  });

  it('flags MIGRATION_RISK at quiz level for a Classic practice quiz', () => {
    const findings = deterministicFindings({
      source: 'canvas',
      live: live({
        meta: { quizId: '1', title: 'Practice', quizType: 'practice_quiz' },
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
    });
    const hit = findings.filter((f) => f.code === 'MIGRATION_RISK');
    expect(hit).toHaveLength(1);
    expect(hit[0]!.severity).toBe('warning');
    expect(hit[0]!.questionId).toBeUndefined();
    expect(hit[0]!.message).toMatch(/practice/i);
    expect(hit[0]!.message).toMatch(/zero points|Gradebook|Grades/i);
    expect(hit[0]!.fixHint).toBeTruthy();
  });

  it('flags MIGRATION_RISK for Classic fill-in-multiple-blanks more tentatively than dropdowns', () => {
    const findings = deterministicFindings({
      source: 'canvas',
      live: live({
        meta: { quizId: '1', title: 'Classic', quizType: 'assignment' },
        itemsAvailable: true,
        items: [
          {
            id: '7',
            type: 'fill_in_multiple_blanks_question',
            stem: 'Complete each blank.',
            key: 'A',
          },
        ],
      }),
    });
    const hit = findings.filter((f) => f.code === 'MIGRATION_RISK');
    expect(hit).toHaveLength(1);
    expect(hit[0]!.questionId).toBe('7');
    expect(hit[0]!.severity).toBe('warning');
    expect(hit[0]!.message).toMatch(/less certain|third-party/i);
    expect(hit[0]!.fixHint).toMatch(/Fill in the Blank/i);
  });

  it('emits one MIGRATION_RISK finding per detected hazard, not one lumped finding', () => {
    const findings = deterministicFindings({
      source: 'canvas',
      live: live({
        meta: { quizId: '1', title: 'Practice mix', quizType: 'practice_quiz' },
        itemsAvailable: true,
        items: [
          {
            id: '10',
            type: 'multiple_dropdowns_question',
            stem: 'Dropdowns',
            key: 'A',
          },
          {
            id: '11',
            type: 'fill_in_multiple_blanks_question',
            stem: 'Blanks',
            key: 'A',
          },
        ],
      }),
    });
    const hit = findings.filter((f) => f.code === 'MIGRATION_RISK');
    expect(hit).toHaveLength(3);
    expect(hit.some((f) => f.questionId === '10')).toBe(true);
    expect(hit.some((f) => f.questionId === '11')).toBe(true);
    expect(hit.filter((f) => f.questionId === undefined)).toHaveLength(1);
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
