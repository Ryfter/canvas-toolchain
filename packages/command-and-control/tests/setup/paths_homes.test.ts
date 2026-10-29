import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { win32 } from 'node:path';

// CT200-08: the doctor reports the three app homes (#200) and reads
// credentials from the root they now live in. win32 is stubbed (process.platform
// plus a virtual filesystem keyed by Windows paths), because a real Windows
// path cannot be created on the machines these tests run on.

// Keys use Windows separators. The code under test joins with the host's `join`
// (posix here), so the mock normalizes every lookup to backslashes.
class VirtualFs extends Map<string, string> {
  override set(k: string, v: string): this { return super.set(k.replace(/\//g, '\\'), v); }
}
const virtualFs = new VirtualFs();
const norm = (p: string): string => p.replace(/\//g, '\\');

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
const CDS_SECRETS = win32.join(LOCAL, 'CanvasToolchain', 'CanvasDesignStudio', 'secrets');

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

function check(report: Awaited<ReturnType<typeof runDoctor>>, id: string) {
  const found = report.checks.find((c) => c.id === id);
  if (!found) throw new Error(`no check ${id}`);
  return found;
}

describe('win32: credentials live in the secrets root', () => {
  it('reports Canvas and Anthropic connected when the files exist ONLY in the secrets root', async () => {
    virtualFs.set(win32.join(CC_SECRETS, 'canvas-config.json'),
      JSON.stringify({ host: 'example.instructure.com', token: 'tok-secret-win' }));
    virtualFs.set(win32.join(CC_SECRETS, 'anthropic-config.json'),
      JSON.stringify({ apiKey: 'sk-ant-secret-win', model: 'claude' }));
    virtualFs.set(win32.join(CDS_SECRETS, 'institution.json'),
      JSON.stringify({ institution: 'X', canvasUrl: 'https://example.instructure.com', apiToken: 'tok-secret-win' }));

    const state = await readSetupState({ hosts: false });

    expect(state.platform).toBe('win32');
    expect(norm(state.files['canvas-config'].path)).toBe(win32.join(CC_SECRETS, 'canvas-config.json'));
    expect(state.files['canvas-config'].present).toBe(true);
    expect(norm(state.files['anthropic-config'].path)).toBe(win32.join(CC_SECRETS, 'anthropic-config.json'));
    expect(state.canvas.configured).toBe(true);
    expect(state.canvasConfig.hasApiToken).toBe(true);
    expect(state.llm.anthropic.configured).toBe(true);
    expect(state.secretBearingFiles).toEqual(expect.arrayContaining(['canvas-config', 'anthropic-config']));

    const report = await runDoctor({ state });
    expect(check(report, 'canvas.credentials').status).toBe('ok');
    expect(report.readyJourneys.canvasConnected).toBe(true);
  });

  it('keeps settings-class files in the config root', async () => {
    const state = await readSetupState({ hosts: false });
    expect(norm(state.files['llm-provider'].path)).toBe(win32.join(CC_CONFIG, 'llm-provider.json'));
    expect(norm(state.files['ollama-config'].path)).toBe(win32.join(CC_CONFIG, 'ollama-config.json'));
    expect(norm(state.files['cc-config'].path)).toBe(win32.join(CC_SECRETS, 'config.json'));
  });

  it('does not find credentials left only in the config root', async () => {
    virtualFs.set(win32.join(CC_CONFIG, 'canvas-config.json'),
      JSON.stringify({ host: 'example.instructure.com', token: 'tok-secret-win' }));
    const state = await readSetupState({ hosts: false });
    expect(state.canvas.configured).toBe(false);
  });
});

describe('paths.homes', () => {
  it('reports three apps with default source, nothing-to-do for a missing journal, no legacy', async () => {
    const state = await readSetupState({ hosts: false });
    expect(state.appHomes.map((h) => h.app)).toEqual(['cc', 'cds', 'ci']);
    for (const h of state.appHomes) {
      expect(h.source).toBe('default');
      expect(h.migration).toBe('nothing-to-do');
      expect(h.legacyPresent).toBe(false);
      expect(h.outsideProfile).toBe(false);
    }
    const c = check(await runDoctor({ state }), 'paths.homes');
    expect(c.status).toBe('ok');
    expect(c.detail?.join('\n')).toContain('Command & Control');
    expect(c.detail?.join('\n')).toContain('Curriculum Intelligence');
  });

  it('reads the migration journal outcome and flags a partial one', async () => {
    virtualFs.set(win32.join(CC_CONFIG, 'path-migration.json'), JSON.stringify({ outcome: 'partial' }));
    const state = await readSetupState({ hosts: false });
    expect(state.appHomes[0].migration).toBe('partial');
    expect(check(await runDoctor({ state }), 'paths.homes').status).toBe('warn');
  });

  it('treats an unparseable journal as unreadable, not an error', async () => {
    virtualFs.set(win32.join(CC_CONFIG, 'path-migration.json'), '{nope');
    const state = await readSetupState({ hosts: false });
    expect(state.appHomes[0].migration).toBe('unreadable');
  });

  it('reports the env override as the source and warns on a UNC share', async () => {
    process.env.CC_HOME = '\\\\fileserver\\shared\\cc';
    const state = await readSetupState({ hosts: false });
    const cc = state.appHomes[0];
    expect(cc.source).toBe('env');
    expect(cc.outsideProfile).toBe(true);
    expect(state.appHomes[1].outsideProfile).toBe(false);
    const c = check(await runDoctor({ state }), 'paths.homes');
    expect(c.status).toBe('warn');
    expect(c.summary).toContain('Command & Control');
  });

  it('warns for a different drive, not for a folder inside the profile', async () => {
    process.env.CC_HOME = 'D:\\work\\cc';
    process.env.CANVAS_DESIGN_HOME = `${PROFILE}\\mine\\cds`;
    const state = await readSetupState({ hosts: false });
    expect(state.appHomes[0].outsideProfile).toBe(true);
    expect(state.appHomes[1].outsideProfile).toBe(false);
  });

  it('flags a legacy folder that is still present beside the new home', async () => {
    virtualFs.set(win32.join(PROFILE, '.curriculum-intelligence'), '');
    // ci has no config home yet, so the resolver keeps the legacy folder active
    // and it is not "beside" anything; give it a new home too.
    virtualFs.set(win32.join(LOCAL, 'CanvasToolchain', 'CurriculumIntelligence'), '');
    virtualFs.set(win32.join(ROAMING, 'CanvasToolchain', 'CurriculumIntelligence'), '');
    const state = await readSetupState({ hosts: false });
    expect(state.appHomes[2].legacyPresent).toBe(true);
  });

  it('never puts a secret value in the serialized report', async () => {
    virtualFs.set(win32.join(CC_SECRETS, 'canvas-config.json'),
      JSON.stringify({ host: 'example.instructure.com', token: 'tok-secret-win' }));
    virtualFs.set(win32.join(CC_SECRETS, 'anthropic-config.json'),
      JSON.stringify({ apiKey: 'sk-ant-secret-win' }));
    process.env.CC_HOME = '\\\\fileserver\\shared\\cc';
    const state = await readSetupState({ hosts: false });
    const text = JSON.stringify({ state, report: await runDoctor({ state }) });
    expect(text).not.toContain('tok-secret-win');
    expect(text).not.toContain('sk-ant-secret-win');
  });
});
