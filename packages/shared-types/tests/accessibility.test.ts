import { describe, it, expect } from 'vitest';
import {
  WCAG22_CRITERIA, NOT_APPLICABLE_CANVAS, DEFAULT_REQUIRED_LEVEL,
  scMeta, isBorderlineFinding, isWithinRequiredLevel, computeVerdict,
  type AccessibilityFinding,
} from '../src/accessibility.js';

function finding(over: Partial<AccessibilityFinding> = {}): AccessibilityFinding {
  return {
    sc: '1.4.3', scName: 'Contrast (Minimum)', scVersion: '2.0', level: 'AA',
    severity: 'serious', engine: 'inhouse', message: 'x', ...over,
  };
}

describe('WCAG22_CRITERIA catalog', () => {
  it('contains only A and AA criteria with unique, well-formed ids', () => {
    const ids = WCAG22_CRITERIA.map(c => c.sc);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of WCAG22_CRITERIA) {
      expect(c.sc).toMatch(/^\d\.\d\.\d{1,2}$/);
      expect(['A', 'AA']).toContain(c.level);
    }
  });
  it('excludes 4.1.1 (removed in WCAG 2.2) and includes the 2.2 additions', () => {
    const ids = new Set(WCAG22_CRITERIA.map(c => c.sc));
    expect(ids.has('4.1.1')).toBe(false);
    for (const sc of ['2.4.11', '2.5.7', '2.5.8', '3.2.6', '3.3.7', '3.3.8']) {
      expect(ids.has(sc)).toBe(true);
    }
  });
  it('scMeta resolves and NA set only names cataloged SCs', () => {
    expect(scMeta('1.4.3')).toMatchObject({ scName: 'Contrast (Minimum)', level: 'AA', scVersion: '2.0' });
    expect(scMeta('9.9.9')).toBeUndefined();
    for (const sc of NOT_APPLICABLE_CANVAS) expect(scMeta(sc)).toBeDefined();
  });
});

describe('isBorderlineFinding', () => {
  it('margin at exactly 85% of required is borderline; just below is not', () => {
    expect(isBorderlineFinding(finding({ margin: { measured: 3.825, required: 4.5, unit: 'contrast ratio' } }))).toBe(true);
    expect(isBorderlineFinding(finding({ margin: { measured: 3.82, required: 4.5, unit: 'contrast ratio' } }))).toBe(false);
  });
  it('without margin: moderate/minor borderline, serious/critical not', () => {
    expect(isBorderlineFinding(finding({ severity: 'moderate' }))).toBe(true);
    expect(isBorderlineFinding(finding({ severity: 'minor' }))).toBe(true);
    expect(isBorderlineFinding(finding({ severity: 'serious' }))).toBe(false);
    expect(isBorderlineFinding(finding({ severity: 'critical' }))).toBe(false);
  });
});

describe('isWithinRequiredLevel', () => {
  it('2.0/2.1 A+AA are within default 2.1 AA; 2.2-only SCs are not', () => {
    expect(isWithinRequiredLevel(finding({ scVersion: '2.0' }), DEFAULT_REQUIRED_LEVEL)).toBe(true);
    expect(isWithinRequiredLevel(finding({ scVersion: '2.1' }), DEFAULT_REQUIRED_LEVEL)).toBe(true);
    expect(isWithinRequiredLevel(finding({ sc: '2.5.8', scVersion: '2.2' }), DEFAULT_REQUIRED_LEVEL)).toBe(false);
    expect(isWithinRequiredLevel(finding({ scVersion: '2.2' }), { version: '2.2', level: 'AA' })).toBe(true);
  });
});

describe('computeVerdict', () => {
  it('pass / borderline / fail', () => {
    expect(computeVerdict([])).toBe('pass');
    expect(computeVerdict([finding({ severity: 'moderate' })])).toBe('borderline');
    expect(computeVerdict([finding({ severity: 'serious' })])).toBe('fail');
    expect(computeVerdict([
      finding({ severity: 'moderate' }),
      finding({ margin: { measured: 2.1, required: 4.5, unit: 'contrast ratio' } }),
    ])).toBe('fail');
  });
});
