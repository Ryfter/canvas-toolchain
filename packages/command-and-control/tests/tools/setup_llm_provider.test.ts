import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setupLlmProvider } from '../../src/tools/setup_llm_provider.js';
import { buildRegistry } from '../../src/surface/registry.js';
import { dispatchSurface } from '../../src/surface/dispatch.js';

let ccHomeDir: string;
const ORIGINAL_CC_HOME = process.env.CC_HOME;

beforeEach(() => {
  ccHomeDir = mkdtempSync(join(tmpdir(), 'cc-home-'));
  process.env.CC_HOME = ccHomeDir;
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  rmSync(ccHomeDir, { recursive: true, force: true });
  if (ORIGINAL_CC_HOME === undefined) delete process.env.CC_HOME;
  else process.env.CC_HOME = ORIGINAL_CC_HOME;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const SECRET = 'sk-ant-do-not-leak';

function mockServers(ollama: string[] | null, lmstudio: string[] | null): void {
  (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
    if (url.includes('11434')) {
      if (ollama === null) throw new TypeError('fetch failed');
      return new Response(JSON.stringify({ models: ollama.map((name) => ({ name })) }), { status: 200 });
    }
    if (url.includes('1234')) {
      if (lmstudio === null) throw new TypeError('fetch failed');
      return new Response(JSON.stringify({ data: lmstudio.map((id) => ({ id })) }), { status: 200 });
    }
    throw new Error(`unexpected url ${url}`);
  });
}

function seedProvider(provider: string): void {
  mkdirSync(ccHomeDir, { recursive: true });
  writeFileSync(join(ccHomeDir, 'llm-provider.json'), JSON.stringify({ provider }));
}

function seedConfig(provider: string, body: Record<string, unknown>): void {
  mkdirSync(ccHomeDir, { recursive: true });
  writeFileSync(join(ccHomeDir, `${provider}-config.json`), JSON.stringify(body));
}

describe('setup_llm_provider report mode (local detection)', () => {
  it('lists models from both local servers when both answer', async () => {
    mockServers(['qwen2.5:14b'], ['qwen2.5-14b-instruct']);

    const result = await setupLlmProvider({});

    expect(result.mode).toBe('report');
    if (result.mode !== 'report') return;
    const ollama = result.localServers.find((s) => s.provider === 'ollama');
    const lmstudio = result.localServers.find((s) => s.provider === 'lmstudio');
    expect(ollama).toMatchObject({
      reachable: true,
      baseUrl: 'http://localhost:11434',
      models: ['qwen2.5:14b'],
      configure: expect.stringContaining('ct_setup action ollama'),
    });
    expect(lmstudio).toMatchObject({
      reachable: true,
      baseUrl: 'http://localhost:1234/v1',
      models: ['qwen2.5-14b-instruct'],
      configure: expect.stringContaining('ct_setup action lmstudio'),
    });
    expect(result.nextSteps.some((s) => s.includes('ollama is running'))).toBe(true);
    expect(result.nextSteps.some((s) => s.includes('lmstudio is running'))).toBe(true);
  });

  it('reports one server present and the other absent, without throwing', async () => {
    mockServers(['qwen2.5:14b'], null);

    const result = await setupLlmProvider({});

    if (result.mode !== 'report') throw new Error('expected report');
    const ollama = result.localServers.find((s) => s.provider === 'ollama');
    const lmstudio = result.localServers.find((s) => s.provider === 'lmstudio');
    expect(ollama?.reachable).toBe(true);
    expect(lmstudio?.reachable).toBe(false);
    expect(lmstudio?.models).toEqual([]);
    expect(result.nextSteps.some((s) => s.includes('Start Ollama'))).toBe(false);
    expect(result.nextSteps.some((s) => s.includes('Open LM Studio'))).toBe(false);
    expect(result.nextSteps.some((s) => s.includes('lmstudio is running'))).toBe(false);
  });

  it('gives helpful text and does not throw when neither server answers', async () => {
    mockServers(null, null);

    const result = await setupLlmProvider({});

    if (result.mode !== 'report') throw new Error('expected report');
    expect(result.localServers.every((s) => !s.reachable)).toBe(true);
    expect(result.nextSteps.join(' ')).toMatch(/No LLM provider is configured/);
    expect(result.nextSteps.join(' ')).toMatch(/No local Ollama or LM Studio server/);
  });

  it('reports the active and configured providers', async () => {
    mockServers(null, null);
    seedProvider('anthropic');
    seedConfig('anthropic', { apiKey: SECRET, model: 'claude' });
    seedConfig('ollama', { baseUrl: 'http://localhost:11434', model: 'qwen2.5:14b' });

    const result = await setupLlmProvider({});

    if (result.mode !== 'report') throw new Error('expected report');
    expect(result.activeProvider).toBe('anthropic');
    expect(result.configuredProviders).toEqual(['anthropic', 'ollama']);
    expect(result.nextSteps.join(' ')).toMatch(/Switch with ct_setup action llm_provider/);
  });

  it('never echoes a stored secret', async () => {
    mockServers(null, null);
    seedProvider('anthropic');
    seedConfig('anthropic', { apiKey: SECRET, model: 'claude' });

    const result = await setupLlmProvider({});

    expect(JSON.stringify(result)).not.toContain(SECRET);
  });
});

describe('setup_llm_provider activation mode', () => {
  it('activates a configured provider', async () => {
    seedConfig('ollama', { baseUrl: 'http://localhost:11434', model: 'qwen2.5:14b' });

    const result = await setupLlmProvider({ provider: 'ollama' });

    expect(result).toMatchObject({ mode: 'activate', ok: true, provider: 'ollama' });
    expect(JSON.parse(readFileSync(join(ccHomeDir, 'llm-provider.json'), 'utf-8'))).toEqual({
      provider: 'ollama',
    });
    // Activation is a local write — it must not probe the network.
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('returns a clear error when the provider is not configured', async () => {
    const result = await setupLlmProvider({ provider: 'lmstudio' });

    expect(result).toMatchObject({
      mode: 'activate',
      ok: false,
      error: 'PROVIDER_NOT_CONFIGURED',
    });
    if (result.mode !== 'activate' || result.ok) throw new Error('expected failure');
    expect(result.fix).toEqual(['Run setup_lmstudio first']);
    expect(existsSync(join(ccHomeDir, 'llm-provider.json'))).toBe(false);
  });

  it('rejects an unknown provider without writing', async () => {
    const result = await setupLlmProvider({ provider: 'gemini' as never });

    expect(result).toMatchObject({ mode: 'activate', ok: false, error: 'INVALID_PROVIDER' });
    expect(existsSync(join(ccHomeDir, 'llm-provider.json'))).toBe(false);
  });
});

describe('ct_setup llm_provider dispatch', () => {
  it('answers the intent action and writes the active provider', async () => {
    seedConfig('ollama', { baseUrl: 'http://localhost:11434', model: 'qwen2.5:14b' });

    const res = await dispatchSurface(buildRegistry(), 'ct_setup', {
      action: 'llm_provider',
      params: { provider: 'ollama' },
    });

    expect(res.isError).toBeFalsy();
    const body = JSON.parse(res.content[0].text as string);
    expect(body).toMatchObject({ mode: 'activate', ok: true, provider: 'ollama' });
  });
});
