import type { AccessibilityFinding, FindingEngine, RequiredLevel } from '@canvas-toolchain/shared-types';

export interface EngineResult {
  findings: AccessibilityFinding[];
  /** SC ids this engine has rules for (used to mark criteria 'pass' when clean). */
  criteriaCovered: string[];
}

export interface AccessibilityEngine {
  readonly name: FindingEngine;
  check(html: string, opts: { requiredLevel: RequiredLevel }): Promise<EngineResult>;
}
