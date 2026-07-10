import { describe, it, expect } from 'vitest';
import {
  DEFAULT_ACCESSIBILITY_POLICY, policyNudge, mapFindingsToWcag3, WCAG3_OUTCOME_MAP,
  type AccessibilityPolicy, type AccessibilityFinding,
} from '../src/accessibility.js';

const finding = (sc: string, message = 'msg'): AccessibilityFinding => ({
  sc, scName: 'x', scVersion: '2.1', level: 'AA', severity: 'serious', engine: 'inhouse', message,
});

describe('DEFAULT_ACCESSIBILITY_POLICY', () => {
  it('defaults to WCAG 2.1 AA, 4-week cadence, WCAG 3 off', () => {
    expect(DEFAULT_ACCESSIBILITY_POLICY.requiredConformance).toEqual({ version: '2.1', level: 'AA' });
    expect(DEFAULT_ACCESSIBILITY_POLICY.recheckWeeks).toBe(4);
    expect(DEFAULT_ACCESSIBILITY_POLICY.wcag3Advisory).toBe(false);
    expect(DEFAULT_ACCESSIBILITY_POLICY.urls).toEqual([]);
  });
});

describe('policyNudge', () => {
  const base: AccessibilityPolicy = { ...DEFAULT_ACCESSIBILITY_POLICY, urls: ['https://www.example.edu/accessibility/'] };

  it('is undefined when the policy has never been verified', () => {
    expect(policyNudge(base, new Date('2026-08-01T00:00:00Z'))).toBeUndefined();
  });

  it('is undefined inside the cadence window (exactly at the boundary passes)', () => {
    const p = { ...base, lastVerifiedAt: '2026-07-01' };
    // exactly 28 days later — not yet overdue
    expect(policyNudge(p, new Date('2026-07-29T00:00:00Z'))).toBeUndefined();
  });

  it('fires past the cadence and names the date + urls', () => {
    const p = { ...base, lastVerifiedAt: '2026-05-01' };
    const nudge = policyNudge(p, new Date('2026-07-01T00:00:00Z'));
    expect(nudge).toContain('2026-05-01');
    expect(nudge).toContain('https://www.example.edu/accessibility/');
  });

  it('honors a custom recheckWeeks', () => {
    const p = { ...base, lastVerifiedAt: '2026-06-20', recheckWeeks: 1 };
    expect(policyNudge(p, new Date('2026-07-01T00:00:00Z'))).toBeDefined();
    expect(policyNudge(p, new Date('2026-06-25T00:00:00Z'))).toBeUndefined();
  });

  it('is undefined for a malformed lastVerifiedAt', () => {
    expect(policyNudge({ ...base, lastVerifiedAt: 'not-a-date' }, new Date())).toBeUndefined();
  });
});

describe('mapFindingsToWcag3', () => {
  it('maps known SCs to draft outcome names', () => {
    const out = mapFindingsToWcag3([finding('1.4.3'), finding('1.1.1')]);
    expect(out).toEqual([
      { sc: '1.4.3', outcome: WCAG3_OUTCOME_MAP['1.4.3'], message: 'msg' },
      { sc: '1.1.1', outcome: WCAG3_OUTCOME_MAP['1.1.1'], message: 'msg' },
    ]);
    expect(WCAG3_OUTCOME_MAP['1.4.3']).toBe('Text and visual contrast');
  });

  it('skips SCs without a draft mapping and dedupes identical findings', () => {
    const out = mapFindingsToWcag3([finding('9.9.9'), finding('1.4.3'), finding('1.4.3')]);
    expect(out).toHaveLength(1);
  });
});
