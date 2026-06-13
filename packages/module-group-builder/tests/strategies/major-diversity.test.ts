import { describe, it, expect } from 'vitest';
import { majorDiversityStrategy } from '../../src/strategies/major-diversity.js';
import { makeRng } from '../../src/rng.js';
import type { StudentRecord } from '../../src/types.js';

const recs: StudentRecord[] = [
  { canvasId: '1', pseudonym: 'A', major: 'IT Management', metrics: {} },
  { canvasId: '2', pseudonym: 'B', major: 'Marketing', metrics: {} },
  { canvasId: '3', pseudonym: 'C', major: 'Accounting', metrics: {} },
  { canvasId: '4', pseudonym: 'D', major: 'IT Management', metrics: {} },
];
const buckets = { 'IT Management': 'technical', Marketing: 'creative', Accounting: 'quantitative' };

describe('major-diversity strategy', () => {
  it('spreads buckets so each group mixes types', () => {
    const g = majorDiversityStrategy.generateCandidate(recs, { groupCount: 2, targetSizes: [2, 2] }, makeRng(1), { majorBuckets: buckets });
    expect(g.map((x) => x.length)).toEqual([2, 2]);
    // the two technical students (1,4) should not both land in the same group
    const grpOf = (id: string) => g.findIndex((grp) => grp.includes(id));
    expect(grpOf('1')).not.toBe(grpOf('4'));
  });
});
