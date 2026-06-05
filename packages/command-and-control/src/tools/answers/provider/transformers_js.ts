// packages/command-and-control/src/tools/answers/provider/transformers_js.ts

import type { EmbeddingProvider } from './types.js';
import { EmbeddingProviderUnavailableError } from './types.js';
import type { EmbeddingProviderInfo } from '../types.js';

const DEFAULT_MODEL = 'Xenova/bge-small-en-v1.5';
const DEFAULT_DIM = 384;

export class TransformersJsEmbeddingProvider implements EmbeddingProvider {
  readonly info: EmbeddingProviderInfo;
  private pipelinePromise: Promise<unknown> | null = null;

  constructor(opts: { model?: string; dimension?: number } = {}) {
    this.info = { kind: 'transformers-js', model: opts.model ?? DEFAULT_MODEL, dimension: opts.dimension ?? DEFAULT_DIM };
  }

  static async isAvailable(): Promise<boolean> {
    try {
      const specifier = '@xenova/transformers';
      await (Function('s', 'return import(s)') as (s: string) => Promise<unknown>)(specifier);
      return true;
    }
    catch { return false; }
  }

  private async getPipeline() {
    if (!this.pipelinePromise) {
      this.pipelinePromise = (async () => {
        try {
          const specifier = '@xenova/transformers';
          const dynamicImport = Function('s', 'return import(s)') as (s: string) => Promise<{ pipeline: (task: string, model: string) => Promise<unknown> }>;
          const mod = await dynamicImport(specifier);
          return await mod.pipeline('feature-extraction', this.info.model);
        } catch (e) {
          throw new EmbeddingProviderUnavailableError(
            `transformers.js unavailable: ${e instanceof Error ? e.message : String(e)} ` +
            `(install with: npm install @xenova/transformers --workspace=packages/command-and-control)`, e);
        }
      })();
    }
    return this.pipelinePromise;
  }

  async embed(texts: string[]): Promise<Float32Array[]> {
    const pipe = await this.getPipeline() as (input: string | string[], opts: { pooling: 'mean'; normalize: boolean }) => Promise<{ data: Float32Array }>;
    const out: Float32Array[] = [];
    for (const text of texts) {
      const result = await pipe(text, { pooling: 'mean', normalize: true });
      out.push(new Float32Array(result.data));
    }
    return out;
  }
}
