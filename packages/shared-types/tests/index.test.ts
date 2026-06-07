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

  it('exports AiasLevel and PageAias types (#92)', () => {
    const sample: import('../src/index.js').PageAias = {
      level: 3,
      note: 'AI Collaboration — draft with AI; you must edit and cite.',
    };
    expect(sample.level).toBe(3);
    expect(typeof sample.note).toBe('string');
  });

  it('exports Clo + CourseClos + PageClos types (#91)', () => {
    const c: import('../src/index.js').Clo = {
      id: '1',
      name: 'Analyzing',
      statement: 'Students will be able to analyze business data.',
      tag: 'core',
    };
    const cc: import('../src/index.js').CourseClos = { clos: [c] };
    const pc: import('../src/index.js').PageClos = { resolved: [c], unknownIds: [] };
    expect(c.id).toBe('1');
    expect(cc.clos).toHaveLength(1);
    expect(pc.resolved).toHaveLength(1);
  });
});
