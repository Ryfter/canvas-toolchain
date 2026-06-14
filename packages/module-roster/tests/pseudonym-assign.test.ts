import { describe, it, expect } from 'vitest';
import { nextSequence, assignPseudonyms } from '../src/pseudonym/assign.js';
import type { MatchedStudent, VaultRecord } from '../src/types.js';

const m = (sn: string, cid: string, name = 'X'): MatchedStudent =>
  ({ ps: { studentNumber: sn, email: '', userId: '', name, rawMajor: '' }, canvas: { canvasId: cid, name }, matchedOn: 'student_number' });
const v = (sn: string, cid: string, p: string, term: string): VaultRecord =>
  ({ studentNumber: sn, canvasId: cid, pseudonym: p, firstSeenTerm: term });

describe('pseudonym assignment', () => {
  it('nextSequence is 1 past the highest existing number for the given prefix', () => {
    expect(nextSequence([], 'FA26')).toBe(1);
    expect(nextSequence([v('1', '9', 'SU26-007', 'SU26'), v('2', '8', 'FA26-003', 'FA26')], 'FA26')).toBe(4);
    expect(nextSequence([v('1', '9', 'SU26-007', 'SU26')], 'FA26')).toBe(1); // different prefix
  });

  it('returning students keep their pseudonym; new students number within the term', () => {
    const vault = [v('100', '900', 'SU26-001', 'SU26')];
    const { assignments, newRecords } = assignPseudonyms(
      [m('100', '900'), m('200', '901'), m('201', '902')], vault, 'FA26',
    );
    const a = (sn: string) => assignments.find((x) => x.studentNumber === sn)!;
    expect(a('100')).toMatchObject({ pseudonym: 'SU26-001', returning: true });
    expect(a('200')).toMatchObject({ pseudonym: 'FA26-001', returning: false });
    expect(a('201')).toMatchObject({ pseudonym: 'FA26-002', returning: false });
    expect(newRecords.map((r) => r.studentNumber).sort()).toEqual(['200', '201']);
    expect(newRecords[0].firstSeenTerm).toBe('FA26');
  });

  it('pads the sequence to three digits', () => {
    const { assignments } = assignPseudonyms([m('1', '9')], [], 'SP27');
    expect(assignments[0].pseudonym).toBe('SP27-001');
  });
});
