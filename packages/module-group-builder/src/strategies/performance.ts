import type { Strategy, StrategyOpts } from './types.js';
import { chunkBySizes } from './types.js';
import type { Grouping, StudentRecord } from '../types.js';

function metricOf(r: StudentRecord, opts: StrategyOpts): number {
  return r.metrics[opts.metric ?? 'overallGrade'] ?? 0;
}
function sortedDesc(records: StudentRecord[], opts: StrategyOpts): StudentRecord[] {
  return [...records].sort((a, b) => metricOf(b, opts) - metricOf(a, opts));
}

/** Snake-draft sorted students across groups so each group spans the range. */
export const heterogeneousStrategy: Strategy = {
  id: 'heterogeneous',
  generateCandidate(records, spec, _rng, opts) {
    const ordered = sortedDesc(records, opts);
    const groups: string[][] = Array.from({ length: spec.groupCount }, () => []);
    let dir = 1, g = 0;
    for (const r of ordered) {
      groups[g].push(r.canvasId);
      if (dir === 1 && g === spec.groupCount - 1) dir = -1;
      else if (dir === -1 && g === 0) dir = 1;
      else g += dir;
    }
    return groups;
  },
  misfit(grouping, records, opts) {
    // lower variance of per-group mean => better spread => lower misfit
    return groupMeanVariance(grouping, records, opts);
  },
};

export const homogeneousStrategy: Strategy = {
  id: 'homogeneous',
  generateCandidate(records, spec, _rng, opts) {
    const ids = sortedDesc(records, opts).map((r) => r.canvasId);
    return chunkBySizes(ids, spec.targetSizes);
  },
  misfit(grouping, records, opts) {
    // higher within-group similarity => lower misfit; use negative of between-group spread
    return -groupMeanVariance(grouping, records, opts);
  },
};

function groupMeanVariance(grouping: Grouping, records: StudentRecord[], opts: StrategyOpts): number {
  const byId = new Map(records.map((r) => [r.canvasId, r] as const));
  const means = grouping.map((grp) => {
    if (grp.length === 0) return 0;
    return grp.reduce((s, id) => s + metricOf(byId.get(id)!, opts), 0) / grp.length;
  });
  const overall = means.reduce((s, m) => s + m, 0) / (means.length || 1);
  return means.reduce((s, m) => s + (m - overall) ** 2, 0) / (means.length || 1);
}
