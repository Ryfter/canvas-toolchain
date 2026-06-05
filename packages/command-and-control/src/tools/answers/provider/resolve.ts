// packages/command-and-control/src/tools/answers/provider/resolve.ts

import type { EmbeddingProvider } from './types.js';
import { OllamaEmbeddingProvider } from './ollama.js';
import { TransformersJsEmbeddingProvider } from './transformers_js.js';
import { VoyageEmbeddingProvider } from './voyage.js';
import { loadLectureAnswersConfig } from '../config.js';

/** Build a provider from saved config. Throws if config is absent. */
export function providerFromConfig(): EmbeddingProvider {
  const cfg = loadLectureAnswersConfig();
  if (!cfg) throw new Error('NO_CONFIG: run setup_lecture_answers first.');
  switch (cfg.provider) {
    case 'ollama':
      return new OllamaEmbeddingProvider({ baseUrl: cfg.ollamaBaseUrl, model: cfg.model });
    case 'transformers-js':
      return new TransformersJsEmbeddingProvider({ model: cfg.model });
    case 'voyage':
      if (!cfg.voyageApiKey) throw new Error('VOYAGE_NO_API_KEY: setup_lecture_answers with provider=voyage requires voyageApiKey.');
      return new VoyageEmbeddingProvider({ apiKey: cfg.voyageApiKey, model: cfg.model });
  }
}

export interface DetectionResult {
  kind: 'ollama' | 'unavailable';
  reason?: string;
}

/** Auto-detect Ollama. Used by setup_lecture_answers when called with no
 *  explicit provider. */
export async function autoDetect(ollamaBaseUrl?: string): Promise<DetectionResult> {
  if (await OllamaEmbeddingProvider.isAvailable(ollamaBaseUrl)) {
    return { kind: 'ollama' };
  }
  return { kind: 'unavailable', reason: `Ollama not reachable at ${ollamaBaseUrl ?? 'http://localhost:11434'}` };
}
