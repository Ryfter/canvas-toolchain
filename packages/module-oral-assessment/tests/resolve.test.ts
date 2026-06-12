import { describe, it, expect } from 'vitest';
import { resolveActiveOralAssessmentProvider } from '../src/resolve.js';

describe('resolveActiveOralAssessmentProvider', () => {
  it('defaults to Rhetorix', () => {
    expect(resolveActiveOralAssessmentProvider().id).toBe('rhetorix');
  });
  it('resolves rhetorix explicitly', () => {
    expect(resolveActiveOralAssessmentProvider('rhetorix').id).toBe('rhetorix');
  });
  it('throws on an unknown provider id', () => {
    expect(() => resolveActiveOralAssessmentProvider('nope')).toThrow(/unknown oral-assessment provider/i);
  });
});
