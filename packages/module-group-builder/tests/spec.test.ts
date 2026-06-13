import { describe, it, expect } from 'vitest';
import { resolveGroupSpec } from '../src/spec.js';

describe('resolveGroupSpec', () => {
  it('groupSize=4 over 10 students -> 3 groups sized 4,3,3', () => {
    const r = resolveGroupSpec({ groupSize: 4 }, 10);
    expect(r.groupCount).toBe(3);
    expect(r.targetSizes).toEqual([4, 3, 3]);
  });
  it('groupCount=3 over 10 -> sizes 4,3,3', () => {
    expect(resolveGroupSpec({ groupCount: 3 }, 10).targetSizes).toEqual([4, 3, 3]);
  });
  it('rejects when neither or both provided', () => {
    expect(() => resolveGroupSpec({}, 10)).toThrow(/exactly one/i);
    expect(() => resolveGroupSpec({ groupSize: 4, groupCount: 3 }, 10)).toThrow(/exactly one/i);
  });
  it('rejects zero students', () => {
    expect(() => resolveGroupSpec({ groupSize: 4 }, 0)).toThrow(/no students/i);
  });
});
