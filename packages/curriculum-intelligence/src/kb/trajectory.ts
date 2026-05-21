import type { TrajectoryFlag, Verdict } from '../types.js';

/**
 * Compute the trajectory flag for a topic given its chronological verdict history.
 * History is ordered oldest → newest. The most recent verdict (last element) is the current run.
 *
 * Flag rules (checked in this order — first match wins):
 *   - 1 verdict           → 'new'
 *   - last 4+ all KEEP    → 'true-evergreen'
 *   - last 4 with 2+ changes between adjacent pairs → 'unstable'
 *   - last 3 with exactly 1 change between adjacent pairs → 'stabilising'
 *   - last >=2 unchanged (and not true-evergreen) → 'stable'
 *   - fallback when <3 verdicts but a change is present → 'unstable'
 */
export function computeTrajectoryFlag(history: Verdict[]): TrajectoryFlag {
  if (history.length === 0) {
    throw new Error('computeTrajectoryFlag called with empty history');
  }
  if (history.length === 1) return 'new';

  const last4 = history.slice(-4);
  if (last4.length >= 4 && last4.every((v) => v === 'KEEP')) {
    return 'true-evergreen';
  }

  const changesInLast4 = countAdjacentChanges(last4);
  if (changesInLast4 >= 2) return 'unstable';

  const last3 = history.slice(-3);
  if (last3.length === 3 && countAdjacentChanges(last3) === 1) return 'stabilising';

  if (changesInLast4 === 0) return 'stable';
  return 'unstable';
}

function countAdjacentChanges(verdicts: Verdict[]): number {
  let n = 0;
  for (let i = 1; i < verdicts.length; i++) {
    if (verdicts[i] !== verdicts[i - 1]) n++;
  }
  return n;
}
