import { resolveLlmClient, LlmProviderError, type LlmClient } from '@canvas-toolchain/shared-llm';
import { loadActiveProvider } from '../tools/set_active_llm_provider.js';
import { loadAnthropicConfig } from '../tools/setup_anthropic.js';
import { loadOllamaConfig } from '../tools/setup_ollama.js';
import { loadLmStudioConfig } from '../tools/setup_lmstudio.js';

export function resolveActiveLlmClient(): LlmClient {
  let provider: 'anthropic' | 'ollama' | 'lmstudio';
  try {
    provider = loadActiveProvider();
  } catch (err) {
    throw new LlmProviderError(
      'LLM_PROVIDER_NOT_SET',
      err instanceof Error ? err.message : String(err),
      'unknown',
      ['Run set_active_llm_provider to choose anthropic, ollama or lmstudio'],
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

  if (provider === 'ollama') {
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

  if (provider === 'lmstudio') {
    try {
      const cfg = loadLmStudioConfig();
      const timeoutOverride = process.env.CC_LMSTUDIO_TIMEOUT_MS
        ? Number(process.env.CC_LMSTUDIO_TIMEOUT_MS)
        : undefined;
      // The saved config holds no secret. A remote/LAN server may require a key;
      // when supplied it arrives via the environment and is sent as a Bearer
      // header only — never logged or echoed.
      const apiKey = process.env.LMSTUDIO_API_KEY;
      return resolveLlmClient({
        provider: 'lmstudio',
        lmstudio: {
          baseUrl: cfg.baseUrl,
          model: cfg.model,
          ...(apiKey ? { apiKey } : {}),
          ...(timeoutOverride !== undefined && !Number.isNaN(timeoutOverride) ? { timeoutMs: timeoutOverride } : {}),
        },
      });
    } catch (err) {
      if (err instanceof LlmProviderError) throw err;
      throw new LlmProviderError(
        'LLM_PROVIDER_CONFIG_MISSING',
        err instanceof Error ? err.message : String(err),
        'lmstudio',
        ['Run setup_lmstudio'],
      );
    }
  }

  // Unreachable: loadActiveProvider only returns the providers handled above.
  throw new LlmProviderError(
    'LLM_PROVIDER_NOT_SET',
    `Unsupported LLM provider '${String(provider)}'`,
    'unknown',
    ['Run set_active_llm_provider to choose anthropic, ollama or lmstudio'],
  );
}
