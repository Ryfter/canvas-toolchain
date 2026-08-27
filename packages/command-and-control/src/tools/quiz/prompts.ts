// src/tools/quiz/prompts.ts
import type { QuizItem } from './types.js';

export const QUIZ_TRIAGE_SYSTEM_PROMPT = `You are a quiz quality reviewer for Canvas LMS Classic Quizzes.
Return ONLY valid JSON (no markdown fences) with this shape:
{"findings":[{"code":"AMBIGUOUS_KEY"|"WEAK_DISTRACTOR"|"COVERAGE_GAP","questionId":"1","message":"...","severity":"warning"|"suggestion"}]}
Rules:
- AMBIGUOUS_KEY: two or more choices are plausibly correct given the stem.
- WEAK_DISTRACTOR: a distractor is absurd, joke, or overlaps the key.
- COVERAGE_GAP: items clearly miss an obvious topic present in the provided topicHints (if any).
- Prefer fewer high-confidence findings over speculative ones.
- If nothing material, return {"findings":[]}.`;

export function buildQuizTriageUserPrompt(items: QuizItem[], topicHints?: string[]): string {
  const hints = topicHints?.length ? `Topic hints:\n${topicHints.map((t) => `- ${t}`).join('\n')}\n\n` : '';
  const body = items.map((it, i) => {
    const id = it.id ?? String(i + 1);
    const choices = (it.choices ?? []).map((c, j) => `  ${String.fromCharCode(65 + j)}. ${c}`).join('\n');
    return `Q${id} (${it.type ?? 'unknown'})\nStem: ${it.stem}\nChoices:\n${choices || '  (none)'}\nKey: ${JSON.stringify(it.key ?? null)}`;
  }).join('\n\n');
  return `${hints}Review these quiz items:\n\n${body}`;
}

export const QUIZ_GENERATE_SYSTEM_PROMPT = `You author Canvas Classic Quiz items for a professor.
Return ONLY valid JSON (no markdown fences):
{"items":[{"id":"1","type":"multiple_choice"|"true_false","difficulty":"easy"|"medium"|"hard","stem":"...","choices":["A text","B text","C text","D text"],"key":"A","points":1,"rationale":"...","sources":["path#hint"]}]}
Rules:
- multiple_choice must have exactly 4 choices; key is A|B|C|D.
- true_false: choices ["True","False"]; key is "true" or "false".
- Ground stems in the provided source excerpts; do not invent unsupported facts.
- Match the requested difficulty counts as closely as possible.
- Keep language clear and unambiguous.`;

export function buildQuizGenerateUserPrompt(args: {
  title: string;
  week: number;
  questionCount: number;
  counts: { easy: number; medium: number; hard: number };
  types: string[];
  bloomHint?: string;
  sourceExcerpts: Array<{ path: string; text: string }>;
}): string {
  const src = args.sourceExcerpts
    .map((s) => `### ${s.path}\n${s.text}`)
    .join('\n\n');
  return [
    `Title: ${args.title}`,
    `Week: ${args.week}`,
    `Question count: ${args.questionCount}`,
    `Difficulty targets: easy=${args.counts.easy}, medium=${args.counts.medium}, hard=${args.counts.hard}`,
    `Allowed types: ${args.types.join(', ')}`,
    args.bloomHint ? `Bloom hint: ${args.bloomHint}` : null,
    '',
    'Source excerpts:',
    src || '(none)',
  ]
    .filter((l) => l != null)
    .join('\n');
}
