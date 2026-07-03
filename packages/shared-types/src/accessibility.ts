/**
 * Canonical WCAG 2.2 accessibility model shared across the toolchain.
 * Engines (in-house checks, axe-core, WAVE) normalize into these shapes;
 * downstream code speaks WCAG success criteria, never tool dialects.
 * Spec: packages/command-and-control/docs/superpowers/specs/2026-07-01-wcag22-conformance-gate-design.md
 */

export type WcagVersion = '2.0' | '2.1' | '2.2';
export type WcagLevel = 'A' | 'AA' | 'AAA';
export type FindingSeverity = 'critical' | 'serious' | 'moderate' | 'minor';
export type FindingEngine = 'inhouse' | 'axe' | 'wave';

export interface RequiredLevel {
  version: WcagVersion;
  level: WcagLevel;
}

/** Gate level when no institution config specifies one (ADA Title II baseline). */
export const DEFAULT_REQUIRED_LEVEL: RequiredLevel = { version: '2.1', level: 'AA' };

export interface FindingMargin {
  measured: number;
  required: number;
  unit: string;
}

export interface AccessibilityFinding {
  sc: string;                 // "1.4.3"
  scName: string;             // "Contrast (Minimum)"
  scVersion: WcagVersion;     // version that introduced the SC
  level: WcagLevel;
  severity: FindingSeverity;
  engine: FindingEngine;
  message: string;
  context?: string;
  margin?: FindingMargin;     // present only for measurable criteria
}

export type CriterionStatus = 'pass' | 'fail' | 'needs-human-review' | 'not-applicable';

export interface ConformanceReport {
  requiredLevel: RequiredLevel;
  verdict: 'pass' | 'borderline' | 'fail';        // vs. required level only
  findings: AccessibilityFinding[];               // at or below required level
  advisories: AccessibilityFinding[];             // beyond required level
  criteria: Array<{ sc: string; scName: string; status: CriterionStatus }>;
}

export interface WcagCriterion {
  sc: string;
  scName: string;
  scVersion: WcagVersion;
  level: WcagLevel;
}

/** All WCAG 2.2 Level A and AA success criteria (4.1.1 removed in 2.2). */
export const WCAG22_CRITERIA: WcagCriterion[] = [
  { sc: '1.1.1', scName: 'Non-text Content', scVersion: '2.0', level: 'A' },
  { sc: '1.2.1', scName: 'Audio-only and Video-only (Prerecorded)', scVersion: '2.0', level: 'A' },
  { sc: '1.2.2', scName: 'Captions (Prerecorded)', scVersion: '2.0', level: 'A' },
  { sc: '1.2.3', scName: 'Audio Description or Media Alternative (Prerecorded)', scVersion: '2.0', level: 'A' },
  { sc: '1.2.4', scName: 'Captions (Live)', scVersion: '2.0', level: 'AA' },
  { sc: '1.2.5', scName: 'Audio Description (Prerecorded)', scVersion: '2.0', level: 'AA' },
  { sc: '1.3.1', scName: 'Info and Relationships', scVersion: '2.0', level: 'A' },
  { sc: '1.3.2', scName: 'Meaningful Sequence', scVersion: '2.0', level: 'A' },
  { sc: '1.3.3', scName: 'Sensory Characteristics', scVersion: '2.0', level: 'A' },
  { sc: '1.3.4', scName: 'Orientation', scVersion: '2.1', level: 'AA' },
  { sc: '1.3.5', scName: 'Identify Input Purpose', scVersion: '2.1', level: 'AA' },
  { sc: '1.4.1', scName: 'Use of Color', scVersion: '2.0', level: 'A' },
  { sc: '1.4.2', scName: 'Audio Control', scVersion: '2.0', level: 'A' },
  { sc: '1.4.3', scName: 'Contrast (Minimum)', scVersion: '2.0', level: 'AA' },
  { sc: '1.4.4', scName: 'Resize Text', scVersion: '2.0', level: 'AA' },
  { sc: '1.4.5', scName: 'Images of Text', scVersion: '2.0', level: 'AA' },
  { sc: '1.4.10', scName: 'Reflow', scVersion: '2.1', level: 'AA' },
  { sc: '1.4.11', scName: 'Non-text Contrast', scVersion: '2.1', level: 'AA' },
  { sc: '1.4.12', scName: 'Text Spacing', scVersion: '2.1', level: 'AA' },
  { sc: '1.4.13', scName: 'Content on Hover or Focus', scVersion: '2.1', level: 'AA' },
  { sc: '2.1.1', scName: 'Keyboard', scVersion: '2.0', level: 'A' },
  { sc: '2.1.2', scName: 'No Keyboard Trap', scVersion: '2.0', level: 'A' },
  { sc: '2.1.4', scName: 'Character Key Shortcuts', scVersion: '2.1', level: 'A' },
  { sc: '2.2.1', scName: 'Timing Adjustable', scVersion: '2.0', level: 'A' },
  { sc: '2.2.2', scName: 'Pause, Stop, Hide', scVersion: '2.0', level: 'A' },
  { sc: '2.3.1', scName: 'Three Flashes or Below Threshold', scVersion: '2.0', level: 'A' },
  { sc: '2.4.1', scName: 'Bypass Blocks', scVersion: '2.0', level: 'A' },
  { sc: '2.4.2', scName: 'Page Titled', scVersion: '2.0', level: 'A' },
  { sc: '2.4.3', scName: 'Focus Order', scVersion: '2.0', level: 'A' },
  { sc: '2.4.4', scName: 'Link Purpose (In Context)', scVersion: '2.0', level: 'A' },
  { sc: '2.4.5', scName: 'Multiple Ways', scVersion: '2.0', level: 'AA' },
  { sc: '2.4.6', scName: 'Headings and Labels', scVersion: '2.0', level: 'AA' },
  { sc: '2.4.7', scName: 'Focus Visible', scVersion: '2.0', level: 'AA' },
  { sc: '2.4.11', scName: 'Focus Not Obscured (Minimum)', scVersion: '2.2', level: 'AA' },
  { sc: '2.5.1', scName: 'Pointer Gestures', scVersion: '2.1', level: 'A' },
  { sc: '2.5.2', scName: 'Pointer Cancellation', scVersion: '2.1', level: 'A' },
  { sc: '2.5.3', scName: 'Label in Name', scVersion: '2.1', level: 'A' },
  { sc: '2.5.4', scName: 'Motion Actuation', scVersion: '2.1', level: 'A' },
  { sc: '2.5.7', scName: 'Dragging Movements', scVersion: '2.2', level: 'AA' },
  { sc: '2.5.8', scName: 'Target Size (Minimum)', scVersion: '2.2', level: 'AA' },
  { sc: '3.1.1', scName: 'Language of Page', scVersion: '2.0', level: 'A' },
  { sc: '3.1.2', scName: 'Language of Parts', scVersion: '2.0', level: 'AA' },
  { sc: '3.2.1', scName: 'On Focus', scVersion: '2.0', level: 'A' },
  { sc: '3.2.2', scName: 'On Input', scVersion: '2.0', level: 'A' },
  { sc: '3.2.3', scName: 'Consistent Navigation', scVersion: '2.0', level: 'AA' },
  { sc: '3.2.4', scName: 'Consistent Identification', scVersion: '2.0', level: 'AA' },
  { sc: '3.2.6', scName: 'Consistent Help', scVersion: '2.2', level: 'A' },
  { sc: '3.3.1', scName: 'Error Identification', scVersion: '2.0', level: 'A' },
  { sc: '3.3.2', scName: 'Labels or Instructions', scVersion: '2.0', level: 'A' },
  { sc: '3.3.3', scName: 'Error Suggestion', scVersion: '2.0', level: 'AA' },
  { sc: '3.3.4', scName: 'Error Prevention (Legal, Financial, Data)', scVersion: '2.0', level: 'AA' },
  { sc: '3.3.7', scName: 'Redundant Entry', scVersion: '2.2', level: 'A' },
  { sc: '3.3.8', scName: 'Accessible Authentication (Minimum)', scVersion: '2.2', level: 'AA' },
  { sc: '4.1.2', scName: 'Name, Role, Value', scVersion: '2.0', level: 'A' },
  { sc: '4.1.3', scName: 'Status Messages', scVersion: '2.1', level: 'AA' },
];

const CATALOG_BY_SC = new Map(WCAG22_CRITERIA.map(c => [c.sc, c]));

export function scMeta(sc: string): WcagCriterion | undefined {
  return CATALOG_BY_SC.get(sc);
}

/**
 * Criteria that do not apply to Canvas RCE content fragments:
 * Canvas owns the page chrome (title, skip links, lang) and login;
 * live media does not occur in course page content.
 */
export const NOT_APPLICABLE_CANVAS: ReadonlySet<string> = new Set([
  '1.2.4',  // Captions (Live) — no live media in page content
  '2.4.1',  // Bypass Blocks — Canvas chrome
  '2.4.2',  // Page Titled — Canvas supplies the page title (H1)
  '3.1.1',  // Language of Page — Canvas sets <html lang>
  '3.3.8',  // Accessible Authentication — Canvas owns login
]);

/** Borderline rule from the spec (§1). */
export function isBorderlineFinding(f: AccessibilityFinding): boolean {
  if (f.margin) return f.margin.measured >= 0.85 * f.margin.required;
  return f.severity === 'moderate' || f.severity === 'minor';
}

const VERSION_ORDER: Record<WcagVersion, number> = { '2.0': 0, '2.1': 1, '2.2': 2 };
const LEVEL_ORDER: Record<WcagLevel, number> = { A: 0, AA: 1, AAA: 2 };

/** True when the finding's SC is part of the required conformance level. */
export function isWithinRequiredLevel(f: AccessibilityFinding, required: RequiredLevel): boolean {
  return VERSION_ORDER[f.scVersion] <= VERSION_ORDER[required.version]
    && LEVEL_ORDER[f.level] <= LEVEL_ORDER[required.level];
}

/** Verdict vs. the required level: any clear failure → fail; any finding → borderline; else pass. */
export function computeVerdict(requiredFindings: AccessibilityFinding[]): ConformanceReport['verdict'] {
  if (requiredFindings.length === 0) return 'pass';
  return requiredFindings.every(isBorderlineFinding) ? 'borderline' : 'fail';
}

/** Professor acknowledgment: `true` for borderline-only, a named-SC array for clear failures. */
export type A11yAcknowledgment = true | string[];

export interface AckEvaluation {
  ok: boolean;
  tier: 'none' | 'borderline' | 'fail';
  /** Clear-failure SCs an array acknowledgment must name exactly (empty for none/borderline). */
  requiredScs: string[];
  reason?: string;
}

/** Unique, sorted SCs of clear (non-borderline) failures at the required level. */
export function clearFailureScs(report: ConformanceReport): string[] {
  return [...new Set(report.findings.filter(f => !isBorderlineFinding(f)).map(f => f.sc))].sort();
}

/**
 * Two-tier gate evaluation (spec §3). Clear failures demand an array naming every
 * failing SC — no more, no less; `true` covers borderline-only. `false` or any
 * non-conforming runtime value (this arrives from JSON tool input) counts as absent.
 */
export function evaluateAckAgainst(
  clearScs: string[],
  hasBorderline: boolean,
  ack: A11yAcknowledgment | boolean | undefined
): AckEvaluation {
  const given = ack === true || Array.isArray(ack) ? ack : undefined;

  if (clearScs.length > 0) {
    const required = [...new Set(clearScs)].sort();
    if (!Array.isArray(given)) {
      return {
        ok: false, tier: 'fail', requiredScs: required,
        reason: `Clear accessibility failures require a named acknowledgment listing every failing criterion: [${required.map(s => `"${s}"`).join(', ')}]. Passing true is not sufficient for clear failures.`,
      };
    }
    const names = [...new Set(given)].sort();
    const missing = required.filter(sc => !names.includes(sc));
    const extra = names.filter(sc => !required.includes(sc));
    if (missing.length > 0 || extra.length > 0) {
      const parts: string[] = [];
      if (missing.length > 0) parts.push(`missing: ${missing.join(', ')}`);
      if (extra.length > 0) parts.push(`not failing here (remove): ${extra.join(', ')}`);
      return {
        ok: false, tier: 'fail', requiredScs: required,
        reason: `The acknowledgment must name every clear-failure criterion and only those — ${parts.join('; ')}.`,
      };
    }
    return { ok: true, tier: 'fail', requiredScs: required };
  }

  if (hasBorderline) {
    if (given === undefined) {
      return {
        ok: false, tier: 'borderline', requiredScs: [],
        reason: 'Borderline accessibility findings require acknowledgment. Review them, then pass acknowledgeAccessibility: true.',
      };
    }
    return { ok: true, tier: 'borderline', requiredScs: [] };
  }

  return { ok: true, tier: 'none', requiredScs: [] };
}

/** Evaluate an acknowledgment against a conformance report's required-level findings. */
export function evaluateAcknowledgment(
  report: ConformanceReport,
  ack: A11yAcknowledgment | boolean | undefined
): AckEvaluation {
  return evaluateAckAgainst(
    clearFailureScs(report),
    report.findings.some(isBorderlineFinding),
    ack
  );
}
