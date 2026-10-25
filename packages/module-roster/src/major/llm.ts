import { AnthropicLlmClient, type LlmClient } from '@canvas-toolchain/shared-llm';
import type { AnthropicCredential } from '@canvas-toolchain/module-contract';

const DEFAULT_MODEL = 'claude-haiku-4-5';

/**
 * Build the production LLM client from the host-injected Anthropic credential
 * (`ctx.credentials.tryGet('anthropic')`), or null when none is configured so major
 * normalization degrades to passthrough.
 */
export function tryMakeAnthropicLlm(cred: AnthropicCredential | null): LlmClient | null {
  if (!cred?.apiKey) return null;
  return new AnthropicLlmClient({ apiKey: cred.apiKey, model: cred.model ?? DEFAULT_MODEL });
}
