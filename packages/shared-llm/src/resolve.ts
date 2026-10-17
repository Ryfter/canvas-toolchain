import { AnthropicLlmClient, type AnthropicConfig, type LlmClient } from './index.js';
import { OllamaLlmClient, type OllamaConfig } from './ollama.js';
import { LmStudioLlmClient, type LmStudioConfig } from './lmstudio.js';
import { LlmProviderError } from './errors.js';

export interface ResolveInput {
  provider: 'anthropic' | 'ollama' | 'lmstudio';
  anthropic?: AnthropicConfig;
  ollama?: OllamaConfig;
  lmstudio?: LmStudioConfig;
}

export function resolveLlmClient(input: ResolveInput): LlmClient {
  if (input.provider === 'anthropic') {
    if (!input.anthropic) {
      throw new LlmProviderError(
        'LLM_PROVIDER_CONFIG_MISSING',
        'Active provider is anthropic but anthropic config was not supplied',
        'anthropic',
        ['Run setup_anthropic'],
      );
    }
    return new AnthropicLlmClient(input.anthropic);
  }
  if (input.provider === 'ollama') {
    if (!input.ollama) {
      throw new LlmProviderError(
        'LLM_PROVIDER_CONFIG_MISSING',
        'Active provider is ollama but ollama config was not supplied',
        'ollama',
        ['Run setup_ollama'],
      );
    }
    return new OllamaLlmClient(input.ollama);
  }
  if (input.provider === 'lmstudio') {
    if (!input.lmstudio) {
      throw new LlmProviderError(
        'LLM_PROVIDER_CONFIG_MISSING',
        'Active provider is lmstudio but lmstudio config was not supplied',
        'lmstudio',
        ['Run setup_lmstudio'],
      );
    }
    return new LmStudioLlmClient(input.lmstudio);
  }
  throw new LlmProviderError(
    'LLM_PROVIDER_NOT_SET',
    `Unknown provider: ${String(input.provider)}`,
    'unknown',
    // This package is provider-agnostic and cannot import the caller's
    // PREFERRED_PROVIDER_ORDER, so the list is mirrored here in that order.
    ['Run set_active_llm_provider to choose lmstudio, ollama or anthropic'],
  );
}
