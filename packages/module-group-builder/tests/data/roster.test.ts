import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseRosterFile } from '../../src/data/roster.js';

let dir: string;
afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

describe('parseRosterFile', () => {
  it('parses canvas_id,pseudonym,major + extra numeric metric columns', () => {
    dir = mkdtempSync(join(tmpdir(), 'gb-roster-'));
    const p = join(dir, 'roster.csv');
    writeFileSync(p, 'canvas_id,pseudonym,major,priorReview\n101,SU26-001,IT Management,4.2\n102,SU26-002,Marketing,3.8\n');
    const rows = parseRosterFile(p);
    expect(rows).toEqual([
      { canvasId: '101', pseudonym: 'SU26-001', major: 'IT Management', metrics: { priorReview: 4.2 } },
      { canvasId: '102', pseudonym: 'SU26-002', major: 'Marketing', metrics: { priorReview: 3.8 } },
    ]);
  });
  it('throws when canvas_id or pseudonym column is missing', () => {
    dir = mkdtempSync(join(tmpdir(), 'gb-roster-'));
    const p = join(dir, 'bad.csv');
    writeFileSync(p, 'name,major\nAda,IT\n');
    expect(() => parseRosterFile(p)).toThrow(/canvas_id.*pseudonym/i);
  });
});
