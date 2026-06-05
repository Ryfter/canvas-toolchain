// packages/command-and-control/src/tools/answers/provider/ollama.ts

import type { EmbeddingProvider } from './types.js';
import { EmbeddingProviderUnavailableError } from './types.js';
import type { EmbeddingProviderInfo } from '../types.js';

const DEFAULT_BASE = 'http://localhost:11434';
const DEFAULT_MODEL = 'nomic-embed-text';
const DEFAULT_DIM = 768;

export interface OllamaOptions {
  baseUrl?: string;
  model?: string;
  dimension?: number;
}

export class OllamaEmbeddingProvider implements EmbeddingProvider {
  readonly info: EmbeddingProviderInfo;
  private baseUrl: string;
  private model: string;

  constructor(opts: OllamaOptions = {}) {
    this.baseUrl = opts.baseUrl ?? DEFAULT_BASE;
    this.model = opts.model ?? DEFAULT_MODEL;
    this.info = { kind: 'ollama', model: this.model, dimension: opts.dimension ?? DEFAULT_DIM };
  }

  static async isAvailable(baseUrl: string = DEFAULT_BASE, timeoutMs = 1500): Promise<boolean> {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      const res = await fetch(`${baseUrl}/api/tags`, { signal: ctrl.signal });
      clearTimeout(t);
      return res.ok;
    } catch { return false; }
  }

  async embed(texts: string[]): Promise<Float32Array[]> {
    const out: Float32Array[] = [];
    for (const text of texts) {
      try {
        const res = await fetch(`${this.baseUrl}/api/embeddings`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ model: this.model, prompt: text }),
        });
        if (!res.ok) throw new Error(`ollama ${res.status}`);
        const data = await res.json() as { embedding: number[] };
        out.push(new Float32Array(data.embedding));
      } catch (e) {
        throw new EmbeddingProviderUnavailableError(`Ollama unavailable: ${e instanceof Error ? e.message : String(e)}`, e);
      }
    }
    return out;
  }
}
