import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fetchCourseSnapshot } from '../../../src/tools/snapshot/fetch_snapshot.js';

function jsonResponse(body: unknown, nextUrl?: string): Response {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (nextUrl) headers.link = `<${nextUrl}>; rel="next"`;
  return new Response(JSON.stringify(body), { status: 200, headers });
}

describe('fetchCourseSnapshot pagination origin guard (#124)', () => {
  let home: string;
  const savedCcHome = process.env.CC_HOME;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'cc-snap-'));
    process.env.CC_HOME = home;
    writeFileSync(join(home, 'canvas-config.json'), JSON.stringify({
      host: 'canvas.test',
      token: 'secret-token',
      configuredAt: new Date().toISOString(),
      lastValidatedAt: new Date().toISOString(),
    }));
  });

  afterEach(() => {
    if (savedCcHome === undefined) delete process.env.CC_HOME;
    else process.env.CC_HOME = savedCcHome;
    vi.unstubAllGlobals();
    rmSync(home, { recursive: true, force: true });
  });

  it('refuses an off-host Link target and never sends the token there', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', (async (url: string) => {
      calls.push(url);
      if (url.includes('/courses/5?')) return jsonResponse({ id: 5, name: 'ITM 999' });
      if (url.includes('/assignment_groups')) {
        return jsonResponse([{ id: 1, name: 'HW', group_weight: 0 }], 'https://evil.example/steal');
      }
      return jsonResponse([]);
    }) as unknown as typeof fetch);

    await expect(fetchCourseSnapshot(5)).rejects.toThrow(/CANVAS_PAGINATION_OFF_HOST/);
    expect(calls.some((u) => u.includes('evil.example'))).toBe(false);
  });
});
