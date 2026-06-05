import { describe, it, expect, vi, afterEach } from 'vitest';
import { VoyageEmbeddingProvider } from '../../../src/tools/answers/provider/voyage.js';
import { EmbeddingProviderUnavailableError } from '../../../src/tools/answers/provider/types.js';

afterEach(() => vi.unstubAllGlobals());

describe('VoyageEmbeddingProvider', () => {
  it('batches all inputs in a single POST and returns one vector per input', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [
        { embedding: new Array(1024).fill(0.1) },
        { embedding: new Array(1024).fill(0.2) },
      ],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const p = new VoyageEmbeddingProvider({ apiKey: 'k' });
    const vecs = await p.embed(['a', 'b']);
    expect(vecs).toHaveLength(2);
    expect(vecs[0]!.length).toBe(1024);
    expect(fetchMock).toHaveBeenCalledTimes(1);  // batched
  });

  it('throws EmbeddingProviderUnavailableError on 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('bad key', { status: 401 })));
    const p = new VoyageEmbeddingProvider({ apiKey: 'wrong' });
    await expect(p.embed(['x'])).rejects.toBeInstanceOf(EmbeddingProviderUnavailableError);
  });
});
