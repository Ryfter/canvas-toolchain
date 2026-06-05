import { describe, expect, it } from 'vitest';
import { resolveLlmClient } from '../src/resolve.js';
import { AnthropicLlmClient } from '../src/index.js';
import { OllamaLlmClient } from '../src/ollama.js';
import { LlmProviderError } from '../src/errors.js';

describe('resolveLlmClient', () => {
  it('returns AnthropicLlmClient when provider=anthropic and anthropic config present', () => {
    const client = resolveLlmClient({
      provider: 'anthropic',
      anthropic: { apiKey: 'sk-test', model: 'claude-3' },
    });
    expect(client).toBeInstanceOf(AnthropicLlmClient);
  });

  it('returns OllamaLlmClient when provider=ollama and ollama config present', () => {
    const client = resolveLlmClient({
      provider: 'ollama',
      ollama: { baseUrl: 'http://localhost:11434', model: 'qwen2.5:14b' },
    });
    expect(client).toBeInstanceOf(OllamaLlmClient);
  });

  it('throws LLM_PROVIDER_CONFIG_MISSING when provider=anthropic but anthropic config absent', () => {
    expect(() => resolveLlmClient({ provider: 'anthropic' }))
      .toThrow(expect.objectContaining({
        constructor: LlmProviderError,
        code: 'LLM_PROVIDER_CONFIG_MISSING',
        provider: 'anthropic',
      }));
  });

  it('throws LLM_PROVIDER_CONFIG_MISSING when provider=ollama but ollama config absent', () => {
    expect(() => resolveLlmClient({ provider: 'ollama' }))
      .toThrow(expect.objectContaining({
        constructor: LlmProviderError,
        code: 'LLM_PROVIDER_CONFIG_MISSING',
        provider: 'ollama',
      }));
  });

  it('throws LLM_PROVIDER_NOT_SET when provider value is not anthropic or ollama', () => {
    expect(() => resolveLlmClient({ provider: 'something' as never }))
      .toThrow(expect.objectContaining({
        constructor: LlmProviderError,
        code: 'LLM_PROVIDER_NOT_SET',
        provider: 'unknown',
      }));
  });
});
