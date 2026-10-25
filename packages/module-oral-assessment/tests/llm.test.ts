import { describe, it, expect } from 'vitest';
import type { ModuleContext } from '@canvas-toolchain/module-contract';
import { makeAnthropicLlm } from '../src/llm.js';

function fakeCtx(cred: { apiKey: string; model?: string } | null): ModuleContext {
  return {
    moduleId: 'oral-assessment',
    paths: { config: '/c', data: '/d', designStudioData: '/ds', secrets: '/s' },
    credentials: {
      get: async () => { throw new Error('unused'); },
      tryGet: async () => cred,
    },
  } as unknown as ModuleContext;
}

describe('makeAnthropicLlm', () => {
  it('throws ANTHROPIC_NOT_CONFIGURED when no credential, without leaking anything', async () => {
    await expect(makeAnthropicLlm(fakeCtx(null))).rejects.toThrow(/ANTHROPIC_NOT_CONFIGURED/);
  });
  it('builds a client from the ctx credential', async () => {
    const llm = await makeAnthropicLlm(fakeCtx({ apiKey: 'sk-secret', model: 'claude-y' }));
    expect(typeof llm.complete).toBe('function');
  });
});
