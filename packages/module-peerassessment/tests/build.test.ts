import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildPeerAssessmentImport } from '../src/build.js';
import type { PaGroup, PaCanvasUser } from '../src/types.js';

const ORIG = process.env.CC_HOME;
let home: string;
beforeEach(() => { home = mkdtempSync(join(tmpdir(), 'pa-build-')); process.env.CC_HOME = home; });
afterEach(() => { if (ORIG === undefined) delete process.env.CC_HOME; else process.env.CC_HOME = ORIG; });

const groups: PaGroup[] = [
  { name: 'Team 1', members: [
    { canvasId: '100', name: 'Jane Public', sortableName: 'Public, Jane', email: 'jane@u.edu', loginId: 'jpublic', sisUserId: '900111' },
  ] },
];
const allStudents: PaCanvasUser[] = [
  { canvasId: '100', name: 'Jane Public' },
  { canvasId: '200', name: 'Bob Roe' },
];

describe('buildPeerAssessmentImport', () => {
  it('writes the CSV and reports rows, ungrouped, and warnings', () => {
    const report = buildPeerAssessmentImport({
      courseId: '5', groupSetName: 'Project Teams', groups, allStudents,
      sources: { vaultIndex: new Map(), peopleSoftIndex: null },
    });
    expect(report.rowsWritten).toBe(1);
    expect(report.totalStudents).toBe(1);
    expect(report.ungrouped).toEqual([{ name: 'Bob Roe', canvasId: '200' }]);
    expect(report.outputPath).not.toBeNull();
    expect(existsSync(report.outputPath as string)).toBe(true);
    expect(readFileSync(report.outputPath as string, 'utf-8')).toContain('Team 1,jpublic,jane@u.edu,Jane,Public,900111');
    expect(report.warnings[0]).toMatch(/FERPA/);
    expect(report.warnings.some((w) => /No PeopleSoft export/.test(w))).toBe(true);
  });

  it('dryRun writes nothing but still reports', () => {
    const report = buildPeerAssessmentImport({
      courseId: '5', groupSetName: 'Project Teams', groups, allStudents,
      sources: { vaultIndex: new Map(), peopleSoftIndex: null }, dryRun: true,
    });
    expect(report.outputPath).toBeNull();
    expect(report.rowsWritten).toBe(0);
    expect(report.totalStudents).toBe(1);
    expect(existsSync(join(home, 'peerassessment'))).toBe(false);
  });

  it('honors a custom outputDir', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pa-custom-'));
    const report = buildPeerAssessmentImport({
      courseId: '5', groupSetName: 'P', groups, allStudents,
      sources: { vaultIndex: new Map(), peopleSoftIndex: null }, outputDir: dir,
    });
    expect(report.outputPath).toBe(join(dir, 'peerassessment-import-5-P.csv'));
    expect(readdirSync(dir)).toContain('peerassessment-import-5-P.csv');
  });

  it('writes no file when there are zero rows', () => {
    const report = buildPeerAssessmentImport({
      courseId: '5', groupSetName: 'P', groups: [], allStudents,
      sources: { vaultIndex: new Map(), peopleSoftIndex: null },
    });
    expect(report.outputPath).toBeNull();
    expect(report.rowsWritten).toBe(0);
  });
});
