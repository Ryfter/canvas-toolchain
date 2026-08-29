// src/tools/quiz/mix.ts
import type { DifficultyMix, QuizItem } from './types.js';
import { DEFAULT_DIFFICULTY_MIX } from './types.js';

export function normalizeMix(mix: DifficultyMix | undefined): DifficultyMix {
  const m = mix ?? DEFAULT_DIFFICULTY_MIX;
  const sum = m.easy + m.medium + m.hard;
  if (Math.abs(sum - 1) > 0.01) {
    throw new Error(`DifficultyMix must sum to 1.0 (±0.01), got ${sum}`);
  }
  return m;
}

/** Infer realized mix from optional per-item difficulty tags; unknown → medium. */
export function realizeMixFromItems(items: QuizItem[]): DifficultyMix {
  if (items.length === 0) return { easy: 0, medium: 0, hard: 0 };
  let easy = 0;
  let medium = 0;
  let hard = 0;
  for (const it of items) {
    if (it.difficulty === 'easy') easy++;
    else if (it.difficulty === 'hard') hard++;
    else medium++;
  }
  const n = items.length;
  return { easy: easy / n, medium: medium / n, hard: hard / n };
}

/** Target item counts from mix; remainder goes to medium. */
export function realizeTargetCounts(
  questionCount: number,
  mix: DifficultyMix,
): { easy: number; medium: number; hard: number } {
  const m = normalizeMix(mix);
  const easy = Math.round(m.easy * questionCount);
  const hard = Math.round(m.hard * questionCount);
  let medium = questionCount - easy - hard;
  if (medium < 0) {
    // Rounding overflow — pull from easy then hard
    let deficit = -medium;
    const takeEasy = Math.min(deficit, easy);
    medium = 0;
    return { easy: easy - takeEasy, medium: questionCount - (easy - takeEasy) - hard, hard };
  }
  return { easy, medium, hard };
}
