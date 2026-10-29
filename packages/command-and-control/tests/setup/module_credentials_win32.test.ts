import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { win32 } from 'node:path';

// CT201-13 on Windows: module credential files are read from the secrets root
// (local, non-roaming), and legacy modules get their label. win32 is stubbed
// like paths_homes.test.ts (virtual filesystem keyed by Windows paths).

class VirtualFs extends Map<string, string> {
  override set(k: string, v: string): this { return super.set(k.replace(/\//g, '\\'), v); }
}
const virtualFs = new VirtualFs();

vi.mock('node:fs', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs')>();
  const key = (p: unknown): string => String(p).replace(/\//g, '\\');
  return {
    ...real,
    existsSync: (p: unknown) => virtualFs.has(key(p)) || real.existsSync(key(p)),
    readFileSync: ((p: unknown, ...rest: unknown[]) =>
      virtualFs.has(key(p))
        ? virtualFs.get(key(p))
        : (real.readFileSync as (...a: unknown[]) => unknown)(p, ...rest)) as typeof real.readFileSync,
    statSync: ((p: unknown, ...rest: unknown[]) =>
      virtualFs.has(key(p))
        ? ({ mode: 0o100644, isDirectory: () => false, isFile: () => true } as unknown)
        : (real.statSync as (...a: unknown[]) => unknown)(p, ...rest)) as typeof real.statSync,
  };
});

const { readSetupState } = await import('../../src/setup/read_state.js');
const { runDoctor } = await import('../../src/setup/doctor.js');

const PROFILE = 'C:\\Users\\prof';
const LOCAL = `${PROFILE}\\AppData\\Local`;
const ROAMING = `${PROFILE}\\AppData\\Roaming`;
const CC_CONFIG = win32.join(ROAMING, 'CanvasToolchain', 'CommandAndControl');
const CC_SECRETS = win32.join(LOCAL, 'CanvasToolchain', 'CommandAndControl', 'secrets');

const ENV_KEYS = [
  'CC_HOME', 'CANVAS_DESIGN_HOME', 'CURRICULUM_INTELLIGENCE_HOME', 'APPDATA', 'LOCALAPPDATA',
  'HOME', 'USERPROFILE', 'ANTHROPIC_API_KEY',
] as const;
const saved: Record<string, string | undefined> = {};
const realPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!;

beforeEach(() => {
  virtualFs.clear();
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  for (const k of ENV_KEYS) delete process.env[k];
  Object.defineProperty(process, 'platform', { value: 'win32' });
  process.env.HOME = PROFILE;
  process.env.USERPROFILE = PROFILE;
  process.env.APPDATA = ROAMING;
  process.env.LOCALAPPDATA = LOCAL;
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('network call in test'))));
});

afterEach(() => {
  Object.defineProperty(process, 'platform', realPlatform);
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.unstubAllGlobals();
});

describe('win32: module credentials', () => {
  it('reads a module credential from the secrets root and keeps the secret out of the report', async () => {
    virtualFs.set(win32.join(CC_SECRETS, 'module-credentials', 'roster.json'), JSON.stringify({
      schemaVersion: 1, share: {},
      credentials: { canvas: { host: 'win-school.instructure.com', token: 'win-planted-token' } },
    }));
    // A copy in the CONFIG root is the wrong root and must be ignored.
    virtualFs.set(win32.join(CC_CONFIG, 'module-credentials', 'ghost.json'), '{}');
    virtualFs.set(win32.join(CC_SECRETS, 'roster-vault'), 'x');

    const state = await readSetupState({
      hosts: false,
      loadedModules: async () => [
        { id: 'roster', origin: 'bundled', contractVersion: 2, credentials: [{ kind: 'canvas', required: true }] },
        { id: 'legacy-one', origin: 'channel' },
      ],
    });
    const report = await runDoctor({ state });
    const check = report.checks.find((c) => c.id === 'modules.credentials')!;

    expect(state.modules.credentials.rows).toEqual([
      { moduleId: 'roster', origin: 'bundled', kind: 'canvas', required: true, status: 'module' },
    ]);
    expect(state.modules.credentials.files.map((f) => f.moduleId)).toEqual(['roster']);
    expect(state.modules.credentials.stores.rosterVault).toBe(true);
    expect(check.detail).toContain('legacy-one: legacy (shared files, Windows may need a module update)');
    // POSIX permission bits are synthetic on Windows: never a permissions warning.
    expect(report.checks.find((c) => c.id === 'security.file_permissions')!.status).toBe('ok');
    const dumped = JSON.stringify({ state, report });
    expect(dumped).not.toContain('win-planted-token');
    expect(dumped).not.toContain('win-school.instructure.com');
  });
});
