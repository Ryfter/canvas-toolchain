import { describe, expect, it } from 'vitest';
import { resolveEffectiveAias } from '../../src/course/aias_resolver.js';
import { CANONICAL_AIAS_NOTES } from '../../src/course/aias_canonical.js';

describe('resolveEffectiveAias', () => {
  it('page override wins over course default', () => {
    const result = resolveEffectiveAias(
      { level: 1, note: 'page note' },
      { level: 3, note: 'course note' },
    );
    expect(result).toEqual({ level: 1, note: 'page note' });
  });

  it('course default applies when page absent', () => {
    const result = resolveEffectiveAias(undefined, { level: 3, note: 'course note' });
    expect(result).toEqual({ level: 3, note: 'course note' });
  });

  it('returns canonical note when no custom note supplied at either layer', () => {
    const result = resolveEffectiveAias({ level: 3 }, undefined);
    expect(result).toEqual({ level: 3, note: CANONICAL_AIAS_NOTES[3] });
  });

  it('returns undefined when neither page nor course has a level', () => {
    const result = resolveEffectiveAias(undefined, undefined);
    expect(result).toBeUndefined();
  });

  it('returns undefined when only a course note is set without a level', () => {
    const result = resolveEffectiveAias(undefined, { note: 'orphan note' } as any);
    expect(result).toBeUndefined();
  });
});
