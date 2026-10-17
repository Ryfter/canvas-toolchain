// packages/command-and-control/src/tools/workflows/setup_lecture_answers.ts

import { assertEndpointAllowed, EndpointBlockedError } from '@canvas-toolchain/shared-llm';
import { saveLectureAnswersConfig } from '../answers/config.js';
import { autoDetect } from '../answers/provider/resolve.js';
import type { EmbeddingProviderKind, LectureAnswersConfig } from '../answers/types.js';

export interface SetupLectureAnswersInput {
  provider?: EmbeddingProviderKind;
  voyageApiKey?: string;
  ollamaBaseUrl?: string;
  model?: string;
}

export interface SetupLectureAnswersResult {
  configured: boolean;
  provider?: EmbeddingProviderKind;
  embeddingDimension?: number;
  message?: string;
  fix?: string[];
}

export async function setupLectureAnswers(input: SetupLectureAnswersInput = {}): Promise<SetupLectureAnswersResult> {
  // SSRF guard, first thing: a blocked URL must surface its own reason rather
  // than being swallowed by autoDetect into generic "install Ollama" advice.
  // The canonical (query/fragment-free) URL is what gets probed and persisted.
  let ollamaBaseUrl = input.ollamaBaseUrl;
  if (input.ollamaBaseUrl) {
    try {
      ollamaBaseUrl = (await assertEndpointAllowed(input.ollamaBaseUrl)).url;
    } catch (err) {
      if (err instanceof EndpointBlockedError) {
        return { configured: false, message: err.message, fix: err.fix };
      }
      throw err;
    }
  }

  let kind = input.provider;
  if (!kind) {
    const detected = await autoDetect(ollamaBaseUrl);
    if (detected.kind === 'ollama') kind = 'ollama';
    else {
      return {
        configured: false,
        message: detected.reason ?? 'No embedding provider auto-detected.',
        fix: [
          'Install Ollama (https://ollama.com/download) then run `ollama pull nomic-embed-text` and re-call setup_lecture_answers.',
          'OR re-call setup_lecture_answers with provider="transformers-js" to use the bundled in-process embedder (requires installing @xenova/transformers in command-and-control).',
          'OR re-call setup_lecture_answers with provider="voyage" and voyageApiKey="..." for cloud embeddings (Voyage AI).',
        ],
      };
    }
  }

  if (kind === 'voyage' && !input.voyageApiKey) {
    return {
      configured: false,
      message: 'provider=voyage requires voyageApiKey.',
      fix: ['Re-call setup_lecture_answers with provider="voyage" and voyageApiKey="vk-..." (https://www.voyageai.com/).'],
    };
  }

  const cfg: LectureAnswersConfig = { provider: kind, model: input.model };
  if (kind === 'ollama' && ollamaBaseUrl) cfg.ollamaBaseUrl = ollamaBaseUrl;
  if (kind === 'voyage') cfg.voyageApiKey = input.voyageApiKey;
  saveLectureAnswersConfig(cfg);

  const dim = kind === 'ollama' ? 768 : kind === 'transformers-js' ? 384 : 1024;
  return { configured: true, provider: kind, embeddingDimension: dim, message: `Lecture answers configured with provider=${kind}.` };
}
