import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RosterCanvasClient, loadCanvasCreds } from '../src/canvas/client.js';

function fakeFetch(body: unknown): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch;
}

describe('RosterCanvasClient', () => {
  it('maps course users to CanvasUser with match fields', async () => {
    const client = new RosterCanvasClient(
      { host: 'x.instructure.com', token: 't' },
      { fetchImpl: fakeFetch([
        { id: 900, name: 'Jane Doe', login_id: 'jdoe', sis_user_id: '100', email: 'a@x.edu' },
        { id: 901, name: 'Bob Smith', login_id: 'bsmith' },
      ]) },
    );
    const users = await client.listCourseStudents(123);
    expect(users[0]).toEqual({
      canvasId: '900', name: 'Jane Doe', loginId: 'jdoe', sisUserId: '100', email: 'a@x.edu',
    });
    expect(users[1]).toEqual({ canvasId: '901', name: 'Bob Smith', loginId: 'bsmith', sisUserId: undefined, email: undefined });
  });

  it('throws a clear error on a non-OK Canvas response', async () => {
    const client = new RosterCanvasClient(
      { host: 'x.instructure.com', token: 't' },
      { fetchImpl: (async () => new Response('nope', { status: 403 })) as unknown as typeof fetch },
    );
    await expect(client.listCourseStudents(123)).rejects.toThrow(/403/);
  });

  it('refuses an off-host Link target and never sends the token there (#124)', async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(url);
      if (url.includes('evil.example')) throw new Error(`credentialed request escaped to ${url}`);
      return new Response(JSON.stringify([{ id: 900, name: 'Jane Doe' }]), {
        status: 200,
        headers: {
          'content-type': 'application/json',
          link: '<https://evil.example/api/v1/courses/123/users?page=2>; rel="next"',
        },
      });
    }) as unknown as typeof fetch;
    const client = new RosterCanvasClient({ host: 'x.instructure.com', token: 't' }, { fetchImpl });
    await expect(client.listCourseStudents(123)).rejects.toThrow(/CANVAS_PAGINATION_OFF_HOST/);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('x.instructure.com');
  });
});

// #151 R7: this module reads ~/.command-and-control/canvas-config.json directly,
// so it applies the same host rules as @canvas-toolchain/shared-types'
// normalizeCanvasHost. The table below mirrors that implementation's own test
// table — keeping it here is what stops the two from drifting apart.
describe('loadCanvasCreds host normalization', () => {
  const TABLE: Array<[string, string]> = [
    ['https://example.instructure.com/', 'example.instructure.com'],
    ['https://example.instructure.com/api/v1', 'example.instructure.com'],
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
    const home = mkdtempSync(join(tmpdir(), 'roster-canvas-'));
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
    seed('  ', 'tok');
    expect(() => loadCanvasCreds()).toThrow(/CANVAS_NOT_CONFIGURED/);
  });
});
