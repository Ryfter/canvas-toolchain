// src/tools/quiz/parse.ts
import { parse as parseYaml } from 'yaml';
import type { DifficultyMix, QuizDraftHeader, QuizItem, QuizPageType } from './types.js';
import { DEFAULT_DIFFICULTY_MIX, QUIZ_DRAFT_SCHEMA } from './types.js';

export interface QuizDraft {
  header: QuizDraftHeader;
  items: QuizItem[];
  rawFrontMatter?: Record<string, unknown>;
}

const FM_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

function asMix(v: unknown): DifficultyMix {
  if (!v || typeof v !== 'object') return { ...DEFAULT_DIFFICULTY_MIX };
  const o = v as Record<string, unknown>;
  return {
    easy: Number(o.easy ?? DEFAULT_DIFFICULTY_MIX.easy),
    medium: Number(o.medium ?? DEFAULT_DIFFICULTY_MIX.medium),
    hard: Number(o.hard ?? DEFAULT_DIFFICULTY_MIX.hard),
  };
}

export function parseQuizDraft(md: string): QuizDraft {
  let body = md;
  let fm: Record<string, unknown> = {};
  const m = md.match(FM_PATTERN);
  if (m) {
    try {
      const parsed = parseYaml(m[1] ?? '');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        fm = parsed as Record<string, unknown>;
      }
    } catch {
      fm = {};
    }
    body = md.slice(m[0].length);
  }

  const header: QuizDraftHeader = {
    schema: QUIZ_DRAFT_SCHEMA,
    week: typeof fm.week === 'number' ? fm.week : Number(fm.week ?? 0),
    title: String(fm.title ?? 'Quiz'),
    pageType: (fm.pageType === 'reading-quiz' ? 'reading-quiz' : 'weekly-quiz') as QuizPageType,
    questionCount: typeof fm.questionCount === 'number' ? fm.questionCount : undefined,
    pointsPossible: typeof fm.pointsPossible === 'number' ? fm.pointsPossible : undefined,
    difficultyMix: asMix(fm.difficultyMix),
    sources: Array.isArray(fm.sources) ? fm.sources.map(String) : undefined,
    status: 'draft',
  };

  const chunks = body.split(/^##\s+Q(\d+)\s*$/im).slice(1);
  const items: QuizItem[] = [];
  for (let i = 0; i < chunks.length; i += 2) {
    const id = chunks[i]!;
    const block = chunks[i + 1] ?? '';
    const stemMatch = block.match(/\*\*stem:\*\*\s*(.+)/i);
    const keyMatch = block.match(/\*\*key:\*\*\s*(\S+)/i);
    const diffMatch = block.match(/\*\*difficulty:\*\*\s*(\w+)/i);
    const typeMatch = block.match(/\*\*type:\*\*\s*(\S+)/i);
    const choiceLines = [...block.matchAll(/^\s*-\s*([A-D])\.\s*(.+)$/gim)];
    const diff = diffMatch?.[1]?.toLowerCase();
    items.push({
      id,
      type: typeMatch?.[1] ?? 'multiple_choice',
      stem: stemMatch?.[1]?.trim() ?? '',
      choices: choiceLines.length > 0 ? choiceLines.map((c) => c[2]!.trim()) : undefined,
      key: keyMatch?.[1]?.trim(),
      difficulty: diff === 'easy' || diff === 'hard' || diff === 'medium' ? diff : undefined,
    });
  }

  return { header, items, rawFrontMatter: fm };
}

export function renderQuizDraft(draft: QuizDraft): string {
  const h = draft.header;
  const mix = h.difficultyMix;
  const sources = (h.sources ?? []).map((s) => `  - ${s}`).join('\n');
  const fm = [
    '---',
    `schema: ${QUIZ_DRAFT_SCHEMA}`,
    `week: ${h.week}`,
    `title: ${JSON.stringify(h.title)}`,
    `pageType: ${h.pageType}`,
    h.questionCount != null ? `questionCount: ${h.questionCount}` : null,
    h.pointsPossible != null ? `pointsPossible: ${h.pointsPossible}` : null,
    `difficultyMix: { easy: ${mix.easy}, medium: ${mix.medium}, hard: ${mix.hard} }`,
    sources ? `sources:\n${sources}` : null,
    'status: draft',
    '---',
    '',
  ]
    .filter((line) => line != null)
    .join('\n');

  const qs = draft.items
    .map((it, i) => {
      const id = it.id ?? String(i + 1);
      const choices = (it.choices ?? [])
        .map((c, j) => `  - ${String.fromCharCode(65 + j)}. ${c}`)
        .join('\n');
      return [
        `## Q${id}`,
        `- **difficulty:** ${it.difficulty ?? 'medium'}`,
        `- **type:** ${it.type ?? 'multiple_choice'}`,
        `- **stem:** ${it.stem}`,
        choices ? `- **choices:**\n${choices}` : null,
        `- **key:** ${Array.isArray(it.key) ? it.key.join(',') : (it.key ?? '')}`,
        it.points != null ? `- **points:** ${it.points}` : null,
        '',
      ]
        .filter((x) => x != null)
        .join('\n');
    })
    .join('\n');

  return `${fm}\n${qs}`.trimEnd() + '\n';
}
