import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadMajorAliases, saveMajorAliases } from '../src/major/aliases.js';

let home: string;
beforeEach(() => { home = mkdtempSync(join(tmpdir(), 'roster-alias-')); });
afterEach(() => { rmSync(home, { recursive: true, force: true }); });

describe('major aliases', () => {
  it('returns {} when none saved', () => { expect(loadMajorAliases(home)).toEqual({}); });
  it('round-trips a saved alias map', () => {
    saveMajorAliases(home, { 'Bus Admin: Marketing': 'Marketing' });
    expect(loadMajorAliases(home)).toEqual({ 'Bus Admin: Marketing': 'Marketing' });
  });
});
