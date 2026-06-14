import { describe, it, expect } from 'vitest';
import { renderRosterCsv } from '../src/roster/output.js';
import type { ProposalRow } from '../src/types.js';

const row = (o: Partial<ProposalRow>): ProposalRow => ({
  studentNumber: '', canvasId: '', pseudonym: '', returning: false,
  matchedOn: 'student_number', rawMajor: '', canonicalMajor: '', ...o,
});

describe('renderRosterCsv', () => {
  it('emits the canvas_id,pseudonym,major header + one line per row', () => {
    const csv = renderRosterCsv([
      row({ canvasId: '900', pseudonym: 'SU26-001', canonicalMajor: 'Marketing' }),
      row({ canvasId: '901', pseudonym: 'FA26-001', canonicalMajor: 'Business Analytics' }),
    ]);
    expect(csv).toBe(
      'canvas_id,pseudonym,major\n900,SU26-001,Marketing\n901,FA26-001,Business Analytics\n',
    );
  });

  it('quotes a major containing a comma', () => {
    const csv = renderRosterCsv([row({ canvasId: '900', pseudonym: 'SU26-001', canonicalMajor: 'Econ, Quantitative' })]);
    expect(csv).toContain('900,SU26-001,"Econ, Quantitative"');
  });
});
