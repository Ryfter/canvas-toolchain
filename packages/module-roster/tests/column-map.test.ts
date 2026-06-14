import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadColumnMap, saveColumnMap } from '../src/peoplesoft/column-map.js';
import type { ColumnMapping } from '../src/types.js';

let home: string;
beforeEach(() => { home = mkdtempSync(join(tmpdir(), 'roster-cm-')); process.env.CC_HOME = home; });
afterEach(() => { delete process.env.CC_HOME; rmSync(home, { recursive: true, force: true }); });

const map: ColumnMapping = {
  studentNumber: 'Student ID', email: 'Email', userId: 'NetID', name: 'Name', major: 'Plan',
};

describe('column map', () => {
  it('returns null when none saved', () => { expect(loadColumnMap()).toBeNull(); });
  it('round-trips a saved mapping', () => {
    saveColumnMap(map);
    expect(loadColumnMap()).toEqual(map);
  });
});
