import { scanFerpa } from 'canvas-design-mcp/dist/tools/publish.js';
import { validateCanvasHtml } from 'canvas-design-mcp/dist/tools/validate.js';
import { runPolicyConformanceCheck } from 'canvas-design-mcp/dist/tools/a11y/policy.js';
import { isBorderlineFinding } from '@canvas-toolchain/shared-types';
import type { Warning } from './manifest_types.js';

export async function scanWarnings(html: string): Promise<Warning[]> {
  const warnings: Warning[] = [];

  const ferpa = scanFerpa(html);
  if (ferpa) {
    warnings.push({ kind: 'ferpa', severity: 'block', message: ferpa.reason, line: ferpa.line });
  }

  const validation = validateCanvasHtml(html);
  if (!validation.valid) {
    for (const v of validation.violations) {
      warnings.push({
        kind: 'validation',
        severity: 'block',
        message: `${v.rule}: ${v.context}`,
        line: undefined,
      });
    }
  }

  // Phase 2 (spec §3): findings at the required level gate publishing — clear
  // failures block until acknowledged by named SC; borderline needs a light ack.
  const conformance = await runPolicyConformanceCheck(html);
  for (const f of conformance.findings) {
    const borderline = isBorderlineFinding(f);
    warnings.push({
      kind: 'a11y',
      severity: borderline ? 'warn' : 'block',
      message: `${f.sc} ${f.scName} — ${f.message}`,
      sc: f.sc,
      a11yTier: borderline ? 'borderline' : 'clear',
      // Same formula audit_course_accessibility uses for review-queue sorting (#111).
      ...(f.margin && { marginRatio: f.margin.measured / f.margin.required }),
    });
  }

  return warnings;
}
