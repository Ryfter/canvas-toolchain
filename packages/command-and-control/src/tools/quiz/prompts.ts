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
