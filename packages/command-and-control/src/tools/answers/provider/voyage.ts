// packages/command-and-control/src/tools/answers/provider/voyage.ts

import type { EmbeddingProvider } from './types.js';
import { EmbeddingProviderUnavailableError } from './types.js';
import type { EmbeddingProviderInfo } from '../types.js';

const DEFAULT_MODEL = 'voyage-3';
const DEFAULT_DIM = 1024;

export class VoyageEmbeddingProvider implements EmbeddingProvider {
  readonly info: EmbeddingProviderInfo;
  private apiKey: string;
  private model: string;

  constructor(opts: { apiKey: string; model?: string; dimension?: number }) {
    this.apiKey = opts.apiKey;
    this.model = opts.model ?? DEFAULT_MODEL;
    this.info = { kind: 'voyage', model: this.model, dimension: opts.dimension ?? DEFAULT_DIM };
  }

  static async isAvailable(apiKey: string): Promise<boolean> {
    try {
      const res = await fetch('https://api.voyageai.com/v1/embeddings', {
        method: 'POST',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ input: 'ping', model: DEFAULT_MODEL }),
      });
      return res.ok;
    } catch { return false; }
  }

  async embed(texts: string[]): Promise<Float32Array[]> {
    try {
      const res = await fetch('https://api.voyageai.com/v1/embeddings', {
        method: 'POST',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({ input: texts, model: this.model }),
      });
      if (!res.ok) throw new Error(`voyage ${res.status}: ${await res.text().catch(() => '')}`);
      const data = await res.json() as { data: Array<{ embedding: number[] }> };
      return data.data.map(d => new Float32Array(d.embedding));
    } catch (e) {
      throw new EmbeddingProviderUnavailableError(
        `Voyage unavailable: ${e instanceof Error ? e.message : String(e)}`, e);
    }
  }
}
