import { describe, it, expect } from 'vitest';
import { AnthropicLlmClient } from '@canvas-toolchain/shared-llm';
import { tryMakeAnthropicLlm } from '../src/major/llm.js';

describe('tryMakeAnthropicLlm', () => {
  it('returns null when no Anthropic credential is configured (normalization degrades)', () => {
    expect(tryMakeAnthropicLlm(null)).toBeNull();
  });

  it('returns null for a credential with an empty key', () => {
    expect(tryMakeAnthropicLlm({ apiKey: '' })).toBeNull();
  });

  it('builds a client from the injected credential', () => {
    expect(tryMakeAnthropicLlm({ apiKey: 'sk-test' })).toBeInstanceOf(AnthropicLlmClient);
    expect(tryMakeAnthropicLlm({ apiKey: 'sk-test', model: 'claude-sonnet-4-6' })).toBeInstanceOf(AnthropicLlmClient);
  });
});
