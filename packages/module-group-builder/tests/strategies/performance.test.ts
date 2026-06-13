import { describe, it, expect } from 'vitest';
import { heterogeneousStrategy, homogeneousStrategy } from '../../src/strategies/performance.js';
import { makeRng } from '../../src/rng.js';
import type { StudentRecord } from '../../src/types.js';

const recs: StudentRecord[] = [
  { canvasId: '1', pseudonym: 'A', metrics: { overallGrade: 95 } },
  { canvasId: '2', pseudonym: 'B', metrics: { overallGrade: 85 } },
  { canvasId: '3', pseudonym: 'C', metrics: { overallGrade: 75 } },
  { canvasId: '4', pseudonym: 'D', metrics: { overallGrade: 65 } },
];
const spec = { groupCount: 2, targetSizes: [2, 2] };

describe('performance strategies', () => {
  it('heterogeneous spreads high+low together (snake draft by grade)', () => {
    const g = heterogeneousStrategy.generateCandidate(recs, spec, makeRng(1), {});
    // sorted desc: 1(95),2(85),3(75),4(65); snake into 2 groups -> [1,4],[2,3]
    const sizes = g.map((x) => x.length);
    expect(sizes).toEqual([2, 2]);
    // each group should contain one of the top-2 and one of the bottom-2
    for (const grp of g) {
      const grades = grp.map((id) => recs.find((r) => r.canvasId === id)!.metrics.overallGrade);
      expect(Math.max(...grades) - Math.min(...grades)).toBeGreaterThanOrEqual(10);
    }
  });
  it('homogeneous clusters similar performers', () => {
    const g = homogeneousStrategy.generateCandidate(recs, spec, makeRng(1), {});
    expect(g).toEqual([['1', '2'], ['3', '4']]); // top pair, bottom pair
  });
});
