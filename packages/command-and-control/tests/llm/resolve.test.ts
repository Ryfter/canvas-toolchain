import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveActiveLlmClient } from '../../src/llm/resolve.js';
import { AnthropicLlmClient, OllamaLlmClient, LlmProviderError } from '@canvas-toolchain/shared-llm';

let ccHomeDir: string;
const ORIGINAL_CC_HOME = process.env.CC_HOME;

beforeEach(() => {
  ccHomeDir = mkdtempSync(join(tmpdir(), 'cc-home-'));
  process.env.CC_HOME = ccHomeDir;
});

afterEach(() => {
  rmSync(ccHomeDir, { recursive: true, force: true });
  if (ORIGINAL_CC_HOME === undefined) delete process.env.CC_HOME;
  else process.env.CC_HOME = ORIGINAL_CC_HOME;
});

function seedAnthropic() {
  mkdirSync(ccHomeDir, { recursive: true });
  writeFileSync(join(ccHomeDir, 'anthropic-config.json'), JSON.stringify({ apiKey: 'sk-test', model: 'claude' }));
}

function seedOllama() {
  mkdirSync(ccHomeDir, { recursive: true });
  writeFileSync(join(ccHomeDir, 'ollama-config.json'), JSON.stringify({ baseUrl: 'http://localhost:11434', model: 'qwen2.5:14b' }));
}

function seedProvider(provider: 'anthropic' | 'ollama') {
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
});
