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

import {
  evaluateAckAgainst, evaluateAcknowledgment, clearFailureScs,
  type AccessibilityFinding, type ConformanceReport, DEFAULT_REQUIRED_LEVEL,
} from '../src/accessibility.js';

function findingAck(over: Partial<AccessibilityFinding>): AccessibilityFinding {
  return {
    sc: '1.4.3', scName: 'Contrast (Minimum)', scVersion: '2.0', level: 'AA',
    severity: 'serious', engine: 'inhouse', message: 'low contrast', ...over,
  };
}

function report(findings: AccessibilityFinding[]): ConformanceReport {
  return {
    requiredLevel: DEFAULT_REQUIRED_LEVEL,
    verdict: findings.length === 0 ? 'pass' : 'fail',
    findings, advisories: [], criteria: [],
  };
}

describe('evaluateAckAgainst', () => {
  it('passes with tier none when nothing failed', () => {
    expect(evaluateAckAgainst([], false, undefined))
      .toEqual({ ok: true, tier: 'none', requiredScs: [] });
  });

  it('blocks borderline without acknowledgment', () => {
    const r = evaluateAckAgainst([], true, undefined);
    expect(r.ok).toBe(false);
    expect(r.tier).toBe('borderline');
    expect(r.reason).toContain('acknowledgeAccessibility: true');
  });

  it('passes borderline with true', () => {
    expect(evaluateAckAgainst([], true, true)).toEqual({ ok: true, tier: 'borderline', requiredScs: [] });
  });

  it('passes borderline with an array too', () => {
    expect(evaluateAckAgainst([], true, ['1.4.3']).ok).toBe(true);
  });

  it('rejects true for clear failures', () => {
    const r = evaluateAckAgainst(['1.4.3'], false, true);
    expect(r.ok).toBe(false);
    expect(r.tier).toBe('fail');
    expect(r.requiredScs).toEqual(['1.4.3']);
    expect(r.reason).toContain('not sufficient');
  });

  it('rejects an incomplete array (missing SC named)', () => {
    const r = evaluateAckAgainst(['1.3.1', '1.4.3'], false, ['1.4.3']);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('missing: 1.3.1');
  });

  it('rejects extra SCs (must name only what fails)', () => {
    const r = evaluateAckAgainst(['1.4.3'], false, ['1.4.3', '2.4.4']);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('2.4.4');
  });

  it('passes a complete exact array, order- and duplicate-insensitive', () => {
    const r = evaluateAckAgainst(['1.3.1', '1.4.3'], true, ['1.4.3', '1.3.1', '1.4.3']);
    expect(r).toEqual({ ok: true, tier: 'fail', requiredScs: ['1.3.1', '1.4.3'] });
  });

  it('treats runtime false (from JSON input) as no acknowledgment', () => {
    expect(evaluateAckAgainst([], true, false).ok).toBe(false);
  });
});

describe('clearFailureScs / evaluateAcknowledgment', () => {
  it('extracts unique sorted clear-failure SCs, excluding borderline findings', () => {
    const rep = report([
      findingAck({ sc: '1.4.3', severity: 'serious' }),
      findingAck({ sc: '1.3.1', scName: 'Info and Relationships', severity: 'serious' }),
      findingAck({ sc: '1.3.1', scName: 'Info and Relationships', severity: 'serious', message: 'second defect' }),
      findingAck({ sc: '2.4.4', scName: 'Link Purpose (In Context)', severity: 'moderate' }), // borderline
    ]);
    expect(clearFailureScs(rep)).toEqual(['1.3.1', '1.4.3']);
    const r = evaluateAcknowledgment(rep, ['1.3.1', '1.4.3']);
    expect(r.ok).toBe(true);
    expect(r.tier).toBe('fail');
  });

  it('a margin inside the 85% band makes a serious finding borderline, not clear', () => {
    const rep = report([findingAck({
      severity: 'serious',
      margin: { measured: 4.32, required: 4.5, unit: 'contrast ratio' },
    })]);
    rep.verdict = 'borderline';
    expect(clearFailureScs(rep)).toEqual([]);
    expect(evaluateAcknowledgment(rep, true).ok).toBe(true);
  });

  it('passing report needs no acknowledgment and ignores a supplied one', () => {
    const rep = report([]);
    expect(evaluateAcknowledgment(rep, undefined)).toEqual({ ok: true, tier: 'none', requiredScs: [] });
    expect(evaluateAcknowledgment(rep, true).ok).toBe(true);
  });
});
