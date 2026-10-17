import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveActiveLlmClient } from '../../src/llm/resolve.js';
import { AnthropicLlmClient, OllamaLlmClient, LmStudioLlmClient, LlmProviderError } from '@canvas-toolchain/shared-llm';

let ccHomeDir: string;
const ORIGINAL_CC_HOME = process.env.CC_HOME;
const ORIGINAL_LMSTUDIO_KEY = process.env.LMSTUDIO_API_KEY;

beforeEach(() => {
  ccHomeDir = mkdtempSync(join(tmpdir(), 'cc-home-'));
  process.env.CC_HOME = ccHomeDir;
  delete process.env.LMSTUDIO_API_KEY;
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  rmSync(ccHomeDir, { recursive: true, force: true });
  if (ORIGINAL_CC_HOME === undefined) delete process.env.CC_HOME;
  else process.env.CC_HOME = ORIGINAL_CC_HOME;
  if (ORIGINAL_LMSTUDIO_KEY === undefined) delete process.env.LMSTUDIO_API_KEY;
  else process.env.LMSTUDIO_API_KEY = ORIGINAL_LMSTUDIO_KEY;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function seedAnthropic() {
  mkdirSync(ccHomeDir, { recursive: true });
  writeFileSync(join(ccHomeDir, 'anthropic-config.json'), JSON.stringify({ apiKey: 'sk-test', model: 'claude' }));
}

function seedOllama() {
  mkdirSync(ccHomeDir, { recursive: true });
  writeFileSync(join(ccHomeDir, 'ollama-config.json'), JSON.stringify({ baseUrl: 'http://localhost:11434', model: 'qwen2.5:14b' }));
}

function seedLmStudio() {
  mkdirSync(ccHomeDir, { recursive: true });
  writeFileSync(
    join(ccHomeDir, 'lmstudio-config.json'),
    JSON.stringify({ baseUrl: 'http://localhost:1234/v1', model: 'qwen2.5-14b-instruct' }),
  );
}

function seedProvider(provider: 'anthropic' | 'ollama' | 'lmstudio') {
  mkdirSync(ccHomeDir, { recursive: true });
  writeFileSync(join(ccHomeDir, 'llm-provider.json'), JSON.stringify({ provider }));
}

describe('resolveActiveLlmClient', () => {
  it('returns AnthropicLlmClient when provider=anthropic + anthropic-config present', () => {
    seedAnthropic();
    seedProvider('anthropic');
    expect(resolveActiveLlmClient()).toBeInstanceOf(AnthropicLlmClient);
  });

  it('returns OllamaLlmClient when provider=ollama + ollama-config present', () => {
    seedOllama();
    seedProvider('ollama');
    expect(resolveActiveLlmClient()).toBeInstanceOf(OllamaLlmClient);
  });

  it('returns LmStudioLlmClient when provider=lmstudio + lmstudio-config present', () => {
    seedLmStudio();
    seedProvider('lmstudio');
    expect(resolveActiveLlmClient()).toBeInstanceOf(LmStudioLlmClient);
  });

  it('the lmstudio client calls /chat/completions with the configured model', async () => {
    seedLmStudio();
    seedProvider('lmstudio');
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(new Response(
      JSON.stringify({ choices: [{ message: { content: 'hi' } }] }),
      { status: 200 },
    ));

    const client = resolveActiveLlmClient();
    const result = await client.complete('sys', 'usr');

    expect(result.text).toBe('hi');
    const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:1234/v1/chat/completions');
    expect(JSON.parse(init.body as string).model).toBe('qwen2.5-14b-instruct');
  });

  it('sends LMSTUDIO_API_KEY as a Bearer header', async () => {
    process.env.LMSTUDIO_API_KEY = 'lm-secret-key';
    seedLmStudio();
    seedProvider('lmstudio');
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(new Response(
      JSON.stringify({ choices: [{ message: { content: 'hi' } }] }),
      { status: 200 },
    ));

    const client = resolveActiveLlmClient();
    await client.complete('sys', 'usr');

    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer lm-secret-key');
  });

  it('throws LLM_PROVIDER_NOT_SET when llm-provider.json is missing', () => {
    seedAnthropic();
    expect(() => resolveActiveLlmClient()).toThrow(
      expect.objectContaining({ constructor: LlmProviderError, code: 'LLM_PROVIDER_NOT_SET' }),
    );
  });

  it('throws LLM_PROVIDER_CONFIG_MISSING when provider=anthropic but anthropic-config missing', () => {
    seedProvider('anthropic');
    expect(() => resolveActiveLlmClient()).toThrow(
      expect.objectContaining({ constructor: LlmProviderError, code: 'LLM_PROVIDER_CONFIG_MISSING' }),
    );
  });

  it('throws LLM_PROVIDER_CONFIG_MISSING when provider=ollama but ollama-config missing', () => {
    seedProvider('ollama');
    expect(() => resolveActiveLlmClient()).toThrow(
      expect.objectContaining({ constructor: LlmProviderError, code: 'LLM_PROVIDER_CONFIG_MISSING' }),
    );
  });

  it('throws LLM_PROVIDER_CONFIG_MISSING when provider=lmstudio but lmstudio-config missing', () => {
    seedProvider('lmstudio');
    expect(() => resolveActiveLlmClient()).toThrow(
      expect.objectContaining({
        constructor: LlmProviderError,
        code: 'LLM_PROVIDER_CONFIG_MISSING',
        provider: 'lmstudio',
      }),
    );
  });
});
