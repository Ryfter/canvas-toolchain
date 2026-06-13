import type { Diagnostics, Grouping, ResolvedGroupSpec, StudentRecord } from '../types.js';
import type { Strategy, StrategyOpts } from '../strategies/types.js';
import type { History } from '../history/store.js';
import { makeRng } from '../rng.js';
import { repeatPairingPenalty, repeatPairs, sizeImbalancePenalty } from './penalties.js';

export interface OptimizeInput {
  records: StudentRecord[];
  spec: ResolvedGroupSpec;
  strategy: Strategy;
  history: History;
  opts: StrategyOpts;
  seed: number;
  iterations?: number;
  weights?: { fit?: number; repeat?: number; size?: number };
}

const DEFAULT_ITERS = 300;
const W = { fit: 1, repeat: 10, size: 5 };

export function optimize(input: OptimizeInput): { grouping: Grouping; diagnostics: Diagnostics } {
  const rng = makeRng(input.seed);
  const iters = input.strategy.id === 'alphabetical' ? 1 : (input.iterations ?? DEFAULT_ITERS);
  const w = { ...W, ...input.weights };

  let best: Grouping | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let i = 0; i < iters; i++) {
    const cand = input.strategy.generateCandidate(input.records, input.spec, rng, input.opts);
    const score =
      w.fit * input.strategy.misfit(cand, input.records, input.opts) +
      w.repeat * repeatPairingPenalty(cand, input.history) +
      w.size * sizeImbalancePenalty(cand, input.spec.targetSizes);
    if (score < bestScore) { bestScore = score; best = cand; }
  }
  const grouping = best ?? [];
  const diagnostics: Diagnostics = {
    strategy: input.strategy.id as Diagnostics['strategy'],
    groupCount: grouping.length,
    sizes: grouping.map((g) => g.length),
    repeatPairs: repeatPairs(grouping, input.history),
    seed: input.seed,
  };
  return { grouping, diagnostics };
}
