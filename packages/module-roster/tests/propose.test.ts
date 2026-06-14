import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { proposeRoster } from '../src/propose.js';
import { saveVault } from '../src/vault/store.js';
import { vaultPath } from '../src/paths.js';
import type { CanvasUser, PeopleSoftRow } from '../src/types.js';
import type { LlmClient } from '@canvas-toolchain/shared-llm';

let home: string;
beforeEach(() => { home = mkdtempSync(join(tmpdir(), 'roster-propose-')); process.env.CC_HOME = home; });
afterEach(() => { delete process.env.CC_HOME; rmSync(home, { recursive: true, force: true }); });

const ps = (o: Partial<PeopleSoftRow>): PeopleSoftRow =>
  ({ studentNumber: '', email: '', userId: '', name: '', rawMajor: '', ...o });
const cu = (o: Partial<CanvasUser>): CanvasUser => ({ canvasId: '', name: '', ...o });
const idLlm: LlmClient = { complete: async (_s, u) => {
  const raws = JSON.parse(u.slice(u.indexOf('['))) as string[];
  return { text: JSON.stringify(Object.fromEntries(raws.map((r) => [r, r.toUpperCase()]))) };
} };

describe('proposeRoster', () => {
  it('matches, assigns pseudonyms, normalizes majors, and writes nothing', async () => {
    saveVault([{ studentNumber: '100', canvasId: '900', pseudonym: 'SU26-001', firstSeenTerm: 'SU26' }]);
    const report = await proposeRoster({
      term: 'FA26', courseId: '123',
      peopleSoft: [ps({ studentNumber: '100', name: 'Jane Doe', rawMajor: 'marketing' }),
                   ps({ studentNumber: '200', name: 'Bob Roe', rawMajor: 'accounting' })],
      canvasUsers: [cu({ canvasId: '900', sisUserId: '100', name: 'Jane Doe' }),
                    cu({ canvasId: '901', sisUserId: '200', name: 'Bob Roe' })],
      llm: idLlm, aliases: {},
    });
    const by = (sn: string) => report.rows.find((r) => r.studentNumber === sn)!;
    expect(by('100')).toMatchObject({ pseudonym: 'SU26-001', returning: true, canonicalMajor: 'MARKETING' });
    expect(by('200')).toMatchObject({ pseudonym: 'FA26-001', returning: false });
    expect(report.llmUsed).toBe(true);
    // The proposal NEVER writes the roster, and the vault is only the pre-seeded one.
    expect(existsSync(vaultPath())).toBe(true);          // pre-seeded, unchanged
    expect(report.rows).toHaveLength(2);
  });

  it('surfaces collisions, ambiguity, and unmatched both directions', async () => {
    saveVault([{ studentNumber: '100', canvasId: '900', pseudonym: 'SU26-001', firstSeenTerm: 'SU26' }]);
    const report = await proposeRoster({
      term: 'FA26', courseId: '123',
      peopleSoft: [
        ps({ studentNumber: '100', name: 'Jane Doe' }),         // collision: now canvas 999
        ps({ studentNumber: 'z', name: 'Twin Name' }),          // ambiguous
        ps({ studentNumber: 'ghost', name: 'No Canvas' }),      // unmatched PS
      ],
      canvasUsers: [
        cu({ canvasId: '999', sisUserId: '100', name: 'Jane Doe' }),
        cu({ canvasId: '500', name: 'Twin Name' }), cu({ canvasId: '501', name: 'Twin Name' }),
        cu({ canvasId: '700', sisUserId: 'extra', name: 'Only In Canvas' }),
      ],
      llm: null, aliases: {},
    });
    expect(report.collisions[0]).toMatchObject({ studentNumber: '100', vaultCanvasId: '900', incomingCanvasId: '999' });
    expect(report.ambiguous).toHaveLength(1);
    expect(report.unmatchedPeopleSoft.map((p) => p.studentNumber)).toContain('ghost');
    expect(report.unmatchedCanvas.map((c) => c.canvasId)).toContain('700');
    expect(report.llmUsed).toBe(false);                  // passthrough
  });

  it('warns when no Canvas user carries a sis_user_id or login_id', async () => {
    const report = await proposeRoster({
      term: 'FA26', courseId: '123',
      peopleSoft: [ps({ studentNumber: '100', email: 'a@x.edu', name: 'Jane Doe' })],
      canvasUsers: [cu({ canvasId: '900', email: 'a@x.edu', name: 'Jane Doe' })], // no sis/login
      llm: null, aliases: {},
    });
    expect(report.warnings.some((w) => /sis_user_id or login_id/.test(w))).toBe(true);
  });
});
