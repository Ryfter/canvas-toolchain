import { describe, it, expect } from 'vitest';
import { findIncomplete, findUngrouped, findDuplicateEmails, findMultiGrouped } from '../src/report.js';
import type { ResolvedMember } from '../src/join/resolve.js';
import type { PaCanvasUser } from '../src/types.js';

const rm = (canvasId: string, name: string, row: Partial<ResolvedMember['row']>): ResolvedMember => ({
  member: { canvasId, name },
  row: { team: 'T', loginId: 'l', email: 'e@e', firstName: 'F', lastName: 'L', studentId: 's', ...row },
});

describe('findIncomplete', () => {
  it('lists the human labels of blank required columns', () => {
    const out = findIncomplete([rm('100', 'Jane', { loginId: '', studentId: '' })]);
    expect(out).toEqual([{ name: 'Jane', canvasId: '100', missing: ['Login ID', 'Student ID #'] }]);
  });
  it('omits complete rows', () => {
    expect(findIncomplete([rm('100', 'Jane', {})])).toEqual([]);
  });
});

describe('findUngrouped', () => {
  it('returns enrolled students not present in any group', () => {
    const all: PaCanvasUser[] = [{ canvasId: '100', name: 'Jane' }, { canvasId: '200', name: 'Bob' }];
    const grouped = [rm('100', 'Jane', {})];
    expect(findUngrouped(all, grouped)).toEqual([{ name: 'Bob', canvasId: '200' }]);
  });
});

describe('findDuplicateEmails', () => {
  it('flags emails shared by more than one row, case-insensitively', () => {
    const out = findDuplicateEmails([
      rm('100', 'Jane', { email: 'dup@u.edu' }),
      rm('200', 'Bob', { email: 'DUP@u.edu' }),
      rm('300', 'Sue', { email: 'unique@u.edu' }),
    ]);
    expect(out).toEqual([{ email: 'dup@u.edu', names: ['Jane', 'Bob'] }]);
  });
  it('ignores blank emails', () => {
    expect(findDuplicateEmails([rm('100', 'Jane', { email: '' }), rm('200', 'Bob', { email: '' })])).toEqual([]);
  });
});

describe('findDuplicateEmails — same student in two groups', () => {
  it('does NOT flag one canvas_id appearing twice as a duplicate email', () => {
    const out = findDuplicateEmails([
      { member: { canvasId: '100', name: 'Jane' }, row: { team: 'T1', loginId: 'l', email: 'jane@u.edu', firstName: 'F', lastName: 'L', studentId: 's' } },
      { member: { canvasId: '100', name: 'Jane' }, row: { team: 'T2', loginId: 'l', email: 'jane@u.edu', firstName: 'F', lastName: 'L', studentId: 's' } },
    ]);
    expect(out).toEqual([]);
  });
});

describe('findMultiGrouped', () => {
  it('flags a student whose canvas_id appears in more than one team', () => {
    const out = findMultiGrouped([
      { member: { canvasId: '100', name: 'Jane' }, row: { team: 'T1', loginId: 'l', email: 'e@e', firstName: 'F', lastName: 'L', studentId: 's' } },
      { member: { canvasId: '100', name: 'Jane' }, row: { team: 'T2', loginId: 'l', email: 'e@e', firstName: 'F', lastName: 'L', studentId: 's' } },
      { member: { canvasId: '200', name: 'Bob' }, row: { team: 'T1', loginId: 'l', email: 'b@e', firstName: 'F', lastName: 'L', studentId: 's' } },
    ]);
    expect(out).toEqual([{ canvasId: '100', name: 'Jane', teams: ['T1', 'T2'] }]);
  });
});
