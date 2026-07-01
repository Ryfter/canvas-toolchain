import {
  scMeta, type AccessibilityFinding, type FindingSeverity,
} from '@canvas-toolchain/shared-types';
import { auditAccessibility, type AccessibilityWarning } from '../accessibility.js';
import type { AccessibilityEngine, EngineResult } from './engine.js';

/** check id → { sc, severity } (spec §1 severity map). */
const CHECK_MAP: Record<string, { sc: string; severity: FindingSeverity }> = {
  'contrast-ratio':    { sc: '1.4.3', severity: 'serious' },
  'empty-alt':         { sc: '1.1.1', severity: 'moderate' },
  'heading-skip':      { sc: '1.3.1', severity: 'moderate' },
  'vague-link':        { sc: '2.4.4', severity: 'moderate' },
  'table-no-headers':  { sc: '1.3.1', severity: 'serious' },
  'video-no-captions': { sc: '1.2.2', severity: 'serious' },
};

const COVERED = ['1.1.1', '1.2.2', '1.3.1', '1.4.3', '2.4.4'];

function toFinding(w: AccessibilityWarning): AccessibilityFinding | undefined {
  const mapped = CHECK_MAP[w.check];
  if (!mapped) return undefined;
  const meta = scMeta(mapped.sc);
  if (!meta) return undefined;
  // Contrast in the 85% borderline band downgrades serious → moderate (spec §1).
  const severity: FindingSeverity =
    w.margin && w.margin.measured >= 0.85 * w.margin.required ? 'moderate' : mapped.severity;
  return {
    sc: meta.sc,
    scName: meta.scName,
    scVersion: meta.scVersion,
    level: meta.level,
    severity,
    engine: 'inhouse',
    message: w.message,
    ...(w.context !== undefined && { context: w.context }),
    ...(w.margin !== undefined && { margin: w.margin }),
  };
}

export const inhouseEngine: AccessibilityEngine = {
  name: 'inhouse',
  async check(html): Promise<EngineResult> {
    const findings = auditAccessibility(html)
      .map(toFinding)
      .filter((f): f is AccessibilityFinding => f !== undefined);
    return { findings, criteriaCovered: COVERED };
  },
};
