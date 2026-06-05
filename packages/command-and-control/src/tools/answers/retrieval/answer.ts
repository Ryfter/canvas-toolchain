// packages/command-and-control/src/tools/answers/retrieval/answer.ts

import type { LlmClient } from '@canvas-toolchain/shared-llm';
import { resolveActiveLlmClient } from '../../../llm/resolve.js';
import { SYSTEM_PROMPT, buildUserPrompt, extractCitedIndexes } from './prompt.js';
import type { Chunk } from '../types.js';

export interface AnswerHooks {
  llm?: LlmClient;
}

export interface Citation {
  index: number;
  source: Chunk['source'];
  sourcePath: string;
  sourceRef: string;
  deepLink: string | null;
  snippet: string;
}

export interface AnswerResult {
  answer: string;
  citations: Citation[];
  usage?: { inputTokens: number; outputTokens: number };
}

export async function generateAnswer(
  question: string,
  chunks: Chunk[],
  hooks: AnswerHooks = {},
): Promise<AnswerResult> {
  const llm = hooks.llm ?? resolveActiveLlmClient();
  const userPrompt = buildUserPrompt(question, chunks);
  const response = await llm.complete(SYSTEM_PROMPT, userPrompt, { maxTokens: 1024 });
  const indexes = extractCitedIndexes(response.text);

  const citations: Citation[] = indexes
    .filter(i => i >= 1 && i <= chunks.length)
    .map(i => {
      const c = chunks[i - 1]!;
      return {
        index: i, source: c.source, sourcePath: c.sourcePath,
        sourceRef: c.sourceRef, deepLink: c.deepLink,
        snippet: c.content.slice(0, 240),
      };
    });

  return { answer: response.text, citations, usage: response.usage };
}
