import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { AnnouncementRow } from './audit.js';

export interface CanvasCreds { host: string; token: string }
export interface CanvasClientOptions { fetchImpl?: typeof fetch }

/** Same credential source + idiom as module-group-builder's canvas client. */
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

export class AnnouncementsClient {
  private readonly fetchImpl: typeof fetch;
  constructor(private readonly creds: CanvasCreds, opts: CanvasClientOptions = {}) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }
  private base(): string { return `https://${this.creds.host}/api/v1`; }
  private headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.creds.token}`, 'Content-Type': 'application/json', Accept: 'application/json' };
  }
  /** Announcements are discussion topics with only_announcements=true; paginated. */
  async listAnnouncements(courseId: number): Promise<AnnouncementRow[]> {
    const out: AnnouncementRow[] = [];
    let next: string | undefined =
      `${this.base()}/courses/${courseId}/discussion_topics?only_announcements=true&per_page=100`;
    while (next) {
      const res = await this.fetchImpl(next, { method: 'GET', headers: this.headers() });
      if (!res.ok) throw new Error(`Canvas GET ${next} failed: ${res.status}`);
      out.push(...((await res.json()) as AnnouncementRow[]));
      next = parseNextLink(res.headers.get('link'));
    }
    return out;
  }
  async createAnnouncement(
    courseId: number,
    input: { title: string; message: string; delayedPostAt: string },
  ): Promise<{ id: number }> {
    const res = await this.fetchImpl(`${this.base()}/courses/${courseId}/discussion_topics`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        title: input.title,
        message: input.message,
        is_announcement: true,
        delayed_post_at: input.delayedPostAt,
        published: true,
      }),
    });
    if (!res.ok) throw new Error(`Canvas POST discussion_topics failed: ${res.status}`);
    return (await res.json()) as { id: number };
  }
}
