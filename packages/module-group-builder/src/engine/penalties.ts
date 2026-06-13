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
  let p = 0;
  for (let i = 0; i < Math.max(grouping.length, targetSizes.length); i++)
    p += Math.abs((grouping[i]?.length ?? 0) - (targetSizes[i] ?? 0));
  return p;
}
