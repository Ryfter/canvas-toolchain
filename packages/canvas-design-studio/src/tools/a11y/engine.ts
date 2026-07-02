import type { AccessibilityFinding, FindingEngine, RequiredLevel } from '@canvas-toolchain/shared-types';

export interface EngineResult {
  findings: AccessibilityFinding[];
  /** SC ids this engine has rules for (used to mark criteria 'pass' when clean). */
  criteriaCovered: string[];
}

export interface AccessibilityEngine {
  readonly name: FindingEngine;
  // requiredLevel is forward-looking (Phase 2): engines may narrow rule sets by level; today the runner partitions findings after the fact.
  check(html: string, opts: { requiredLevel: RequiredLevel }): Promise<EngineResult>;
}
