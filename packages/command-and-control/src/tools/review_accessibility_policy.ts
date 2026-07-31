import {
  loadAccessibilityPolicy, saveAccessibilityPolicy, type PolicyDeps,
} from '@canvas-toolchain/canvas-design-studio/dist/tools/a11y/policy.js';
import {
  DEFAULT_ACCESSIBILITY_POLICY, policyNudge,
  type AccessibilityPolicy, type RequiredLevel,
} from '@canvas-toolchain/shared-types';

export interface ReviewAccessibilityPolicyInput {
  /** Stamp lastVerifiedAt = today (the professor re-read the policy). */
  confirm?: boolean;
  urls?: string[];
  requiredConformance?: RequiredLevel;
  recheckWeeks?: number;
  wcag3Advisory?: boolean;
}

export interface ReviewAccessibilityPolicyResult {
  ok: boolean;
  policy?: AccessibilityPolicy;
  text?: string;
  error?: string;
  message?: string;
  fix?: string[];
}

const VERSIONS = new Set(['2.0', '2.1', '2.2']);
const LEVELS = new Set(['A', 'AA', 'AAA']);

function render(policy: AccessibilityPolicy | undefined): string {
  const p = policy ?? DEFAULT_ACCESSIBILITY_POLICY;
  const lines = [
    'Institution accessibility policy' + (policy ? '' : ' — not configured; defaults in effect'),
    `Required conformance: WCAG ${p.requiredConformance.version} ${p.requiredConformance.level}` +
      (policy ? '' : ' (ADA Title II baseline)'),
    `Re-verification cadence: every ${p.recheckWeeks} week(s)`,
    `Last verified: ${p.lastVerifiedAt ?? 'never'}`,
    `WCAG 3 draft advisories: ${p.wcag3Advisory ? 'ON (advisory only — never gates)' : 'off'}`,
    p.urls.length > 0 ? `Policy URLs:\n${p.urls.map(u => `  - ${u}`).join('\n')}` : 'Policy URLs: none recorded',
  ];
  const nudge = policy ? policyNudge(policy) : undefined;
  if (nudge) lines.push('', `⏰ ${nudge}`, 'Re-read the policy, then call review_accessibility_policy with confirm: true.');
  return lines.join('\n');
}

export function reviewAccessibilityPolicy(
  input: ReviewAccessibilityPolicyInput,
  deps: PolicyDeps = {},
): ReviewAccessibilityPolicyResult {
  const updates: Partial<AccessibilityPolicy> = {};
  if (input.urls !== undefined) updates.urls = input.urls;
  if (input.wcag3Advisory !== undefined) updates.wcag3Advisory = input.wcag3Advisory;
  if (input.recheckWeeks !== undefined) {
    if (!Number.isInteger(input.recheckWeeks) || input.recheckWeeks < 1) {
      return {
        ok: false, error: 'INVALID_RECHECK_WEEKS',
        message: `recheckWeeks must be a whole number of weeks >= 1 (got ${input.recheckWeeks}).`,
        fix: ['Pass recheckWeeks as a positive integer, e.g. 4.'],
      };
    }
    updates.recheckWeeks = input.recheckWeeks;
  }
  if (input.requiredConformance !== undefined) {
    const { version, level } = input.requiredConformance;
    if (!VERSIONS.has(version) || !LEVELS.has(level)) {
      return {
        ok: false, error: 'INVALID_CONFORMANCE',
        message: `requiredConformance must be a WCAG 2.x level (versions ${[...VERSIONS].join('/')}, levels ${[...LEVELS].join('/')}).`,
        fix: ['Example: { "version": "2.1", "level": "AA" } — the ADA Title II baseline.'],
      };
    }
    updates.requiredConformance = input.requiredConformance;
  }
  if (input.confirm) updates.lastVerifiedAt = new Date().toISOString().slice(0, 10);

  try {
    if (Object.keys(updates).length > 0) {
      const policy = saveAccessibilityPolicy(updates, deps);
      return { ok: true, policy, text: render(policy) };
    }
    const policy = loadAccessibilityPolicy(deps);
    return { ok: true, policy, text: render(policy) };
  } catch (e) {
    return {
      ok: false, error: 'NO_INSTITUTION_CONFIG',
      message: e instanceof Error ? e.message : String(e),
      fix: ['Run setup_institution first — the accessibility policy lives in the institution config.'],
    };
  }
}
