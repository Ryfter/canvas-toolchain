import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OllamaEmbeddingProvider } from '../../../src/tools/answers/provider/ollama.js';
import { EmbeddingProviderUnavailableError } from '../../../src/tools/answers/provider/types.js';

afterEach(() => vi.unstubAllGlobals());

describe('OllamaEmbeddingProvider', () => {
  it('embeds via POST /api/embeddings, returns one vector per input', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () =>
      new Response(JSON.stringify({ embedding: new Array(768).fill(0.1) }), { status: 200 })));
    const p = new OllamaEmbeddingProvider({ baseUrl: 'http://localhost:11434', model: 'nomic-embed-text' });
    const vecs = await p.embed(['hello', 'world']);
    expect(vecs).toHaveLength(2);
    expect(vecs[0]).toBeInstanceOf(Float32Array);
    expect(vecs[0]!.length).toBe(768);
  });

  it('throws EmbeddingProviderUnavailableError when daemon is down', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    const p = new OllamaEmbeddingProvider({ baseUrl: 'http://localhost:11434', model: 'nomic-embed-text' });
    await expect(p.embed(['x'])).rejects.toBeInstanceOf(EmbeddingProviderUnavailableError);
  });

  it('detects availability by hitting /api/tags', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));
    const ok = await OllamaEmbeddingProvider.isAvailable('http://localhost:11434');
    expect(ok).toBe(true);
  });
});
