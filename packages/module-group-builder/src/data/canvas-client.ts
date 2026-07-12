import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface CanvasCreds { host: string; token: string; }

export interface EnrollmentRow {
  user_id: number;
  grades?: { current_score?: number | null };
}
export interface SubmissionRow { user_id: number; assignment_id: number; workflow_state: string; }
export interface GroupCategory { id: number; name: string; }
export interface CanvasGroup { id: number; name: string; }

export interface CanvasClientOptions { fetchImpl?: typeof fetch; }

export function loadCanvasCreds(): CanvasCreds {
  const path = join(process.env.CC_HOME ?? join(homedir(), '.command-and-control'), 'canvas-config.json');
  if (!existsSync(path)) throw new Error('CANVAS_NOT_CONFIGURED: Run setup_canvas with your Canvas host and token.');
  let cfg: Partial<CanvasCreds>;
  try { cfg = JSON.parse(readFileSync(path, 'utf-8')) as Partial<CanvasCreds>; }
  catch { throw new Error('CANVAS_NOT_CONFIGURED: canvas-config.json is corrupt. Re-run setup_canvas.'); }
  if (!cfg.host || !cfg.token) throw new Error('CANVAS_NOT_CONFIGURED: canvas-config.json missing host/token.');
  return { host: cfg.host, token: cfg.token };
}

function parseNextLink(link: string | null): string | undefined {
  if (!link) return undefined;
  for (const part of link.split(',')) {
    const m = part.match(/<([^>]+)>;\s*rel="next"/);
    if (m) return m[1];
  }
  return undefined;
}

/** #124: the Authorization header must only ever be sent to the configured
 *  Canvas host — refuse any Link "next" URL that points anywhere else. */
function assertSameCanvasOrigin(nextUrl: string, host: string): string {
  const expectedOrigin = new URL(`https://${host}`).origin;
  let next: URL;
  try { next = new URL(nextUrl); }
  catch {
    throw new Error('CANVAS_PAGINATION_OFF_HOST: Canvas returned an unparseable Link "next" URL; refusing to continue pagination.');
  }
  if (next.origin !== expectedOrigin) {
    throw new Error(`CANVAS_PAGINATION_OFF_HOST: refusing to follow a Link header to ${next.origin}; credentials are only sent to ${expectedOrigin}.`);
  }
  return next.toString();
}

export class CanvasClient {
  private readonly fetchImpl: typeof fetch;
  constructor(private readonly creds: CanvasCreds, opts: CanvasClientOptions = {}) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }
  private base(): string { return `https://${this.creds.host}/api/v1`; }
  private headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.creds.token}`, 'Content-Type': 'application/json', Accept: 'application/json' };
  }
  private async getAll<T>(url: string): Promise<T[]> {
    const out: T[] = [];
    let next: string | undefined = url;
    while (next) {
      const res = await this.fetchImpl(next, { method: 'GET', headers: this.headers() });
      if (!res.ok) throw new Error(`Canvas GET ${next} failed: ${res.status}`);
      out.push(...((await res.json()) as T[]));
      const rawNext = parseNextLink(res.headers.get('link'));
      next = rawNext === undefined ? undefined : assertSameCanvasOrigin(rawNext, this.creds.host);
    }
    return out;
  }
  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await this.fetchImpl(`${this.base()}/${path}`, { method: 'POST', headers: this.headers(), body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`Canvas POST ${path} failed: ${res.status}`);
    return (await res.json()) as T;
  }

  /** Active student enrollments incl. current_score. */
  listStudentEnrollments(courseId: number): Promise<EnrollmentRow[]> {
    const url = `${this.base()}/courses/${courseId}/enrollments?` +
      `type%5B%5D=StudentEnrollment&state%5B%5D=active&per_page=100`;
    return this.getAll<EnrollmentRow>(url);
  }
  /** Submissions for a set of assignment ids across all students. */
  listSubmissions(courseId: number, assignmentIds: number[]): Promise<SubmissionRow[]> {
    if (assignmentIds.length === 0) return Promise.resolve([]);
    const q = assignmentIds.map((id) => `assignment_ids%5B%5D=${id}`).join('&');
    const url = `${this.base()}/courses/${courseId}/students/submissions?student_ids%5B%5D=all&${q}&per_page=100`;
    return this.getAll<SubmissionRow>(url);
  }
  createGroupCategory(courseId: number, name: string): Promise<GroupCategory> {
    return this.post<GroupCategory>(`courses/${courseId}/group_categories`, { name });
  }
  createGroup(categoryId: number, name: string): Promise<CanvasGroup> {
    return this.post<CanvasGroup>(`group_categories/${categoryId}/groups`, { name });
  }
  addGroupMember(groupId: number, canvasUserId: number): Promise<unknown> {
    return this.post(`groups/${groupId}/memberships`, { user_id: canvasUserId });
  }
}
