import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderImportCsv, writeImportCsv } from '../src/output.js';
import type { PeerAssessmentRow } from '../src/types.js';

const rows: PeerAssessmentRow[] = [
  { team: 'Team 1', loginId: 'jpublic', email: 'jane@u.edu', firstName: 'Jane', lastName: 'Public', studentId: '900111' },
];

describe('renderImportCsv', () => {
  it('emits the exact PeerAssessment header then one row per student', () => {
    const csv = renderImportCsv(rows);
    expect(csv).toBe(
      'Team,Login ID,Email,First Name,Last Name,Student ID #\n' +
      'Team 1,jpublic,jane@u.edu,Jane,Public,900111\n',
    );
  });
  it('RFC-4180 escapes commas, quotes, and newlines', () => {
    const csv = renderImportCsv([
      { team: 'A,B', loginId: 'x', email: 'e@e', firstName: 'Jo "JJ"', lastName: 'Line\nBreak', studentId: '1' },
    ]);
    expect(csv).toContain('"A,B",x,e@e,"Jo ""JJ""","Line\nBreak",1');
  });
  it('neutralizes formula-injection leading characters', () => {
    const csv = renderImportCsv([
      { team: 'T', loginId: 'x', email: 'e@e', firstName: '=cmd()', lastName: '+evil', studentId: '1' },
    ]);
    expect(csv).toContain("T,x,e@e,'=cmd(),'+evil,1");
  });
});

describe('writeImportCsv', () => {
  it('creates parent dirs and writes the file, returning the path', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pa-out-'));
    const path = join(dir, 'nested', 'import.csv');
    const written = writeImportCsv(path, rows);
    expect(written).toBe(path);
    expect(readFileSync(path, 'utf-8')).toBe(renderImportCsv(rows));
  });
});
