// packages/command-and-control/src/tools/workflows/index_course_for_answers.ts

import { join } from 'node:path';
import { homedir } from 'node:os';
import { ingestCourse, type IngestResult } from '../answers/ingest/orchestrator.js';
import { providerFromConfig } from '../answers/provider/resolve.js';
import type { EmbeddingProvider } from '../answers/provider/types.js';

export interface IndexCourseForAnswersInput {
  courseId: number;
  courseDir: string;
  rebuild?: boolean;
  transcriptSources?: string[];
}

export interface IndexCourseForAnswersHooks {
  provider?: EmbeddingProvider;  // tests inject a fake
}

export interface IndexCourseForAnswersResult extends IngestResult {
  ok: boolean;
  provider: 'ollama' | 'transformers-js' | 'voyage';
  durationMs: number;
}

export async function indexCourseForAnswers(
  input: IndexCourseForAnswersInput,
  hooks: IndexCourseForAnswersHooks = {},
): Promise<IndexCourseForAnswersResult> {
  const t0 = performance.now();
  const provider = hooks.provider ?? providerFromConfig();
  const sources = input.transcriptSources ?? defaultTranscriptSources(input.courseId);
  const result = await ingestCourse({
    courseId: input.courseId, courseDir: input.courseDir, transcriptSources: sources,
    provider, rebuild: input.rebuild ?? false,
  });
  return { ok: true, provider: provider.info.kind, durationMs: Math.round(performance.now() - t0), ...result };
}

function defaultTranscriptSources(courseId: number): string[] {
  // Convention: existing sub-project 2 writes enriched transcripts here.
  // If a different layout is in use, callers can pass transcriptSources explicitly.
  const ciHome = process.env.CURRICULUM_INTELLIGENCE_HOME ?? join(homedir(), '.curriculum-intelligence');
  return [join(ciHome, 'panopto', String(courseId))];
}
