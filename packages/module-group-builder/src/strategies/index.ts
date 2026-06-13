import type { Strategy } from './types.js';
import { randomStrategy } from './random.js';
import { alphabeticalStrategy } from './alphabetical.js';
import { weightedStrategy } from './weighted.js';
import { heterogeneousStrategy, homogeneousStrategy } from './performance.js';
import { majorDiversityStrategy } from './major-diversity.js';
import type { StrategyId } from '../types.js';

const REGISTRY: Record<StrategyId, Strategy> = {
  random: randomStrategy,
  alphabetical: alphabeticalStrategy,
  weighted: weightedStrategy,
  heterogeneous: heterogeneousStrategy,
  homogeneous: homogeneousStrategy,
  'major-diversity': majorDiversityStrategy,
};

export const STRATEGY_IDS: StrategyId[] = ['random', 'alphabetical', 'weighted', 'heterogeneous', 'homogeneous', 'major-diversity'];

export function getStrategy(id: StrategyId): Strategy {
  const s = REGISTRY[id];
  if (!s) throw new Error(`Unknown strategy: '${id}'`);
  return s;
}
