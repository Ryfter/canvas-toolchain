import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ccHome } from '../paths.js';
import type { PaCanvasUser, PaGroup } from '../types.js';

export interface CanvasCreds { host: string; token: string; }
export interface PaCanvasClientOptions { fetchImpl?: typeof fetch; }

interface RawCanvasUser {
  id: number; name: string; sortable_name?: string;
  login_id?: string; sis_user_id?: string | null; email?: string;
}
interface RawNamed { id: number; name: string; }

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

function toUser(u: RawCanvasUser): PaCanvasUser {
  return {
    canvasId: String(u.id),
    name: u.name,
    sortableName: u.sortable_name ?? undefined,
    loginId: u.login_id ?? undefined,
    sisUserId: u.sis_user_id == null ? undefined : String(u.sis_user_id),
    email: u.email ?? undefined,
  };
}

export class PaCanvasClient {
  private readonly fetchImpl: typeof fetch;
  constructor(private readonly creds: CanvasCreds, opts: PaCanvasClientOptions = {}) {
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

  /** Find a group category (set) id by exact name, or null. */
  async findGroupCategory(courseId: number, name: string): Promise<number | null> {
    const cats = await this.getAll<RawNamed>(
      `${this.base()}/courses/${courseId}/group_categories?per_page=100`);
    const hit = cats.find((c) => c.name === name);
    return hit ? hit.id : null;
  }
  /** List the groups within a category. */
  listGroups(categoryId: number): Promise<RawNamed[]> {
    return this.getAll<RawNamed>(`${this.base()}/group_categories/${categoryId}/groups?per_page=100`);
  }
  /** List the members of a group, normalized. */
  async listGroupMembers(groupId: number): Promise<PaCanvasUser[]> {
    const raw = await this.getAll<RawCanvasUser>(
      `${this.base()}/groups/${groupId}/users?include%5B%5D=email&per_page=100`);
    return raw.map(toUser);
  }
  /** List active students in the course (for the ungrouped check). */
  async listCourseStudents(courseId: number): Promise<PaCanvasUser[]> {
    const raw = await this.getAll<RawCanvasUser>(
      `${this.base()}/courses/${courseId}/users?enrollment_type%5B%5D=student&include%5B%5D=email&per_page=100`);
    return raw.map(toUser);
  }
  /** Read the named group set as PaGroup[]. Throws GROUP_SET_NOT_FOUND if absent. */
  async readGroupSet(courseId: number, groupSetName: string): Promise<PaGroup[]> {
    const catId = await this.findGroupCategory(courseId, groupSetName);
    if (catId == null) {
      throw new Error(`GROUP_SET_NOT_FOUND: no group set named "${groupSetName}" in course ${courseId}.`);
    }
    const groups = await this.listGroups(catId);
    const out: PaGroup[] = [];
    for (const g of groups) {
      out.push({ name: g.name, members: await this.listGroupMembers(g.id) });
    }
    return out;
  }
}
