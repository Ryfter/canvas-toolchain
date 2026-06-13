import { describe, it, expect } from 'vitest';
import { getStrategy, STRATEGY_IDS } from '../../src/strategies/index.js';

describe('strategy registry', () => {
  it('resolves all six ids', () => {
    expect(STRATEGY_IDS).toEqual(['random', 'alphabetical', 'weighted', 'heterogeneous', 'homogeneous', 'major-diversity']);
    for (const id of STRATEGY_IDS) expect(getStrategy(id).id).toBe(id);
  });
  it('throws on unknown id', () => {
    expect(() => getStrategy('nope' as never)).toThrow(/unknown strategy/i);
  });
});
