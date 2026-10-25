import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  MODULE_CREDENTIALS_DIRNAME,
  clearModuleCredential,
  moduleCredentialFileExists,
  moduleCredentialPresence,
  resolveModuleCredential,
  setModuleCredential,
  setModuleShare,
} from '../src/module-credentials.js';
import * as barrel from '../src/index.js';

// CT201-02 (spec 2026-10-18-paths-and-module-credentials §4.2, §6, Q1a, Q2).
// Every test runs against temp homes via CC_HOME — never the real profile.

const SHARED_TOKEN = 'shared-canvas-token-SECRET-111';
const MOD_A_TOKEN = 'module-a-token-SECRET-222';
const MOD_B_TOKEN = 'module-b-token-SECRET-333';
const SHARED_KEY = 'sk-ant-shared-SECRET-444';
const MOD_KEY = 'sk-ant-module-SECRET-555';
const PANOPTO_SECRET = 'panopto-client-SECRET-666';
const ALL_SECRETS = [SHARED_TOKEN, MOD_A_TOKEN, MOD_B_TOKEN, SHARED_KEY, MOD_KEY, PANOPTO_SECRET];

const POLICY_SHARE = { shareDefault: true };
const POLICY_DENY = { shareDefault: false };
const posixOnly = it.skipIf(process.platform === 'win32');

let home: string;
let designHome: string;
const saved: Record<string, string | undefined> = {};

const credDir = () => join(home, MODULE_CREDENTIALS_DIRNAME);
const credFile = (id: string) => join(credDir(), `${id}.json`);
const readJson = (p: string) => JSON.parse(readFileSync(p, 'utf-8')) as Record<string, any>;

function seedSharedCanvas(host = 'shared.instructure.com', token = SHARED_TOKEN): void {
  writeFileSync(join(home, 'canvas-config.json'), JSON.stringify({ host, token }), 'utf-8');
}

function seedSharedAnthropic(value: unknown = { apiKey: SHARED_KEY, model: 'claude-x' }): void {
  writeFileSync(join(home, 'anthropic-config.json'), JSON.stringify(value), 'utf-8');
}

function seedModuleFile(id: string, value: unknown): void {
  mkdirSync(credDir(), { recursive: true });
  writeFileSync(credFile(id), typeof value === 'string' ? value : JSON.stringify(value), 'utf-8');
}

/** Run fn, returning its result or the thrown error's message. */
function capture(fn: () => unknown): string {
  try {
    return JSON.stringify(fn()) ?? '';
  } catch (err) {
    return err instanceof Error ? `${err.name}: ${err.message}\n${err.stack ?? ''}` : String(err);
  }
}

function expectNoSecrets(text: string): void {
  for (const s of ALL_SECRETS) expect(text).not.toContain(s);
}

beforeEach(() => {
  for (const k of ['CC_HOME', 'CANVAS_DESIGN_HOME']) saved[k] = process.env[k];
  home = mkdtempSync(join(tmpdir(), 'module-creds-cc-'));
  designHome = mkdtempSync(join(tmpdir(), 'module-creds-cds-'));
  process.env.CC_HOME = home;
  process.env.CANVAS_DESIGN_HOME = designHome;
});

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  rmSync(home, { recursive: true, force: true });
  rmSync(designHome, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('resolution order', () => {
  it('two modules with different Canvas tokens resolve independently at once', () => {
    seedSharedCanvas();
    setModuleCredential('group-builder', 'canvas', { host: 'a.instructure.com', token: MOD_A_TOKEN });
    setModuleCredential('roster', 'canvas', { host: 'b.instructure.com', token: MOD_B_TOKEN });

    expect(resolveModuleCredential('group-builder', 'canvas', POLICY_SHARE)).toEqual({
      value: { host: 'a.instructure.com', token: MOD_A_TOKEN },
      source: 'module',
    });
    expect(resolveModuleCredential('roster', 'canvas', POLICY_SHARE)).toEqual({
      value: { host: 'b.instructure.com', token: MOD_B_TOKEN },
      source: 'module',
    });
  });

  it('a module with no entry falls back to the shared credential with source "shared"', () => {
    seedSharedCanvas();
    expect(resolveModuleCredential('group-builder', 'canvas', POLICY_SHARE)).toEqual({
      value: { host: 'shared.instructure.com', token: SHARED_TOKEN },
      source: 'shared',
    });
  });

  it('nothing anywhere is missing "none"', () => {
    expect(resolveModuleCredential('group-builder', 'canvas', POLICY_SHARE)).toEqual({ missing: 'none' });
  });

  it('an unusable shared file (host only) is missing "none", never a half credential', () => {
    writeFileSync(join(home, 'canvas-config.json'), JSON.stringify({ host: 'x.instructure.com' }));
    expect(resolveModuleCredential('m', 'canvas', POLICY_SHARE)).toEqual({ missing: 'none' });
  });
});

describe('sharing consent', () => {
  it('shareDefault false (channel module) refuses the shared fallback', () => {
    seedSharedCanvas();
    expect(resolveModuleCredential('announcements', 'canvas', POLICY_DENY)).toEqual({ missing: 'share-denied' });
  });

  it('an explicit share:true in the file overrides shareDefault false', () => {
    seedSharedCanvas();
    setModuleShare('announcements', 'canvas', true);
    expect(resolveModuleCredential('announcements', 'canvas', POLICY_DENY)).toMatchObject({ source: 'shared' });
  });

  it('an explicit share:false in the file overrides shareDefault true', () => {
    seedSharedCanvas();
    setModuleShare('group-builder', 'canvas', false);
    expect(resolveModuleCredential('group-builder', 'canvas', POLICY_SHARE)).toEqual({ missing: 'share-denied' });
  });

  it('share flags are per kind', () => {
    seedSharedCanvas();
    seedSharedAnthropic();
    setModuleShare('roster', 'canvas', true);
    expect(resolveModuleCredential('roster', 'canvas', POLICY_DENY)).toMatchObject({ source: 'shared' });
    expect(resolveModuleCredential('roster', 'anthropic', POLICY_DENY)).toEqual({ missing: 'share-denied' });
  });

  it("a module's own credential is used even when sharing is denied", () => {
    seedSharedCanvas();
    setModuleCredential('announcements', 'canvas', { host: 'a.instructure.com', token: MOD_A_TOKEN });
    expect(resolveModuleCredential('announcements', 'canvas', POLICY_DENY)).toMatchObject({ source: 'module' });
  });

  it('setModuleShare preserves stored credentials', () => {
    setModuleCredential('roster', 'canvas', { host: 'a.instructure.com', token: MOD_A_TOKEN });
    setModuleShare('roster', 'anthropic', true);
    const file = readJson(credFile('roster'));
    expect(file.credentials.canvas.token).toBe(MOD_A_TOKEN);
    expect(file.share).toEqual({ anthropic: true });
    expect(file.schemaVersion).toBe(1);
  });
});

describe('no credential mixing', () => {
  it('a per-module host with no token stops at "incomplete" and never borrows the shared token', () => {
    seedSharedCanvas();
    seedModuleFile('roster', { schemaVersion: 1, credentials: { canvas: { host: 'mine.instructure.com' } } });
    const result = resolveModuleCredential('roster', 'canvas', POLICY_SHARE);
    expect(result).toEqual({ missing: 'incomplete' });
    expectNoSecrets(JSON.stringify(result));
  });

  it('a per-module token with no host stops at "incomplete" and never borrows the shared host', () => {
    seedSharedCanvas();
    seedModuleFile('roster', { schemaVersion: 1, credentials: { canvas: { token: MOD_A_TOKEN } } });
    const result = resolveModuleCredential('roster', 'canvas', POLICY_SHARE);
    expect(result).toEqual({ missing: 'incomplete' });
    expectNoSecrets(JSON.stringify(result));
  });

  it('a non-object entry is incomplete', () => {
    seedSharedCanvas();
    seedModuleFile('roster', { schemaVersion: 1, credentials: { canvas: 'oops' } });
    expect(resolveModuleCredential('roster', 'canvas', POLICY_SHARE)).toEqual({ missing: 'incomplete' });
  });

  it('a corrupt module file refuses (incomplete) rather than falling back to the shared identity', () => {
    seedSharedCanvas();
    seedModuleFile('roster', `{"credentials":{"canvas":{"token":"${MOD_A_TOKEN}"`);
    const result = resolveModuleCredential('roster', 'canvas', POLICY_SHARE);
    expect(result).toEqual({ missing: 'incomplete' });
    expectNoSecrets(JSON.stringify(result));
  });

  it('setModuleCredential refuses an incomplete value without echoing it', () => {
    const msg = capture(() => setModuleCredential('roster', 'canvas', { host: '', token: MOD_A_TOKEN }));
    expect(msg).toMatch(/MODULE_CREDENTIAL_INCOMPLETE/);
    expectNoSecrets(msg);
    expect(existsSync(credFile('roster'))).toBe(false);
  });
});

describe('anthropic and panopto kinds', () => {
  it('anthropic: module entry wins, shared falls back, model optional', () => {
    seedSharedAnthropic({ apiKey: SHARED_KEY });
    expect(resolveModuleCredential('oral-assessment', 'anthropic', POLICY_SHARE)).toEqual({
      value: { apiKey: SHARED_KEY },
      source: 'shared',
    });
    setModuleCredential('oral-assessment', 'anthropic', { apiKey: MOD_KEY, model: 'claude-y' });
    expect(resolveModuleCredential('oral-assessment', 'anthropic', POLICY_SHARE)).toEqual({
      value: { apiKey: MOD_KEY, model: 'claude-y' },
      source: 'module',
    });
  });

  it('anthropic: a corrupt shared file is "none" and leaks nothing', () => {
    writeFileSync(join(home, 'anthropic-config.json'), `{"apiKey":"${SHARED_KEY}"`);
    const out = capture(() => resolveModuleCredential('oral-assessment', 'anthropic', POLICY_SHARE));
    expect(JSON.parse(out)).toEqual({ missing: 'none' });
    expectNoSecrets(out);
  });

  it('panopto: shared panopto-config.json resolves with the full PanoptoCredential shape', () => {
    writeFileSync(
      join(home, 'panopto-config.json'),
      JSON.stringify({ domain: 'x.hosted.panopto.com', clientId: 'cid', clientSecret: PANOPTO_SECRET }),
    );
    expect(resolveModuleCredential('video', 'panopto', POLICY_SHARE)).toEqual({
      value: {
        domain: 'x.hosted.panopto.com', clientId: 'cid', clientSecret: PANOPTO_SECRET,
        iframeWhitelisted: null, configuredAt: '', lastValidatedAt: '',
      },
      source: 'shared',
    });
  });

  it('panopto: a module entry missing clientSecret is incomplete', () => {
    seedModuleFile('video', { schemaVersion: 1, credentials: { panopto: { domain: 'd', clientId: 'c' } } });
    expect(resolveModuleCredential('video', 'panopto', POLICY_SHARE)).toEqual({ missing: 'incomplete' });
  });
});

describe('Canvas host normalization', () => {
  it('normalizes the host on write through the canvas-host helper', () => {
    setModuleCredential('roster', 'canvas', { host: 'https://School.Instructure.com/courses/1', token: MOD_A_TOKEN });
    expect(readJson(credFile('roster')).credentials.canvas.host).toBe('school.instructure.com');
  });

  it('turns a bare subdomain into <name>.instructure.com', () => {
    setModuleCredential('roster', 'canvas', { host: 'school', token: MOD_A_TOKEN });
    expect(resolveModuleCredential('roster', 'canvas', POLICY_SHARE)).toMatchObject({
      value: { host: 'school.instructure.com' },
    });
  });

  it('heals a hand-edited host on read', () => {
    seedModuleFile('roster', {
      schemaVersion: 1, credentials: { canvas: { host: 'HTTPS://Mine.instructure.com/', token: MOD_A_TOKEN } },
    });
    expect(resolveModuleCredential('roster', 'canvas', POLICY_SHARE)).toEqual({
      value: { host: 'mine.instructure.com', token: MOD_A_TOKEN },
      source: 'module',
    });
  });

  it('normalizes the shared host (read through canvas-store)', () => {
    seedSharedCanvas('https://Shared.Instructure.com/');
    expect(resolveModuleCredential('m', 'canvas', POLICY_SHARE)).toMatchObject({
      value: { host: 'shared.instructure.com' },
    });
  });
});

describe('module id validation', () => {
  const bad = ['', '..', '../evil', 'a/b', 'a\\b', '.hidden', '-lead', 'UPPER', 'a.b', 'a b', `a${'b'.repeat(64)}`, '/abs'];

  for (const id of bad) {
    it(`refuses ${JSON.stringify(id.length > 20 ? `${id.slice(0, 20)}…` : id)} on every entry point`, () => {
      for (const fn of [
        () => resolveModuleCredential(id, 'canvas', POLICY_SHARE),
        () => setModuleCredential(id, 'canvas', { host: 'a.instructure.com', token: MOD_A_TOKEN }),
        () => clearModuleCredential(id),
        () => setModuleShare(id, 'canvas', true),
        () => moduleCredentialPresence(id),
        () => moduleCredentialFileExists(id),
      ]) {
        expect(fn).toThrow(/MODULE_ID_INVALID/);
      }
      expect(existsSync(credDir()) ? readdirSync(credDir()) : []).toEqual([]);
    });
  }

  it('refuses a non-string id', () => {
    expect(() => resolveModuleCredential(42 as unknown as string, 'canvas', POLICY_SHARE)).toThrow(/MODULE_ID_INVALID/);
  });

  it('does not echo the rejected id (it could be a pasted secret)', () => {
    const msg = capture(() => setModuleCredential(`${MOD_A_TOKEN}/x`, 'canvas', { host: 'a', token: 't' }));
    expect(msg).toMatch(/MODULE_ID_INVALID/);
    expectNoSecrets(msg);
  });

  it('accepts a 64-character id', () => {
    const id = `a${'b'.repeat(63)}`;
    setModuleCredential(id, 'canvas', { host: 'a.instructure.com', token: MOD_A_TOKEN });
    expect(resolveModuleCredential(id, 'canvas', POLICY_SHARE)).toMatchObject({ source: 'module' });
  });

  it('refuses an unknown kind', () => {
    expect(() => resolveModuleCredential('m', 'github' as never, POLICY_SHARE)).toThrow(/CREDENTIAL_KIND_INVALID/);
    expect(() => setModuleShare('m', 'github' as never, true)).toThrow(/CREDENTIAL_KIND_INVALID/);
  });
});

describe('file layout, permissions and atomic writes', () => {
  it('stores files at <secrets>/module-credentials/<id>.json with schemaVersion 1', () => {
    setModuleCredential('roster', 'canvas', { host: 'a.instructure.com', token: MOD_A_TOKEN });
    expect(readJson(credFile('roster'))).toEqual({
      schemaVersion: 1,
      share: {},
      credentials: { canvas: { host: 'a.instructure.com', token: MOD_A_TOKEN } },
    });
  });

  posixOnly('creates the directory 0o700 and the file 0o600', () => {
    setModuleCredential('roster', 'canvas', { host: 'a.instructure.com', token: MOD_A_TOKEN });
    expect(statSync(credDir()).mode & 0o777).toBe(0o700);
    expect(statSync(credFile('roster')).mode & 0o777).toBe(0o600);
  });

  posixOnly('tightens a pre-existing loose directory and keeps 0o600 after every kind of write', () => {
    mkdirSync(credDir(), { recursive: true, mode: 0o755 });
    setModuleShare('roster', 'canvas', true);
    expect(statSync(credDir()).mode & 0o777).toBe(0o700);
    expect(statSync(credFile('roster')).mode & 0o777).toBe(0o600);
    setModuleCredential('roster', 'canvas', { host: 'a.instructure.com', token: MOD_A_TOKEN });
    clearModuleCredential('roster', 'anthropic');
    expect(statSync(credFile('roster')).mode & 0o777).toBe(0o600);
  });

  posixOnly('writes replace the file by rename (new inode), never in place', () => {
    setModuleCredential('roster', 'canvas', { host: 'a.instructure.com', token: MOD_A_TOKEN });
    const before = statSync(credFile('roster')).ino;
    setModuleCredential('roster', 'canvas', { host: 'a.instructure.com', token: MOD_B_TOKEN });
    expect(statSync(credFile('roster')).ino).not.toBe(before);
  });

  it('leaves no temp files behind, and a stale temp from a crash does not matter', () => {
    mkdirSync(credDir(), { recursive: true });
    writeFileSync(join(credDir(), 'roster.json.999-dead.tmp'), 'partial');
    setModuleCredential('roster', 'canvas', { host: 'a.instructure.com', token: MOD_A_TOKEN });
    setModuleCredential('roster', 'anthropic', { apiKey: MOD_KEY });
    const names = readdirSync(credDir()).sort();
    expect(names).toEqual(['roster.json', 'roster.json.999-dead.tmp']);
    expect(resolveModuleCredential('roster', 'canvas', POLICY_SHARE)).toMatchObject({ source: 'module' });
  });

  it('refuses to overwrite a corrupt module file, naming no contents', () => {
    seedModuleFile('roster', `{"credentials":{"canvas":{"token":"${MOD_A_TOKEN}"`);
    for (const fn of [
      () => setModuleCredential('roster', 'anthropic', { apiKey: MOD_KEY }),
      () => setModuleShare('roster', 'canvas', true),
      () => clearModuleCredential('roster', 'canvas'),
    ]) {
      const msg = capture(fn);
      expect(msg).toMatch(/MODULE_CREDENTIALS_CORRUPT/);
      expectNoSecrets(msg);
    }
    expect(readFileSync(credFile('roster'), 'utf-8')).toContain(MOD_A_TOKEN);
  });

  it('does not create the module-credentials folder on read', () => {
    resolveModuleCredential('roster', 'canvas', POLICY_SHARE);
    moduleCredentialPresence('roster');
    expect(existsSync(credDir())).toBe(false);
  });
});

describe('clear and presence', () => {
  it('clear(kind) removes one entry and keeps the rest; clear() deletes the file', () => {
    setModuleCredential('roster', 'canvas', { host: 'a.instructure.com', token: MOD_A_TOKEN });
    setModuleCredential('roster', 'anthropic', { apiKey: MOD_KEY });
    setModuleShare('roster', 'canvas', false);

    expect(clearModuleCredential('roster', 'canvas')).toEqual({ removed: true });
    expect(clearModuleCredential('roster', 'canvas')).toEqual({ removed: false });
    const file = readJson(credFile('roster'));
    expect(file.credentials).toEqual({ anthropic: { apiKey: MOD_KEY } });
    expect(file.share).toEqual({ canvas: false });

    expect(moduleCredentialFileExists('roster')).toBe(true);
    expect(clearModuleCredential('roster')).toEqual({ removed: true });
    expect(existsSync(credFile('roster'))).toBe(false);
    expect(moduleCredentialFileExists('roster')).toBe(false);
    expect(clearModuleCredential('roster')).toEqual({ removed: false });
  });

  it('clear() deletes even a corrupt file (the escape hatch)', () => {
    seedModuleFile('roster', '{not json');
    expect(clearModuleCredential('roster')).toEqual({ removed: true });
    expect(existsSync(credFile('roster'))).toBe(false);
  });

  it('presence reports module / none / incomplete and never values', () => {
    seedSharedCanvas();
    seedModuleFile('roster', {
      schemaVersion: 1,
      credentials: { canvas: { host: 'a.instructure.com', token: MOD_A_TOKEN }, anthropic: { model: 'x' } },
    });
    const presence = moduleCredentialPresence('roster');
    expect(presence).toEqual({ canvas: 'module', anthropic: 'incomplete', panopto: 'none' });
    expectNoSecrets(JSON.stringify(presence));
  });

  it('presence of a module with no file is all none', () => {
    expect(moduleCredentialPresence('roster')).toEqual({ canvas: 'none', anthropic: 'none', panopto: 'none' });
  });

  it('presence of a corrupt file is all incomplete and leaks nothing', () => {
    seedModuleFile('roster', `{"credentials":{"canvas":{"token":"${MOD_A_TOKEN}"`);
    const out = capture(() => moduleCredentialPresence('roster'));
    expect(JSON.parse(out)).toEqual({ canvas: 'incomplete', anthropic: 'incomplete', panopto: 'incomplete' });
    expectNoSecrets(out);
  });
});

describe('secret hygiene across every surface', () => {
  it('no planted secret appears in any status, error or console output', () => {
    const logs: string[] = [];
    for (const m of ['log', 'error', 'warn', 'info', 'debug'] as const) {
      vi.spyOn(console, m).mockImplementation((...args: unknown[]) => { logs.push(args.map(String).join(' ')); });
    }
    seedSharedCanvas();
    seedSharedAnthropic();
    setModuleCredential('roster', 'canvas', { host: 'a.instructure.com', token: MOD_A_TOKEN });
    seedModuleFile('broken', `{"credentials":{"canvas":{"token":"${MOD_B_TOKEN}"`);

    const outputs = [
      capture(() => resolveModuleCredential('broken', 'canvas', POLICY_SHARE)),
      capture(() => resolveModuleCredential('announcements', 'canvas', POLICY_DENY)),
      capture(() => moduleCredentialPresence('roster')),
      capture(() => moduleCredentialPresence('broken')),
      capture(() => clearModuleCredential('roster', 'panopto')),
      capture(() => setModuleShare('broken', 'canvas', true)),
      capture(() => setModuleCredential('broken', 'anthropic', { apiKey: MOD_KEY })),
      capture(() => setModuleCredential('roster', 'anthropic', { apiKey: '' , model: MOD_KEY })),
      capture(() => setModuleCredential('roster', 'panopto', { domain: 'd', clientId: 'c', clientSecret: '' } as never)),
      capture(() => setModuleCredential('../x', 'canvas', { host: 'a', token: MOD_A_TOKEN })),
      capture(() => resolveModuleCredential('m', 'canvas', POLICY_SHARE, { env: { CC_HOME: join(home, 'other') } })),
      capture(() => moduleCredentialFileExists('roster')),
    ];
    expectNoSecrets(outputs.join('\n'));
    expectNoSecrets(logs.join('\n'));
    expect(logs).toEqual([]);
  });
});

describe('home resolution', () => {
  it('CC_HOME is one folder for everything: module files and shared files live under it', () => {
    seedSharedCanvas();
    setModuleCredential('roster', 'anthropic', { apiKey: MOD_KEY });
    expect(existsSync(join(home, 'module-credentials', 'roster.json'))).toBe(true);
    expect(resolveModuleCredential('roster', 'canvas', POLICY_SHARE)).toMatchObject({ source: 'shared' });
  });

  it('switching CC_HOME switches every file at once', () => {
    setModuleCredential('roster', 'canvas', { host: 'a.instructure.com', token: MOD_A_TOKEN });
    const other = mkdtempSync(join(tmpdir(), 'module-creds-other-'));
    try {
      process.env.CC_HOME = other;
      expect(resolveModuleCredential('roster', 'canvas', POLICY_SHARE)).toEqual({ missing: 'none' });
      expect(moduleCredentialFileExists('roster')).toBe(false);
    } finally {
      process.env.CC_HOME = home;
      rmSync(other, { recursive: true, force: true });
    }
    expect(resolveModuleCredential('roster', 'canvas', POLICY_SHARE)).toMatchObject({ source: 'module' });
  });

  it('a blank CC_HOME is unset (falls through to the platform default, not the cwd)', async () => {
    const { ccSecretsHome } = await import('../src/app-paths.js');
    const fakeHome = mkdtempSync(join(tmpdir(), 'module-creds-home-'));
    try {
      const o = { env: { CC_HOME: '   ' }, homedir: fakeHome, platform: 'linux' as const };
      setModuleShare('roster', 'anthropic', true, o);
      expect(existsSync(join(ccSecretsHome(o), MODULE_CREDENTIALS_DIRNAME, 'roster.json'))).toBe(true);
      expect(ccSecretsHome(o)).toBe(join(fakeHome, '.command-and-control'));
    } finally {
      rmSync(fakeHome, { recursive: true, force: true });
    }
  });

  it('PathEnv redirects module files and the anthropic/panopto shared files', () => {
    const other = mkdtempSync(join(tmpdir(), 'module-creds-pathenv-'));
    try {
      const o = { env: { CC_HOME: other } };
      writeFileSync(join(other, 'anthropic-config.json'), JSON.stringify({ apiKey: SHARED_KEY }));
      expect(resolveModuleCredential('roster', 'anthropic', POLICY_SHARE, o)).toMatchObject({ source: 'shared' });
      setModuleCredential('roster', 'anthropic', { apiKey: MOD_KEY }, o);
      expect(existsSync(join(other, MODULE_CREDENTIALS_DIRNAME, 'roster.json'))).toBe(true);
      expect(existsSync(credFile('roster'))).toBe(false);
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });

  it('refuses a PathEnv whose home differs from the canvas-store home for a shared Canvas read', () => {
    seedSharedCanvas();
    const o = { env: { CC_HOME: join(home, 'elsewhere') } };
    expect(() => resolveModuleCredential('roster', 'canvas', POLICY_SHARE, o)).toThrow(/MODULE_CREDENTIALS_HOME_MISMATCH/);
  });

  it('a PathEnv that matches the canvas-store home reads the shared Canvas credential', () => {
    seedSharedCanvas();
    expect(resolveModuleCredential('roster', 'canvas', POLICY_SHARE, { env: { CC_HOME: home } })).toMatchObject({
      source: 'shared',
    });
  });
});

describe('barrel exports', () => {
  it('re-exports the public API from the package index', () => {
    expect(barrel.resolveModuleCredential).toBe(resolveModuleCredential);
    expect(barrel.setModuleCredential).toBe(setModuleCredential);
    expect(barrel.clearModuleCredential).toBe(clearModuleCredential);
    expect(barrel.setModuleShare).toBe(setModuleShare);
    expect(barrel.moduleCredentialPresence).toBe(moduleCredentialPresence);
    expect(barrel.moduleCredentialFileExists).toBe(moduleCredentialFileExists);
    expect(barrel.MODULE_CREDENTIALS_DIRNAME).toBe('module-credentials');
  });
});
