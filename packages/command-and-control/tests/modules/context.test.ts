import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setModuleCredential, setModuleShare } from '@canvas-toolchain/shared-types';
import { createModuleContext, shareDefaultFor } from '../../src/modules/context.js';

const SHARED_TOKEN = 'shared-secret-token-AAAA1111';
const OWN_TOKEN = 'own-secret-token-BBBB2222';

let home: string;
let cds: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'cc-ctx-'));
  cds = mkdtempSync(join(tmpdir(), 'cds-ctx-'));
  process.env.CC_HOME = home;
  process.env.CANVAS_DESIGN_HOME = cds;
});
afterEach(() => {
  delete process.env.CC_HOME;
  delete process.env.CANVAS_DESIGN_HOME;
  rmSync(home, { recursive: true, force: true });
  rmSync(cds, { recursive: true, force: true });
});

function writeSharedCanvas(token = SHARED_TOKEN): void {
  writeFileSync(join(home, 'canvas-config.json'), JSON.stringify({ host: 'school', token }));
}

const canvasRequired = [{ kind: 'canvas' as const, required: true, purpose: 'Reads course rosters.' }];

async function rejection(p: Promise<unknown>): Promise<Error> {
  try {
    await p;
  } catch (err) {
    return err as Error;
  }
  throw new Error('expected a rejection');
}

describe('shareDefaultFor (spec Q2, accepted)', () => {
  it('first-party bundled modules share by default; channel modules are denied until consent', () => {
    expect(shareDefaultFor('bundled')).toBe(true);
    expect(shareDefaultFor('channel')).toBe(false);
  });
});

describe('createModuleContext', () => {
  it('binds the module id and hands out the host-resolved homes', () => {
    const ctx = createModuleContext({ moduleId: 'group-builder', moduleName: 'Group Builder', declarations: [], origin: 'bundled' });
    expect(ctx.moduleId).toBe('group-builder');
    expect(ctx.paths).toEqual({ config: home, data: home, secrets: home, designStudioData: cds });
  });

  it('a bundled module resolves the shared Canvas connection (shareDefault true), host normalized', async () => {
    writeSharedCanvas();
    const ctx = createModuleContext({ moduleId: 'group-builder', moduleName: 'Group Builder', declarations: canvasRequired, origin: 'bundled' });
    expect(await ctx.credentials.get('canvas')).toEqual({ host: 'school.instructure.com', token: SHARED_TOKEN });
    expect(await ctx.credentials.tryGet('canvas')).toEqual({ host: 'school.instructure.com', token: SHARED_TOKEN });
  });

  it('a channel module is denied the shared connection until the professor consents (shareDefault false)', async () => {
    writeSharedCanvas();
    const ctx = createModuleContext({ moduleId: 'auditor', moduleName: 'Auditor', declarations: canvasRequired, origin: 'channel' });
    const err = await rejection(ctx.credentials.get('canvas'));
    expect(err.message).toMatch(/^CANVAS_NOT_CONFIGURED: Auditor \(auditor\) /);
    expect(err.message).toContain('ct_setup action module_credentials with module "auditor"');
    expect(err.message).not.toContain(SHARED_TOKEN);
    expect(await ctx.credentials.tryGet('canvas')).toBeNull();

    setModuleShare('auditor', 'canvas', true);
    expect(await ctx.credentials.get('canvas')).toEqual({ host: 'school.instructure.com', token: SHARED_TOKEN });
  });

  it("a module's own credential wins over the shared one", async () => {
    writeSharedCanvas();
    setModuleCredential('group-builder', 'canvas', { host: 'other.instructure.com', token: OWN_TOKEN });
    const ctx = createModuleContext({ moduleId: 'group-builder', moduleName: 'Group Builder', declarations: canvasRequired, origin: 'bundled' });
    expect(await ctx.credentials.get('canvas')).toEqual({ host: 'other.instructure.com', token: OWN_TOKEN });
  });

  it('reads disk fresh on every call (a ct_setup change needs no restart)', async () => {
    const ctx = createModuleContext({ moduleId: 'group-builder', moduleName: 'Group Builder', declarations: canvasRequired, origin: 'bundled' });
    expect(await ctx.credentials.tryGet('canvas')).toBeNull();
    writeSharedCanvas();
    expect((await ctx.credentials.get('canvas')).token).toBe(SHARED_TOKEN);
  });

  it('nothing configured: the fixed "needs a connection" sentence', async () => {
    const ctx = createModuleContext({ moduleId: 'group-builder', moduleName: 'Group Builder', declarations: canvasRequired, origin: 'bundled' });
    const err = await rejection(ctx.credentials.get('canvas'));
    expect(err.message).toBe(
      'CANVAS_NOT_CONFIGURED: Group Builder (group-builder) needs a Canvas connection. Run ct_setup action ' +
        'module_credentials with module "group-builder" to share your main Canvas connection or give it its own.',
    );
    expect(err.name).toBe('CANVAS_NOT_CONFIGURED');
  });

  it('an incomplete own entry gets its own sentence and never falls back to (or leaks) the shared token', async () => {
    writeSharedCanvas();
    mkdirModuleCreds({ canvas: { host: 'other.instructure.com', token: '' } });
    const ctx = createModuleContext({ moduleId: 'group-builder', moduleName: 'Group Builder', declarations: canvasRequired, origin: 'bundled' });
    const err = await rejection(ctx.credentials.get('canvas'));
    expect(err.message).toMatch(/^CANVAS_NOT_CONFIGURED: Group Builder \(group-builder\) has its own Canvas connection saved, but it is incomplete\./);
    expect(err.message).not.toContain(SHARED_TOKEN);
    expect(err.message).not.toContain('other.instructure.com');
    expect(await ctx.credentials.tryGet('canvas')).toBeNull();
  });

  it('anthropic and panopto map to their own *_NOT_CONFIGURED codes', async () => {
    const ctx = createModuleContext({
      moduleId: 'roster', moduleName: 'Roster', origin: 'bundled',
      declarations: [
        { kind: 'anthropic', required: false, purpose: 'Normalizes majors.' },
        { kind: 'panopto', required: true, purpose: 'Fetches captions.' },
      ],
    });
    expect((await rejection(ctx.credentials.get('anthropic'))).message).toMatch(/^ANTHROPIC_NOT_CONFIGURED: Roster \(roster\) needs an Anthropic API key\./);
    expect((await rejection(ctx.credentials.get('panopto'))).message).toMatch(/^PANOPTO_NOT_CONFIGURED: Roster \(roster\) needs a Panopto connection\./);
    expect(await ctx.credentials.tryGet('anthropic')).toBeNull();

    writeFileSync(join(home, 'anthropic-config.json'), JSON.stringify({ apiKey: 'sk-ant-SECRET', model: 'm' }));
    expect(await ctx.credentials.tryGet('anthropic')).toEqual({ apiKey: 'sk-ant-SECRET', model: 'm' });
  });

  it('an undeclared kind rejects with CREDENTIAL_NOT_DECLARED from get and tryGet, even when one is configured', async () => {
    writeSharedCanvas();
    const ctx = createModuleContext({
      moduleId: 'oral-assessment', moduleName: 'Oral Assessment', origin: 'bundled',
      declarations: [{ kind: 'anthropic', required: true, purpose: 'Drafts prompts.' }],
    });
    for (const p of [ctx.credentials.get('canvas'), ctx.credentials.tryGet('canvas')]) {
      const err = await rejection(p);
      expect(err.name).toBe('CREDENTIAL_NOT_DECLARED');
      expect(err.message).toMatch(/^CREDENTIAL_NOT_DECLARED: Oral Assessment \(oral-assessment\) did not declare a canvas credential/);
      expect(err.message).not.toContain(SHARED_TOKEN);
    }
  });

  it('an unknown kind is refused as undeclared, never passed to the store', async () => {
    const ctx = createModuleContext({ moduleId: 'x', moduleName: 'X', declarations: canvasRequired, origin: 'bundled' });
    const err = await rejection((ctx.credentials.get as (k: string) => Promise<unknown>)('../../etc'));
    expect(err.name).toBe('CREDENTIAL_NOT_DECLARED');
  });

  it('the context is frozen so a module cannot widen its own declarations or rebind its id', () => {
    const ctx = createModuleContext({ moduleId: 'x', moduleName: 'X', declarations: canvasRequired, origin: 'bundled' });
    expect(Object.isFrozen(ctx)).toBe(true);
    expect(Object.isFrozen(ctx.paths)).toBe(true);
    expect(Object.isFrozen(ctx.credentials)).toBe(true);
  });
});

function mkdirModuleCreds(credentials: Record<string, unknown>): void {
  const dir = join(home, 'module-credentials');
  // Hand-written on purpose: setModuleCredential refuses incomplete values.
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'group-builder.json'), JSON.stringify({ schemaVersion: 1, share: {}, credentials }));
}
