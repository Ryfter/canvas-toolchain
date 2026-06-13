import { describe, it, expect } from 'vitest';
import { chunkBySizes } from '../../src/strategies/types.js';

describe('chunkBySizes', () => {
  it('splits an ordered id list into groups of the target sizes', () => {
    expect(chunkBySizes(['a', 'b', 'c', 'd', 'e'], [2, 2, 1])).toEqual([['a', 'b'], ['c', 'd'], ['e']]);
  });
});
