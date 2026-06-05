import { describe, it, expect, vi } from 'vitest';
import { TransformersJsEmbeddingProvider } from '../../../src/tools/answers/provider/transformers_js.js';
import { EmbeddingProviderUnavailableError } from '../../../src/tools/answers/provider/types.js';

describe('TransformersJsEmbeddingProvider', () => {
  it('records 384-dim BGE-small as info by default', () => {
    const p = new TransformersJsEmbeddingProvider();
    expect(p.info.kind).toBe('transformers-js');
    expect(p.info.dimension).toBe(384);
  });

  it('throws EmbeddingProviderUnavailableError when @xenova/transformers is not installed', async () => {
    // We expect this to fail in the CI environment where @xenova/transformers is NOT installed.
    // If a developer happens to have it installed locally, this test is skipped.
    const installed = await TransformersJsEmbeddingProvider.isAvailable();
    if (installed) {
      console.warn('Skipping unavailable-error test — @xenova/transformers IS installed locally.');
      return;
    }
    const p = new TransformersJsEmbeddingProvider();
    await expect(p.embed(['x'])).rejects.toBeInstanceOf(EmbeddingProviderUnavailableError);
  });
});
