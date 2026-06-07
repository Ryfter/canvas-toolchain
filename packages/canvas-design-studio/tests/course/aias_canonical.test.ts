import { describe, expect, it } from 'vitest';
import { CANONICAL_AIAS_NOTES, CANONICAL_AIAS_NAMES } from '../../src/course/aias_canonical.js';

describe('canonical AIAS constants', () => {
  it('has notes for all 5 levels', () => {
    for (const level of [1, 2, 3, 4, 5] as const) {
      expect(CANONICAL_AIAS_NOTES[level]).toBeTruthy();
      expect(CANONICAL_AIAS_NOTES[level].length).toBeGreaterThan(10);
    }
  });

  it('has names for all 5 levels', () => {
    expect(CANONICAL_AIAS_NAMES[1]).toBe('No AI');
    expect(CANONICAL_AIAS_NAMES[2]).toBe('AI Planning');
    expect(CANONICAL_AIAS_NAMES[3]).toBe('AI Collaboration');
    expect(CANONICAL_AIAS_NAMES[4]).toBe('Full AI');
    expect(CANONICAL_AIAS_NAMES[5]).toBe('AI Exploration');
  });
});
