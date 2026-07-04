import { evaluateAckAgainst, type AckEvaluation } from '@canvas-toolchain/shared-types';
import type { Warning } from './manifest_types.js';

/**
 * Per-file accessibility gate over preview-time warnings (spec §3, course path).
 * Same two-tier semantics as publish_to_canvas. Warnings without a11yTier
 * (pre-Phase-2 snapshots) do not gate.
 */
export function evaluateEntryA11yGate(
  warnings: Warning[],
  ack: true | string[] | undefined
): AckEvaluation {
  const a11y = warnings.filter(w => w.kind === 'a11y');
  const clearScs = [...new Set(a11y.filter(w => w.a11yTier === 'clear' && w.sc).map(w => w.sc as string))];
  const hasBorderline = a11y.some(w => w.a11yTier === 'borderline');
  return evaluateAckAgainst(clearScs, hasBorderline, ack);
}
