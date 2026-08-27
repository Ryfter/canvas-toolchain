import { describe, it, expect } from 'vitest';
import { normalizeMix, realizeMixFromItems } from '../../../src/tools/quiz/mix.js';
import { DEFAULT_DIFFICULTY_MIX } from '../../../src/tools/quiz/types.js';

describe('normalizeMix', () => {
  it('accepts default mix', () => {
    expect(normalizeMix(undefined)).toEqual(DEFAULT_DIFFICULTY_MIX);
  });

  it('rejects mix that does not sum to 1', () => {
    expect(() => normalizeMix({ easy: 0.5, medium: 0.5, hard: 0.5 })).toThrow(/sum/);
  });
});

describe('realizeMixFromItems', () => {
  it('computes proportions from difficulty tags', () => {
    const mix = realizeMixFromItems([
      { stem: 'a', difficulty: 'easy' },
      { stem: 'b', difficulty: 'easy' },
      { stem: 'c', difficulty: 'medium' },
      { stem: 'd', difficulty: 'hard' },
      { stem: 'e' },
    ]);
    expect(mix.easy).toBeCloseTo(0.4);
    expect(mix.medium).toBeCloseTo(0.4); // medium + untagged
    expect(mix.hard).toBeCloseTo(0.2);
  });
});
