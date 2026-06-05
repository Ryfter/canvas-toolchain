import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { OllamaLlmClient } from '../src/ollama.js';
import { LlmProviderError } from '../src/errors.js';
import { OLLAMA_GENERATE_OK } from './_fixtures/ollama-responses.js';

describe('OllamaLlmClient', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('POSTs combined system+user prompt to /api/generate', async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(new Response(
      JSON.stringify(OLLAMA_GENERATE_OK),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));
    const client = new OllamaLlmClient({ baseUrl: 'http://localhost:11434', model: 'qwen2.5:14b' });

    const result = await client.complete('You are helpful.', 'Say hi.');

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:11434/api/generate',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'content-type': 'application/json' }),
      }),
    );
    const body = JSON.parse((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.model).toBe('qwen2.5:14b');
    expect(body.stream).toBe(false);
    expect(body.prompt).toBe('You are helpful.\n\nSay hi.');
    expect(result).toEqual({
      text: 'hello world',
      usage: { inputTokens: 12, outputTokens: 4 },
    });
  });

  it('honors opts.model and opts.maxTokens overrides', async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(new Response(
      JSON.stringify(OLLAMA_GENERATE_OK),
      { status: 200 },
    ));
    const client = new OllamaLlmClient({ baseUrl: 'http://localhost:11434', model: 'qwen2.5:14b' });

    await client.complete('sys', 'usr', { model: 'llama3.1:8b', maxTokens: 500 });

    const body = JSON.parse((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.model).toBe('llama3.1:8b');
    expect(body.options).toEqual({ num_predict: 500 });
  });

  it('throws OLLAMA_MODEL_NOT_PULLED on 404', async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(new Response('model not found', { status: 404 }));
    const client = new OllamaLlmClient({ baseUrl: 'http://localhost:11434', model: 'qwen2.5:14b' });

    await expect(client.complete('sys', 'usr'))
      .rejects.toMatchObject({
        constructor: LlmProviderError,
        code: 'OLLAMA_MODEL_NOT_PULLED',
        provider: 'ollama',
      });
  });

  it('throws OLLAMA_UNREACHABLE on connection refused (TypeError from fetch)', async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }),
    );
    const client = new OllamaLlmClient({ baseUrl: 'http://localhost:11434', model: 'qwen2.5:14b' });

    await expect(client.complete('sys', 'usr'))
      .rejects.toMatchObject({
        constructor: LlmProviderError,
        code: 'OLLAMA_UNREACHABLE',
        provider: 'ollama',
      });
  });

  it('throws OLLAMA_TIMEOUT when AbortSignal fires', async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new DOMException('aborted', 'AbortError'),
    );
    const client = new OllamaLlmClient({ baseUrl: 'http://localhost:11434', model: 'qwen2.5:14b', timeoutMs: 1 });

    await expect(client.complete('sys', 'usr'))
      .rejects.toMatchObject({
        constructor: LlmProviderError,
        code: 'OLLAMA_TIMEOUT',
        provider: 'ollama',
      });
  });

  it('throws LLM_REQUEST_FAILED on unexpected 500', async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(new Response('boom', { status: 500 }));
    const client = new OllamaLlmClient({ baseUrl: 'http://localhost:11434', model: 'qwen2.5:14b' });

    await expect(client.complete('sys', 'usr'))
      .rejects.toMatchObject({
        constructor: LlmProviderError,
        code: 'LLM_REQUEST_FAILED',
        provider: 'ollama',
      });
  });

  it('omits options.num_predict when maxTokens not supplied', async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(new Response(
      JSON.stringify(OLLAMA_GENERATE_OK),
      { status: 200 },
    ));
    const client = new OllamaLlmClient({ baseUrl: 'http://localhost:11434', model: 'qwen2.5:14b' });

    await client.complete('sys', 'usr');

    const body = JSON.parse((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.options).toBeUndefined();
  });
});
