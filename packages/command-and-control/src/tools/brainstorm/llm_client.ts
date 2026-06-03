// Compat shim — real implementation lives in @canvas-toolchain/shared-llm.
// Existing imports of `LlmClient`, `LlmResponse`, `AnthropicLlmClient` continue to work
// but new construction now requires passing AnthropicConfig.
export type { LlmClient, LlmResponse, AnthropicConfig } from '@canvas-toolchain/shared-llm';
export { AnthropicLlmClient as SharedAnthropicLlmClient } from '@canvas-toolchain/shared-llm';

import { AnthropicLlmClient as SharedClient } from '@canvas-toolchain/shared-llm';
import { loadAnthropicConfig } from '../setup_anthropic.js';

/** Backward-compat wrapper that auto-loads config from setup_anthropic, so existing
 *  callers (and tests) don't need to be updated immediately. New code should use
 *  SharedAnthropicLlmClient directly with explicit config. */
export class AnthropicLlmClient extends SharedClient {
  constructor() {
    const cfg = loadAnthropicConfig();
    super({ apiKey: cfg.apiKey, model: cfg.model });
  }
}
