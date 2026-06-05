import { resolveLlmClient, LlmProviderError, type LlmClient } from '@canvas-toolchain/shared-llm';
import { loadActiveProvider } from '../tools/set_active_llm_provider.js';
import { loadAnthropicConfig } from '../tools/setup_anthropic.js';
import { loadOllamaConfig } from '../tools/setup_ollama.js';

export function resolveActiveLlmClient(): LlmClient {
  let provider: 'anthropic' | 'ollama';
  try {
    provider = loadActiveProvider();
  } catch (err) {
    throw new LlmProviderError(
      'LLM_PROVIDER_NOT_SET',
      err instanceof Error ? err.message : String(err),
      'unknown',
      ['Run set_active_llm_provider to choose anthropic or ollama'],
    );
  }

  if (provider === 'anthropic') {
    try {
      const cfg = loadAnthropicConfig();
      return resolveLlmClient({
        provider: 'anthropic',
        anthropic: { apiKey: cfg.apiKey, model: cfg.model },
      });
    } catch (err) {
      if (err instanceof LlmProviderError) throw err;
      throw new LlmProviderError(
        'LLM_PROVIDER_CONFIG_MISSING',
        err instanceof Error ? err.message : String(err),
        'anthropic',
        ['Run setup_anthropic'],
      );
    }
  }

  try {
    const cfg = loadOllamaConfig();
    const timeoutOverride = process.env.CC_OLLAMA_TIMEOUT_MS
      ? Number(process.env.CC_OLLAMA_TIMEOUT_MS)
      : undefined;
    return resolveLlmClient({
      provider: 'ollama',
      ollama: {
        baseUrl: cfg.baseUrl,
        model: cfg.model,
        ...(timeoutOverride !== undefined && !Number.isNaN(timeoutOverride) ? { timeoutMs: timeoutOverride } : {}),
      },
    });
  } catch (err) {
    if (err instanceof LlmProviderError) throw err;
    throw new LlmProviderError(
      'LLM_PROVIDER_CONFIG_MISSING',
      err instanceof Error ? err.message : String(err),
      'ollama',
      ['Run setup_ollama'],
    );
  }
}
