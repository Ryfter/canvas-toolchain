import { describe, expect, it } from 'vitest';
import { CORE_SLOTS, VERDICTS } from '../src/index.js';

describe('shared types runtime exports', () => {
  it('exports stable verdict and core slot vocabularies', () => {
    expect(VERDICTS).toEqual(['KEEP', 'UPDATE', 'DROP', 'ADD']);
    expect(CORE_SLOTS).toContain('hero');
    expect(CORE_SLOTS).toContain('panopto');
  });
});
