import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setupAnthropic } from '../../src/tools/setup_anthropic.js';
import { setupOllama } from '../../src/tools/setup_ollama.js';
import { setupLmStudio } from '../../src/tools/setup_lmstudio.js';
import {
  autoActivateProvider,
  migrateActiveProvider,
  readActiveProviderOrNull,
} from '../../src/tools/set_active_llm_provider.js';
import { resolveActiveLlmClient } from '../../src/llm/resolve.js';

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

function providerPath(): string {
  return join(ccHomeDir, 'llm-provider.json');
}

function mockOllamaTags(models: string[]): void {
  (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
    new Response(JSON.stringify({ models: models.map((name) => ({ name })) }), { status: 200 }),
  );
}

function mockLmStudioModels(ids: string[]): void {
  (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
    new Response(JSON.stringify({ data: ids.map((id) => ({ id })) }), { status: 200 }),
  );
}

describe('auto-activation after a successful setup', () => {
  it('activates anthropic on a fresh home so resolveActiveLlmClient no longer throws LLM_PROVIDER_NOT_SET', async () => {
    const result = await setupAnthropic({ apiKey: 'sk-ant-real', test: false });

    expect(result.configured).toBe(true);
    expect(result.activation).toEqual({
      activated: true,
      activeProvider: 'anthropic',
      note: expect.stringContaining('anthropic'),
    });
    expect(JSON.parse(readFileSync(providerPath(), 'utf-8'))).toEqual({ provider: 'anthropic' });

    const client = resolveActiveLlmClient();
    expect(typeof client.complete).toBe('function');
  });

  it('activates ollama on a fresh home so resolveActiveLlmClient succeeds', async () => {
    mockOllamaTags(['qwen2.5:14b']);

    const result = await setupOllama({ model: 'qwen2.5:14b' });

    expect(result.mode).toBe('commit');
    expect(result.ok).toBe(true);
    expect(result.activation?.activated).toBe(true);
    expect(JSON.parse(readFileSync(providerPath(), 'utf-8'))).toEqual({ provider: 'ollama' });
    expect(() => resolveActiveLlmClient()).not.toThrow();
  });

  it('activates lmstudio on a fresh home so resolveActiveLlmClient succeeds', async () => {
    mockLmStudioModels(['qwen2.5-14b-instruct']);

    const result = await setupLmStudio({ model: 'qwen2.5-14b-instruct' });

    expect(result.mode).toBe('commit');
    expect(result.ok).toBe(true);
    expect(result.activation?.activated).toBe(true);
    expect(JSON.parse(readFileSync(providerPath(), 'utf-8'))).toEqual({ provider: 'lmstudio' });
    expect(() => resolveActiveLlmClient()).not.toThrow();
  });

  it('does not overwrite an existing valid active provider and says how to switch', async () => {
    seedProvider('ollama');
    seedOllamaConfig();

    const result = await setupAnthropic({ apiKey: 'sk-ant-real', test: false });

    expect(result.activation).toEqual({
      activated: false,
      activeProvider: 'ollama',
      note: expect.stringContaining('ct_setup action llm_provider'),
    });
    expect(JSON.parse(readFileSync(providerPath(), 'utf-8'))).toEqual({ provider: 'ollama' });
  });

  it('keeps the already-active provider and does not tell the user to switch to it', async () => {
    seedProvider('anthropic');
    seedAnthropicConfig();

    const result = await setupAnthropic({ apiKey: 'sk-ant-real', test: false });

    expect(result.activation).toEqual({
      activated: false,
      activeProvider: 'anthropic',
      note: expect.stringContaining('already the active LLM provider'),
    });
    expect(result.activation?.note).not.toMatch(/switch to anthropic/);
    expect(JSON.parse(readFileSync(providerPath(), 'utf-8'))).toEqual({ provider: 'anthropic' });
  });

  it('replaces a selector that points at a provider which is not configured', async () => {
    seedProvider('lmstudio'); // no lmstudio-config.json on disk

    const result = await setupAnthropic({ apiKey: 'sk-ant-real', test: false });

    expect(result.activation?.activated).toBe(true);
    expect(JSON.parse(readFileSync(providerPath(), 'utf-8'))).toEqual({ provider: 'anthropic' });
  });

  it('activates when the selector is corrupt', async () => {
    mkdirSync(ccHomeDir, { recursive: true });
    writeFileSync(providerPath(), '{ not json');

    const result = autoActivateProvider('anthropic');

    expect(result.activated).toBe(true);
    expect(JSON.parse(readFileSync(providerPath(), 'utf-8'))).toEqual({ provider: 'anthropic' });
  });

  it('does not leak the API key through the activation note', async () => {
    const result = await setupAnthropic({ apiKey: 'sk-ant-secret-value', test: false });
    expect(JSON.stringify(result)).not.toContain('sk-ant-secret-value');
  });
});

describe('startup migration (migrateActiveProvider)', () => {
  it('activates the only configured provider', () => {
    seedOllamaConfig();

    const result = migrateActiveProvider();

    expect(result).toEqual({ activated: true, provider: 'ollama' });
    expect(JSON.parse(readFileSync(providerPath(), 'utf-8'))).toEqual({ provider: 'ollama' });
  });

  it('does not choose when two providers are configured', () => {
    seedOllamaConfig();
    seedAnthropicConfig();

    const result = migrateActiveProvider();

    expect(result).toEqual({ activated: false, provider: null });
    expect(existsSync(providerPath())).toBe(false);
  });

  it('does not choose when nothing is configured', () => {
    expect(migrateActiveProvider()).toEqual({ activated: false, provider: null });
    expect(existsSync(providerPath())).toBe(false);
  });

  it('leaves an existing selector alone, even if it is stale', () => {
    seedProvider('lmstudio');

    const result = migrateActiveProvider();

    expect(result.activated).toBe(false);
    expect(JSON.parse(readFileSync(providerPath(), 'utf-8'))).toEqual({ provider: 'lmstudio' });
  });

  it('never touches the network', () => {
    seedAnthropicConfig();

    migrateActiveProvider();

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(readActiveProviderOrNull()).toBe('anthropic');
  });
});

function seedProvider(provider: string): void {
  mkdirSync(ccHomeDir, { recursive: true });
  writeFileSync(providerPath(), JSON.stringify({ provider }));
}

function seedAnthropicConfig(): void {
  mkdirSync(ccHomeDir, { recursive: true });
  writeFileSync(
    join(ccHomeDir, 'anthropic-config.json'),
    JSON.stringify({ apiKey: 'sk-ant-secret', model: 'claude' }),
  );
}

function seedOllamaConfig(): void {
  mkdirSync(ccHomeDir, { recursive: true });
  writeFileSync(
    join(ccHomeDir, 'ollama-config.json'),
    JSON.stringify({ baseUrl: 'http://localhost:11434', model: 'qwen2.5:14b' }),
  );
}
