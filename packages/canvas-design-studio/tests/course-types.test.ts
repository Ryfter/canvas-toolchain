import { describe, it, expect } from 'vitest';
import { PAGE_TYPES, PAGE_TYPE_LABELS } from '../src/course-types.js';

describe('oral-assessment page type', () => {
  it('is a registered page type with a label', () => {
    expect((PAGE_TYPES as readonly string[]).includes('oral-assessment')).toBe(true);
    expect(PAGE_TYPE_LABELS['oral-assessment']).toBeTruthy();
  });
});
