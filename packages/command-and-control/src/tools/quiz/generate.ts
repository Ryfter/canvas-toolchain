// src/tools/quiz/generate.ts
import { mkdirSync, renameSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { LlmClient } from '@canvas-toolchain/shared-llm';
import type {
  DifficultyMix,
  QuizFinding,
  QuizItem,
  QuizItemType,
  QuizPageType,
} from './types.js';
import { DEFAULT_DIFFICULTY_MIX, QUIZ_DRAFT_SCHEMA } from './types.js';
import { normalizeMix, realizeMixFromItems, realizeTargetCounts } from './mix.js';
import { renderQuizDraft, type QuizDraft } from './parse.js';
import { QUIZ_GENERATE_SYSTEM_PROMPT, buildQuizGenerateUserPrompt } from './prompts.js';
import { validateQuizItems } from './validate.js';

const MAX_SOURCE_CHARS = 12_000;
const MAX_QUESTION_COUNT = 25;

export interface GenerateQuizDraftInput {
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
  bloomHint?: string;
  /** Pre-loaded source text keyed by path (tests); production reads files. */
  sourceTexts?: Record<string, string>;
}

export interface GenerateQuizDraftDeps {
  llm?: LlmClient;
  readFile?: (path: string) => string;
  writeFileAtomic?: (path: string, body: string) => void;
}

export interface GenerateQuizDraftResult {
  path: string;
  questionCount: number;
  realizedMix: DifficultyMix;
  structuralFindings: QuizFinding[];
  warnings: string[];
  summary: string;
}

export type GenerateQuizDraftOutcome =
  | GenerateQuizDraftResult
  | { error: string; message?: string; fix?: string };

function defaultAtomicWrite(path: string, body: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp.${process.pid}`;
  writeFileSync(tmp, body, 'utf-8');
  renameSync(tmp, path);
}

function slugTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'quiz';
}

function parseItemsJson(raw: string): QuizItem[] {
  let t = raw.trim();
  if (t.startsWith('```')) {
    t = t.replace(/^```[a-zA-Z]*\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(t);
  } catch {
    throw Object.assign(new Error('QUIZ_PARSE_FAILED'), {
      code: 'QUIZ_PARSE_FAILED',
      excerpt: t.slice(0, 200),
    });
  }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as { items?: unknown }).items)) {
    throw Object.assign(new Error('QUIZ_PARSE_FAILED'), { code: 'QUIZ_PARSE_FAILED' });
  }
  const items = (parsed as { items: unknown[] }).items;
  return items.map((rawItem, i) => {
    const o = (rawItem ?? {}) as Record<string, unknown>;
    const type = String(o.type ?? 'multiple_choice');
    const choices = Array.isArray(o.choices) ? o.choices.map(String) : undefined;
    let key: string | string[] | undefined;
    if (Array.isArray(o.key)) key = o.key.map(String);
    else if (o.key != null) key = String(o.key);
    const diff = String(o.difficulty ?? 'medium');
    return {
      id: String(o.id ?? i + 1),
      type,
      stem: String(o.stem ?? ''),
      choices,
      key: type.includes('true_false') && typeof key === 'string' ? key.toLowerCase() : key,
      points: typeof o.points === 'number' ? o.points : 1,
      difficulty: diff === 'easy' || diff === 'hard' || diff === 'medium' ? diff : 'medium',
    } satisfies QuizItem;
  });
}

function loadSources(
  courseDir: string,
  sources: string[],
  readFile: (path: string) => string,
  sourceTexts?: Record<string, string>,
): { excerpts: Array<{ path: string; text: string }>; warnings: string[] } {
  const warnings: string[] = [];
  const excerpts: Array<{ path: string; text: string }> = [];
  let budget = MAX_SOURCE_CHARS;
  for (const src of sources) {
    const abs = src.startsWith('/') ? src : join(courseDir, src);
    let text = sourceTexts?.[src] ?? sourceTexts?.[abs];
    if (text == null) {
      try {
        text = readFile(abs);
      } catch {
        warnings.push(`Could not read source: ${src}`);
        continue;
      }
    }
    if (text.trim().length === 0) {
      warnings.push(`Empty source: ${src}`);
      continue;
    }
    if (text.length > budget) {
      text = text.slice(0, budget);
      warnings.push(`Truncated source to fit size cap: ${src}`);
      budget = 0;
    } else {
      budget -= text.length;
    }
    excerpts.push({ path: src, text });
    if (budget <= 0) break;
  }
  return { excerpts, warnings };
}

export async function generateQuizDraft(
  input: GenerateQuizDraftInput,
  deps: GenerateQuizDraftDeps,
): Promise<GenerateQuizDraftOutcome> {
  if (!deps.llm) {
    return { error: 'LLM_REQUIRED', message: 'generate_quiz needs an LLM client.', fix: 'Run setup_anthropic or set_active_llm_provider.' };
  }
  if (!input.sources?.length) {
    return {
      error: 'QUIZ_SOURCES_REQUIRED',
      message: 'At least one source path is required.',
      fix: 'Pass sources: ["week-01/reading.md", ...] under courseDir.',
    };
  }

  let mix: DifficultyMix;
  try {
    mix = normalizeMix(input.difficultyMix ?? DEFAULT_DIFFICULTY_MIX);
  } catch (err) {
    return {
      error: 'QUIZ_MIX_INVALID',
      message: err instanceof Error ? err.message : String(err),
      fix: 'Provide difficultyMix easy+medium+hard summing to 1.0.',
    };
  }

  const questionCount = Math.min(
    Math.max(1, input.questionCount ?? 10),
    MAX_QUESTION_COUNT,
  );
  const types = input.types?.length ? input.types : (['multiple_choice'] as QuizItemType[]);
  const title = input.title ?? `Week ${input.week} Weekly Quiz`;
  const pageType = input.pageType ?? 'weekly-quiz';
  const weekFolder = `week-${String(input.week).padStart(2, '0')}`;
  const defaultOut = join(
    input.courseDir,
    weekFolder,
    'quizzes',
    `${slugTitle(title)}-draft.md`,
  );
  const outputPath = input.outputPath ?? defaultOut;

  if (!input.overwrite && existsSync(outputPath)) {
    return {
      error: 'QUIZ_OUTPUT_EXISTS',
      message: `Output already exists: ${outputPath}`,
      fix: 'Pass overwrite: true or a different outputPath.',
    };
  }

  const reader = deps.readFile ?? ((p: string) => readFileSync(p, 'utf-8'));

  const { excerpts, warnings } = loadSources(
    input.courseDir,
    input.sources,
    reader,
    input.sourceTexts,
  );
  if (excerpts.length === 0) {
    return {
      error: 'QUIZ_SOURCES_EMPTY',
      message: 'No readable source text found.',
      fix: 'Check source paths exist under courseDir and contain text.',
    };
  }

  const counts = realizeTargetCounts(questionCount, mix);
  const user = buildQuizGenerateUserPrompt({
    title,
    week: input.week,
    questionCount,
    counts,
    types,
    bloomHint: input.bloomHint,
    sourceExcerpts: excerpts,
  });

  let items: QuizItem[];
  try {
    const response = await deps.llm.complete(QUIZ_GENERATE_SYSTEM_PROMPT, user, { maxTokens: 4096 });
    items = parseItemsJson(response.text);
  } catch (err) {
    const excerpt = err && typeof err === 'object' && 'excerpt' in err
      ? String((err as { excerpt: string }).excerpt)
      : undefined;
    return {
      error: 'QUIZ_PARSE_FAILED',
      message: excerpt
        ? `LLM did not return parseable quiz JSON. First 200 chars: ${excerpt}`
        : err instanceof Error ? err.message : String(err),
      fix: 'Retry generate_quiz; ensure the active LLM returns the required JSON shape.',
    };
  }

  if (items.length === 0) {
    return {
      error: 'QUIZ_PARSE_FAILED',
      message: 'LLM returned zero quiz items.',
      fix: 'Retry generate_quiz with clearer source excerpts.',
    };
  }

  const draft: QuizDraft = {
    header: {
      schema: QUIZ_DRAFT_SCHEMA,
      week: input.week,
      title,
      pageType,
      questionCount: items.length,
      pointsPossible: items.reduce((a, it) => a + (it.points ?? 1), 0),
      difficultyMix: mix,
      sources: input.sources,
      status: 'draft',
    },
    items,
  };

  const md = renderQuizDraft(draft);
  const write = deps.writeFileAtomic ?? defaultAtomicWrite;
  write(outputPath, md);

  const structural = await validateQuizItems(
    { source: 'local-draft', path: outputPath, items, llmTriage: false },
    {},
  );

  const realizedMix = realizeMixFromItems(items);
  return {
    path: outputPath,
    questionCount: items.length,
    realizedMix,
    structuralFindings: structural.findings,
    warnings,
    summary: `Wrote ${items.length}-question draft to ${outputPath} (${structural.verdict}).`,
  };
}
