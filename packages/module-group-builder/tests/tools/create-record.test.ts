import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createGroups } from '../../src/run.js';
import { loadHistory } from '../../src/history/store.js';
import { groupBuilderTools } from '../../src/tools.js';

let home: string; const saved = process.env.CC_HOME;
afterEach(() => { if (home) rmSync(home, { recursive: true, force: true }); if (saved === undefined) delete process.env.CC_HOME; else process.env.CC_HOME = saved; });

function fakeClient() {
  return {
    async listStudentEnrollments() { return [
      { user_id: 1, grades: { current_score: 95 } }, { user_id: 2, grades: { current_score: 60 } },
      { user_id: 3, grades: { current_score: 80 } }, { user_id: 4, grades: { current_score: 70 } },
    ]; },
    async listSubmissions() { return []; },
    async createGroupCategory() { throw new Error('should not push'); },
    async createGroup() { throw new Error('no'); },
    async addGroupMember() { throw new Error('no'); },
  };
}

describe('createGroups orchestration', () => {
  it('writes a CSV + markdown, returns diagnostics, does NOT mutate history', async () => {
    home = mkdtempSync(join(tmpdir(), 'gb-run-')); process.env.CC_HOME = home;
    const roster = join(home, 'roster.csv');
    writeFileSync(roster, 'canvas_id,pseudonym,major\n1,SU26-001,IT\n2,SU26-002,Marketing\n3,SU26-003,Accounting\n4,SU26-004,Finance\n');
    const out = join(home, 'out');
    const res = await createGroups({ courseId: '5', strategy: 'heterogeneous', groupCount: 2, rosterFile: roster, outputDir: out, seed: 1 }, { client: fakeClient() as never });
    expect(existsSync(res.csvPath)).toBe(true);
    expect(existsSync(res.markdownPath)).toBe(true);
    expect(res.diagnostics.groupCount).toBe(2);
    expect(readFileSync(res.csvPath, 'utf-8')).toContain('group,pseudonym,canvas_id');
    expect(loadHistory('5').pairCounts).toEqual({}); // preview-safe
  });
});

describe('record_groups tool', () => {
  it('appends a grouping to history (so the next createGroups sees the pairs)', async () => {
    home = mkdtempSync(join(tmpdir(), 'gb-rec-')); process.env.CC_HOME = home;
    const tool = groupBuilderTools.find((t) => t.schema.name === 'record_groups')!;
    expect(loadHistory('7').pairCounts).toEqual({});
    const res = await tool.handler({ courseId: '7', grouping: [['1', '2'], ['3', '4']] });
    expect((res.content[0] as { text: string }).text).toContain('pairing-history.json');
    const history = loadHistory('7');
    expect(history.pairCounts['1|2']).toBe(1);
    expect(history.pairCounts['3|4']).toBe(1);
  });
});
