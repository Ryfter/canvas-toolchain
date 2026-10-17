import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { LmStudioLlmClient, listLmStudioModels } from '../src/lmstudio.js';
import { LlmProviderError } from '../src/errors.js';
import { LMSTUDIO_CHAT_OK, LMSTUDIO_MODELS_OK } from './_fixtures/lmstudio-responses.js';

const BASE = 'http://localhost:1234/v1';

function fetchMock() {
  return globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
}

describe('LmStudioLlmClient', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('POSTs an OpenAI-style chat body to /chat/completions', async () => {
    fetchMock().mockResolvedValue(new Response(
      JSON.stringify(LMSTUDIO_CHAT_OK),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));
    const client = new LmStudioLlmClient({ baseUrl: BASE, model: 'qwen2.5-14b-instruct' });

    const result = await client.complete('You are helpful.', 'Say hi.');

    expect(globalThis.fetch).toHaveBeenCalledWith(
      `${BASE}/chat/completions`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'content-type': 'application/json' }),
        redirect: 'manual',
      }),
    );
    const body = JSON.parse(fetchMock().mock.calls[0][1].body);
    expect(body.model).toBe('qwen2.5-14b-instruct');
    expect(body.stream).toBe(false);
    expect(body.messages).toEqual([
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'Say hi.' },
    ]);
    expect(result).toEqual({
      text: 'hello world',
      usage: { inputTokens: 12, outputTokens: 4 },
    });
  });

  it('honors opts.model and opts.maxTokens overrides', async () => {
    fetchMock().mockResolvedValue(new Response(JSON.stringify(LMSTUDIO_CHAT_OK), { status: 200 }));
    const client = new LmStudioLlmClient({ baseUrl: BASE, model: 'qwen2.5-14b-instruct' });

    await client.complete('sys', 'usr', { model: 'llama-3.1-8b-instruct', maxTokens: 500 });

    const body = JSON.parse(fetchMock().mock.calls[0][1].body);
    expect(body.model).toBe('llama-3.1-8b-instruct');
    expect(body.max_tokens).toBe(500);
  });

  it('omits max_tokens when maxTokens not supplied', async () => {
    fetchMock().mockResolvedValue(new Response(JSON.stringify(LMSTUDIO_CHAT_OK), { status: 200 }));
    const client = new LmStudioLlmClient({ baseUrl: BASE, model: 'qwen2.5-14b-instruct' });

    await client.complete('sys', 'usr');

    const body = JSON.parse(fetchMock().mock.calls[0][1].body);
    expect(body.max_tokens).toBeUndefined();
  });

  it('sends an optional API key as a Bearer header and never leaks it', async () => {
    fetchMock().mockResolvedValue(new Response('boom', { status: 500 }));
    const client = new LmStudioLlmClient({
      baseUrl: BASE,
      model: 'qwen2.5-14b-instruct',
      apiKey: 'lm-secret-key',
    });

    const err = await client.complete('sys', 'usr').then(
      () => null,
      (e: unknown) => e as LlmProviderError,
    );

    expect(fetchMock().mock.calls[0][1].headers.authorization).toBe('Bearer lm-secret-key');
    expect(err).toBeInstanceOf(LlmProviderError);
    expect(JSON.stringify(err)).not.toContain('lm-secret-key');
    expect(err!.message).not.toContain('lm-secret-key');
    expect(err!.fix.join(' ')).not.toContain('lm-secret-key');
  });

  it('sends no authorization header when no key is configured', async () => {
    fetchMock().mockResolvedValue(new Response(JSON.stringify(LMSTUDIO_CHAT_OK), { status: 200 }));
    const client = new LmStudioLlmClient({ baseUrl: BASE, model: 'qwen2.5-14b-instruct' });

    await client.complete('sys', 'usr');

    expect(fetchMock().mock.calls[0][1].headers.authorization).toBeUndefined();
  });

  it('throws LMSTUDIO_MODEL_NOT_FOUND on 404', async () => {
    fetchMock().mockResolvedValue(new Response('model not found', { status: 404 }));
    const client = new LmStudioLlmClient({ baseUrl: BASE, model: 'qwen2.5-14b-instruct' });

    await expect(client.complete('sys', 'usr')).rejects.toMatchObject({
      constructor: LlmProviderError,
      code: 'LMSTUDIO_MODEL_NOT_FOUND',
      provider: 'lmstudio',
    });
  });

  it('throws LMSTUDIO_UNREACHABLE on connection refused', async () => {
    fetchMock().mockRejectedValue(
      Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }),
    );
    const client = new LmStudioLlmClient({ baseUrl: BASE, model: 'qwen2.5-14b-instruct' });

    await expect(client.complete('sys', 'usr')).rejects.toMatchObject({
      constructor: LlmProviderError,
      code: 'LMSTUDIO_UNREACHABLE',
      provider: 'lmstudio',
    });
  });

  it('throws LMSTUDIO_TIMEOUT when the AbortSignal fires', async () => {
    fetchMock().mockRejectedValue(new DOMException('aborted', 'AbortError'));
    const client = new LmStudioLlmClient({ baseUrl: BASE, model: 'qwen2.5-14b-instruct', timeoutMs: 1 });

    await expect(client.complete('sys', 'usr')).rejects.toMatchObject({
      constructor: LlmProviderError,
      code: 'LMSTUDIO_TIMEOUT',
      provider: 'lmstudio',
    });
  });

  it('throws LLM_REQUEST_FAILED on an unexpected 500', async () => {
    fetchMock().mockResolvedValue(new Response('boom', { status: 500 }));
    const client = new LmStudioLlmClient({ baseUrl: BASE, model: 'qwen2.5-14b-instruct' });

    await expect(client.complete('sys', 'usr')).rejects.toMatchObject({
      constructor: LlmProviderError,
      code: 'LLM_REQUEST_FAILED',
      provider: 'lmstudio',
    });
  });

  it('refuses a blocked endpoint without calling fetch', async () => {
    const client = new LmStudioLlmClient({ baseUrl: 'http://169.254.169.254/v1', model: 'm' });

    await expect(client.complete('sys', 'usr')).rejects.toMatchObject({
      code: 'ENDPOINT_BLOCKED',
      reason: 'metadata',
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('sends redirect: manual and refuses to follow a 3xx', async () => {
    fetchMock().mockResolvedValue(
      new Response('', { status: 302, headers: { location: 'http://169.254.169.254/' } }),
    );
    const client = new LmStudioLlmClient({ baseUrl: BASE, model: 'qwen2.5-14b-instruct' });

    await expect(client.complete('sys', 'usr')).rejects.toMatchObject({
      code: 'ENDPOINT_BLOCKED',
      reason: 'redirect',
    });
    expect(fetchMock().mock.calls[0][1]).toMatchObject({ redirect: 'manual' });
  });
});

describe('listLmStudioModels', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('GETs /models and returns the model ids', async () => {
    fetchMock().mockResolvedValue(new Response(
      JSON.stringify(LMSTUDIO_MODELS_OK),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));

    const models = await listLmStudioModels(BASE);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      `${BASE}/models`,
      expect.objectContaining({ redirect: 'manual' }),
    );
    expect(models).toEqual(['qwen2.5-14b-instruct', 'llama-3.1-8b-instruct']);
  });

  it('throws LMSTUDIO_UNREACHABLE when the server is off', async () => {
    fetchMock().mockRejectedValue(Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }));

    await expect(listLmStudioModels(BASE)).rejects.toMatchObject({
      constructor: LlmProviderError,
      code: 'LMSTUDIO_UNREACHABLE',
      provider: 'lmstudio',
    });
  });

  it('refuses a blocked endpoint without calling fetch', async () => {
    await expect(listLmStudioModels('http://169.254.169.254/v1')).rejects.toMatchObject({
      code: 'ENDPOINT_BLOCKED',
      reason: 'metadata',
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
