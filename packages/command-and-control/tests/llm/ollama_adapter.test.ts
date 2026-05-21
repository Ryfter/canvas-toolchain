import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OllamaAdapter } from '../../src/llm/ollama_adapter.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('OllamaAdapter', () => {
  it('sends prompt to /api/generate and returns response text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ response: 'hello from ollama' }),
    }));

    const adapter = new OllamaAdapter('http://localhost:11434', 'llama3.2');
    const result = await adapter.complete('say hello');

    expect(result).toBe('hello from ollama');
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('http://localhost:11434/api/generate');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.prompt).toBe('say hello');
    expect(body.model).toBe('llama3.2');
    expect(body.stream).toBe(false);
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

  it('isReachable returns true when /api/tags responds ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));

    const adapter = new OllamaAdapter('http://localhost:11434', 'llama3.2');
    expect(await adapter.isReachable()).toBe(true);
  });

  it('isReachable returns false when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    const adapter = new OllamaAdapter('http://localhost:11434', 'llama3.2');
    expect(await adapter.isReachable()).toBe(false);
  });
});
