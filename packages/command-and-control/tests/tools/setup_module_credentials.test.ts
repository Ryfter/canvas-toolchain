import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CanvasToolchainModule, CredentialDeclaration } from '@canvas-toolchain/module-contract';
import {
  moduleCredentialFileExists,
  moduleCredentialPresence,
  resolveModuleCredential,
  setModuleCredential,
  setModuleShare,
} from '@canvas-toolchain/shared-types';
import {
  defaultResolveModule,
  setupModuleCredentials,
  type ModuleCredentialsDeps,
  type ModuleLookup,
} from '../../src/tools/setup_module_credentials.js';
import { buildRegistry } from '../../src/surface/registry.js';

// Planted secrets: none of these may ever appear in a result, a thrown message,
// or anything written to the console.
const CANVAS_TOKEN = 'PLANTED-canvas-token-7f3a9c';
const SHARED_CANVAS_TOKEN = 'PLANTED-shared-canvas-token-1b2c';
const API_KEY = 'sk-ant-PLANTED-api-key-44d1';
const PANOPTO_SECRET = 'PLANTED-panopto-secret-9e8d';
const PANOPTO_CLIENT_ID = 'PLANTED-panopto-client-id-5a6b';
const MODULE_HOST = 'planted-module-host.instructure.com';
const SHARED_HOST = 'planted-shared-host.instructure.com';
const SECRETS = [CANVAS_TOKEN, SHARED_CANVAS_TOKEN, API_KEY, PANOPTO_SECRET, PANOPTO_CLIENT_ID];

let tmpHome: string;
let consoleOutput: string[];

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'cc-module-creds-'));
  process.env.CC_HOME = tmpHome;
  consoleOutput = [];
  for (const level of ['log', 'error', 'warn', 'info', 'debug'] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      consoleOutput.push(args.map(String).join(' '));
    });
  }
});

afterEach(() => {
  // Captured console output must never carry a secret, in any test.
  assertNoSecrets(consoleOutput.join('\n'));
  vi.restoreAllMocks();
  delete process.env.CC_HOME;
  rmSync(tmpHome, { recursive: true, force: true });
});

function assertNoSecrets(text: string): void {
  for (const secret of SECRETS) expect(text).not.toContain(secret);
}

function v2(id: string, declarations: CredentialDeclaration[]): CanvasToolchainModule {
  return {
    id, name: `Module ${id}`, version: '1.0.0', handles: [], tools: [],
    contractVersion: 2, credentials: declarations,
  } as unknown as CanvasToolchainModule;
}

const canvasReq: CredentialDeclaration = { kind: 'canvas', required: true, purpose: 'Reads groups.' };
const anthropicOpt: CredentialDeclaration = { kind: 'anthropic', required: false, purpose: 'Normalizes majors.' };
const panoptoReq: CredentialDeclaration = { kind: 'panopto', required: true, purpose: 'Fetches captions.' };

const MODULES: Record<string, ModuleLookup> = {
  'group-builder': { status: 'found', module: v2('group-builder', [canvasReq]), origin: 'bundled' },
  roster: { status: 'found', module: v2('roster', [canvasReq, anthropicOpt]), origin: 'bundled' },
  video: { status: 'found', module: v2('video', [panoptoReq]), origin: 'bundled' },
  announcements: { status: 'found', module: v2('announcements', [canvasReq]), origin: 'channel' },
  legacy: {
    status: 'found',
    module: { id: 'legacy', name: 'Legacy', version: '1.0.0', handles: [], tools: [] } as unknown as CanvasToolchainModule,
    origin: 'channel',
  },
};

function okResponse(): Response {
  return { ok: true, status: 200, json: async () => ({ access_token: 'x' }) } as Response;
}
function statusResponse(status: number): Response {
  return { ok: false, status, json: async () => ({}) } as Response;
}

function makeDeps(fetchImpl: ModuleCredentialsDeps['fetchImpl'] = vi.fn(async () => okResponse())): ModuleCredentialsDeps & { fetchImpl: ReturnType<typeof vi.fn> } {
  return {
    resolveModule: async (id) => MODULES[id] ?? { status: 'unknown' },
    listModuleIds: () => Object.keys(MODULES),
    fetchImpl: fetchImpl as ReturnType<typeof vi.fn>,
  };
}

/** Run the tool and assert nothing secret leaks through a result or a throw. */
async function run(args: Record<string, unknown>, deps = makeDeps()): Promise<Record<string, unknown>> {
  let result: Record<string, unknown>;
  try {
    result = await setupModuleCredentials(args as never, deps);
  } catch (err) {
    const msg = err instanceof Error ? `${err.name} ${err.message} ${String(err.stack)}` : String(err);
    assertNoSecrets(msg);
    throw err;
  }
  assertNoSecrets(JSON.stringify(result));
  return result;
}

function writeSharedCanvas(): void {
  writeFileSync(join(tmpHome, 'canvas-config.json'), JSON.stringify({ host: SHARED_HOST, token: SHARED_CANVAS_TOKEN }));
}

function credentialFile(id: string): string {
  return join(tmpHome, 'module-credentials', `${id}.json`);
}

describe('set', () => {
  it('validates against Canvas BEFORE saving, then saves the module credential', async () => {
    const deps = makeDeps();
    const result = await run({ module: 'group-builder', kind: 'canvas', op: 'set', host: MODULE_HOST, token: CANVAS_TOKEN }, deps);

    expect(result).toMatchObject({ ok: true, op: 'set', module: 'group-builder', kind: 'canvas', saved: true, validated: true, source: 'module' });
    expect(deps.fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = deps.fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://${MODULE_HOST}/api/v1/users/self`);
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${CANVAS_TOKEN}`);

    const resolved = resolveModuleCredential('group-builder', 'canvas', { shareDefault: true });
    expect(resolved).toEqual({ value: { host: MODULE_HOST, token: CANVAS_TOKEN }, source: 'module' });
    // The result never names the host either (presence only).
    expect(JSON.stringify(result)).not.toContain(MODULE_HOST);
  });

  it('normalizes a bare Canvas subdomain before validating and saving', async () => {
    const deps = makeDeps();
    await run({ module: 'group-builder', kind: 'canvas', op: 'set', host: 'https://myschool/', token: CANVAS_TOKEN }, deps);
    expect(deps.fetchImpl.mock.calls[0][0]).toBe('https://myschool.instructure.com/api/v1/users/self');
  });

  it('saves nothing when the live service rejects the credential', async () => {
    const deps = makeDeps(vi.fn(async () => statusResponse(401)));
    const result = await run({ module: 'group-builder', kind: 'canvas', op: 'set', host: MODULE_HOST, token: CANVAS_TOKEN }, deps);

    expect(result).toMatchObject({ ok: false, error: 'CREDENTIAL_VALIDATION_FAILED', saved: false });
    expect(String(result.message)).toContain('401');
    expect(moduleCredentialFileExists('group-builder')).toBe(false);
  });

  it('saves nothing on a network failure, and never echoes the error text', async () => {
    const deps = makeDeps(vi.fn(async () => {
      throw new Error(`connect failed for token ${CANVAS_TOKEN}`);
    }));
    const result = await run({ module: 'group-builder', kind: 'canvas', op: 'set', host: MODULE_HOST, token: CANVAS_TOKEN }, deps);
    expect(result).toMatchObject({ ok: false, error: 'CREDENTIAL_VALIDATION_FAILED', saved: false });
    expect(moduleCredentialFileExists('group-builder')).toBe(false);
  });

  it('refuses an incomplete credential without calling the service', async () => {
    const deps = makeDeps();
    const result = await run({ module: 'group-builder', kind: 'canvas', op: 'set', token: CANVAS_TOKEN }, deps);
    expect(result).toMatchObject({ ok: false, error: 'CREDENTIAL_INCOMPLETE' });
    expect(deps.fetchImpl).not.toHaveBeenCalled();
    expect(moduleCredentialFileExists('group-builder')).toBe(false);
  });

  it('validates and saves an Anthropic key (model optional)', async () => {
    const deps = makeDeps();
    const result = await run({ module: 'roster', kind: 'anthropic', op: 'set', apiKey: API_KEY, model: 'claude-test-model' }, deps);
    expect(result).toMatchObject({ ok: true, saved: true, source: 'module' });
    const [url, init] = deps.fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect((init.headers as Record<string, string>)['x-api-key']).toBe(API_KEY);
    expect(JSON.parse(String(init.body)).model).toBe('claude-test-model');
    expect(resolveModuleCredential('roster', 'anthropic', { shareDefault: false }))
      .toEqual({ value: { apiKey: API_KEY, model: 'claude-test-model' }, source: 'module' });
  });

  it('validates and saves a Panopto credential', async () => {
    const deps = makeDeps();
    const result = await run({
      module: 'video', kind: 'panopto', op: 'set',
      domain: 'school.hosted.panopto.com', clientId: PANOPTO_CLIENT_ID, clientSecret: PANOPTO_SECRET,
    }, deps);
    expect(result).toMatchObject({ ok: true, saved: true, source: 'module' });
    expect(deps.fetchImpl.mock.calls[0][0]).toBe('https://school.hosted.panopto.com/Panopto/oauth2/connect/token');
    const resolved = resolveModuleCredential('video', 'panopto', { shareDefault: false });
    expect(resolved).toMatchObject({ source: 'module', value: { clientSecret: PANOPTO_SECRET, domain: 'school.hosted.panopto.com' } });
  });

  it('refuses a Panopto domain that is not a bare hostname, without calling out', async () => {
    const deps = makeDeps();
    const result = await run({
      module: 'video', kind: 'panopto', op: 'set',
      domain: 'evil.example/path?x=', clientId: PANOPTO_CLIENT_ID, clientSecret: PANOPTO_SECRET,
    }, deps);
    expect(result).toMatchObject({ ok: false, error: 'PANOPTO_DOMAIN_INVALID' });
    expect(deps.fetchImpl).not.toHaveBeenCalled();
  });

  it.skipIf(process.platform === 'win32')('stores the module file owner-only (0o600)', async () => {
    await run({ module: 'group-builder', kind: 'canvas', op: 'set', host: MODULE_HOST, token: CANVAS_TOKEN });
    expect(statSync(credentialFile('group-builder')).mode & 0o777).toBe(0o600);
  });
});

describe('test', () => {
  it('validates the module credential and reports source "module"', async () => {
    setModuleCredential('group-builder', 'canvas', { host: MODULE_HOST, token: CANVAS_TOKEN });
    const deps = makeDeps();
    const result = await run({ module: 'group-builder', kind: 'canvas', op: 'test' }, deps);
    expect(result).toMatchObject({ ok: true, op: 'test', source: 'module', validated: true });
    expect(deps.fetchImpl.mock.calls[0][0]).toBe(`https://${MODULE_HOST}/api/v1/users/self`);
  });

  it('falls back to the shared credential for a built-in module and says so', async () => {
    writeSharedCanvas();
    const deps = makeDeps();
    const result = await run({ module: 'group-builder', kind: 'canvas', op: 'test' }, deps);
    expect(result).toMatchObject({ ok: true, source: 'shared', validated: true });
    expect(deps.fetchImpl.mock.calls[0][0]).toBe(`https://${SHARED_HOST}/api/v1/users/self`);
    expect(JSON.stringify(result)).not.toContain(SHARED_HOST);
  });

  it('a channel module is denied the shared credential until consent', async () => {
    writeSharedCanvas();
    const deps = makeDeps();
    const result = await run({ module: 'announcements', kind: 'canvas', op: 'test' }, deps);
    expect(result).toMatchObject({ ok: false, error: 'CANVAS_NOT_CONFIGURED', missing: 'share-denied' });
    expect(deps.fetchImpl).not.toHaveBeenCalled();
  });

  it('reports a rejected resolved credential with its source', async () => {
    writeSharedCanvas();
    const result = await run({ module: 'group-builder', kind: 'canvas', op: 'test' }, makeDeps(vi.fn(async () => statusResponse(401))));
    expect(result).toMatchObject({ ok: false, error: 'CREDENTIAL_VALIDATION_FAILED', source: 'shared', validated: false });
  });

  it('reports none configured', async () => {
    const result = await run({ module: 'group-builder', kind: 'canvas', op: 'test' });
    expect(result).toMatchObject({ ok: false, error: 'CANVAS_NOT_CONFIGURED', missing: 'none' });
  });

  it('reports an incomplete module entry without mixing in the shared one', async () => {
    writeSharedCanvas();
    mkdirSync(join(tmpHome, 'module-credentials'), { recursive: true });
    writeFileSync(credentialFile('group-builder'), JSON.stringify({
      schemaVersion: 1, share: {}, credentials: { canvas: { host: MODULE_HOST } },
    }));
    const deps = makeDeps();
    const result = await run({ module: 'group-builder', kind: 'canvas', op: 'test' }, deps);
    expect(result).toMatchObject({ ok: false, error: 'CANVAS_NOT_CONFIGURED', missing: 'incomplete' });
    expect(deps.fetchImpl).not.toHaveBeenCalled();
  });
});

describe('share / unshare', () => {
  it('share grants a channel module the shared credential', async () => {
    writeSharedCanvas();
    const result = await run({ module: 'announcements', kind: 'canvas', op: 'share' });
    expect(result).toMatchObject({ ok: true, op: 'share', share: true, source: 'shared' });
    expect(resolveModuleCredential('announcements', 'canvas', { shareDefault: false })).toMatchObject({ source: 'shared' });
    // Consent only: the module file holds no credential values.
    const file = readFileSync(credentialFile('announcements'), 'utf-8');
    assertNoSecrets(file);
    expect(file).not.toContain(SHARED_HOST);
  });

  it('unshare denies a built-in module the shared credential', async () => {
    writeSharedCanvas();
    const result = await run({ module: 'group-builder', kind: 'canvas', op: 'unshare' });
    expect(result).toMatchObject({ ok: true, op: 'unshare', share: false, source: null, missing: 'share-denied' });
    expect(resolveModuleCredential('group-builder', 'canvas', { shareDefault: true })).toEqual({ missing: 'share-denied' });
  });

  it('unshare leaves a module-own credential in charge, and says so', async () => {
    setModuleCredential('group-builder', 'canvas', { host: MODULE_HOST, token: CANVAS_TOKEN });
    const result = await run({ module: 'group-builder', kind: 'canvas', op: 'unshare' });
    expect(result).toMatchObject({ ok: true, share: false, source: 'module' });
  });

  it('share and unshare call no service', async () => {
    const deps = makeDeps();
    await run({ module: 'announcements', kind: 'canvas', op: 'share' }, deps);
    await run({ module: 'announcements', kind: 'canvas', op: 'unshare' }, deps);
    expect(deps.fetchImpl).not.toHaveBeenCalled();
  });
});

describe('clear (two-call confirm gate)', () => {
  it('without confirm deletes nothing and warns it will switch to the shared identity', async () => {
    writeSharedCanvas();
    setModuleCredential('group-builder', 'canvas', { host: MODULE_HOST, token: CANVAS_TOKEN });
    const before = readFileSync(credentialFile('group-builder'), 'utf-8');

    const result = await run({ module: 'group-builder', kind: 'canvas', op: 'clear' });

    expect(result).toMatchObject({ ok: false, error: 'CONFIRMATION_REQUIRED', op: 'clear', afterClear: 'shared' });
    expect(String(result.message)).toMatch(/shared Canvas connection/);
    expect(readFileSync(credentialFile('group-builder'), 'utf-8')).toBe(before);
    expect(moduleCredentialPresence('group-builder').canvas).toBe('module');
  });

  it('confirm: false is still only a preview', async () => {
    setModuleCredential('group-builder', 'canvas', { host: MODULE_HOST, token: CANVAS_TOKEN });
    const result = await run({ module: 'group-builder', kind: 'canvas', op: 'clear', confirm: false });
    expect(result).toMatchObject({ error: 'CONFIRMATION_REQUIRED' });
    expect(moduleCredentialPresence('group-builder').canvas).toBe('module');
  });

  it('a "true" string is not a confirmation', async () => {
    setModuleCredential('group-builder', 'canvas', { host: MODULE_HOST, token: CANVAS_TOKEN });
    const result = await run({ module: 'group-builder', kind: 'canvas', op: 'clear', confirm: 'true' });
    expect(result).toMatchObject({ error: 'CONFIRMATION_REQUIRED' });
    expect(moduleCredentialPresence('group-builder').canvas).toBe('module');
  });

  it('preview says the module will stop working when sharing is denied', async () => {
    setModuleCredential('announcements', 'canvas', { host: MODULE_HOST, token: CANVAS_TOKEN });
    const result = await run({ module: 'announcements', kind: 'canvas', op: 'clear' });
    expect(result).toMatchObject({ error: 'CONFIRMATION_REQUIRED', afterClear: 'stops-working' });
    expect(String(result.message)).toMatch(/stop working/);
  });

  it('preview honours an explicit unshare on a built-in module', async () => {
    setModuleCredential('group-builder', 'canvas', { host: MODULE_HOST, token: CANVAS_TOKEN });
    setModuleShare('group-builder', 'canvas', false);
    const result = await run({ module: 'group-builder', kind: 'canvas', op: 'clear' });
    expect(result).toMatchObject({ afterClear: 'stops-working' });
  });

  it('confirm: true removes only that kind and reports the new source', async () => {
    writeSharedCanvas();
    setModuleCredential('roster', 'canvas', { host: MODULE_HOST, token: CANVAS_TOKEN });
    setModuleCredential('roster', 'anthropic', { apiKey: API_KEY });

    const result = await run({ module: 'roster', kind: 'canvas', op: 'clear', confirm: true });

    expect(result).toMatchObject({ ok: true, op: 'clear', removed: true, source: 'shared' });
    expect(moduleCredentialPresence('roster')).toMatchObject({ canvas: 'none', anthropic: 'module' });
  });

  it('nothing stored: reports nothing to clear, no gate needed', async () => {
    const result = await run({ module: 'group-builder', kind: 'canvas', op: 'clear' });
    expect(result).toMatchObject({ ok: true, removed: false });
  });

  it('an unreadable file is previewed, then removed whole on confirm', async () => {
    mkdirSync(join(tmpHome, 'module-credentials'), { recursive: true });
    writeFileSync(credentialFile('group-builder'), `{ "token": "${CANVAS_TOKEN}" `);

    const preview = await run({ module: 'group-builder', kind: 'canvas', op: 'clear' });
    expect(preview).toMatchObject({ error: 'CONFIRMATION_REQUIRED', unreadable: true });
    expect(existsSync(credentialFile('group-builder'))).toBe(true);

    const done = await run({ module: 'group-builder', kind: 'canvas', op: 'clear', confirm: true });
    expect(done).toMatchObject({ ok: true, removed: true });
    expect(existsSync(credentialFile('group-builder'))).toBe(false);
  });
});

describe('refusals', () => {
  it('refuses an undeclared kind with CREDENTIAL_NOT_DECLARED, touching nothing', async () => {
    const deps = makeDeps();
    const result = await run({ module: 'group-builder', kind: 'anthropic', op: 'set', apiKey: API_KEY }, deps);
    expect(result).toMatchObject({ ok: false, error: 'CREDENTIAL_NOT_DECLARED' });
    expect(deps.fetchImpl).not.toHaveBeenCalled();
    expect(moduleCredentialFileExists('group-builder')).toBe(false);
  });

  it('refuses a legacy (v1) module with an explanation', async () => {
    const result = await run({ module: 'legacy', kind: 'canvas', op: 'share' });
    expect(result).toMatchObject({ ok: false, error: 'LEGACY_MODULE' });
    expect(String(result.message)).toMatch(/shared/i);
    expect(moduleCredentialFileExists('legacy')).toBe(false);
  });

  it('refuses an unknown module and lists the valid ids', async () => {
    const result = await run({ module: 'nope', kind: 'canvas', op: 'test' });
    expect(result).toMatchObject({ ok: false, error: 'UNKNOWN_MODULE' });
    expect((result.fix as string[]).join(' ')).toContain('group-builder');
  });

  it('never echoes a module id that is not a known module (a pasted token could be one)', async () => {
    const result = await run({ module: CANVAS_TOKEN.toLowerCase(), kind: 'canvas', op: 'test' });
    expect(result).toMatchObject({ error: 'UNKNOWN_MODULE' });
    expect(JSON.stringify(result)).not.toContain(CANVAS_TOKEN.toLowerCase());
  });

  it('refuses a malformed module id without a lookup', async () => {
    const resolveModule = vi.fn();
    const result = await run({ module: `../${CANVAS_TOKEN}`, kind: 'canvas', op: 'test' }, { ...makeDeps(), resolveModule });
    expect(result).toMatchObject({ error: 'UNKNOWN_MODULE' });
    expect(resolveModule).not.toHaveBeenCalled();
  });

  it('refuses an unknown kind and an unknown op without echoing them', async () => {
    const badKind = await run({ module: 'group-builder', kind: CANVAS_TOKEN, op: 'test' });
    expect(badKind).toMatchObject({ error: 'CREDENTIAL_KIND_INVALID' });
    const badOp = await run({ module: 'group-builder', kind: 'canvas', op: CANVAS_TOKEN });
    expect(badOp).toMatchObject({ error: 'OP_INVALID' });
  });

  it('reports a module that failed to load', async () => {
    const result = await run({ module: 'group-builder', kind: 'canvas', op: 'test' }, {
      ...makeDeps(), resolveModule: async () => ({ status: 'load-failed' }),
    });
    expect(result).toMatchObject({ error: 'MODULE_LOAD_FAILED' });
  });
});

describe('defaultResolveModule', () => {
  it('finds a bundled v2 module and its declarations', async () => {
    const found = await defaultResolveModule('group-builder');
    expect(found).toMatchObject({ status: 'found', origin: 'bundled' });
    if (found.status === 'found') {
      expect(found.module.contractVersion).toBe(2);
      expect(found.module.credentials?.map((d) => d.kind)).toContain('canvas');
    }
  });

  it('reports an id that is neither bundled nor installed as unknown', async () => {
    expect(await defaultResolveModule('not-a-module')).toEqual({ status: 'unknown' });
  });
});

describe('surface registration', () => {
  it('is ct_setup action module_credentials', () => {
    const op = buildRegistry().get('setup_module_credentials');
    expect(op).toMatchObject({ intentTool: 'ct_setup', intentAction: 'module_credentials', exposure: 'intent' });
    expect(op!.description.length).toBeLessThanOrEqual(200);
    const schema = op!.inputSchema as { required: string[]; properties: Record<string, unknown> };
    expect(schema.required).toEqual(['module', 'kind', 'op']);
    for (const p of ['host', 'token', 'apiKey', 'model', 'domain', 'clientId', 'clientSecret', 'confirm']) {
      expect(schema.properties).toHaveProperty(p);
    }
  });
});
