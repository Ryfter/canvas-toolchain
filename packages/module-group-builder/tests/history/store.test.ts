import { describe, it, expect, afterEach } from 'vitest';
import { initFake } from "../helpers/fake-ctx.js";
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadHistory, appendGrouping, pairKey } from '../../src/history/store.js';

let home: string;
afterEach(() => { if (home) rmSync(home, { recursive: true, force: true }); });

describe('pairing-history store', () => {
  it('starts empty, records pairs from a committed grouping', () => {
    home = mkdtempSync(join(tmpdir(), 'gb-hist-')); initFake(home);
    expect(loadHistory('5').pairCounts).toEqual({});
    appendGrouping('5', [['1', '2', '3'], ['4', '5']]);
    const h = loadHistory('5');
    expect(h.pairCounts[pairKey('1', '2')]).toBe(1);
    expect(h.pairCounts[pairKey('2', '3')]).toBe(1);
    expect(h.pairCounts[pairKey('4', '5')]).toBe(1);
    expect(h.pairCounts[pairKey('1', '4')]).toBeUndefined();
    appendGrouping('5', [['1', '2'], ['3', '4', '5']]);
    expect(loadHistory('5').pairCounts[pairKey('1', '2')]).toBe(2);
  });
});
