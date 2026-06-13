import type { Strategy, StrategyOpts } from './types.js';
import type { StudentRecord } from '../types.js';
import { heterogeneousStrategy, homogeneousStrategy } from './performance.js';

const DEFAULT_WEIGHTS: Record<string, number> = {
  priorReview: 0.4, attendance: 0.3, assignmentsCompleted: 0.2, overallGrade: 0.1,
};

export function compositeScore(r: StudentRecord, weights: Record<string, number>): number {
  const present = Object.entries(weights).filter(([k]) => typeof r.metrics[k] === 'number');
  const total = present.reduce((s, [, w]) => s + w, 0);
  if (total === 0) return 0;
  return present.reduce((s, [k, w]) => s + (w / total) * (r.metrics[k] as number), 0);
}

export const weightedStrategy: Strategy = {
  id: 'weighted',
  generateCandidate(records, spec, rng, opts) {
    const weights = opts.weights ?? DEFAULT_WEIGHTS;
    const scored: StudentRecord[] = records.map((r) => ({ ...r, metrics: { ...r.metrics, __composite: compositeScore(r, weights) } }));
    const inner = opts.weightedMode === 'cluster' ? homogeneousStrategy : heterogeneousStrategy;
    return inner.generateCandidate(scored, spec, rng, { metric: '__composite' });
  },
  misfit(grouping, records, opts) {
    const weights = opts.weights ?? DEFAULT_WEIGHTS;
    const scored: StudentRecord[] = records.map((r) => ({ ...r, metrics: { ...r.metrics, __composite: compositeScore(r, weights) } }));
    const inner = opts.weightedMode === 'cluster' ? homogeneousStrategy : heterogeneousStrategy;
    return inner.misfit(grouping, scored, { metric: '__composite' });
  },
};
