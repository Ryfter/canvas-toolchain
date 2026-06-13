import type { Grouping } from '../types.js';
import type { History } from '../history/store.js';
import { pairKey } from '../history/store.js';

export function repeatPairingPenalty(grouping: Grouping, history: History): number {
  let p = 0;
  for (const grp of grouping) {
    for (let i = 0; i < grp.length; i++)
      for (let j = i + 1; j < grp.length; j++)
        p += history.pairCounts[pairKey(grp[i], grp[j])] ?? 0;
  }
  return p;
}

export function repeatPairs(grouping: Grouping, history: History): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const grp of grouping)
    for (let i = 0; i < grp.length; i++)
      for (let j = i + 1; j < grp.length; j++)
        if ((history.pairCounts[pairKey(grp[i], grp[j])] ?? 0) > 0) out.push([grp[i], grp[j]]);
  return out;
}

export function sizeImbalancePenalty(grouping: Grouping, targetSizes: number[]): number {
  // Compare size multisets (sorted descending), not positions: a candidate whose
  // group sizes match the target sizes as a set scores 0 regardless of which index
  // holds the larger group (e.g. snake-draft [3,3,4] vs target [4,3,3] → 0).
  const sizes = grouping.map((g) => g.length).sort((a, b) => b - a);
  const targets = [...targetSizes].sort((a, b) => b - a);
  let p = 0;
  for (let i = 0; i < Math.max(sizes.length, targets.length); i++)
    p += Math.abs((sizes[i] ?? 0) - (targets[i] ?? 0));
  return p;
}
