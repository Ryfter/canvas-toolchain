import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getCcStatus } from '../../src/tools/get_cc_status.js';

let tmpHome: string;
const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'cc-home-'));
  process.env.CC_HOME = tmpHome;
  delete process.env.ANTHROPIC_API_KEY;
  vi.restoreAllMocks();
  // Hermetic: an unexpected network call fails loudly instead of hanging or
  // returning real data. A test that wants a probe re-stubs `fetch` itself.
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('network call in test'))));
});

afterEach(() => {
  delete process.env.CC_HOME;
  if (ORIGINAL_KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY;
  rmSync(tmpHome, { recursive: true, force: true });
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('getCcStatus', () => {
  it('reports anthropic key absent when env var not set', async () => {
    const status = await getCcStatus();
    expect(status.providers.anthropic.keyPresent).toBe(false);
    expect(status.providers.anthropic.source).toBe('none');
  });

  it('reports an environment-only key as not configured, with a note', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-env-only';
    const status = await getCcStatus();
    // The runtime reads the file, not the environment, so an env-only key is
    // NOT usable — reporting it as present is the misdiagnosis this fixes.
    expect(status.providers.anthropic.keyPresent).toBe(false);
    expect(status.providers.anthropic.source).toBe('env');
    expect(status.providers.anthropic.note).toMatch(/ANTHROPIC_API_KEY/);
    expect(status.providers.anthropic.note).toMatch(/anthropic-config\.json/);
    expect(JSON.stringify(status)).not.toContain('sk-ant-env-only');
  });

  it('reports anthropic configured when anthropic-config.json supplies a key', async () => {
    writeFileSync(
      join(tmpHome, 'anthropic-config.json'),
      JSON.stringify({ apiKey: 'sk-from-file', model: 'claude' }),
    );
    const status = await getCcStatus();
    expect(status.providers.anthropic.keyPresent).toBe(true);
    expect(status.providers.anthropic.source).toBe('file');
    expect(status.providers.anthropic.note).toBeUndefined();
    expect(JSON.stringify(status)).not.toContain('sk-from-file');
  });

  it('reports anthropic key absent when config file has no apiKey', async () => {
    writeFileSync(join(tmpHome, 'anthropic-config.json'), JSON.stringify({ model: 'claude' }));
    const status = await getCcStatus();
    expect(status.providers.anthropic.keyPresent).toBe(false);
  });

  it('reports canvas-config.json presence without echoing host or token', async () => {
    expect((await getCcStatus()).configured.canvasConfig).toBe(false);
    writeFileSync(
      join(tmpHome, 'canvas-config.json'),
      JSON.stringify({ host: 'example.instructure.com', token: 'tok-secret' }),
    );
    const status = await getCcStatus();
    expect(status.configured.canvasConfig).toBe(true);
    const dumped = JSON.stringify(status);
    expect(dumped).not.toContain('tok-secret');
    expect(dumped).not.toContain('example.instructure.com');
  });

  it('reports llm-provider.json presence', async () => {
    expect((await getCcStatus()).configured.llmProvider).toBe(false);
    writeFileSync(join(tmpHome, 'llm-provider.json'), JSON.stringify({ provider: 'anthropic' }));
    expect((await getCcStatus()).configured.llmProvider).toBe(true);
  });

  it('reports the active LLM provider from llm-provider.json', async () => {
    expect((await getCcStatus()).llm.activeProvider).toBeNull();
    writeFileSync(join(tmpHome, 'llm-provider.json'), JSON.stringify({ provider: 'ollama' }));
    expect((await getCcStatus()).llm.activeProvider).toBe('ollama');
  });

  it('reports canvas-backup.generated.toml presence without echoing contents', async () => {
    expect((await getCcStatus()).configured.canvasBackupToml).toBe(false);
    writeFileSync(
      join(tmpHome, 'canvas-backup.generated.toml'),
      'base_url = "https://secret.example"\n',
    );
    const status = await getCcStatus();
    expect(status.configured.canvasBackupToml).toBe(true);
    expect(JSON.stringify(status)).not.toContain('secret.example');
  });

  it('reports ollama as undefined when not configured', async () => {
    const status = await getCcStatus();
    expect(status.providers.ollama).toBeUndefined();
  });

  it('reports a saved but blocked ollama URL as unreachable without fetching', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    // ollama-config.json is the store this tool reads; a hand-edited or legacy
    // entry can hold a URL the guard now refuses.
    writeFileSync(
      join(tmpHome, 'ollama-config.json'),
      JSON.stringify({ baseUrl: 'http://169.254.169.254', model: 'llama3.2' }),
    );

    const status = await getCcStatus();

    expect(status.providers.ollama?.reachable).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('canonicalizes the reported ollama baseUrl without echoing credentials', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    writeFileSync(
      join(tmpHome, 'ollama-config.json'),
      JSON.stringify({ baseUrl: 'http://user:hunter2@localhost:11434/?x=1#y', model: 'llama3.2' }),
    );

    const status = await getCcStatus();

    expect(JSON.stringify(status)).not.toContain('hunter2');
    expect(status.providers.ollama?.reachable).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('reports reachable=false when /api/tags responds with a 3xx redirect', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response('', { status: 302, headers: { location: 'http://169.254.169.254/' } }),
    ));
    writeFileSync(
      join(tmpHome, 'ollama-config.json'),
      JSON.stringify({ baseUrl: 'http://localhost:11434', model: 'llama3.2' }),
    );

    const status = await getCcStatus();

    expect(status.providers.ollama?.reachable).toBe(false);
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1]).toMatchObject({ redirect: 'manual' });
    vi.unstubAllGlobals();
  });

  it('reports mode and routing from config', async () => {
    const status = await getCcStatus();
    expect(status.mode).toBe('easy');
    expect(status.routing.fast).toBe('anthropic');
  });

  it('reports ci as installed (it is a local dep)', async () => {
    const status = await getCcStatus();
    expect(status.installedPackages.ci).toBe(true);
  });

  it('points at ct_setup doctor for full diagnostics', async () => {
    const status = await getCcStatus();
    expect(status.diagnostics).toEqual({
      tool: 'ct_setup',
      action: 'doctor',
      hint: expect.stringContaining('ct_setup'),
    });
  });

  it('contains no secrets from any config file', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-env-only';
    writeFileSync(join(tmpHome, 'anthropic-config.json'), JSON.stringify({ apiKey: 'sk-ant-secret', model: 'claude' }));
    writeFileSync(join(tmpHome, 'canvas-config.json'), JSON.stringify({ host: 'example.instructure.com', token: 'tok-secret' }));
    writeFileSync(join(tmpHome, 'config.json'), JSON.stringify({ coursesRoot: '/courses', registry: { token: 'gh-secret' } }));
    writeFileSync(join(tmpHome, 'ollama-config.json'), JSON.stringify({ baseUrl: 'http://localhost:11434', model: 'llama3.2' }));
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));

    const dumped = JSON.stringify(await getCcStatus());

    for (const secret of ['sk-ant-env-only', 'sk-ant-secret', 'tok-secret', 'gh-secret']) {
      expect(dumped).not.toContain(secret);
    }
  });
});

describe('getCcStatus Ollama source', () => {
  it('makes no network call when Ollama is not configured', async () => {
    const fetchMock = vi.fn(() => Promise.reject(new Error('network call in test')));
    vi.stubGlobal('fetch', fetchMock);

    const status = await getCcStatus();

    expect(status.providers.ollama).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports Ollama configured in ollama-config.json, and probes it', async () => {
    writeFileSync(
      join(tmpHome, 'ollama-config.json'),
      JSON.stringify({ baseUrl: 'http://localhost:11434', model: 'qwen2.5:14b' }),
    );
    const fetchMock = vi.fn(async () => new Response('{"models":[]}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const status = await getCcStatus();

    expect(status.providers.ollama).toEqual({
      baseUrl: 'http://localhost:11434',
      model: 'qwen2.5:14b',
      reachable: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe('http://localhost:11434/api/tags');
  });

  it('ignores Ollama fields written into config.json', async () => {
    writeFileSync(
      join(tmpHome, 'config.json'),
      JSON.stringify({ providers: { ollama: { baseUrl: 'http://localhost:9999', model: 'stale' } } }),
    );
    const fetchMock = vi.fn(() => Promise.reject(new Error('network call in test')));
    vi.stubGlobal('fetch', fetchMock);

    const status = await getCcStatus();

    expect(status.providers.ollama).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports a configured but unreachable Ollama without throwing', async () => {
    writeFileSync(
      join(tmpHome, 'ollama-config.json'),
      JSON.stringify({ baseUrl: 'http://localhost:11434', model: 'qwen2.5:14b' }),
    );
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED'); }));

    const status = await getCcStatus();

    expect(status.providers.ollama?.reachable).toBe(false);
  });
});
