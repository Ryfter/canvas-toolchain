// src/tools/workflows/validate_quiz.ts
import { readFileSync } from 'node:fs';
import type { LlmClient } from '@canvas-toolchain/shared-llm';
import { resolveActiveLlmClient } from '../../llm/resolve.js';
import { loadInstitutionConfig } from '../publish/canvas_config_bridge.js';
import { fetchLiveQuiz, QuizFetchError, type FetchLiveQuizInput } from '../quiz/canvas_fetch.js';
import type {
  DifficultyMix,
  LiveQuizPayload,
  QuizHorizonPass,
  QuizValidationReport,
  WeekMapOverride,
  WeekProvenance,
} from '../quiz/types.js';
import { validateQuizItems } from '../quiz/validate.js';

export interface ValidateQuizInput {
  courseId?: string;
  quizId?: string;
  quizPath?: string;
  quizMarkdown?: string;
  asOfDate?: string;
  weekNumber?: number;
  weekStartMonday?: string;
  weekProvenance?: WeekProvenance;
  horizonPass?: QuizHorizonPass;
  termStartMonday?: string;
  weekMapOverrides?: WeekMapOverride[];
  courseDir?: string;
  llmTriage?: boolean;
  expectedMix?: DifficultyMix;
  topicHints?: string[];
}

export interface ValidateQuizDeps {
  llm?: LlmClient;
  readFile?: (path: string) => string;
  fetchLiveQuiz?: (args: FetchLiveQuizInput) => Promise<LiveQuizPayload>;
}

export type ValidateQuizResult =
  | QuizValidationReport
  | { error: string; message?: string; fix?: string };

function defaultRead(path: string): string {
  return readFileSync(path, 'utf-8');
}

/** Minimal local-draft stem extractor for authoring pre-check (not readiness SoT). */
function itemsFromDraftMarkdown(md: string): import('../quiz/types.js').QuizItem[] {
  const chunks = md.split(/^##\s+Q(\d+)\s*$/im).slice(1);
  const items: import('../quiz/types.js').QuizItem[] = [];
  for (let i = 0; i < chunks.length; i += 2) {
    const id = chunks[i]!;
    const body = chunks[i + 1] ?? '';
    const stemMatch = body.match(/\*\*stem:\*\*\s*(.+)/i);
    const keyMatch = body.match(/\*\*key:\*\*\s*(\S+)/i);
    const choiceLines = [...body.matchAll(/^\s*-\s*([A-D])\.\s*(.+)$/gim)];
    items.push({
      id,
      type: 'multiple_choice_question',
      stem: stemMatch?.[1]?.trim() ?? '',
      choices: choiceLines.map((m) => m[2]!.trim()),
      key: keyMatch?.[1]?.trim().toUpperCase(),
    });
  }
  return items;
}

/**
 * Validate a Canvas quiz (live) or local draft (authoring pre-check).
 * Exported for shell spot-check call-out / optional compose.
 * Never gates on weeklyCheckEnabled.
 */
export async function validateQuiz(
  input: ValidateQuizInput,
  deps: ValidateQuizDeps = {},
): Promise<ValidateQuizResult> {
  const hasLive = Boolean(input.courseId && input.quizId);
  const hasPath = Boolean(input.quizPath);
  const hasMd = Boolean(input.quizMarkdown);

  if (hasLive && (hasPath || hasMd)) {
    return {
      error: 'QUIZ_VALIDATE_SOURCE',
      message: 'Provide either live courseId+quizId or a local draft, not both.',
      fix: 'Omit quizPath/quizMarkdown for spot-check, or omit courseId/quizId for authoring pre-check.',
    };
  }

  if (!hasLive && !hasPath && !hasMd) {
    return {
      error: 'QUIZ_VALIDATE_SOURCE',
      message: 'Missing quiz source.',
      fix: 'Pass courseId and quizId (live Canvas), or quizPath / quizMarkdown for a local draft pre-check.',
    };
  }

  if (hasPath && hasMd) {
    return {
      error: 'QUIZ_INPUT_XOR',
      message: 'Pass only one of quizPath or quizMarkdown.',
      fix: 'Omit one of the local draft inputs.',
    };
  }

  try {
    if (hasLive) {
      const pull =
        deps.fetchLiveQuiz ??
        ((args: FetchLiveQuizInput) => {
          const cfg = loadInstitutionConfig();
          return fetchLiveQuiz(args, { cfg });
        });

      let live: LiveQuizPayload;
      try {
        live = await pull({ courseId: input.courseId!, quizId: input.quizId! });
      } catch (err) {
        if (err instanceof QuizFetchError) {
          return {
            error: err.code,
            message: err.message,
            fix: err.code === 'CANVAS_UNAUTHORIZED' ? 'Run setup_canvas.' : undefined,
          };
        }
        try {
          loadInstitutionConfig();
        } catch {
          return {
            error: 'CANVAS_NOT_CONFIGURED',
            message: 'Canvas config missing or invalid.',
            fix: 'Run setup_canvas.',
          };
        }
        throw err;
      }

      const llm =
        deps.llm ??
        (input.llmTriage === false || input.horizonPass === 'secondary'
          ? undefined
          : (() => {
              try {
                return resolveActiveLlmClient();
              } catch {
                return undefined;
              }
            })());

      return validateQuizItems(
        {
          source: 'canvas',
          courseId: input.courseId,
          quizId: input.quizId,
          live,
          horizonPass: input.horizonPass,
          asOfDate: input.asOfDate,
          weekNumber: input.weekNumber,
          weekStartMonday: input.weekStartMonday,
          weekProvenance: input.weekProvenance,
          expectedMix: input.expectedMix,
          topicHints: input.topicHints,
          llmTriage: input.llmTriage,
        },
        { llm },
      );
    }

    const read = deps.readFile ?? defaultRead;
    const md = hasMd ? input.quizMarkdown! : read(input.quizPath!);
    const items = itemsFromDraftMarkdown(md);
    return validateQuizItems(
      {
        source: 'local-draft',
        path: input.quizPath,
        items,
        horizonPass: input.horizonPass ?? 'primary',
        asOfDate: input.asOfDate,
        weekNumber: input.weekNumber,
        weekStartMonday: input.weekStartMonday,
        weekProvenance: input.weekProvenance,
        llmTriage: false, // local draft: deterministic only in v1 phase 1
      },
      {},
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/canvas|setup_canvas|config/i.test(msg)) {
      return {
        error: 'CANVAS_NOT_CONFIGURED',
        message: msg,
        fix: 'Run setup_canvas.',
      };
    }
    return { error: 'QUIZ_VALIDATE_FAILED', message: msg };
  }
}

/** Alias for shell composition / call-out. */
export const validateQuizForShell = validateQuiz;
