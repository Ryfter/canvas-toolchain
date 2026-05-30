import { scanFerpa } from 'canvas-design-mcp/dist/tools/publish.js';
import { validateCanvasHtml } from 'canvas-design-mcp/dist/tools/validate.js';
import { auditAccessibility } from 'canvas-design-mcp/dist/tools/accessibility.js';
import type { Warning } from './manifest_types.js';

export function scanWarnings(html: string): Warning[] {
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

  for (const a of auditAccessibility(html)) {
    warnings.push({
      kind: 'a11y',
      severity: 'warn',
      message: a.message,
      line: (a as { line?: number }).line,
    });
  }

  return warnings;
}
