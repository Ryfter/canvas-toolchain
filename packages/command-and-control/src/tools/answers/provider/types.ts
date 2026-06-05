// packages/command-and-control/src/tools/answers/provider/types.ts

import type { EmbeddingProviderInfo } from '../types.js';

export interface EmbeddingProvider {
  readonly info: EmbeddingProviderInfo;
  /** Returns one float[] per input string. All vectors must share the same
   *  dimension (info.dimension). Throws if the provider is unreachable. */
  embed(texts: string[]): Promise<Float32Array[]>;
}

/** Thrown when the configured provider cannot service a request (network out,
 *  daemon down, etc.). Callers should degrade to keyword-only retrieval. */
export class EmbeddingProviderUnavailableError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'EmbeddingProviderUnavailableError';
  }
}
