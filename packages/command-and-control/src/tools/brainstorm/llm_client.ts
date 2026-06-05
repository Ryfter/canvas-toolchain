// Compat shim — real implementation lives in @canvas-toolchain/shared-llm.
// Existing imports of `LlmClient`, `LlmResponse`, `AnthropicLlmClient`, `AnthropicConfig`
// continue to work. New construction routes through resolveActiveLlmClient so the
// brainstorm flow honors the active provider (anthropic or ollama).
export type { LlmClient, LlmResponse, AnthropicConfig } from '@canvas-toolchain/shared-llm';
export { AnthropicLlmClient as SharedAnthropicLlmClient } from '@canvas-toolchain/shared-llm';

import type { LlmClient } from '@canvas-toolchain/shared-llm';
import { resolveActiveLlmClient } from '../../llm/resolve.js';

/** Backward-compat wrapper that resolves the active provider on construction.
 *  Existing call sites that did `new AnthropicLlmClient()` (no args) now transparently
 *  use whichever provider the user has selected via set_active_llm_provider. */
export class AnthropicLlmClient implements LlmClient {
  private readonly inner: LlmClient;
  constructor() {
    this.inner = resolveActiveLlmClient();
  }
  async complete(
    systemPrompt: string,
    userPrompt: string,
    opts?: { model?: string; maxTokens?: number },
  ) {
    return this.inner.complete(systemPrompt, userPrompt, opts);
  }
}
