import { describe, it, expect } from 'vitest';
import { repeatPairingPenalty, sizeImbalancePenalty, repeatPairs } from '../../src/engine/penalties.js';
import { pairKey } from '../../src/history/store.js';

describe('penalties', () => {
  it('repeatPairingPenalty sums history counts for pairs present in the candidate', () => {
    const history = { pairCounts: { [pairKey('1', '2')]: 2, [pairKey('3', '4')]: 1 } };
    const grouping = [['1', '2'], ['3', '5']]; // 1-2 repeats (2), 3-5 new
    expect(repeatPairingPenalty(grouping, history)).toBe(2);
    expect(repeatPairs(grouping, history)).toEqual([['1', '2']]);
  });
  it('sizeImbalancePenalty is 0 when sizes match targets', () => {
    expect(sizeImbalancePenalty([['1', '2'], ['3']], [2, 1])).toBe(0);
    expect(sizeImbalancePenalty([['1'], ['2', '3']], [2, 1])).toBeGreaterThan(0);
  });
});
