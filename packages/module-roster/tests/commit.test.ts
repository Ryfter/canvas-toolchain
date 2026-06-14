import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { commitRoster } from '../src/commit.js';
import { loadVault, saveVault } from '../src/vault/store.js';
import type { ProposalReport, ProposalRow } from '../src/types.js';

let home: string;
beforeEach(() => { home = mkdtempSync(join(tmpdir(), 'roster-commit-')); process.env.CC_HOME = home; });
afterEach(() => { delete process.env.CC_HOME; rmSync(home, { recursive: true, force: true }); });

const row = (o: Partial<ProposalRow>): ProposalRow => ({
  studentNumber: '', canvasId: '', pseudonym: '', returning: false,
  matchedOn: 'student_number', rawMajor: '', canonicalMajor: '', ...o,
});
const report = (rows: ProposalRow[]): ProposalReport => ({
  term: 'FA26', courseId: '123', rows, ambiguous: [], unmatchedPeopleSoft: [],
  unmatchedCanvas: [], majorMap: {}, collisions: [], llmUsed: false, warnings: [],
});

describe('commitRoster', () => {
  it('writes the roster CSV and inserts only new vault records', () => {
    saveVault([{ studentNumber: '100', canvasId: '900', pseudonym: 'SU26-001', firstSeenTerm: 'SU26' }]);
    const out = join(home, 'roster.csv');
    const r = commitRoster(report([
      row({ studentNumber: '100', canvasId: '900', pseudonym: 'SU26-001', returning: true, canonicalMajor: 'Marketing' }),
      row({ studentNumber: '200', canvasId: '901', pseudonym: 'FA26-001', returning: false, canonicalMajor: 'Accounting' }),
    ]), out);

    expect(existsSync(out)).toBe(true);
    expect(readFileSync(out, 'utf-8')).toContain('901,FA26-001,Accounting');
    expect(r.rowsWritten).toBe(2);
    expect(r.vaultAdded).toBe(1);
    const vault = loadVault();
    expect(vault.map((v) => v.studentNumber).sort()).toEqual(['100', '200']);
  });

  it('is safe to re-commit: returning students are not duplicated or re-numbered', () => {
    saveVault([{ studentNumber: '100', canvasId: '900', pseudonym: 'SU26-001', firstSeenTerm: 'SU26' }]);
    const out = join(home, 'roster.csv');
    const rep = report([row({ studentNumber: '100', canvasId: '900', pseudonym: 'SU26-001', returning: true })]);
    commitRoster(rep, out);
    const r2 = commitRoster(rep, out);
    expect(r2.vaultAdded).toBe(0);
    expect(loadVault()).toHaveLength(1);
  });

  it('refuses to commit when unresolved collisions are present', () => {
    const rep = report([row({ studentNumber: '100', canvasId: '999', pseudonym: 'SU26-001' })]);
    rep.collisions = [{ studentNumber: '100', vaultCanvasId: '900', incomingCanvasId: '999' }];
    expect(() => commitRoster(rep, join(home, 'roster.csv'))).toThrow(/collision/i);
  });

  it('refuses to commit when a row collides with the live vault even if report.collisions is empty', () => {
    saveVault([{ studentNumber: '100', canvasId: '900', pseudonym: 'SU26-001', firstSeenTerm: 'SU26' }]);
    const rep = report([row({ studentNumber: '100', canvasId: '999', pseudonym: 'SU26-001' })]); // collisions: []
    expect(() => commitRoster(rep, join(home, 'roster.csv'))).toThrow(/collision/i);
  });
});
