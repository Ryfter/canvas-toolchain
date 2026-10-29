import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { announcementTools, handleAudit, handleRecreate } from '../src/tools.js';
import announcementsModule from '../src/index.js';
import { isCanvasToolchainModule } from '@canvas-toolchain/module-contract';
import { resetCtxForTest } from '../src/ctx.js';
import { fakeCtx } from './helpers/fake-ctx.js';

const ROWS = [
  { id: 10, title: 'Week 1 kickoff', message: '<p>Hello</p>', posted_at: null, delayed_post_at: '2026-05-01T09:00:00Z' },
  { id: 11, title: 'Midterm reminder', message: '<p>Soon</p>', posted_at: null, delayed_post_at: '2099-01-01T09:00:00Z' },
];

function fetchFor(routes: Record<string, unknown>): typeof fetch {
  return (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    const key = `${init?.method ?? 'GET'} ${u.includes('discussion_topics') ? 'topics' : u}`;
    if (!(key in routes)) throw new Error(`unexpected fetch: ${key}`);
    return new Response(JSON.stringify(routes[key]), { status: 200 });
  }) as unknown as typeof fetch;
}

let home: string;
beforeEach(async () => {
  home = mkdtempSync(join(tmpdir(), 'ann-'));
  await announcementsModule.init!(fakeCtx(home));
});
afterEach(() => { resetCtxForTest(); rmSync(home, { recursive: true, force: true }); });

describe('module contract', () => {
  it('default export satisfies the contract with both tools', () => {
    expect(isCanvasToolchainModule(announcementsModule)).toBe(true);
    expect(announcementsModule.id).toBe('announcements');
    expect(announcementTools.map((t) => t.schema.name)).toEqual(['audit_announcements', 'recreate_announcement']);
  });
});

describe('contract v2', () => {
  it('declares a required canvas credential and the 1.2.0 version', () => {
    expect(announcementsModule.contractVersion).toBe(2);
    expect(announcementsModule.version).toBe('1.2.0');
    expect(announcementsModule.credentials).toEqual([expect.objectContaining({ kind: 'canvas', required: true })]);
  });

  it('tools fail with MODULE_NOT_INITIALIZED before init', async () => {
    resetCtxForTest();
    await expect(handleAudit({ courseId: 20244 }, { fetchImpl: fetchFor({}) })).rejects.toThrow(/MODULE_NOT_INITIALIZED/);
  });

  it('sends the host-provided credential to Canvas, not a file on disk', async () => {
    await announcementsModule.init!(fakeCtx(home, { host: 'school.instructure.com', token: 'secret-tok' }));
    const seen: string[] = [];
    const f: typeof fetch = (async (url: string | URL, init?: RequestInit) => {
      seen.push(String(url), String((init?.headers as Record<string, string>).Authorization));
      return new Response('[]', { status: 200 });
    }) as unknown as typeof fetch;
    await handleAudit({ courseId: 20244 }, { fetchImpl: f });
    expect(seen[0]).toContain('https://school.instructure.com/api/v1/courses/20244/discussion_topics');
    expect(seen[1]).toBe('Bearer secret-tok');
  });
});

describe('audit_announcements', () => {
  it('lists stale + ok announcements', async () => {
    const res = await handleAudit({ courseId: 20244 }, { fetchImpl: fetchFor({ 'GET topics': ROWS }) });
    expect(res.stale).toHaveLength(1);
    expect((res.stale as Array<{ id: number }>)[0].id).toBe(10);
    expect(res.ok).toHaveLength(1);
  });
});

describe('input validation (#128)', () => {
  const neverFetch: typeof fetch = (async (url: string) => {
    throw new Error(`Canvas was called with invalid input: ${url}`);
  }) as unknown as typeof fetch;

  it('audit refuses a non-positive-integer courseId without calling Canvas', async () => {
    for (const courseId of [NaN, Infinity, 0, -1, 1.5] as number[]) {
      const res = await handleAudit({ courseId }, { fetchImpl: neverFetch });
      expect(res.error).toBe('INVALID_COURSE_ID');
    }
  });

  it('audit refuses an unparseable term window without calling Canvas', async () => {
    const res = await handleAudit({ courseId: 20244, termStart: 'not a date' }, { fetchImpl: neverFetch });
    expect(res.error).toBe('INVALID_TERM_WINDOW');
  });

  it('recreate refuses invalid ids without calling Canvas', async () => {
    const good = { courseId: 20244, announcementId: 10, newDelayedPostAt: '2099-02-01T09:00:00Z' };
    expect((await handleRecreate({ ...good, courseId: 1.5 }, { fetchImpl: neverFetch })).error).toBe('INVALID_COURSE_ID');
    expect((await handleRecreate({ ...good, announcementId: -2 }, { fetchImpl: neverFetch })).error).toBe('INVALID_ANNOUNCEMENT_ID');
  });

  it('recreate refuses an unparseable newDelayedPostAt before preview AND before create — no Canvas POST', async () => {
    for (const confirm of [undefined, true]) {
      const res = await handleRecreate(
        { courseId: 20244, announcementId: 10, newDelayedPostAt: 'soonish', ...(confirm ? { confirm } : {}) },
        { fetchImpl: neverFetch },
      );
      expect(res.error).toBe('INVALID_DATE');
      expect(res.preview).toBeUndefined();
      expect(res.created).toBeUndefined();
    }
  });
});

describe('recreate_announcement', () => {
  it('previews without posting when confirm is absent', async () => {
    let posted = false;
    const f = fetchFor({ 'GET topics': ROWS, 'POST topics': { id: 99 } });
    const spy: typeof fetch = (async (u, i) => { if (i?.method === 'POST') posted = true; return f(u, i); }) as unknown as typeof fetch;
    const res = await handleRecreate(
      { courseId: 20244, announcementId: 10, newDelayedPostAt: '2099-02-01T09:00:00Z' },
      { fetchImpl: spy },
    );
    expect(res.preview).toBe(true);
    expect(posted).toBe(false);
  });
  it('creates the corrected copy on confirm and never deletes the original', async () => {
    const calls: string[] = [];
    const f = fetchFor({ 'GET topics': ROWS, 'POST topics': { id: 99 } });
    const spy: typeof fetch = (async (u, i) => { calls.push(i?.method ?? 'GET'); return f(u, i); }) as unknown as typeof fetch;
    const res = await handleRecreate(
      { courseId: 20244, announcementId: 10, newDelayedPostAt: '2099-02-01T09:00:00Z', confirm: true },
      { fetchImpl: spy },
    );
    expect(res.created).toMatchObject({ id: 99 });
    expect(String(res.note)).toContain('delete the stale original');
    expect(calls).not.toContain('DELETE');
  });
});
