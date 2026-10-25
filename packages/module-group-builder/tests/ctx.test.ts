import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import mod from '../src/index.js';
import { groupBuilderTools } from '../src/tools.js';
import { createGroups } from '../src/run.js';
import { resetCtxForTest } from '../src/ctx.js';
import { fakeCtx } from './helpers/fake-ctx.js';

let root: string;
afterEach(() => { resetCtxForTest(); vi.unstubAllGlobals(); if (root) rmSync(root, { recursive: true, force: true }); });

describe('module-scope ctx', () => {
  it('declares contract v2 with a required canvas credential', () => {
    expect(mod.contractVersion).toBe(2);
    expect(mod.credentials).toEqual([expect.objectContaining({ kind: 'canvas', required: true })]);
  });

  it('tools fail with MODULE_NOT_INITIALIZED before init', async () => {
    resetCtxForTest();
    const rec = groupBuilderTools.find((t) => t.schema.name === 'record_groups')!;
    await expect(rec.handler({ courseId: '1', grouping: [['1', '2']] })).rejects.toThrow(/MODULE_NOT_INITIALIZED/);
    await expect(createGroups({ courseId: '1', strategy: 'random', groupCount: 1 })).rejects.toThrow(/MODULE_NOT_INITIALIZED/);
  });

  it('state is stored under ctx.paths.config/groups/<course>', async () => {
    root = mkdtempSync(join(tmpdir(), 'gb-ctx-'));
    await mod.init!(fakeCtx(root));
    const rec = groupBuilderTools.find((t) => t.schema.name === 'record_groups')!;
    await rec.handler({ courseId: '9', grouping: [['1', '2']] });
    expect(existsSync(join(root, 'groups', '9', 'pairing-history.json'))).toBe(true);
  });

  it('reads the Canvas credential from ctx.credentials, not from disk', async () => {
    root = mkdtempSync(join(tmpdir(), 'gb-cred-'));
    await mod.init!(fakeCtx(root, { host: 'school.instructure.com', token: 'secret-tok' }));
    const seen: string[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      seen.push(url, String((init.headers as Record<string, string>).Authorization));
      return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
    });
    await createGroups({ courseId: '5', strategy: 'random', groupCount: 1, outputDir: join(root, 'out') }).catch(() => undefined);
    expect(seen[0]).toContain('https://school.instructure.com/api/v1/courses/5/enrollments');
    expect(seen[1]).toBe('Bearer secret-tok');
  });
});
