import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setModuleCredential, setModuleShare } from '@canvas-toolchain/shared-types';
import { readSetupState } from '../../src/setup/read_state.js';
import { runDoctor } from '../../src/setup/doctor.js';
import type { LoadedModuleDeclaration } from '../../src/setup/types.js';

// CT201-13: the doctor reports, per loaded v2 module and declared kind, which
// credential it will use. Presence and outcome only; planted secrets must never
// appear anywhere in the report or the state.

const SECRETS = ['planted-canvas-token', 'planted-module-token', 'planted-anthropic-key',
  'planted-panopto-secret', 'panopto-planted.example.edu', 'moduleschool.instructure.com'];

let home: string;
const ENV_KEYS = ['CC_HOME', 'CANVAS_DESIGN_HOME', 'CURRICULUM_INTELLIGENCE_HOME', 'ANTHROPIC_API_KEY', 'HOME'] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  home = mkdtempSync(join(tmpdir(), 'ct-modcred-'));
  process.env.CC_HOME = join(home, 'cc');
  process.env.CANVAS_DESIGN_HOME = join(home, 'cds');
  process.env.CURRICULUM_INTELLIGENCE_HOME = join(home, 'ci');
  process.env.HOME = home;
  delete process.env.ANTHROPIC_API_KEY;
  mkdirSync(process.env.CC_HOME, { recursive: true });
  mkdirSync(process.env.CANVAS_DESIGN_HOME, { recursive: true });
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('network call in test'))));
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.unstubAllGlobals();
  rmSync(home, { recursive: true, force: true });
});

const mods = (list: LoadedModuleDeclaration[]) => async () => list;
const v2 = (id: string, origin: 'bundled' | 'channel', credentials: LoadedModuleDeclaration['credentials']): LoadedModuleDeclaration =>
  ({ id, origin, contractVersion: 2, credentials });

async function creds(list: LoadedModuleDeclaration[]) {
  const state = await readSetupState({ loadedModules: mods(list), hosts: false });
  const report = await runDoctor({ state });
  return { state, report, check: report.checks.find((c) => c.id === 'modules.credentials')! };
}

function seedShared(): void {
  writeFileSync(join(process.env.CC_HOME!, 'canvas-config.json'),
    JSON.stringify({ host: 'planted.example.edu', token: 'planted-canvas-token' }), { mode: 0o600 });
  writeFileSync(join(process.env.CC_HOME!, 'anthropic-config.json'),
    JSON.stringify({ apiKey: 'planted-anthropic-key', model: 'm' }), { mode: 0o600 });
}

describe('modules.credentials', () => {
  it('reports module / shared / share-denied / incomplete / none per declared kind', async () => {
    seedShared();
    setModuleCredential('roster', 'canvas', { host: 'moduleschool.instructure.com', token: 'planted-module-token' });
    setModuleShare('consented', 'canvas', true);
    mkdirSync(join(process.env.CC_HOME!, 'module-credentials'), { recursive: true });
    writeFileSync(join(process.env.CC_HOME!, 'module-credentials', 'broken.json'),
      JSON.stringify({ schemaVersion: 1, share: {}, credentials: { canvas: { host: 'x.instructure.com' } } }), { mode: 0o600 });

    const { state, check } = await creds([
      v2('roster', 'bundled', [{ kind: 'canvas', required: true }]),
      v2('video', 'bundled', [{ kind: 'canvas', required: true }, { kind: 'panopto', required: false }]),
      v2('denied', 'channel', [{ kind: 'canvas', required: true }]),
      v2('consented', 'channel', [{ kind: 'canvas', required: true }]),
      v2('broken', 'channel', [{ kind: 'canvas', required: false }]),
      v2('empty', 'channel', [{ kind: 'anthropic', required: false }]),
    ]);
    const status = (id: string, kind: string) =>
      state.modules.credentials.rows.find((r) => r.moduleId === id && r.kind === kind)?.status;
    expect(status('roster', 'canvas')).toBe('module');
    expect(status('video', 'canvas')).toBe('shared');
    expect(status('video', 'panopto')).toBe('none');
    expect(status('denied', 'canvas')).toBe('share-denied');
    expect(status('consented', 'canvas')).toBe('shared');
    expect(status('broken', 'canvas')).toBe('incomplete');
    expect(status('empty', 'anthropic')).toBe('share-denied');

    expect(check.status).toBe('warn');
    expect(check.summary).toContain('denied');
    expect(check.fix).toMatchObject({ tool: 'ct_setup', action: 'module_credentials' });
    expect(check.detail).toContain('Using the shared credential: consented, video.');
    expect(check.detail?.some((d) => d.includes('roster-vault'))).toBe(true);
  });

  it('is ok when every required kind is usable and optional gaps stay quiet', async () => {
    seedShared();
    const { check } = await creds([
      v2('video', 'bundled', [{ kind: 'canvas', required: true }, { kind: 'panopto', required: false }]),
    ]);
    expect(check.status).toBe('ok');
    expect(check.fix).toBeUndefined();
  });

  it('labels legacy v1 modules and does not make them rows', async () => {
    const { state, check } = await creds([{ id: 'old-mod', origin: 'channel' }]);
    expect(state.modules.credentials.rows).toEqual([]);
    expect(state.modules.credentials.legacy).toEqual([{ id: 'old-mod', origin: 'channel' }]);
    expect(check.detail).toContain('old-mod: legacy (shared files, Windows may need a module update)');
    expect(check.status).toBe('ok');
  });

  it('warns, without throwing, when the modules cannot be loaded', async () => {
    const state = await readSetupState({ hosts: false, loadedModules: async () => { throw new Error('boom planted-canvas-token'); } });
    const report = await runDoctor({ state });
    const check = report.checks.find((c) => c.id === 'modules.credentials')!;
    expect(check.status).toBe('warn');
    expect(JSON.stringify(report)).not.toContain('planted-canvas-token');
  });

  it.skipIf(process.platform === 'win32')('flags a group-readable module credential file in security.file_permissions', async () => {
    setModuleCredential('roster', 'canvas', { host: 'moduleschool.instructure.com', token: 'planted-module-token' });
    const file = join(process.env.CC_HOME!, 'module-credentials', 'roster.json');
    expect(existsSync(file)).toBe(true);
    chmodSync(file, 0o644);
    const { report } = await creds([v2('roster', 'bundled', [{ kind: 'canvas', required: true }])]);
    const perms = report.checks.find((c) => c.id === 'security.file_permissions')!;
    expect(perms.status).toBe('warn');
    expect(perms.detail).toContain(file);
  });

  it('never emits a token, key, host, domain or file body', async () => {
    seedShared();
    setModuleCredential('roster', 'canvas', { host: 'moduleschool.instructure.com', token: 'planted-module-token' });
    setModuleCredential('video', 'panopto', {
      domain: 'panopto-planted.example.edu', clientId: 'cid', clientSecret: 'planted-panopto-secret',
    });
    const { state, report } = await creds([
      v2('roster', 'bundled', [{ kind: 'canvas', required: true }]),
      v2('video', 'bundled', [{ kind: 'panopto', required: false }, { kind: 'canvas', required: false }]),
    ]);
    const dumped = JSON.stringify({ state, report });
    for (const secret of SECRETS) expect(dumped).not.toContain(secret);
  });
});
