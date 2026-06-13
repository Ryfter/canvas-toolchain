import type { Strategy, StrategyOpts } from './types.js';
import type { Grouping, StudentRecord } from '../types.js';
import { shuffle } from '../rng.js';

function bucketOf(r: StudentRecord, opts: StrategyOpts): string {
  const map = opts.majorBuckets ?? {};
  return (r.major && map[r.major]) || 'other';
}

export const majorDiversityStrategy: Strategy = {
  id: 'major-diversity',
  generateCandidate(records, spec, rng, opts) {
    // Bucket -> shuffled queue of ids; round-robin deal one bucket at a time across groups.
    const byBucket = new Map<string, string[]>();
    for (const r of shuffle(records, rng)) {
      const b = bucketOf(r, opts);
      (byBucket.get(b) ?? byBucket.set(b, []).get(b)!).push(r.canvasId);
    }
    const groups: string[][] = Array.from({ length: spec.groupCount }, () => []);
    let g = 0;
    // deal bucket by bucket so same-bucket members spread across distinct groups first
    for (const queue of byBucket.values()) {
      for (const id of queue) { groups[g % spec.groupCount].push(id); g++; }
    }
    return rebalance(groups, spec.targetSizes);
  },
  misfit(grouping, records, opts) {
    // fewer same-bucket collisions within a group => lower misfit
    const byId = new Map(records.map((r) => [r.canvasId, r] as const));
    let collisions = 0;
    for (const grp of grouping) {
      const seen = new Map<string, number>();
      for (const id of grp) {
        const b = bucketOf(byId.get(id)!, opts);
        const c = (seen.get(b) ?? 0); collisions += c; seen.set(b, c + 1);
      }
    }
    return collisions;
  },
};

/** Move members between groups so sizes match targetSizes (greedy). */
function rebalance(groups: Grouping, targetSizes: number[]): Grouping {
  const flat = groups.flat();
  const out: Grouping = [];
  let i = 0;
  for (const s of targetSizes) { out.push(flat.slice(i, i + s)); i += s; }
  return out;
}
