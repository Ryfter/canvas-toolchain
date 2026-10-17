import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir, platform } from 'node:os';
import { join } from 'node:path';
import { readSetupState } from '../../src/setup/read_state.js';

let ccHome: string;
let cdsHome: string;
const ORIGINAL = {
  ccHome: process.env.CC_HOME,
  cdsHome: process.env.CANVAS_DESIGN_HOME,
  anthropicKey: process.env.ANTHROPIC_API_KEY,
};

/** Seed a file under CC_HOME (or CANVAS_DESIGN_HOME when `home` is given). */
function seed(name: string, body: string, home: string = ccHome): string {
  const path = join(home, name);
  writeFileSync(path, body, 'utf-8');
  return path;
}

function seedJson(name: string, value: unknown, home: string = ccHome): string {
  return seed(name, JSON.stringify(value, null, 2), home);
}

beforeEach(() => {
  ccHome = mkdtempSync(join(tmpdir(), 'cc-home-'));
  cdsHome = mkdtempSync(join(tmpdir(), 'cds-home-'));
  process.env.CC_HOME = ccHome;
  process.env.CANVAS_DESIGN_HOME = cdsHome;
  delete process.env.ANTHROPIC_API_KEY;
  // Any network call at all fails loudly rather than hanging or returning.
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('network call in test'))));
});

afterEach(() => {
  rmSync(ccHome, { recursive: true, force: true });
  rmSync(cdsHome, { recursive: true, force: true });
  for (const [key, value] of Object.entries({
    CC_HOME: ORIGINAL.ccHome,
    CANVAS_DESIGN_HOME: ORIGINAL.cdsHome,
    ANTHROPIC_API_KEY: ORIGINAL.anthropicKey,
  })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('readSetupState on an empty home', () => {
  it('returns a complete state without throwing', async () => {
    const state = await readSetupState();

    expect(state.platform).toBe(platform());
    expect(state.coursesRoot).toBeNull();
    expect(state.coursesRootExists).toBe(false);
    expect(state.canvas.configured).toBe(false);
    expect(state.canvas.host).toBeNull();
    expect(state.designStudio.configured).toBe(false);
    expect(state.storesInSync).toBe(true);
    expect(state.llm.activeProvider).toBeNull();
    expect(state.llm.anthropic.source).toBe('none');
    expect(state.transcripts.source).toBe('panopto');
    expect(state.backup).toEqual({
      executableConfigured: false,
      executableSource: 'none',
      managedTomlPresent: false,
    });
    expect(state.modules.pendingRequests).toEqual([]);
    expect(state.secretBearingFiles).toEqual([]);
    for (const health of Object.values(state.files)) {
      expect(health.present).toBe(false);
      expect(health.validJson).toBe(false);
      expect(health.permissionsOk).toBeNull();
    }
  });

  it('makes zero network calls when probe is omitted or false', async () => {
    seedJson('canvas-config.json', { host: 'example.instructure.com', token: 'tok-secret' });
    seedJson('anthropic-config.json', { apiKey: 'sk-ant-secret', model: 'claude' });

    await readSetupState();
    await readSetupState({ probe: false });

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe('readSetupState on a broken home', () => {
  it('reports corrupt JSON as health, never as a throw', async () => {
    seed('canvas-config.json', '{ not json');
    seed('config.json', '{ also not json');
    seed('anthropic-config.json', 'not json at all');
    seed('llm-provider.json', 'nope');
    seed('transcript-config.json', 'nope');
    seed('lecture-answers-config.json', 'nope');
    seed('modules.json', 'nope');
    seed('institution.json', 'nope', cdsHome);

    const state = await readSetupState();

    expect(state.files['canvas-config'].validJson).toBe(false);
    expect(state.files['cc-config'].validJson).toBe(false);
    expect(state.files['institution-config'].validJson).toBe(false);
    expect(state.files['modules-manifest'].validJson).toBe(false);
    expect(state.canvas.configured).toBe(false);
    // A corrupt config.json must not take the whole read down with it.
    expect(state.coursesRoot).toBeNull();
    expect(state.designStudio.configured).toBe(false);
    expect(state.transcripts.source).toBeNull();
  });

  it('treats a canvas config that parses but has no token as unconfigured', async () => {
    seedJson('canvas-config.json', { host: 'example.instructure.com' });

    const state = await readSetupState();

    expect(state.canvas.configured).toBe(false);
    expect(state.files['canvas-config'].present).toBe(true);
    expect(state.files['canvas-config'].validJson).toBe(true);
  });
});

describe('readSetupState secrets', () => {
  it('normalizes the Canvas host and never echoes a token', async () => {
    seedJson('canvas-config.json', {
      host: 'schoolname',
      token: 'tok-secret',
      configuredAt: '2026-10-01T00:00:00.000Z',
    });

    const state = await readSetupState();

    expect(state.canvas.configured).toBe(true);
    expect(state.canvas.host).toBe('schoolname.instructure.com');
    expect(state.canvas.configuredAt).toBe('2026-10-01T00:00:00.000Z');
    expect(JSON.stringify(state)).not.toContain('tok-secret');
  });

  it('lists exactly the files that currently hold a secret value', async () => {
    seedJson('config.json', { coursesRoot: '/courses', registry: { token: 'gh-secret' } });
    seedJson('canvas-config.json', { host: 'example.instructure.com', token: 'tok-secret' });
    seedJson('anthropic-config.json', { apiKey: 'sk-ant-secret', model: 'claude' });
    seedJson('lecture-answers-config.json', { provider: 'voyage', voyageApiKey: 'pa-secret' });
    seedJson('ollama-config.json', { baseUrl: 'http://localhost:11434', model: 'llama3.2' });
    seedJson('institution.json', { canvasUrl: 'https://example.instructure.com', waveApiKey: 'wave-secret' }, cdsHome);

    const state = await readSetupState();

    expect(state.secretBearingFiles.sort()).toEqual([
      'anthropic-config', 'canvas-config', 'cc-config', 'institution-config', 'lecture-answers-config',
    ]);
    const dumped = JSON.stringify(state);
    for (const secret of ['gh-secret', 'tok-secret', 'sk-ant-secret', 'pa-secret', 'wave-secret']) {
      expect(dumped).not.toContain(secret);
    }
  });

  it('leaves a config.json without a registry token out of the secret list', async () => {
    seedJson('config.json', { coursesRoot: '/courses' });
    expect((await readSetupState()).secretBearingFiles).toEqual([]);
  });

  it('reports POSIX permission state for a secret file', async () => {
    const path = seedJson('canvas-config.json', { host: 'example.instructure.com', token: 'tok-secret' });
    if (platform() === 'win32') {
      expect((await readSetupState()).files['canvas-config'].permissionsOk).toBeNull();
      return;
    }
    chmodSync(path, 0o644);
    const loose = await readSetupState();
    expect(loose.files['canvas-config'].modeOctal).toBe(0o644);
    expect(loose.files['canvas-config'].permissionsOk).toBe(false);

    chmodSync(path, 0o600);
    const tight = await readSetupState();
    expect(tight.files['canvas-config'].modeOctal).toBe(0o600);
    expect(tight.files['canvas-config'].permissionsOk).toBe(true);
  });
});

describe('readSetupState providers', () => {
  it('reports an env-only Anthropic key as its own source', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-env';
    const state = await readSetupState();
    expect(state.llm.anthropic.configured).toBe(true);
    expect(state.llm.anthropic.source).toBe('env');
    expect(JSON.stringify(state)).not.toContain('sk-ant-env');
  });

  it('reports both when the key is in the environment and the file', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-env';
    seedJson('anthropic-config.json', { apiKey: 'sk-ant-file', model: 'claude' });
    expect((await readSetupState()).llm.anthropic.source).toBe('both');
  });

  it('reads the active provider and the Ollama model', async () => {
    seedJson('ollama-config.json', { baseUrl: 'http://localhost:11434', model: 'qwen2.5:14b' });
    seedJson('llm-provider.json', { provider: 'ollama' });

    const state = await readSetupState();

    expect(state.llm.activeProvider).toBe('ollama');
    expect(state.llm.ollama).toEqual({
      configured: true, host: 'http://localhost:11434', model: 'qwen2.5:14b',
    });
  });

  it('reads the lecture-answers embedder', async () => {
    seedJson('lecture-answers-config.json', { provider: 'voyage', voyageApiKey: 'pa-secret' });
    expect((await readSetupState()).llm.lectureAnswers).toEqual({ configured: true, provider: 'voyage' });
  });
});

describe('readSetupState stores', () => {
  it('flags a split Canvas store as out of sync, either way round', async () => {
    seedJson('canvas-config.json', { host: 'example.instructure.com', token: 'tok-secret' });
    expect((await readSetupState()).storesInSync).toBe(false);

    rmSync(join(ccHome, 'canvas-config.json'));
    seedJson('institution.json', { canvasUrl: 'https://example.instructure.com', apiToken: 'tok' }, cdsHome);
    expect((await readSetupState()).storesInSync).toBe(false);
  });

  it('reports two stores that agree as in sync', async () => {
    seedJson('canvas-config.json', { host: 'example.instructure.com', token: 'tok-secret' });
    seedJson(
      'institution.json',
      { canvasUrl: 'https://example.instructure.com', apiToken: 'cds-tok', waveApiKey: 'wave-secret' },
      cdsHome,
    );

    const state = await readSetupState();

    expect(state.storesInSync).toBe(true);
    expect(state.designStudio).toEqual({
      configured: true,
      host: 'example.instructure.com',
      hasApiToken: true,
      hasWaveApiKey: true,
      institutionName: null,
    });
    expect(JSON.stringify(state)).not.toContain('cds-tok');
  });

  it('reads a local-only institution.json without inventing a Canvas host', async () => {
    seedJson('institution.json', { institution: 'State U', waveApiKey: 'wave-secret' }, cdsHome);

    const state = await readSetupState();

    expect(state.designStudio).toEqual({
      configured: true,
      host: null,
      hasApiToken: false,
      hasWaveApiKey: true,
      institutionName: 'State U',
    });
    expect(state.storesInSync).toBe(true);
    expect(JSON.stringify(state)).not.toContain('wave-secret');
  });

  it('reports two stores pointing at different hosts as out of sync', async () => {
    seedJson('canvas-config.json', { host: 'example.instructure.com', token: 'tok-secret' });
    seedJson('institution.json', { canvasUrl: 'https://other.instructure.com', apiToken: 'tok' }, cdsHome);
    expect((await readSetupState()).storesInSync).toBe(false);
  });
});

describe('readSetupState modules and backup', () => {
  it('reports bundled, installed, and requested modules', async () => {
    seedJson('modules.json', { modules: { video: { enabled: true }, announcements: { enabled: true } } });
    seedJson('installed-modules.json', {
      modules: { announcements: { id: 'announcements', version: '1.1.0', sha256: 'x', installedAt: '' } },
    });
    seedJson('pending-module-installs.json', { modules: ['roster'] });

    const state = await readSetupState();

    expect(state.modules.bundled).toContainEqual({ id: 'video', enabled: true });
    expect(state.modules.bundled).toContainEqual({ id: 'roster', enabled: false });
    expect(state.modules.installed).toContainEqual({ id: 'announcements', version: '1.1.0', enabled: true });
    expect(state.modules.pendingRequests).toEqual(['roster']);
  });

  it('reports the managed Canvas Backup toml without reading its body', async () => {
    seed('canvas-backup.generated.toml', 'base_url = "https://secret.example"\n');
    const state = await readSetupState();
    expect(state.backup.managedTomlPresent).toBe(true);
    expect(JSON.stringify(state)).not.toContain('secret.example');
  });
});

describe('readSetupState probe', () => {
  it('probes Canvas with a bearer header when configured', async () => {
    seedJson('canvas-config.json', { host: 'example.instructure.com', token: 'tok-secret' });
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const state = await readSetupState({ probe: true });

    expect(state.canvas.probe).toEqual({ attempted: true, reachable: true, status: 200 });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://example.instructure.com/api/v1/users/self');
    expect(url).not.toContain('tok-secret');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer tok-secret');
    expect(init.redirect).toBe('manual');
    expect(init.signal).toBeDefined();
  });

  it('probes Anthropic separately from Canvas', async () => {
    seedJson('anthropic-config.json', { apiKey: 'sk-ant-secret', model: 'claude' });
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const state = await readSetupState({ probe: true });

    expect(state.llm.anthropic.probe).toEqual({ attempted: true, reachable: true, status: 200 });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/models');
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('sk-ant-secret');
    expect(init.redirect).toBe('manual');
  });

  it('records a failed probe as an error code, never an error message', async () => {
    seedJson('canvas-config.json', { host: 'example.instructure.com', token: 'tok-secret' });
    const failure = Object.assign(new TypeError('request to https://example.instructure.com failed'), {
      code: 'ENOTFOUND',
    });
    vi.stubGlobal('fetch', vi.fn(async () => { throw failure; }));

    const state = await readSetupState({ probe: true });

    expect(state.canvas.probe).toEqual({ attempted: true, reachable: false, errorCode: 'ENOTFOUND' });
    expect(JSON.stringify(state)).not.toContain('tok-secret');
  });

  it('probes nothing when no credential is configured', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const state = await readSetupState({ probe: true });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(state.canvas.probe).toEqual({ attempted: false, reachable: false });
  });

  it('is not attempted by default', async () => {
    seedJson('canvas-config.json', { host: 'example.instructure.com', token: 'tok-secret' });
    expect((await readSetupState()).canvas.probe).toBeUndefined();
  });
});

describe('readSetupState courses root', () => {
  it('reports an existing courses root', async () => {
    const root = join(ccHome, 'courses');
    mkdirSync(root, { recursive: true });
    seedJson('config.json', { coursesRoot: root });
    const state = await readSetupState();
    expect(state.coursesRoot).toBe(root);
    expect(state.coursesRootExists).toBe(true);
  });

  it('reports a configured but missing courses root', async () => {
    seedJson('config.json', { coursesRoot: join(ccHome, 'gone') });
    const state = await readSetupState();
    expect(state.coursesRootExists).toBe(false);
  });
});
