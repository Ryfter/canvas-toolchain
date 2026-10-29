import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadColumnMap, saveColumnMap } from '../src/peoplesoft/column-map.js';
import type { ColumnMapping } from '../src/types.js';

let home: string;
beforeEach(() => { home = mkdtempSync(join(tmpdir(), 'roster-cm-')); });
afterEach(() => { rmSync(home, { recursive: true, force: true }); });

const map: ColumnMapping = {
  studentNumber: 'Student ID', email: 'Email', userId: 'NetID', name: 'Name', major: 'Plan',
};

describe('column map', () => {
  it('returns null when none saved', () => { expect(loadColumnMap(home)).toBeNull(); });
  it('round-trips a saved mapping', () => {
    saveColumnMap(home, map);
    expect(loadColumnMap(home)).toEqual(map);
  });
  it('reads and writes <configDir>/roster-vault/column-map.json, nowhere else', () => {
    const other = mkdtempSync(join(tmpdir(), 'roster-cm-other-'));
    try {
      expect(saveColumnMap(home, map)).toBe(join(home, 'roster-vault', 'column-map.json'));
      expect(loadColumnMap(other)).toBeNull();
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });
});
