import { describe, it, expect } from 'vitest';
import { matchStudents, normalizeName } from '../src/match/resolver.js';
import type { CanvasUser, PeopleSoftRow } from '../src/types.js';

const ps = (o: Partial<PeopleSoftRow>): PeopleSoftRow =>
  ({ studentNumber: '', email: '', userId: '', name: '', rawMajor: '', ...o });
const cu = (o: Partial<CanvasUser>): CanvasUser =>
  ({ canvasId: '', name: '', ...o });

describe('match resolver', () => {
  it('normalizeName lowercases, trims, and reorders "Last, First"', () => {
    expect(normalizeName('Doe, Jane')).toBe('jane doe');
    expect(normalizeName('  Jane   Doe ')).toBe('jane doe');
  });

  it('matches on student_number first', () => {
    const r = matchStudents(
      [ps({ studentNumber: '100', email: 'a@x.edu', name: 'Jane Doe' })],
      [cu({ canvasId: '900', sisUserId: '100', email: 'z@x.edu', name: 'Someone Else' })],
    );
    expect(r.matched).toHaveLength(1);
    expect(r.matched[0].matchedOn).toBe('student_number');
    expect(r.matched[0].canvas.canvasId).toBe('900');
  });

  it('falls back email -> userId -> name in order', () => {
    const r = matchStudents(
      [
        ps({ studentNumber: 'x', email: 'a@x.edu', userId: 'u1', name: 'A B' }),
        ps({ studentNumber: 'y', email: 'no@x.edu', userId: 'u2', name: 'C D' }),
        ps({ studentNumber: 'z', email: 'no2@x.edu', userId: 'no', name: 'Eve Fox' }),
      ],
      [
        cu({ canvasId: '900', email: 'a@x.edu' }),
        cu({ canvasId: '901', loginId: 'u2' }),
        cu({ canvasId: '902', name: 'Fox, Eve' }),
      ],
    );
    const by = (sn: string) => r.matched.find((m) => m.ps.studentNumber === sn)!;
    expect(by('x').matchedOn).toBe('email');
    expect(by('y').matchedOn).toBe('userId');
    expect(by('z').matchedOn).toBe('name');
  });

  it('reports ambiguous when two Canvas users share a normalized name', () => {
    const r = matchStudents(
      [ps({ studentNumber: 'q', name: 'Jane Doe' })],
      [cu({ canvasId: '900', name: 'Jane Doe' }), cu({ canvasId: '901', name: 'Doe, Jane' })],
    );
    expect(r.matched).toHaveLength(0);
    expect(r.ambiguous).toHaveLength(1);
    expect(r.ambiguous[0].candidates.map((c) => c.canvasId).sort()).toEqual(['900', '901']);
  });

  it('lists unmatched on both sides', () => {
    const r = matchStudents(
      [ps({ studentNumber: 'only-ps', name: 'No One' })],
      [cu({ canvasId: '900', name: 'Other Person', sisUserId: 'only-canvas' })],
    );
    expect(r.unmatchedPeopleSoft.map((p) => p.studentNumber)).toEqual(['only-ps']);
    expect(r.unmatchedCanvas.map((c) => c.canvasId)).toEqual(['900']);
  });

  it('does not reuse one Canvas user for two PeopleSoft rows', () => {
    const r = matchStudents(
      [ps({ studentNumber: '100', name: 'Jane Doe' }), ps({ studentNumber: '101', name: 'Jane Doe' })],
      [cu({ canvasId: '900', sisUserId: '100', name: 'Jane Doe' })],
    );
    expect(r.matched).toHaveLength(1);             // 100 wins on student_number
    expect(r.matched[0].ps.studentNumber).toBe('100');
    expect(r.unmatchedPeopleSoft.map((p) => p.studentNumber)).toEqual(['101']);
  });
});
