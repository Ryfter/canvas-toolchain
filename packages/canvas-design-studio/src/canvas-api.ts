import type { CanvasCourse, CanvasPage, InstitutionConfig } from './types.js';
import type { CanvasAssignment, CanvasAssignmentRaw } from './tools/list-canvas-objects.js';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';
type QueryValue = string | string[] | undefined;

export interface CanvasApiClientOptions {
  retryDelaysMs?: number[];
}

export class CanvasApiError extends Error {
  code: string;
  status: number;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'CanvasApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function appendQueryValue(url: URL, key: string, value: QueryValue): void {
  if (value === undefined) return;
  const values = Array.isArray(value) ? value : [value];
  for (const item of values) {
    url.searchParams.append(key, item);
  }
}

function joinApiUrl(baseUrl: string, path: string, params?: Record<string, QueryValue>): string {
  const url = new URL(`${trimTrailingSlash(baseUrl)}/api/v1/${path.replace(/^\/+/, '')}`);
  for (const [key, value] of Object.entries(params ?? {})) {
    appendQueryValue(url, key, value);
  }
  return url.toString();
}

function parseNextLink(linkHeader: string | null): string | undefined {
  if (!linkHeader) return undefined;
  const next = linkHeader.split(',').find(part => part.includes('rel="next"'));
  const match = next?.match(/<([^>]+)>/);
  return match?.[1];
}

/** #124: the Authorization header must only ever be sent to the configured
 *  Canvas origin — refuse any Link "next" URL that points anywhere else. */
function assertSameCanvasOrigin(nextUrl: string, expectedOrigin: string): string {
  let next: URL;
  try {
    next = new URL(nextUrl);
  } catch {
    throw new CanvasApiError(0, 'CANVAS_PAGINATION_OFF_HOST',
      'Canvas returned an unparseable Link "next" URL; refusing to continue pagination.');
  }
  if (next.origin !== expectedOrigin) {
    throw new CanvasApiError(0, 'CANVAS_PAGINATION_OFF_HOST',
      `Refusing to follow a Link header to ${next.origin}; credentials are only sent to ${expectedOrigin}.`);
  }
  return next.toString();
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function responseDetails(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    try {
      return await response.text();
    } catch {
      return undefined;
    }
  }
}

function mapError(status: number, details: unknown): CanvasApiError {
  if (status === 401) {
    return new CanvasApiError(status, 'CANVAS_UNAUTHORIZED', 'Canvas rejected the API token. Run setup_institution to update it.', details);
  }
  if (status === 403) {
    return new CanvasApiError(
      status,
      'CANVAS_FORBIDDEN',
      'Your Canvas API token or Canvas role does not allow editing pages in this course.',
      details
    );
  }
  if (status === 404) {
    return new CanvasApiError(status, 'CANVAS_NOT_FOUND', 'Course or page not found. It may have been deleted, concluded, or unavailable to your Canvas role.', details);
  }
  if (status === 422) {
    return new CanvasApiError(status, 'CANVAS_REJECTED_HTML', 'Canvas rejected the page content. Review the Canvas response details.', details);
  }
  if (status === 429) {
    return new CanvasApiError(status, 'CANVAS_RATE_LIMITED', 'Canvas is rate limiting requests. Try again in a few minutes.', details);
  }
  return new CanvasApiError(status, 'CANVAS_HTTP_ERROR', `Canvas API returned HTTP ${status}.`, details);
}

export class CanvasApiClient {
  private readonly config: InstitutionConfig;
  private readonly retryDelaysMs: number[];

  constructor(config: InstitutionConfig, options: CanvasApiClientOptions = {}) {
    this.config = config;
    this.retryDelaysMs = options.retryDelaysMs ?? [2000, 4000, 8000];
  }

  async listCourses(enrollmentWorkflowStates?: string | string[]): Promise<CanvasCourse[]> {
    return this.paginatedGet<CanvasCourse>('courses', {
      per_page: '50',
      'include[]': ['term', 'total_students', 'teachers'],
      'enrollment_workflow_state[]': enrollmentWorkflowStates,
    });
  }

  async listPages(courseId: number): Promise<CanvasPage[]> {
    return this.paginatedGet<CanvasPage>(`courses/${courseId}/pages`, { per_page: '50' });
  }

  async listAssignments(courseId: number): Promise<CanvasAssignmentRaw[]> {
    return this.paginatedGet<CanvasAssignmentRaw>(`courses/${courseId}/assignments`, { per_page: '100' });
  }

  async createPage(courseId: number, title: string, html: string): Promise<CanvasPage> {
    return this.request<CanvasPage>('POST', `courses/${courseId}/pages`, {
      wiki_page: { title, body: html, published: true },
    });
  }

  async updatePage(courseId: number, pageUrl: string, html: string): Promise<CanvasPage> {
    return this.request<CanvasPage>('PUT', `courses/${courseId}/pages/${encodeURIComponent(pageUrl)}`, {
      wiki_page: { body: html },
    });
  }

  async updateAssignmentDescription(courseId: number, assignmentId: number, html: string): Promise<CanvasAssignment> {
    return this.request<CanvasAssignment>('PUT', `courses/${courseId}/assignments/${assignmentId}`, {
      assignment: { description: html },
    });
  }

  async deletePage(courseId: number, pageUrl: string): Promise<void> {
    await this.request<unknown>('DELETE', `courses/${courseId}/pages/${encodeURIComponent(pageUrl)}`);
  }

  async getPageBody(courseId: number, pageUrl: string): Promise<string> {
    const page = await this.request<CanvasPage & { body?: string }>(
      'GET',
      `courses/${courseId}/pages/${encodeURIComponent(pageUrl)}`,
    );
    return page.body ?? '';
  }

  /** Fetch a Canvas Files file's contents as a UTF-8 string. Two-step flow:
   *  GET /api/v1/files/<fileId> returns a metadata payload that includes a
   *  short-lived signed `url`; we then GET that url for the actual bytes.
   *
   *  Used by V&R preview to capture prior widget content for rollback, and by
   *  rollback to materialize that content for re-upload. Widget bodies are
   *  always HTML in practice; non-text files would still decode but downstream
   *  hashing/diffing isn't meaningful for them. */
  async getFileContent(fileId: number): Promise<string> {
    const meta = await this.request<{ url?: string }>('GET', `files/${fileId}`);
    if (!meta.url) {
      throw new CanvasApiError(500, 'CANVAS_FILE_NO_URL', `Canvas file ${fileId} metadata had no download URL.`);
    }
    let res: Response;
    try {
      // Note: do NOT send the Bearer token to the signed download URL — it's a
      // pre-signed S3-style URL that uses its own verifier query param.
      res = await fetch(meta.url);
    } catch (err) {
      throw new CanvasApiError(0, 'CANVAS_NETWORK_ERROR', `Could not download Canvas file ${fileId}.`, err);
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new CanvasApiError(res.status, 'CANVAS_HTTP_ERROR',
        `Canvas file ${fileId} download returned HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
    return await res.text();
  }

  private async paginatedGet<T>(path: string, params?: Record<string, QueryValue>): Promise<T[]> {
    let nextUrl: string | undefined = joinApiUrl(this.config.canvasUrl, path, params);
    const expectedOrigin = new URL(nextUrl).origin;
    const all: T[] = [];

    while (nextUrl) {
      const response = await this.fetchWithRetry(nextUrl, { method: 'GET', headers: this.headers() });
      const body = await response.json() as T[];
      all.push(...body);
      const rawNext = parseNextLink(response.headers.get('link'));
      nextUrl = rawNext === undefined ? undefined : assertSameCanvasOrigin(rawNext, expectedOrigin);
    }

    return all;
  }

  private async request<T>(method: HttpMethod, path: string, body?: unknown): Promise<T> {
    const response = await this.fetchWithRetry(joinApiUrl(this.config.canvasUrl, path), {
      method,
      headers: this.headers(),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return response.json() as Promise<T>;
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.config.apiToken ?? ''}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }

  private async fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
    for (let attempt = 0; attempt <= this.retryDelaysMs.length; attempt += 1) {
      let response: Response;
      try {
        response = await fetch(url, init);
      } catch (err) {
        throw new CanvasApiError(0, 'CANVAS_NETWORK_ERROR', 'Canvas API unreachable - check your Canvas URL in institution config and try again.', err);
      }

      if (response.ok) return response;

      const details = await responseDetails(response);
      if (response.status === 429 && attempt < this.retryDelaysMs.length) {
        await sleep(this.retryDelaysMs[attempt]);
        continue;
      }

      throw mapError(response.status, details);
    }

    throw new CanvasApiError(429, 'CANVAS_RATE_LIMITED', 'Canvas is rate limiting requests. Try again in a few minutes.');
  }
}
