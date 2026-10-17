// packages/command-and-control/src/tools/answers/provider/ollama.ts

import { assertEndpointAllowed, redirectBlocked, EndpointBlockedError } from '@canvas-toolchain/shared-llm';
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
    // SSRF guard: never fetch a blocked target; report it as unavailable.
    let endpoint: Awaited<ReturnType<typeof assertEndpointAllowed>>;
    try {
      endpoint = await assertEndpointAllowed(baseUrl);
    } catch {
      return false;
    }
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      const res = await fetch(`${endpoint.url}/api/tags`, { signal: ctrl.signal, redirect: 'manual' });
      clearTimeout(t);
      return res.ok;
    } catch { return false; }
  }

  async embed(texts: string[]): Promise<Float32Array[]> {
    const out: Float32Array[] = [];
    for (const text of texts) {
      // Re-check immediately before each request (SSRF guard); a blocked target
      // throws EndpointBlockedError (ENDPOINT_BLOCKED), which propagates so the
      // professor sees the real reason rather than a generic "unavailable".
      const endpoint = await assertEndpointAllowed(this.baseUrl);
      try {
        const res = await fetch(`${endpoint.url}/api/embeddings`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ model: this.model, prompt: text }),
          redirect: 'manual',
        });
        if (res.status >= 300 && res.status < 400) {
          throw redirectBlocked(`${endpoint.url}/api/embeddings`);
        }
        if (!res.ok) throw new Error(`ollama ${res.status}`);
        const data = await res.json() as { embedding: number[] };
        out.push(new Float32Array(data.embedding));
      } catch (e) {
        if (e instanceof EndpointBlockedError) throw e;
        throw new EmbeddingProviderUnavailableError(`Ollama unavailable: ${e instanceof Error ? e.message : String(e)}`, e);
      }
    }
    return out;
  }
}
