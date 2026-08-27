// src/tools/quiz/canvas_fetch.ts
import type { LiveQuizPayload, QuizItem, QuizMeta } from './types.js';

export interface CanvasCfg {
  canvasUrl: string;
  apiToken: string;
}

export interface FetchLiveQuizDeps {
  cfg: CanvasCfg;
  fetchFn?: typeof fetch;
}

export interface FetchLiveQuizInput {
  courseId: string;
  quizId: string;
}

export class QuizFetchError extends Error {
  code: string;
  constructor(code: string, message: string, options?: { cause?: unknown }) {
    super(`${code}: ${message}`, options);
    this.name = 'QuizFetchError';
    this.code = code;
  }
}

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, Accept: 'application/json' };
}

function parseNextLink(linkHeader: string | null): string | undefined {
  if (!linkHeader) return undefined;
  const next = linkHeader.split(',').find((part) => part.includes('rel="next"'));
  return next?.match(/<([^>]+)>/)?.[1];
}

async function getJson(url: string, deps: FetchLiveQuizDeps): Promise<{ body: unknown; link: string | null }> {
  const fetchFn = deps.fetchFn ?? fetch;
  let res: Response;
  try {
    res = await fetchFn(url, { headers: authHeaders(deps.cfg.apiToken) });
  } catch (err) {
    throw new QuizFetchError('CANVAS_NETWORK_ERROR', `Canvas unreachable at ${url}.`, { cause: err });
  }
  if (!res.ok) {
    if (res.status === 401) {
      throw new QuizFetchError('CANVAS_UNAUTHORIZED', 'Canvas rejected the API token. Re-run setup_canvas.');
    }
    if (res.status === 404) {
      throw new QuizFetchError('CANVAS_NOT_FOUND', `Canvas returned 404 for ${url}.`);
    }
    throw new QuizFetchError('CANVAS_HTTP_ERROR', `Canvas returned HTTP ${res.status} for ${url}.`);
  }
  return { body: await res.json(), link: res.headers.get('link') };
}

/** Paginate an array endpoint; refuse off-origin Link: rel="next". */
async function fetchArrayPaged(
  firstUrl: string,
  deps: FetchLiveQuizDeps,
): Promise<unknown[]> {
  const expectedOrigin = new URL(firstUrl).origin;
  const items: unknown[] = [];
  let url: string | undefined = firstUrl;
  for (let page = 0; url && page < 50; page++) {
    const { body, link } = await getJson(url, deps);
    if (!Array.isArray(body)) {
      throw new QuizFetchError('CANVAS_HTTP_ERROR', `Expected array from ${url}.`);
    }
    items.push(...body);
    const rawNext = parseNextLink(link);
    if (rawNext === undefined) {
      url = undefined;
      continue;
    }
    let next: URL | undefined;
    try {
      next = new URL(rawNext);
    } catch {
      next = undefined;
    }
    if (!next || next.origin !== expectedOrigin) {
      throw new QuizFetchError(
        'CANVAS_OFF_ORIGIN_PAGINATION',
        `Refused off-origin or unparseable Link next for quiz questions pagination.`,
      );
    }
    url = next.toString();
  }
  return items;
}

interface CanvasAnswerRaw {
  text?: string;
  html?: string;
  weight?: number;
}

interface CanvasQuestionRaw {
  id?: number | string;
  question_type?: string;
  question_text?: string;
  points_possible?: number;
  answers?: CanvasAnswerRaw[];
}

function letterForIndex(i: number): string {
  return String.fromCharCode(65 + i); // A, B, C…
}

function mapQuestion(q: CanvasQuestionRaw, index: number): QuizItem {
  const id = String(q.id ?? index + 1);
  const type = String(q.question_type ?? 'unknown');
  const stem = String(q.question_text ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const answers = Array.isArray(q.answers) ? q.answers : [];
  const choices = answers.map((a) => String(a.text ?? a.html ?? '').replace(/<[^>]+>/g, ' ').trim());

  let key: string | string[] | undefined;
  if (type.includes('true_false')) {
    const win = answers.find((a) => (a.weight ?? 0) > 0);
    key = win ? String(win.text ?? '').toLowerCase() : undefined;
  } else if (choices.length > 0) {
    const winners = answers
      .map((a, i) => ((a.weight ?? 0) > 0 ? letterForIndex(i) : null))
      .filter((x): x is string => x !== null);
    if (winners.length === 1) key = winners[0];
    else if (winners.length > 1) key = winners;
  }

  return {
    id,
    type,
    stem,
    choices: choices.length > 0 ? choices : undefined,
    key,
    points: typeof q.points_possible === 'number' ? q.points_possible : null,
  };
}

function looksLikeNewQuizzes(quizType: string | undefined, itemsAvailable: boolean, questionCount: number | null): boolean {
  const t = (quizType ?? '').toLowerCase();
  if (t.includes('quizzes.next') || t.includes('new_quizzes') || t === 'graded_quiz_next') return true;
  // Classic quiz claiming questions but API returned none → limited surface
  if (!itemsAvailable && (questionCount ?? 0) > 0) return true;
  return false;
}

export async function fetchLiveQuiz(
  input: FetchLiveQuizInput,
  deps: FetchLiveQuizDeps,
): Promise<LiveQuizPayload> {
  const base = `${deps.cfg.canvasUrl.replace(/\/+$/, '')}/api/v1/courses/${input.courseId}`;
  const quizUrl = `${base}/quizzes/${input.quizId}`;
  const { body } = await getJson(quizUrl, deps);
  const q = body as Record<string, unknown>;

  const meta: QuizMeta = {
    quizId: String(q.id ?? input.quizId),
    title: String(q.title ?? 'Quiz'),
    questionCount: typeof q.question_count === 'number' ? q.question_count : null,
    pointsPossible: typeof q.points_possible === 'number' ? q.points_possible : null,
    published: Boolean(q.published),
    dueAt: (q.due_at as string | null | undefined) ?? null,
    lockAt: (q.lock_at as string | null | undefined) ?? null,
    unlockAt: (q.unlock_at as string | null | undefined) ?? null,
    quizType: q.quiz_type != null ? String(q.quiz_type) : undefined,
  };

  let rawQuestions: unknown[] = [];
  try {
    rawQuestions = await fetchArrayPaged(
      `${base}/quizzes/${input.quizId}/questions?per_page=100`,
      deps,
    );
  } catch (err) {
    if (err instanceof QuizFetchError && err.code === 'CANVAS_NOT_FOUND') {
      rawQuestions = [];
    } else {
      throw err;
    }
  }

  const items = (rawQuestions as CanvasQuestionRaw[]).map(mapQuestion);
  const itemsAvailable = items.length > 0;
  const newQuizzesLimited = looksLikeNewQuizzes(meta.quizType, itemsAvailable, meta.questionCount ?? null);

  return { meta, items, itemsAvailable, newQuizzesLimited };
}
