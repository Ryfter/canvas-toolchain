import type { ModuleContext } from '@canvas-toolchain/module-contract';
import { AnthropicLlmClient, type LlmClient } from '@canvas-toolchain/shared-llm';

const DEFAULT_MODEL = 'claude-haiku-4-5';

/** Construct the production LLM client from the host-provided credential. Tests inject their own LlmClient instead. */
export async function makeAnthropicLlm(ctx: ModuleContext): Promise<LlmClient> {
  const cred = await ctx.credentials.tryGet('anthropic');
  if (!cred || !cred.apiKey) {
    throw new Error('ANTHROPIC_NOT_CONFIGURED: Run setup_anthropic with your Anthropic API key.');
  }
  return new AnthropicLlmClient({ apiKey: cred.apiKey, model: cred.model ?? DEFAULT_MODEL });
}
