import {
  DEFAULT_REQUIRED_LEVEL, NOT_APPLICABLE_CANVAS, WCAG22_CRITERIA, WCAG3_DRAFT_DATE,
  computeVerdict, isBorderlineFinding, isWithinRequiredLevel,
  type AccessibilityFinding, type ConformanceReport, type RequiredLevel,
} from '@canvas-toolchain/shared-types';
import type { AccessibilityEngine } from './engine.js';
import { inhouseEngine } from './inhouse.js';
import { axeEngine } from './axe.js';

const SEVERITY_RANK = { critical: 3, serious: 2, moderate: 1, minor: 0 } as const;

const ENGINES: AccessibilityEngine[] = [inhouseEngine, axeEngine];

/** Dedupe by (sc, context|message): keep the highest-severity report of a defect. */
export function dedupe(findings: AccessibilityFinding[]): AccessibilityFinding[] {
  const byKey = new Map<string, AccessibilityFinding>();
  for (const f of findings) {
    const key = `${f.sc}|${f.context ?? f.message}`;
    const existing = byKey.get(key);
    if (!existing || SEVERITY_RANK[f.severity] > SEVERITY_RANK[existing.severity]) {
      byKey.set(key, f);
    }
  }
  return [...byKey.values()];
}

export async function runConformanceCheck(
  html: string,
  opts: { requiredLevel?: RequiredLevel } = {}
): Promise<ConformanceReport> {
  const requiredLevel = opts.requiredLevel ?? DEFAULT_REQUIRED_LEVEL;

  const results = await Promise.all(ENGINES.map(e => e.check(html, { requiredLevel })));
  const all = dedupe(results.flatMap(r => r.findings));
  const covered = new Set(results.flatMap(r => r.criteriaCovered));

  const findings = all.filter(f => isWithinRequiredLevel(f, requiredLevel));
  const advisories = all.filter(f => !isWithinRequiredLevel(f, requiredLevel));
  // Criteria statuses reflect the full WCAG 2.2 picture (incl. advisories); the verdict is scoped to the required level — a 'fail' criterion can coexist with verdict 'pass'.
  const failedScs = new Set(all.map(f => f.sc));

  const criteria = WCAG22_CRITERIA.map(c => ({
    sc: c.sc,
    scName: c.scName,
    status: NOT_APPLICABLE_CANVAS.has(c.sc) ? 'not-applicable' as const
      : failedScs.has(c.sc) ? 'fail' as const
      : covered.has(c.sc) ? 'pass' as const
      : 'needs-human-review' as const,
  }));

  return { requiredLevel, verdict: computeVerdict(findings), findings, advisories, criteria };
}

function findingLine(f: AccessibilityFinding, i: number): string {
  const margin = f.margin ? ` [${f.margin.measured.toFixed(2)} measured, ${f.margin.required} required]` : '';
  return `${i + 1}. ${f.sc} ${f.scName} (${f.severity})${margin}: ${f.message}` +
    (f.context ? `\n   Context: ${f.context}` : '');
}

export function formatConformanceReport(report: ConformanceReport): string {
  const req = `WCAG ${report.requiredLevel.version} ${report.requiredLevel.level}`;
  const lines: string[] = [];
  const icon = report.verdict === 'pass' ? '✓' : report.verdict === 'borderline' ? '⚠' : '✗';
  lines.push(`${icon} Accessibility: ${report.verdict.toUpperCase()} against ${req} (checked with WCAG 2.2 rules — advisory)`);

  const clear = report.findings.filter(f => !isBorderlineFinding(f));
  const borderline = report.findings.filter(isBorderlineFinding);
  if (clear.length > 0) {
    lines.push('', `Clear failures (${clear.length}):`, ...clear.map(findingLine));
  }
  if (borderline.length > 0) {
    lines.push('', `Borderline — near the line (${borderline.length}):`, ...borderline.map(findingLine));
  }
  if (report.advisories.length > 0) {
    lines.push('', `Beyond ${req} (forward-looking, never gates) (${report.advisories.length}):`,
      ...report.advisories.map(findingLine));
  }

  const review = report.criteria.filter(c => c.status === 'needs-human-review');
  if (review.length > 0) {
    lines.push('', `This content needs human review for ${review.length} criteria (automation cannot judge them): ` +
      review.slice(0, 6).map(c => c.sc).join(', ') + (review.length > 6 ? ', …' : ''),
      'Deep-check tools (free): WAVE browser extension, or MS Accessibility Insights — https://accessibilityinsights.io/downloads/');
  }

  if (report.recommendedChecker) {
    lines.push('', `${report.recommendedChecker} — the free browser extension covers login-gated Canvas pages; the paid WAVE API (wave_deep_check) works on public URLs only.`);
  }
  if (report.wcag3 && report.wcag3.length > 0) {
    lines.push('', `WCAG 3 (pre-release draft ${WCAG3_DRAFT_DATE} — advisory only, never gates):`,
      ...report.wcag3.map((w, i) => `${i + 1}. ${w.outcome} (maps from ${w.sc}): ${w.message}`),
      'Draft outcomes with no 2.x analogue cannot be assessed automatically yet.');
  }
  if (report.policyNudge) {
    lines.push('', `⏰ ${report.policyNudge}`);
  }

  return lines.join('\n');
}
