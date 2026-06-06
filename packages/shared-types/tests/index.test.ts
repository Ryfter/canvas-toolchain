import { describe, expect, it } from 'vitest';
import { CORE_SLOTS, VERDICTS } from '../src/index.js';

describe('shared types runtime exports', () => {
  it('exports stable verdict and core slot vocabularies', () => {
    expect(VERDICTS).toEqual(['KEEP', 'UPDATE', 'DROP', 'ADD']);
    expect(CORE_SLOTS).toContain('hero');
    expect(CORE_SLOTS).toContain('panopto');
  });

  it('exports the tier system types from #66', () => {
    const sample: import('../src/index.js').PageTiers = {
      locked: false,
      sections: [
        { heading: 'Due Date', tier: 1, summary: 'Friday Oct 17 at 11:59 PM' },
        { heading: 'Submission Instructions', tier: 2, summary: 'Single PDF max 3 pages' },
      ],
    };
    expect(sample.sections).toHaveLength(2);
    expect(sample.sections[0].tier).toBe(1);
  });
});
