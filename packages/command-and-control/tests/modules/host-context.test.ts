/**
 * CT201-03: the host injects a ModuleContext into v2 modules (spec 4.3, 5.3, Q2).
 * Every test runs against temp homes via CC_HOME / CANVAS_DESIGN_HOME, never the real home.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import type { CanvasToolchainModule, ModuleContext } from '@canvas-toolchain/module-contract';
import { loadModules } from '../../src/modules/registry.js';
import { saveModuleManifest } from '../../src/modules/manifest.js';
import { artifactPath, loadInstalledModules, saveInstalledModules } from '../../src/channel/installed.js';
import { adaptModuleTools } from '../../src/surface/module_adapter.js';

const SHARED_TOKEN = 'shared-secret-token-ZZZZ9999';
const WINDOWS_HINT = 'This module version predates Canvas Toolchain\'s Windows folders.';

let home: string;
let cds: string;
let errSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'cc-hostctx-'));
  cds = mkdtempSync(join(tmpdir(), 'cds-hostctx-'));
  process.env.CC_HOME = home;
  process.env.CANVAS_DESIGN_HOME = cds;
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  errSpy.mockRestore();
  delete process.env.CC_HOME;
  delete process.env.CANVAS_DESIGN_HOME;
  rmSync(home, { recursive: true, force: true });
  rmSync(cds, { recursive: true, force: true });
});

function writeSharedCanvas(): void {
  writeFileSync(join(home, 'canvas-config.json'), JSON.stringify({ host: 'school', token: SHARED_TOKEN }));
}

function enable(...ids: string[]): void {
  saveModuleManifest({ modules: Object.fromEntries(ids.map((id) => [id, { enabled: true }])) });
}

function placeArtifact(id: string, version: string, source: string): void {
  const p = artifactPath(id, version);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, source);
  const file = loadInstalledModules();
  file.modules[id] = {
    id, version, installedAt: '2026-10-25T00:00:00Z',
    sha256: createHash('sha256').update(source).digest('hex'),
  };
  saveInstalledModules(file);
}

function loggedText(): string {
  return errSpy.mock.calls.map((c) => c.map(String).join(' ')).join('\n');
}

/** A v2 module whose tool only works once init has handed it a ctx. */
function v2Module(id: string, events: string[], over: Partial<CanvasToolchainModule> = {}): CanvasToolchainModule {
  let ctx: ModuleContext | undefined;
  return {
    id, name: `Mod ${id}`, description: 'test', version: '1.0.0',
    contractVersion: 2,
    credentials: [{ kind: 'canvas', required: true, purpose: 'Reads courses.' }],
    init: async (c) => {
      await new Promise((r) => setTimeout(r, 5)); // proves the host awaits init
      events.push(`init:${c.moduleId}`);
      ctx = c;
    },
    tools: [{
      schema: { name: `${id}_tool`, description: 't', inputSchema: { type: 'object' } },
      handler: async () => {
        if (!ctx) throw new Error('MODULE_NOT_INITIALIZED');
        const canvas = await ctx.credentials.get('canvas');
        return { content: [{ type: 'text', text: canvas.host }] };
      },
    }],
    ...over,
  };
}

describe('v2 modules receive a ModuleContext before their tools are exposed', () => {
  it('init runs (and is awaited) before loadModules returns the module; its tool then works', async () => {
    writeSharedCanvas();
    enable('v2mod');
    const events: string[] = [];
    const loaded = await loadModules({ v2mod: async () => v2Module('v2mod', events) });
    expect(events).toEqual(['init:v2mod']);
    expect(loaded.byId.has('v2mod')).toBe(true);
    const [op] = adaptModuleTools('v2mod', loaded.byId.get('v2mod')!.tools);
    await expect(op.handler({})).resolves.toEqual({ content: [{ type: 'text', text: 'school.instructure.com' }] });
  });

  it('the ctx is bound to the manifest id with host-resolved paths', async () => {
    enable('pathmod');
    let seen: ModuleContext | undefined;
    await loadModules({ pathmod: async () => v2Module('pathmod', [], { init: (c) => { seen = c; } }) });
    expect(seen?.moduleId).toBe('pathmod');
    expect(seen?.paths).toEqual({ config: home, data: home, secrets: home, designStudioData: cds });
  });

  it('a module whose init throws is skipped (fail-soft), and the error text never reaches the log', async () => {
    enable('boom', 'good');
    const loaded = await loadModules({
      boom: async () => v2Module('boom', [], { init: () => { throw new Error(`INIT_FAILED: leaked ${SHARED_TOKEN}`); } }),
      good: async () => v2Module('good', []),
    });
    expect(loaded.byId.has('boom')).toBe(false);
    expect(loaded.tools.map((t) => t.name)).not.toContain('boom_tool');
    expect(loaded.handlers.has('boom_tool')).toBe(false);
    expect(loaded.byId.has('good')).toBe(true);
    expect(loggedText()).toContain("'boom'");
    expect(loggedText()).toContain('INIT_FAILED');
    expect(loggedText()).not.toContain(SHARED_TOKEN);
  });

  it('a v2 module with malformed declarations is rejected before init', async () => {
    enable('bad');
    const events: string[] = [];
    const loaded = await loadModules({
      bad: async () => v2Module('bad', events, {
        credentials: [{ kind: 'canvas', required: true, purpose: '' }],
      }),
    });
    expect(loaded.byId.has('bad')).toBe(false);
    expect(events).toEqual([]);
  });

  it('a v2 module with no declarations and no init still loads', async () => {
    enable('bare');
    const loaded = await loadModules({
      bare: async () => ({
        id: 'bare', name: 'Bare', description: 'd', version: '1.0.0', contractVersion: 2,
        tools: [{ schema: { name: 'bare_tool', inputSchema: { type: 'object' } }, handler: async () => ({ content: [] }) }],
      }) as CanvasToolchainModule,
    });
    expect(loaded.handlers.has('bare_tool')).toBe(true);
  });

  it('asking for an undeclared kind rejects with CREDENTIAL_NOT_DECLARED through the production path', async () => {
    writeSharedCanvas();
    enable('nodecl');
    let ctx: ModuleContext | undefined;
    const loaded = await loadModules({
      nodecl: async () => v2Module('nodecl', [], {
        credentials: [{ kind: 'anthropic', required: true, purpose: 'Drafts.' }],
        init: (c) => { ctx = c; },
        tools: [{
          schema: { name: 'nodecl_tool', inputSchema: { type: 'object' } },
          handler: async () => { await ctx!.credentials.get('canvas'); return { content: [] }; },
        }],
      }),
    });
    const [op] = adaptModuleTools('nodecl', loaded.byId.get('nodecl')!.tools);
    const err = await op.handler({}).then(() => null, (e: Error) => e);
    expect(err?.name).toBe('CREDENTIAL_NOT_DECLARED');
    expect(err?.message).toMatch(/^CREDENTIAL_NOT_DECLARED:/);
    expect(err?.message).not.toContain(SHARED_TOKEN);
  });

  it('only the precedence winner is initialized: a losing bundled module never gets a ctx', async () => {
    const events: string[] = [];
    placeArtifact('dup', '2.0.0', `export default { id: 'dup', name: 'Dup', description: 'd', version: '2.0.0', contractVersion: 2,
      init: () => {}, tools: [{ schema: { name: 'dup_new', inputSchema: { type: 'object' } }, handler: async () => ({ content: [] }) }] };\n`);
    enable('dup');
    const loaded = await loadModules({ dup: async () => v2Module('dup', events) });
    expect(loaded.handlers.has('dup_new')).toBe(true);
    expect(events).toEqual([]);
  });
});

describe('credential sharing default by module origin (spec Q2: accepted)', () => {
  it('a bundled (first-party) v2 module rides the shared Canvas connection', async () => {
    writeSharedCanvas();
    enable('first');
    const loaded = await loadModules({ first: async () => v2Module('first', []) });
    const [op] = adaptModuleTools('first', loaded.byId.get('first')!.tools);
    await expect(op.handler({})).resolves.toEqual({ content: [{ type: 'text', text: 'school.instructure.com' }] });
  });

  it('a channel-installed v2 module is denied the shared connection until consent, and the value never leaks', async () => {
    writeSharedCanvas();
    placeArtifact('chan', '1.0.0', `let ctx;
export default { id: 'chan', name: 'Channel Mod', description: 'd', version: '1.0.0', contractVersion: 2,
  credentials: [{ kind: 'canvas', required: true, purpose: 'Reads announcements.' }],
  init: (c) => { ctx = c; },
  tools: [{ schema: { name: 'chan_tool', inputSchema: { type: 'object' } },
    handler: async () => { const c = await ctx.credentials.get('canvas'); return { content: [{ type: 'text', text: c.host }] }; } }] };\n`);
    enable('chan');
    const loaded = await loadModules({});
    const [op] = adaptModuleTools('chan', loaded.byId.get('chan')!.tools);
    const err = await op.handler({}).then(() => null, (e: Error) => e);
    expect(err?.message).toMatch(/^CANVAS_NOT_CONFIGURED: Channel Mod \(chan\) /);
    expect(err?.message).not.toContain(SHARED_TOKEN);
    expect(loggedText()).not.toContain(SHARED_TOKEN);

    // Consent (what `ct_setup module_credentials share` will write) flips it, no restart.
    mkdirSync(join(home, 'module-credentials'), { recursive: true });
    writeFileSync(join(home, 'module-credentials', 'chan.json'),
      JSON.stringify({ schemaVersion: 1, share: { canvas: true }, credentials: {} }));
    await expect(op.handler({})).resolves.toEqual({ content: [{ type: 'text', text: 'school.instructure.com' }] });
  });
});

describe('v1 modules are loaded exactly as before (no ctx)', () => {
  it('a v1 module loads without init being called, even if it happens to carry one', async () => {
    enable('old');
    const init = vi.fn();
    const handler = async () => ({ content: [{ type: 'text' as const, text: 'v1' }] });
    const mod = {
      id: 'old', name: 'Old', description: 'd', version: '1.0.0', init,
      tools: [{ schema: { name: 'old_tool', inputSchema: { type: 'object' as const } }, handler }],
    };
    const loaded = await loadModules({ old: async () => mod as unknown as CanvasToolchainModule });
    expect(init).not.toHaveBeenCalled();
    expect(loaded.byId.get('old')).toBe(mod);
    expect(loaded.handlers.get('old_tool')).toBe(handler);
  });

  it('a legacy channel module without declarations still loads (spec 4.3 acceptance)', async () => {
    placeArtifact('legacy', '1.0.0', `export default { id: 'legacy', name: 'Legacy', description: 'd', version: '1.0.0',
      tools: [{ schema: { name: 'legacy_tool', inputSchema: { type: 'object' } }, handler: async () => ({ content: [] }) }] };\n`);
    enable('legacy');
    const loaded = await loadModules({});
    expect(loaded.handlers.has('legacy_tool')).toBe(true);
  });
});

describe('legacy channel module Windows hint (spec 5.3), through the production dispatch path', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const frozen = readFileSync(join(here, '../../../../modules/announcements/1.1.0/announcements-1.1.0.mjs'), 'utf-8');

  async function auditOp(platform: NodeJS.Platform) {
    placeArtifact('announcements', '1.1.0', frozen);
    enable('announcements');
    const loaded = await loadModules({}, { platform });
    const ops = adaptModuleTools('announcements', loaded.byId.get('announcements')!.tools);
    return ops.find((o) => o.id === 'announcements.audit_announcements')!;
  }

  it('win32: the frozen announcements-1.1.0 CANVAS_NOT_CONFIGURED rejection carries the update hint', async () => {
    const op = await auditOp('win32');
    const err = await op.handler({ courseId: 1 }).then(() => null, (e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err!.message).toMatch(/^CANVAS_NOT_CONFIGURED: Run setup_canvas with your Canvas host and token\./);
    expect(err!.message).toContain(WINDOWS_HINT);
    expect(err!.message).toContain('Run `install_module announcements` to update it.');
  });

  it('darwin: the same rejection passes through untouched, with no Windows hint', async () => {
    const op = await auditOp('darwin');
    const err = await op.handler({ courseId: 1 }).then(() => null, (e: Error) => e);
    expect(err!.message).toBe('CANVAS_NOT_CONFIGURED: Run setup_canvas with your Canvas host and token.');
  });

  it('linux: no hint either', async () => {
    const op = await auditOp('linux');
    const err = await op.handler({ courseId: 1 }).then(() => null, (e: Error) => e);
    expect(err!.message).not.toContain(WINDOWS_HINT);
  });

  it('win32: successful results and non-*_NOT_CONFIGURED rejections are untouched', async () => {
    placeArtifact('other', '1.0.0', `export default { id: 'other', name: 'Other', description: 'd', version: '1.0.0',
      tools: [
        { schema: { name: 'ok_tool', inputSchema: { type: 'object' } }, handler: async () => ({ content: [{ type: 'text', text: 'fine' }] }) },
        { schema: { name: 'fail_tool', inputSchema: { type: 'object' } }, handler: async () => { throw new Error('CANVAS_PAGINATION_OFF_HOST: nope'); } },
      ] };\n`);
    enable('other');
    const loaded = await loadModules({}, { platform: 'win32' });
    const ops = adaptModuleTools('other', loaded.byId.get('other')!.tools);
    await expect(ops[0].handler({})).resolves.toEqual({ content: [{ type: 'text', text: 'fine' }] });
    await expect(ops[1].handler({})).rejects.toThrow(/^CANVAS_PAGINATION_OFF_HOST: nope$/);
  });

  it('win32: bundled v1 modules and v2 channel modules are never wrapped', async () => {
    const handler = async () => { throw new Error('CANVAS_NOT_CONFIGURED: bundled'); };
    enable('bund');
    const loaded = await loadModules({
      bund: async () => ({ id: 'bund', name: 'B', description: 'd', version: '1.0.0',
        tools: [{ schema: { name: 'b', inputSchema: { type: 'object' } }, handler }] }) as CanvasToolchainModule,
    }, { platform: 'win32' });
    expect(loaded.byId.get('bund')!.tools[0].handler).toBe(handler);
  });
});
