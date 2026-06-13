import { describe, it, expect } from 'vitest';
import { weightedStrategy, compositeScore } from '../../src/strategies/weighted.js';
import { makeRng } from '../../src/rng.js';
import type { StudentRecord } from '../../src/types.js';

describe('weighted strategy', () => {
  it('compositeScore renormalizes when a weighted metric is missing', () => {
    const r: StudentRecord = { canvasId: '1', pseudonym: 'A', metrics: { overallGrade: 80 } }; // no priorReview
    const score = compositeScore(r, { priorReview: 0.5, overallGrade: 0.5 });
    expect(score).toBeCloseTo(80); // priorReview drops; overallGrade weight renormalizes to 1.0
  });
  it('balances composite across groups by default', () => {
    const recs: StudentRecord[] = [
      { canvasId: '1', pseudonym: 'A', metrics: { overallGrade: 100 } },
      { canvasId: '2', pseudonym: 'B', metrics: { overallGrade: 90 } },
      { canvasId: '3', pseudonym: 'C', metrics: { overallGrade: 60 } },
      { canvasId: '4', pseudonym: 'D', metrics: { overallGrade: 50 } },
    ];
    const g = weightedStrategy.generateCandidate(recs, { groupCount: 2, targetSizes: [2, 2] }, makeRng(1), { weights: { overallGrade: 1 } });
    for (const grp of g) {
      const sum = grp.reduce((s, id) => s + recs.find((r) => r.canvasId === id)!.metrics.overallGrade, 0);
      expect(sum).toBe(150); // 100+50 and 90+60 — balanced
    }
  });
});
