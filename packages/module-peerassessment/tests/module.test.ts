import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isCanvasToolchainModule, type ModuleContext } from '@canvas-toolchain/module-contract';
import mod from '../src/index.js';

function fakeCtx(): { ctx: ModuleContext; secretCalls: string[] } {
  const root = mkdtempSync(join(tmpdir(), 'pa-ctx-'));
  const secretCalls: string[] = [];
  const ctx = {
    moduleId: 'peerassessment',
    paths: { config: join(root, 'config'), data: join(root, 'data'), designStudioData: join(root, 'ds'), secrets: join(root, 'secrets') },
    credentials: {
      get: async (kind: string) => { secretCalls.push(kind); return { host: 'canvas.test', token: 'SECRET-TOKEN' }; },
      tryGet: async () => null,
    },
  } as unknown as ModuleContext;
  return { ctx, secretCalls };
}

const callTool = (args: unknown) => mod.tools[0].handler(args);

describe('module-peerassessment default export', () => {
  it('satisfies the module contract and declares v2 canvas', () => {
    expect(isCanvasToolchainModule(mod)).toBe(true);
    expect(mod.contractVersion).toBe(2);
    expect(mod.credentials).toEqual([expect.objectContaining({ kind: 'canvas', required: true })]);
  });
  it('has id "peerassessment" and exposes its tool', () => {
    expect(mod.id).toBe('peerassessment');
    expect(mod.tools.map((t) => t.schema.name)).toEqual(['build_peerassessment_import']);
  });
  // Must stay before the init test: ctx lives in module scope.
  it('fails with MODULE_NOT_INITIALIZED before init', async () => {
    await expect(callTool({ courseId: '5', groupSetName: 'G' })).rejects.toThrow(/MODULE_NOT_INITIALIZED/);
  });
  it('after init: Canvas via ctx, vault from ctx secrets, CSV under ctx config, no secret in result', async () => {
    const { ctx, secretCalls } = fakeCtx();
    mkdirSync(join(ctx.paths.secrets, 'roster-vault'), { recursive: true });
    writeFileSync(join(ctx.paths.secrets, 'roster-vault', 'vault.json'), JSON.stringify({
      records: [{ studentNumber: '900111', canvasId: '100', pseudonym: 'FA26-001', firstSeenTerm: 'FA26' }],
    }));
    await mod.init!(ctx);
    const fetchOrig = globalThis.fetch;
    const urls: string[] = [];
    globalThis.fetch = (async (url: string) => {
      urls.push(url);
      const body = url.includes('/group_categories?') ? [{ id: 7, name: 'G' }]
        : url.includes('/group_categories/7/groups') ? [{ id: 9, name: 'Team 1' }]
        : url.includes('/groups/9/users') ? [{ id: 100, name: 'Jane Public', sortable_name: 'Public, Jane', email: 'jane@u.edu' }]
        : [{ id: 100, name: 'Jane Public' }];
      return { ok: true, status: 200, json: async () => body, headers: new Headers() } as unknown as Response;
    }) as unknown as typeof fetch;
    try {
      const res = await callTool({ courseId: '5', groupSetName: 'G' });
      const text = (res.content[0] as { text: string }).text;
      expect(text).not.toContain('SECRET-TOKEN');
      expect(secretCalls).toEqual(['canvas']);
      expect(urls[0]).toContain('https://canvas.test/api/v1');
      const out = join(ctx.paths.config, 'peerassessment');
      const files = readdirSync(out);
      expect(files).toHaveLength(1);
      expect(readFileSync(join(out, files[0]), 'utf-8')).toContain('Team 1,,jane@u.edu,Jane,Public,900111');
    } finally { globalThis.fetch = fetchOrig; }
  });
});
