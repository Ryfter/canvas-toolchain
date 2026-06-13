import { describe, it, expect } from 'vitest';
import { makeRng, shuffle } from '../src/rng.js';

describe('seeded rng', () => {
  it('is deterministic for a given seed', () => {
    const a = makeRng(42); const b = makeRng(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
  it('shuffle is a permutation and reproducible by seed', () => {
    const input = [1, 2, 3, 4, 5];
    const s1 = shuffle(input, makeRng(7));
    const s2 = shuffle(input, makeRng(7));
    expect(s1).toEqual(s2);
    expect([...s1].sort()).toEqual([1, 2, 3, 4, 5]);
    expect(input).toEqual([1, 2, 3, 4, 5]); // does not mutate input
  });
});
