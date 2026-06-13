import type { Grouping, ResolvedGroupSpec, StudentRecord } from '../types.js';

export interface StrategyOpts {
  metric?: string;                         // for heterogeneous/homogeneous (default overallGrade)
  weights?: Record<string, number>;        // for weighted
  weightedMode?: 'balance' | 'cluster';    // default 'balance'
  majorBuckets?: Record<string, string>;   // for major-diversity
}

export interface Strategy {
  id: string;
  generateCandidate(records: StudentRecord[], spec: ResolvedGroupSpec, rng: () => number, opts: StrategyOpts): Grouping;
  /** 0 = perfect fit to the strategy's intent; larger = worse. */
  misfit(grouping: Grouping, records: StudentRecord[], opts: StrategyOpts): number;
}

/** Split an ordered id list into consecutive groups of the given sizes. */
export function chunkBySizes(ids: string[], sizes: number[]): Grouping {
  const out: Grouping = [];
  let i = 0;
  for (const s of sizes) { out.push(ids.slice(i, i + s)); i += s; }
  return out;
}
