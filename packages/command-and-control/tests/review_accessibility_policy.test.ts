import { describe, it, expect } from 'vitest';
import { reviewAccessibilityPolicy } from '../src/tools/review_accessibility_policy.js';
import type { PolicyDeps } from '@canvas-toolchain/canvas-design-studio/dist/tools/a11y/policy.js';
import type { InstitutionConfig } from '@canvas-toolchain/canvas-design-studio/dist/types.js';

const BASE: InstitutionConfig = {
  institution: 'Example U', canvasUrl: 'https://example.instructure.com',
  colors: { primary: '#0033A0', primaryDark: '#002277', primaryLight: '#E6ECF9', secondary: '#F4F3EF' },
};

function memDeps(initial?: InstitutionConfig): PolicyDeps & { current: () => InstitutionConfig | undefined } {
  let cfg = initial;
  return {
    exists: () => cfg !== undefined,
    load: () => { if (!cfg) throw new Error('no config'); return cfg; },
    save: (c) => { cfg = c as InstitutionConfig; },
    current: () => cfg,
  };
}

describe('review_accessibility_policy', () => {
  it('no args → shows the defaults note when nothing is configured', () => {
    const r = reviewAccessibilityPolicy({}, memDeps(BASE));
    expect(r.ok).toBe(true);
    expect(r.text).toContain('WCAG 2.1 AA');
    expect(r.text).toContain('defaults');
  });

  it('confirm: true stamps lastVerifiedAt today', () => {
    const deps = memDeps(BASE);
    const r = reviewAccessibilityPolicy({ confirm: true }, deps);
    expect(r.ok).toBe(true);
    expect(r.policy!.lastVerifiedAt).toBe(new Date().toISOString().slice(0, 10));
    expect(deps.current()!.accessibilityPolicy!.lastVerifiedAt).toBe(r.policy!.lastVerifiedAt);
  });

  it('accepts updates and persists them', () => {
    const deps = memDeps(BASE);
    const r = reviewAccessibilityPolicy({
      urls: ['https://www.example.edu/accessibility/'],
      requiredConformance: { version: '2.2', level: 'AA' },
      recheckWeeks: 2,
      wcag3Advisory: true,
    }, deps);
    expect(r.ok).toBe(true);
    const saved = deps.current()!.accessibilityPolicy!;
    expect(saved.requiredConformance.version).toBe('2.2');
    expect(saved.recheckWeeks).toBe(2);
    expect(saved.wcag3Advisory).toBe(true);
  });

  it('rejects a bad recheckWeeks without writing', () => {
    const deps = memDeps(BASE);
    const r = reviewAccessibilityPolicy({ recheckWeeks: 0 }, deps);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('INVALID_RECHECK_WEEKS');
    expect(deps.current()!.accessibilityPolicy).toBeUndefined();
  });

  it('rejects an unknown conformance version without writing', () => {
    const r = reviewAccessibilityPolicy({ requiredConformance: { version: '3.0', level: 'AA' } as never }, memDeps(BASE));
    expect(r.ok).toBe(false);
    expect(r.error).toBe('INVALID_CONFORMANCE');
  });

  it('surfaces the setup_institution fix when no config exists', () => {
    const r = reviewAccessibilityPolicy({ confirm: true }, memDeps());
    expect(r.ok).toBe(false);
    expect(r.error).toBe('NO_INSTITUTION_CONFIG');
    expect(r.fix!.join(' ')).toContain('setup_institution');
  });
});
