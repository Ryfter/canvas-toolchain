import { describe, expect, it } from 'vitest';
import { SECTIONS, SECTION_IDS } from '../src/surface/sections.js';

describe('advanced sections', () => {
  it('defines exactly the eight sections from the spec', () => {
    expect([...SECTION_IDS].sort()).toEqual([
      'accessibility', 'admin', 'design', 'modules',
      'registry', 'research', 'snapshots', 'transcripts',
    ]);
  });

  it('gives every section a non-empty description', () => {
    for (const id of SECTION_IDS) {
      expect(SECTIONS[id].description.length).toBeGreaterThan(0);
    }
  });
});
