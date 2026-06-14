import { describe, it, expect } from 'vitest';
import { resolveRow, resolveMembers, type ResolveSources } from '../src/join/resolve.js';
import type { PaCanvasUser, PaGroup } from '../src/types.js';
import type { PeopleSoftRow } from '@canvas-toolchain/module-roster';

const ps = (over: Partial<PeopleSoftRow>): PeopleSoftRow => ({
  studentNumber: '900111', email: 'ps@u.edu', userId: 'psnetid', name: 'Public, Jane', rawMajor: 'IT', ...over,
});

describe('resolveRow', () => {
  it('prefers Canvas fields when present', () => {
    const m: PaCanvasUser = { canvasId: '100', name: 'Jane Public', sortableName: 'Public, Jane',
      email: 'canvas@u.edu', loginId: 'canvasnet', sisUserId: '900111' };
    const src: ResolveSources = { vaultIndex: new Map(), peopleSoftIndex: null };
    expect(resolveRow('Team 1', m, src)).toEqual({
      team: 'Team 1', loginId: 'canvasnet', email: 'canvas@u.edu',
      firstName: 'Jane', lastName: 'Public', studentId: '900111',
    });
  });

  it('fills Login ID / email / name from PeopleSoft when Canvas withholds them', () => {
    const m: PaCanvasUser = { canvasId: '100', name: '' };
    const src: ResolveSources = {
      vaultIndex: new Map([['100', '900111']]),
      peopleSoftIndex: new Map([['900111', ps({})]]),
    };
    expect(resolveRow('Team 1', m, src)).toEqual({
      team: 'Team 1', loginId: 'psnetid', email: 'ps@u.edu',
      firstName: 'Jane', lastName: 'Public', studentId: '900111',
    });
  });

  it('fills Student ID# from the vault even with no PeopleSoft file', () => {
    const m: PaCanvasUser = { canvasId: '100', name: 'Jane Public', sortableName: 'Public, Jane', email: 'c@u.edu', loginId: 'cnet' };
    const src: ResolveSources = { vaultIndex: new Map([['100', '900111']]), peopleSoftIndex: null };
    expect(resolveRow('Team 1', m, src).studentId).toBe('900111');
  });

  it('leaves columns blank when no source supplies them', () => {
    const m: PaCanvasUser = { canvasId: '100', name: 'Jane Public', sortableName: 'Public, Jane', email: 'c@u.edu' };
    const src: ResolveSources = { vaultIndex: new Map(), peopleSoftIndex: null };
    const row = resolveRow('Team 1', m, src);
    expect(row.loginId).toBe('');
    expect(row.studentId).toBe('');
  });
});

describe('resolveMembers', () => {
  it('flattens groups, pairing each row with its member', () => {
    const groups: PaGroup[] = [
      { name: 'Team 1', members: [{ canvasId: '100', name: 'Jane Public', sortableName: 'Public, Jane', email: 'j@u.edu', loginId: 'j', sisUserId: '1' }] },
      { name: 'Team 2', members: [{ canvasId: '200', name: 'Bob Roe', sortableName: 'Roe, Bob', email: 'b@u.edu', loginId: 'b', sisUserId: '2' }] },
    ];
    const out = resolveMembers(groups, { vaultIndex: new Map(), peopleSoftIndex: null });
    expect(out.map((r) => r.row.team)).toEqual(['Team 1', 'Team 2']);
    expect(out.map((r) => r.member.canvasId)).toEqual(['100', '200']);
  });
});
