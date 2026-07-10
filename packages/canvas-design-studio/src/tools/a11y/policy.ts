import {
  DEFAULT_ACCESSIBILITY_POLICY, mapFindingsToWcag3, policyNudge,
  type AccessibilityPolicy, type ConformanceReport,
} from '@canvas-toolchain/shared-types';
import { configExists, loadConfig, saveConfig } from '../../config.js';
import { runConformanceCheck } from './conformance.js';
import type { InstitutionConfig } from '../../types.js';

/** Injectable config access — production uses the real institution.json; tests inject memory. */
export interface PolicyDeps {
  exists?: () => boolean;
  load?: () => InstitutionConfig;
  save?: (config: InstitutionConfig) => void;
}

function resolve(deps: PolicyDeps) {
  return {
    exists: deps.exists ?? configExists,
    load: deps.load ?? loadConfig,
    save: deps.save ?? saveConfig,
  };
}

/** The stored policy (defaults filled), or undefined when the professor has never
 *  configured one. Never throws — an unreadable config means "no policy". */
export function loadAccessibilityPolicy(deps: PolicyDeps = {}): AccessibilityPolicy | undefined {
  const { exists, load } = resolve(deps);
  try {
    if (!exists()) return undefined;
    const cfg = load();
    if (!cfg.accessibilityPolicy) return undefined;
    return { ...DEFAULT_ACCESSIBILITY_POLICY, ...cfg.accessibilityPolicy };
  } catch {
    return undefined;
  }
}

/** Merge a partial policy into the institution config, preserving all siblings. */
export function saveAccessibilityPolicy(patch: Partial<AccessibilityPolicy>, deps: PolicyDeps = {}): AccessibilityPolicy {
  const { exists, load, save } = resolve(deps);
  if (!exists()) throw new Error('No institution config found. Run setup_institution first.');
  const cfg = load();
  const next: AccessibilityPolicy = { ...DEFAULT_ACCESSIBILITY_POLICY, ...cfg.accessibilityPolicy, ...patch };
  save({ ...cfg, accessibilityPolicy: next });
  return next;
}

export function loadWaveApiKey(deps: PolicyDeps = {}): string | undefined {
  const { exists, load } = resolve(deps);
  try {
    return exists() ? load().waveApiKey : undefined;
  } catch {
    return undefined;
  }
}

export function saveWaveApiKey(key: string, deps: PolicyDeps = {}): void {
  const { exists, load, save } = resolve(deps);
  if (!exists()) throw new Error('No institution config found. Run setup_institution first.');
  save({ ...load(), waveApiKey: key });
}

/** Policy-aware conformance run (spec §7/§8): resolves the required level from the
 *  stored policy and decorates the report with the cadence nudge, the WCAG 3 draft
 *  advisory section, and the institution-recommended checker. With no policy
 *  configured the result is byte-identical to a bare runConformanceCheck — the
 *  toggle and nudge only exist for professors who opted in. */
export async function runPolicyConformanceCheck(html: string, deps: PolicyDeps = {}): Promise<ConformanceReport> {
  const policy = loadAccessibilityPolicy(deps);
  const report = await runConformanceCheck(html, policy ? { requiredLevel: policy.requiredConformance } : {});
  if (!policy) return report;
  const nudge = policyNudge(policy);
  if (nudge) report.policyNudge = nudge;
  if (policy.wcag3Advisory) report.wcag3 = mapFindingsToWcag3([...report.findings, ...report.advisories]);
  const wave = policy.urls.find(u => /wave/i.test(u));
  if (wave) report.recommendedChecker = `Your institution's published guidance recommends WAVE (${wave})`;
  return report;
}
