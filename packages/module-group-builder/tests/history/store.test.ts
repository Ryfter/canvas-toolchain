import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadHistory, appendGrouping, pairKey } from '../../src/history/store.js';

let home: string; const saved = process.env.CC_HOME;
afterEach(() => { if (home) rmSync(home, { recursive: true, force: true }); if (saved === undefined) delete process.env.CC_HOME; else process.env.CC_HOME = saved; });

describe('pairing-history store', () => {
  it('starts empty, records pairs from a committed grouping', () => {
    home = mkdtempSync(join(tmpdir(), 'gb-hist-')); process.env.CC_HOME = home;
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
