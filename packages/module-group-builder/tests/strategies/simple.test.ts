import { describe, it, expect } from 'vitest';
import { randomStrategy } from '../../src/strategies/random.js';
import { alphabeticalStrategy } from '../../src/strategies/alphabetical.js';
import { makeRng } from '../../src/rng.js';
import type { StudentRecord } from '../../src/types.js';

const recs: StudentRecord[] = ['001', '002', '003', '004', '005'].map((p, i) => ({
  canvasId: String(i + 1), pseudonym: `SU26-${p}`, metrics: {},
}));
const spec = { groupCount: 2, targetSizes: [3, 2] };

describe('simple strategies', () => {
  it('random produces correctly-sized groups covering everyone, reproducible by seed', () => {
    const g1 = randomStrategy.generateCandidate(recs, spec, makeRng(1), {});
    const g2 = randomStrategy.generateCandidate(recs, spec, makeRng(1), {});
    expect(g1).toEqual(g2);
    expect(g1.map((x) => x.length)).toEqual([3, 2]);
    expect(g1.flat().sort()).toEqual(['1', '2', '3', '4', '5']);
  });
  it('alphabetical orders by pseudonym then chunks', () => {
    const g = alphabeticalStrategy.generateCandidate(recs, spec, makeRng(1), {});
    expect(g).toEqual([['1', '2', '3'], ['4', '5']]); // pseudonyms already in order
    expect(alphabeticalStrategy.misfit(g, recs, {})).toBe(0);
  });
});
