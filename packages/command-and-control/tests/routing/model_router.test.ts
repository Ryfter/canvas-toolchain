import { describe, it, expect, vi } from 'vitest';
import { ModelRouter } from '../../src/routing/model_router.js';
import type { CcConfig } from '../../src/types.js';
import type { LlmClient } from '../../src/llm/client.js';

const MOCK_CLIENT: LlmClient = { complete: async () => 'mock' };

const BASE_CONFIG: CcConfig = {
  mode: 'easy',
  providers: { anthropic: { model: 'claude-sonnet-4-6' } },
  routing: { fast: 'anthropic', judgment: 'anthropic' },
  lastRun: { analyze_course: null, plan_next_semester: null, update_course_materials: null, full_pipeline: null },
};

describe('ModelRouter', () => {
  it('returns anthropic client for judgment category', async () => {
    const router = new ModelRouter(BASE_CONFIG, () => MOCK_CLIENT);
    const client = await router.forCategory('judgment');
    expect(client).toBe(MOCK_CLIENT);
  });

  it('returns anthropic client for fast when ollama not configured', async () => {
    const router = new ModelRouter(BASE_CONFIG, () => MOCK_CLIENT);
    const client = await router.forCategory('fast');
    expect(client).toBe(MOCK_CLIENT);
  });

  it('returns ollama client for fast when ollama configured and reachable', async () => {
    const config: CcConfig = {
      ...BASE_CONFIG,
      providers: { ...BASE_CONFIG.providers, ollama: { baseUrl: 'http://localhost:11434', model: 'llama3.2' } },
      routing: { fast: 'ollama', judgment: 'anthropic' },
    };

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));

    const router = new ModelRouter(config, () => MOCK_CLIENT);
    const client = await router.forCategory('fast');
    expect(client).not.toBe(MOCK_CLIENT);
  });

  it('falls back to anthropic when ollama is unreachable', async () => {
    const config: CcConfig = {
      ...BASE_CONFIG,
      providers: { ...BASE_CONFIG.providers, ollama: { baseUrl: 'http://localhost:11434', model: 'llama3.2' } },
      routing: { fast: 'ollama', judgment: 'anthropic' },
    };

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    const router = new ModelRouter(config, () => MOCK_CLIENT);
    const client = await router.forCategory('fast');
    expect(client).toBe(MOCK_CLIENT);
  });

  it('throws for category none', async () => {
    const router = new ModelRouter(BASE_CONFIG, () => MOCK_CLIENT);
    await expect(router.forCategory('none')).rejects.toThrow('"none"');
  });
});
