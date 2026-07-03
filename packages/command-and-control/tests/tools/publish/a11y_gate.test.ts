import { describe, it, expect } from 'vitest';
import { evaluateEntryA11yGate } from '../../../src/tools/publish/a11y_gate.js';
import type { Warning } from '../../../src/tools/publish/manifest_types.js';

const clear = (sc: string): Warning =>
  ({ kind: 'a11y', severity: 'block', message: `${sc} clear failure`, sc, a11yTier: 'clear' });
const borderline = (sc: string): Warning =>
  ({ kind: 'a11y', severity: 'warn', message: `${sc} borderline`, sc, a11yTier: 'borderline' });
const ferpaBlock: Warning = { kind: 'ferpa', severity: 'block', message: 'possible student ID' };

describe('evaluateEntryA11yGate', () => {
  it('passes files with no a11y warnings (non-a11y blocks are not its business)', () => {
    expect(evaluateEntryA11yGate([ferpaBlock], undefined).ok).toBe(true);
  });

  it('legacy warnings without a11yTier do not gate (pre-Phase-2 snapshots)', () => {
    const legacy: Warning = { kind: 'a11y', severity: 'warn', message: 'old-format warning' };
    expect(evaluateEntryA11yGate([legacy], undefined).ok).toBe(true);
  });

  it('borderline-only requires true', () => {
    expect(evaluateEntryA11yGate([borderline('2.4.4')], undefined).ok).toBe(false);
    expect(evaluateEntryA11yGate([borderline('2.4.4')], true).ok).toBe(true);
  });

  it('clear failures require the exact named-SC array', () => {
    const warnings = [clear('1.3.1'), clear('1.4.3'), borderline('2.4.4')];
    expect(evaluateEntryA11yGate(warnings, true).ok).toBe(false);
    expect(evaluateEntryA11yGate(warnings, ['1.4.3']).ok).toBe(false);
    const r = evaluateEntryA11yGate(warnings, ['1.4.3', '1.3.1']);
    expect(r.ok).toBe(true);
    expect(r.tier).toBe('fail');
    expect(r.requiredScs).toEqual(['1.3.1', '1.4.3']);
  });
});
