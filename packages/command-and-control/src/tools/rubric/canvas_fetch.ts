// src/tools/rubric/canvas_fetch.ts
import type { PulledRubric, PulledRubricCriterion } from './sync_types.js';

export interface CanvasCfg { canvasUrl: string; apiToken: string; }
export interface PullRubricDeps { cfg: CanvasCfg; fetchFn?: typeof fetch; }
export interface PullRubricInput {
  courseId: string;
  assignmentId?: string;
  /** When set, fetch this specific course rubric (used after the list fallback). */
  rubricId?: string;
}

export class RubricFetchError extends Error {
  code: string;
  constructor(code: string, message: string, options?: { cause?: unknown }) {
    super(`${code}: ${message}`, options);
    this.name = 'RubricFetchError';
    this.code = code;
  }
}

interface CanvasCriterionRaw {
  id?: string | number;
  description?: string;       // Canvas puts the criterion NAME here
  long_description?: string;
  points?: number;
  ratings?: Array<{ points?: number; description?: string }>;
}

function mapCriteria(raw: CanvasCriterionRaw[] | undefined): PulledRubricCriterion[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((c, i) => ({
    id: String(c.id ?? i + 1),
    name: String(c.description ?? `Criterion ${i + 1}`),
    points: typeof c.points === 'number' ? c.points : 0,
    description: String(c.long_description ?? ''),
    ratings: Array.isArray(c.ratings)
      ? c.ratings.map(r => ({ points: typeof r.points === 'number' ? r.points : 0, description: String(r.description ?? '') }))
      : undefined,
  }));
}

async function getJson(url: string, deps: PullRubricDeps): Promise<unknown> {
  const fetchFn = deps.fetchFn ?? fetch;
  let res: Response;
  try {
    res = await fetchFn(url, { headers: { Authorization: `Bearer ${deps.cfg.apiToken}`, Accept: 'application/json' } });
  } catch (err) {
    throw new RubricFetchError('CANVAS_NETWORK_ERROR', `Canvas unreachable at ${url}.`, { cause: err });
  }
  if (!res.ok) {
    if (res.status === 401) throw new RubricFetchError('CANVAS_UNAUTHORIZED', 'Canvas rejected the API token. Re-run setup_canvas.');
    if (res.status === 404) throw new RubricFetchError('CANVAS_NOT_FOUND', `Canvas returned 404 for ${url}.`);
    throw new RubricFetchError('CANVAS_HTTP_ERROR', `Canvas returned HTTP ${res.status} for ${url}.`);
  }
  return await res.json();
}

export async function pullRubric(input: PullRubricInput, deps: PullRubricDeps): Promise<PulledRubric> {
  const base = `${deps.cfg.canvasUrl.replace(/\/+$/, '')}/api/v1/courses/${input.courseId}`;

  // Specific course rubric requested (post-list selection).
  if (input.rubricId) {
    const body = await getJson(`${base}/rubrics/${input.rubricId}`, deps) as { id?: number; title?: string; data?: CanvasCriterionRaw[] };
    return {
      source: { kind: 'course-rubric', courseId: input.courseId, rubricId: input.rubricId, title: String(body.title ?? 'Rubric') },
      criteria: mapCriteria(body.data),
    };
  }

  // Assignment-first.
  if (input.assignmentId) {
    const a = await getJson(`${base}/assignments/${input.assignmentId}`, deps) as
      { id?: number; name?: string; description?: string; rubric?: CanvasCriterionRaw[] | null };
    if (Array.isArray(a.rubric) && a.rubric.length > 0) {
      return {
        source: { kind: 'assignment', courseId: input.courseId, assignmentId: input.assignmentId, title: String(a.name ?? 'Assignment') },
        criteria: mapCriteria(a.rubric),
        assignmentBrief: a.description ?? undefined,
      };
    }
  }

  // List fallback.
  const list = await getJson(`${base}/rubrics`, deps) as Array<{ id?: number; title?: string }>;
  if (!Array.isArray(list) || list.length === 0) {
    throw new RubricFetchError('NO_RUBRICS', `Course ${input.courseId} has no rubrics and the assignment has none attached.`);
  }
  return {
    source: { kind: 'course-rubric', courseId: input.courseId, title: 'Course rubrics' },
    criteria: [],
    choices: list.map(r => ({ rubricId: String(r.id), title: String(r.title ?? 'Rubric') })),
  };
}
