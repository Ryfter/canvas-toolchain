import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CanvasClient, loadCanvasCreds } from '../../src/data/canvas-client.js';

afterEach(() => { vi.restoreAllMocks(); });

function jsonResponse(body: unknown, link?: string): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: link ? { 'content-type': 'application/json', link } : { 'content-type': 'application/json' },
  });
}

describe('CanvasClient', () => {
  it('listStudentEnrollments follows Link-header pagination and Bearer-auths', async () => {
    const calls: string[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(url);
      const auth = (init?.headers as Record<string, string>).Authorization;
      expect(auth).toBe('Bearer tok');
      if (url.includes('page=2')) return jsonResponse([{ user_id: 2, grades: { current_score: 80 } }]);
      return jsonResponse(
        [{ user_id: 1, grades: { current_score: 91 } }],
        '<https://x.instructure.com/api/v1/courses/5/enrollments?page=2>; rel="next"',
      );
    });
    const c = new CanvasClient({ host: 'x.instructure.com', token: 'tok' }, { fetchImpl: fetchMock as unknown as typeof fetch });
    const rows = await c.listStudentEnrollments(5);
    expect(rows.map((r) => r.user_id)).toEqual([1, 2]);
    expect(calls[0]).toContain('/api/v1/courses/5/enrollments');
    expect(calls[0]).toContain('type%5B%5D=StudentEnrollment');
  });

  it('refuses an off-host Link target and never sends the token there (#124)', async () => {
    const calls: string[] = [];
    const fetchMock = vi.fn(async (url: string) => {
      calls.push(url);
      if (url.includes('evil.example')) throw new Error(`credentialed request escaped to ${url}`);
      return jsonResponse(
        [{ user_id: 1, grades: { current_score: 91 } }],
        '<https://evil.example/api/v1/courses/5/enrollments?page=2>; rel="next"',
      );
    });
    const c = new CanvasClient({ host: 'x.instructure.com', token: 'tok' }, { fetchImpl: fetchMock as unknown as typeof fetch });
    await expect(c.listStudentEnrollments(5)).rejects.toThrow(/CANVAS_PAGINATION_OFF_HOST/);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('x.instructure.com');
  });

  it('createGroupCategory POSTs the name', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.method).toBe('POST');
      expect(JSON.parse(String(init?.body))).toEqual({ name: 'Week 3 Teams' });
      return jsonResponse({ id: 77, name: 'Week 3 Teams' });
    });
    const c = new CanvasClient({ host: 'x.instructure.com', token: 'tok' }, { fetchImpl: fetchMock as unknown as typeof fetch });
    expect(await c.createGroupCategory(5, 'Week 3 Teams')).toEqual({ id: 77, name: 'Week 3 Teams' });
  });
});

// #151 R7: this module reads ~/.command-and-control/canvas-config.json directly,
// so it must apply the same host rules as @canvas-toolchain/shared-types'
// normalizeCanvasHost. The table below is that implementation's own test table;
// keeping it here is what stops the two from drifting apart.
describe('loadCanvasCreds host normalization', () => {
  const TABLE: Array<[string, string]> = [
    ['https://example.instructure.com/', 'example.instructure.com'],
    ['https://example.instructure.com/api/v1', 'example.instructure.com'],
    ['  EXAMPLE.Instructure.COM.  ', 'example.instructure.com'],
    ['exampleucanvas', 'exampleucanvas.instructure.com'],
    ['canvas.exampleu.edu', 'canvas.exampleu.edu'],
  ];

  let homes: string[] = [];
  const savedCcHome = process.env.CC_HOME;

  afterEach(() => {
    for (const dir of homes) rmSync(dir, { recursive: true, force: true });
    homes = [];
    if (savedCcHome === undefined) delete process.env.CC_HOME;
    else process.env.CC_HOME = savedCcHome;
  });

  function seed(host: string, token: string): void {
    const home = mkdtempSync(join(tmpdir(), 'gb-canvas-'));
    homes.push(home);
    process.env.CC_HOME = home;
    writeFileSync(join(home, 'canvas-config.json'), JSON.stringify({ host, token }), 'utf-8');
  }

  it('canonicalizes the host it reads', () => {
    for (const [saved, expected] of TABLE) {
      seed(saved, 'tok');
      expect(loadCanvasCreds()).toEqual({ host: expected, token: 'tok' });
    }
  });

  it('throws rather than building a request against an unusable host', () => {
    seed('   ', 'tok');
    expect(() => loadCanvasCreds()).toThrow(/CANVAS_NOT_CONFIGURED/);
  });
});
