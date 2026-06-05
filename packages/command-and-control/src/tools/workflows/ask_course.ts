// packages/command-and-control/src/tools/workflows/ask_course.ts

import { join } from 'node:path';
import { homedir } from 'node:os';
import { AnswersStore } from '../answers/store/store.js';
import { readIndexMeta } from '../answers/store/index_meta.js';
import { hybridRetrieve } from '../answers/retrieval/hybrid.js';
import { generateAnswer, type Citation } from '../answers/retrieval/answer.js';
import { providerFromConfig } from '../answers/provider/resolve.js';
import { ingestCourse } from '../answers/ingest/orchestrator.js';
import type { EmbeddingProvider } from '../answers/provider/types.js';
import type { LlmClient } from '@canvas-toolchain/shared-llm';

export interface AskCourseInput {
  courseId: number;
  courseDir: string;
  question: string;
  k?: number;
  /** Reserved for v1.1 — currently ignored. */
  weekScope?: number;
  transcriptSources?: string[];
}

export interface AskCourseHooks {
  provider?: EmbeddingProvider;
  llm?: LlmClient;
}

export interface AskCourseResult {
  answer: string;
  citations: Citation[];
  retrievalMode: 'hybrid' | 'keyword-only';
  warnings?: string[];
  usage?: { inputTokens: number; outputTokens: number };
}

export async function askCourse(
  input: AskCourseInput,
  hooks: AskCourseHooks = {},
): Promise<AskCourseResult> {
  const k = input.k ?? 8;
  const transcriptSources = input.transcriptSources ?? defaultTranscriptSources(input.courseId);

  // Auto-incremental re-index. If provider blows up here we still try to query
  // with whatever's on disk (degraded to keyword-only).
  let provider: EmbeddingProvider | null = null;
  try { provider = hooks.provider ?? providerFromConfig(); } catch { /* fall through */ }
  const warnings: string[] = [];
  if (provider) {
    try {
      await ingestCourse({ courseId: input.courseId, courseDir: input.courseDir,
        transcriptSources, provider, rebuild: false });
    } catch (e) {
      warnings.push(`Auto-incremental index failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const meta = readIndexMeta(input.courseDir);
  const dim = meta?.provider.dimension ?? provider?.info.dimension ?? 768;
  const store = new AnswersStore(input.courseDir, dim);
  try {
    const retrieval = await hybridRetrieve({
      question: input.question, k, store, provider,
    });
    warnings.push(...retrieval.warnings);

    const chunks = retrieval.chunks.map(x => x.chunk);
    const answerResult = await generateAnswer(input.question, chunks, { llm: hooks.llm });
    return {
      answer: answerResult.answer, citations: answerResult.citations,
      retrievalMode: retrieval.mode,
      warnings: warnings.length > 0 ? warnings : undefined,
      usage: answerResult.usage,
    };
  } finally {
    store.close();
  }
}

function defaultTranscriptSources(courseId: number): string[] {
  const ciHome = process.env.CURRICULUM_INTELLIGENCE_HOME ?? join(homedir(), '.curriculum-intelligence');
  return [join(ciHome, 'panopto', String(courseId))];
}
