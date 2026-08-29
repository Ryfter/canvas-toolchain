import { describe, it, expect, vi } from 'vitest';
import { fetchLiveQuiz, QuizFetchError } from '../../../src/tools/quiz/canvas_fetch.js';

const cfg = { canvasUrl: 'https://example.instructure.com', apiToken: 'tok' };

describe('fetchLiveQuiz', () => {
  it('maps classic quiz + questions with key', async () => {
    const fetchFn = vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.includes('/questions')) {
        return new Response(
          JSON.stringify([
            {
              id: 1,
              question_type: 'multiple_choice_question',
              question_text: 'Stem?',
              points_possible: 1,
              answers: [
                { text: 'Wrong', weight: 0 },
                { text: 'Right', weight: 100 },
                { text: 'Nope', weight: 0 },
                { text: 'Nah', weight: 0 },
              ],
            },
          ]),
          { status: 200, headers: { link: '' } },
        );
      }
      return new Response(
        JSON.stringify({
          id: 9,
          title: 'Week 2 Quiz',
          published: true,
          due_at: '2026-09-14T23:59:00Z',
          question_count: 1,
          points_possible: 1,
          quiz_type: 'practice_quiz',
        }),
        { status: 200 },
      );
    });

    const live = await fetchLiveQuiz(
      { courseId: '101', quizId: '9' },
      { cfg, fetchFn: fetchFn as unknown as typeof fetch },
    );
    expect(live.meta.title).toBe('Week 2 Quiz');
    expect(live.itemsAvailable).toBe(true);
    expect(live.items[0]!.key).toBe('B');
    expect(live.items[0]!.choices).toHaveLength(4);
  });

  it('flags new quizzes / unavailable items', async () => {
    const fetchFn = vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.includes('/questions')) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      return new Response(
        JSON.stringify({
          id: 9,
          title: 'Next Quiz',
          question_count: 5,
          quiz_type: 'quizzes.next',
        }),
        { status: 200 },
      );
    });
    const live = await fetchLiveQuiz(
      { courseId: '101', quizId: '9' },
      { cfg, fetchFn: fetchFn as unknown as typeof fetch },
    );
    expect(live.itemsAvailable).toBe(false);
    expect(live.newQuizzesLimited).toBe(true);
  });

  it('refuses off-origin Link next', async () => {
    const fetchFn = vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.includes('/questions') && !u.includes('page=2')) {
        return new Response(JSON.stringify([{ id: 1, question_text: 'A', answers: [] }]), {
          status: 200,
          headers: {
            link: '<https://evil.example/steal>; rel="next"',
          },
        });
      }
      if (u.includes('/quizzes/9') && !u.includes('questions')) {
        return new Response(JSON.stringify({ id: 9, title: 'Q' }), { status: 200 });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    });

    await expect(
      fetchLiveQuiz({ courseId: '101', quizId: '9' }, { cfg, fetchFn: fetchFn as unknown as typeof fetch }),
    ).rejects.toBeInstanceOf(QuizFetchError);
  });
});
