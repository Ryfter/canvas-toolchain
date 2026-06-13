import { describe, it, expect } from 'vitest';
import { optimize } from '../../src/engine/optimize.js';
import { getStrategy } from '../../src/strategies/index.js';
import type { StudentRecord } from '../../src/types.js';
import { pairKey } from '../../src/history/store.js';

const recs: StudentRecord[] = ['1', '2', '3', '4'].map((id) => ({ canvasId: id, pseudonym: `S${id}`, metrics: {} }));

describe('optimize', () => {
  it('is reproducible for a fixed seed', () => {
    const a = optimize({ records: recs, spec: { groupCount: 2, targetSizes: [2, 2] }, strategy: getStrategy('random'), history: { pairCounts: {} }, opts: {}, seed: 9, iterations: 50 });
    const b = optimize({ records: recs, spec: { groupCount: 2, targetSizes: [2, 2] }, strategy: getStrategy('random'), history: { pairCounts: {} }, opts: {}, seed: 9, iterations: 50 });
    expect(a.grouping).toEqual(b.grouping);
  });
  it('avoids a known repeat pairing when an alternative exists', () => {
    const history = { pairCounts: { [pairKey('1', '2')]: 5, [pairKey('3', '4')]: 5 } };
    const { grouping, diagnostics } = optimize({ records: recs, spec: { groupCount: 2, targetSizes: [2, 2] }, strategy: getStrategy('random'), history, opts: {}, seed: 3, iterations: 200 });
    const grpOf = (id: string) => grouping.findIndex((g) => g.includes(id));
    expect(grpOf('1')).not.toBe(grpOf('2')); // optimizer split the penalized pair
    expect(diagnostics.repeatPairs).toEqual([]);
  });
});
