import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ccHome } from '../paths.js';
import type { CanvasUser } from '../types.js';

export interface CanvasCreds { host: string; token: string; }
export interface RosterCanvasClientOptions { fetchImpl?: typeof fetch; }

interface RawCanvasUser {
  id: number;
  name: string;
  login_id?: string;
  sis_user_id?: string | null;
  email?: string;
}

/** Read ~/.command-and-control/canvas-config.json. Throws if not configured. */
export function loadCanvasCreds(): CanvasCreds {
  const path = join(ccHome(), 'canvas-config.json');
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
      next = parseNextLink(res.headers.get('link'));
    }
    return out;
  }

  /** List active students in a course with login_id / sis_user_id / email for matching. */
  async listCourseStudents(courseId: number): Promise<CanvasUser[]> {
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
}
