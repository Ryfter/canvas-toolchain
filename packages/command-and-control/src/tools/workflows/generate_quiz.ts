// src/tools/workflows/generate_quiz.ts
import type { LlmClient } from '@canvas-toolchain/shared-llm';
import { resolveActiveLlmClient } from '../../llm/resolve.js';
import {
  generateQuizDraft,
  type GenerateQuizDraftInput,
  type GenerateQuizDraftOutcome,
  type GenerateQuizDraftDeps,
} from '../quiz/generate.js';
import type { DifficultyMix, QuizItemType, QuizPageType, WeekMapOverride } from '../quiz/types.js';

export interface GenerateQuizInput {
  courseDir: string;
  week: number;
  sources: string[];
  title?: string;
  pageType?: QuizPageType;
  difficultyMix?: DifficultyMix;
  questionCount?: number;
  types?: QuizItemType[];
  outputPath?: string;
  overwrite?: boolean;
  landingPagePath?: string;
  courseId?: string;
  quizId?: string;
  bloomHint?: string;
  termStartMonday?: string;
  weekMapOverrides?: WeekMapOverride[];
}

export interface GenerateQuizDeps {
  llm?: LlmClient;
  readFile?: (path: string) => string;
  writeFileAtomic?: (path: string, body: string) => void;
  /** Test-only source text map. */
  sourceTexts?: Record<string, string>;
}

export type GenerateQuizResult = GenerateQuizDraftOutcome;

/**
 * Author a local quiz draft from course materials (Phase 2).
 * Manual anytime — not on the weekly spot-check critical path.
 */
export async function generateQuiz(
  input: GenerateQuizInput,
  deps: GenerateQuizDeps = {},
): Promise<GenerateQuizResult> {
  if (!input.courseDir) {
    return {
      error: 'QUIZ_COURSE_DIR_REQUIRED',
      message: 'courseDir is required.',
      fix: 'Pass the CDS course folder absolute path.',
    };
  }
  if (input.week == null || Number.isNaN(Number(input.week))) {
    return {
      error: 'QUIZ_WEEK_REQUIRED',
      message: 'week is required.',
      fix: 'Pass week: N matching the professor week map.',
    };
  }

  let llm = deps.llm;
  if (!llm) {
    try {
      llm = resolveActiveLlmClient();
    } catch {
      return {
        error: 'LLM_REQUIRED',
        message: 'No active LLM configured.',
        fix: 'Run setup_anthropic or set_active_llm_provider (Ollama).',
      };
    }
  }

  const draftInput: GenerateQuizDraftInput = {
    courseDir: input.courseDir,
    week: input.week,
    sources: input.sources ?? [],
    title: input.title,
    pageType: input.pageType,
    difficultyMix: input.difficultyMix,
    questionCount: input.questionCount,
    types: input.types,
    outputPath: input.outputPath,
    overwrite: input.overwrite,
    bloomHint: input.bloomHint,
    sourceTexts: deps.sourceTexts,
  };

  const draftDeps: GenerateQuizDraftDeps = {
    llm,
    readFile: deps.readFile,
    writeFileAtomic: deps.writeFileAtomic,
  };

  return generateQuizDraft(draftInput, draftDeps);
}
