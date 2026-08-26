import { describe, it, expect } from 'vitest';
import {
  DEFAULT_DIFFICULTY_MIX,
  DEFAULT_WEEKLY_CHECK_DAY,
  QUIZ_DRAFT_SCHEMA,
} from '../../../src/tools/quiz/types.js';

describe('quiz types', () => {
  it('exports draft schema and default mix summing to 1', () => {
    expect(QUIZ_DRAFT_SCHEMA).toBe('canvas-toolchain.quiz/v1');
    const { easy, medium, hard } = DEFAULT_DIFFICULTY_MIX;
    expect(easy + medium + hard).toBeCloseTo(1, 5);
  });

  it('recommends saturday as default weekly check day (shell-owned preference)', () => {
    expect(DEFAULT_WEEKLY_CHECK_DAY).toBe('saturday');
  });
});
