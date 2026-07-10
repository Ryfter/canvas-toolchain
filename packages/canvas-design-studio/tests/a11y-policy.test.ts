import { describe, it, expect } from 'vitest';
import {
  loadAccessibilityPolicy, saveAccessibilityPolicy, loadWaveApiKey, saveWaveApiKey,
  runPolicyConformanceCheck, type PolicyDeps,
} from '../src/tools/a11y/policy.js';
import type { InstitutionConfig } from '../src/types.js';

const BASE_CONFIG: InstitutionConfig = {
  institution: 'Example U', canvasUrl: 'https://example.instructure.com',
  colors: { primary: '#0033A0', primaryDark: '#002277', primaryLight: '#E6ECF9', secondary: '#F4F3EF' },
};

/** In-memory institution config: hermetic stand-in for ~/.canvas-design-mcp/institution.json. */
function memDeps(initial?: InstitutionConfig): PolicyDeps & { current: () => InstitutionConfig | undefined } {
  let cfg = initial;
  return {
    exists: () => cfg !== undefined,
    load: () => { if (!cfg) throw new Error('no config'); return cfg; },
    save: (c) => { cfg = c; },
    current: () => cfg,
  };
}

// Deterministic in-house findings (same fixtures as publish.test.ts):
const BORDERLINE_HTML = '<p>Course intro. <a href="https://example.edu/syllabus">click here</a></p>';
const CLEAN_HTML = '<p>Welcome to the course. Read the <a href="https://example.edu/syllabus">course syllabus</a> before week one.</p>';

describe('loadAccessibilityPolicy', () => {
  it('is undefined with no institution config and never throws', () => {
    expect(loadAccessibilityPolicy(memDeps())).toBeUndefined();
  });

  it('is undefined when the config has no accessibilityPolicy block', () => {
    expect(loadAccessibilityPolicy(memDeps(BASE_CONFIG))).toBeUndefined();
  });

  it('fills omitted fields from defaults', () => {
    const deps = memDeps({ ...BASE_CONFIG, accessibilityPolicy: { urls: ['https://www.example.edu/a11y/'] } as never });
    const p = loadAccessibilityPolicy(deps)!;
    expect(p.recheckWeeks).toBe(4);
    expect(p.requiredConformance).toEqual({ version: '2.1', level: 'AA' });
    expect(p.urls).toEqual(['https://www.example.edu/a11y/']);
  });
});

describe('saveAccessibilityPolicy', () => {
  it('merges the patch and preserves config siblings', () => {
    const deps = memDeps({ ...BASE_CONFIG, apiToken: 'keep-me' });
    const p = saveAccessibilityPolicy({ requiredConformance: { version: '2.2', level: 'AA' } }, deps);
    expect(p.requiredConformance.version).toBe('2.2');
    expect(deps.current()!.apiToken).toBe('keep-me');
    expect(deps.current()!.accessibilityPolicy!.recheckWeeks).toBe(4);
  });

  it('throws with the setup_institution hint when no config exists', () => {
    expect(() => saveAccessibilityPolicy({ recheckWeeks: 2 }, memDeps()))
      .toThrow(/setup_institution/);
  });
});

describe('wave api key storage', () => {
  it('round-trips through the institution config', () => {
    const deps = memDeps(BASE_CONFIG);
    expect(loadWaveApiKey(deps)).toBeUndefined();
    saveWaveApiKey('wave-key-123', deps);
    expect(loadWaveApiKey(deps)).toBe('wave-key-123');
    expect(deps.current()!.institution).toBe('Example U');
  });
});

describe('runPolicyConformanceCheck', () => {
  it('is identical to the bare check when no policy is configured', async () => {
    const report = await runPolicyConformanceCheck(CLEAN_HTML, memDeps());
    expect(report.requiredLevel).toEqual({ version: '2.1', level: 'AA' });
    expect(report.policyNudge).toBeUndefined();
    expect(report.wcag3).toBeUndefined();
  });

  it('uses the policy required level', async () => {
    const deps = memDeps({ ...BASE_CONFIG, accessibilityPolicy: {
      urls: [], requiredConformance: { version: '2.2', level: 'AA' }, recheckWeeks: 4, wcag3Advisory: false,
    } });
    const report = await runPolicyConformanceCheck(CLEAN_HTML, deps);
    expect(report.requiredLevel).toEqual({ version: '2.2', level: 'AA' });
  });

  it('attaches the nudge when overdue and the WCAG 3 section when toggled on', async () => {
    const deps = memDeps({ ...BASE_CONFIG, accessibilityPolicy: {
      urls: ['https://www.example.edu/publishing/wave-evaluation-tool/'],
      requiredConformance: { version: '2.1', level: 'AA' },
      recheckWeeks: 4, lastVerifiedAt: '2020-01-01', wcag3Advisory: true,
    } });
    const report = await runPolicyConformanceCheck(BORDERLINE_HTML, deps);
    expect(report.policyNudge).toContain('2020-01-01');
    expect(report.wcag3).toBeDefined();
    expect(report.wcag3!.some(w => w.sc === '2.4.4' && w.outcome === 'Link purpose')).toBe(true);
    expect(report.recommendedChecker).toContain('WAVE');
    // WCAG 3 never gates: verdict unchanged by the toggle
    expect(report.verdict).toBe('borderline');
  });
});
