import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OllamaAdapter } from '../../src/llm/ollama_adapter.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('OllamaAdapter.complete', () => {
  it('sends prompt to /api/generate and returns response text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ response: 'hello from ollama' }),
    }));

    const adapter = new OllamaAdapter('http://localhost:11434', 'llama3.2');
    const result = await adapter.complete('say hello');

    expect(result).toBe('hello from ollama');
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:11434/api/generate');
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.prompt).toBe('say hello');
    expect(body.model).toBe('llama3.2');
    expect(body.stream).toBe(false);
  });

  it('respects opts.model override', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ response: 'ok' }),
    }));

    const adapter = new OllamaAdapter('http://localhost:11434', 'llama3.2');
    await adapter.complete('hi', { model: 'mistral' });

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.model).toBe('mistral');
  });

  it('throws when Ollama returns non-ok status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
    }));

    const adapter = new OllamaAdapter('http://localhost:11434', 'llama3.2');
    await expect(adapter.complete('hi')).rejects.toThrow('Ollama request failed: 503');
  });

  it('passes num_predict when maxTokens provided', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ response: 'ok' }),
    }));

    const adapter = new OllamaAdapter('http://localhost:11434', 'llama3.2');
    await adapter.complete('hi', { maxTokens: 256 });

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect((body.options as Record<string, number>).num_predict).toBe(256);
  });
});

describe('OllamaAdapter.isReachable', () => {
  it('returns true when /api/tags responds ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));

    const adapter = new OllamaAdapter('http://localhost:11434', 'llama3.2');
    expect(await adapter.isReachable()).toBe(true);

    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(url).toBe('http://localhost:11434/api/tags');
  });

  it('returns false when fetch throws (Ollama not running)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    const adapter = new OllamaAdapter('http://localhost:11434', 'llama3.2');
    expect(await adapter.isReachable()).toBe(false);
  });

  it('returns false when /api/tags returns non-ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

    const adapter = new OllamaAdapter('http://localhost:11434', 'llama3.2');
    expect(await adapter.isReachable()).toBe(false);
  });
});
