import type { CanvasUser } from '../types.js';

/** The host-injected Canvas credential (`ctx.credentials.get('canvas')`); the host already normalized `host`. */
export interface CanvasCreds { host: string; token: string; }
export interface RosterCanvasClientOptions { fetchImpl?: typeof fetch; }

interface RawCanvasUser {
  id: number;
  name: string;
  login_id?: string;
  sis_user_id?: string | null;
  email?: string;
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

export class RosterCanvasClient {
  private readonly fetchImpl: typeof fetch;
  constructor(private readonly creds: CanvasCreds, opts: RosterCanvasClientOptions = {}) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }
  private base(): string { return `https://${this.creds.host}/api/v1`; }
  private headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.creds.token}`, Accept: 'application/json' };
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

  /** List active students in a course with login_id / sis_user_id / email for matching. */
  async listCourseStudents(courseId: number): Promise<CanvasUser[]> {
    // NOTE: login_id / sis_user_id are returned only when the API token has permission
    // to read user logins / SIS ids. There is no include[] that forces them; absence is
    // surfaced as a proposal warning (see proposeRoster) rather than an error.
    const url = `${this.base()}/courses/${courseId}/users?` +
      `enrollment_type%5B%5D=student&include%5B%5D=email&per_page=100`;
    const raw = await this.getAll<RawCanvasUser>(url);
    return raw.map((u) => ({
      canvasId: String(u.id),
      name: u.name,
      loginId: u.login_id ?? undefined,
      sisUserId: u.sis_user_id == null ? undefined : String(u.sis_user_id),
      email: u.email ?? undefined,
    }));
  }

  /** Fetch a single Canvas user by id, or null if not found. */
  async getUserById(canvasId: string): Promise<import('../types.js').CanvasUser | null> {
    const res = await this.fetchImpl(`${this.base()}/users/${canvasId}?include%5B%5D=email`, {
      method: 'GET', headers: this.headers(),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Canvas GET user ${canvasId} failed: ${res.status}`);
    const u = (await res.json()) as { id: number; name: string; login_id?: string; sis_user_id?: string | null; email?: string };
    return {
      canvasId: String(u.id), name: u.name, loginId: u.login_id ?? undefined,
      sisUserId: u.sis_user_id == null ? undefined : String(u.sis_user_id), email: u.email ?? undefined,
    };
  }
}
