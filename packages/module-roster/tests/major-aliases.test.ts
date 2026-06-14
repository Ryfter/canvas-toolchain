import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadMajorAliases, saveMajorAliases } from '../src/major/aliases.js';

let home: string;
beforeEach(() => { home = mkdtempSync(join(tmpdir(), 'roster-alias-')); process.env.CC_HOME = home; });
afterEach(() => { delete process.env.CC_HOME; rmSync(home, { recursive: true, force: true }); });

describe('major aliases', () => {
  it('returns {} when none saved', () => { expect(loadMajorAliases()).toEqual({}); });
  it('round-trips a saved alias map', () => {
    saveMajorAliases({ 'Bus Admin: Marketing': 'Marketing' });
    expect(loadMajorAliases()).toEqual({ 'Bus Admin: Marketing': 'Marketing' });
  });
});
