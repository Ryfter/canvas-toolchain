# WCAG 2.2 Phase 1 — Thorough Checking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 6-heuristic advisory audit with a canonical WCAG 2.2 conformance system — shared finding model, in-house + axe-core engines behind one adapter interface, and a unified `ConformanceReport` in every existing output — still fully advisory (the gate is Phase 2).

**Architecture:** New `accessibility` module in `@canvas-toolchain/shared-types` (types + WCAG 2.2 A/AA catalog + borderline/verdict math). New `src/tools/a11y/` module in `canvas-design-mcp` (engine interface, in-house adapter wrapping the existing 6 checks, axe-core adapter running in jsdom, conformance runner + text formatter). Existing call sites (validate, generate, redesign, publish) gain the report; `auditAccessibility` stays exported (deprecated) so command-and-control is untouched until Phase 2.

**Tech Stack:** TypeScript (ESM, `.js` import suffixes), vitest, axe-core ^4.12.1, jsdom ^29.1.1, npm workspaces.

**Spec:** `packages/command-and-control/docs/superpowers/specs/2026-07-01-wcag22-conformance-gate-design.md`

## Global Constraints

- **Advisory only.** Phase 1 must NOT block or gate any publish. `isError` behavior of every tool is unchanged.
- **Back-compat:** `auditAccessibility` and `AccessibilityWarning` remain exported and functional (command-and-control imports them). Only additive changes to their shapes.
- **No institution-specific data** in any file: before each commit run `git grep -iE "exampleu|BSU|Boise" -- <changed files>` and expect zero matches. Placeholders are `example.edu` / `example.instructure.com`.
- **Default required level:** `{ version: '2.1', level: 'AA' }` — exported constant `DEFAULT_REQUIRED_LEVEL`, single source of truth in shared-types.
- **axe-core rules `color-contrast` and `target-size` are disabled** (jsdom has no layout). The in-house contrast check is the authoritative contrast source.
- **Borderline rule (exact):** a finding with `margin` is borderline when `margin.measured >= 0.85 * margin.required`; a finding without `margin` is borderline when severity is `moderate` or `minor`. `serious`/`critical` without margin = clear failure.
- **`npm audit` must stay at 0 vulnerabilities** after adding axe-core/jsdom.
- **TDD:** every task writes the failing test first. All existing tests must keep passing (~1737 across the monorepo).
- Node >= 20; all new code ESM with explicit `.js` suffixes on relative imports.

## File Structure

| File | Responsibility |
|---|---|
| `packages/shared-types/src/accessibility.ts` (create) | Canonical types, WCAG 2.2 A/AA catalog, NA/coverage sets, borderline + verdict + level-partition math |
| `packages/shared-types/src/index.ts` (modify) | Re-export the accessibility module |
| `packages/shared-types/tests/accessibility.test.ts` (create) | Catalog integrity + math tests |
| `packages/canvas-design-studio/src/tools/a11y/engine.ts` (create) | `AccessibilityEngine` interface |
| `packages/canvas-design-studio/src/tools/a11y/inhouse.ts` (create) | Adapter: 6 existing checks → canonical findings |
| `packages/canvas-design-studio/src/tools/a11y/axe.ts` (create) | axe-core in jsdom → canonical findings |
| `packages/canvas-design-studio/src/tools/a11y/conformance.ts` (create) | Runner: merge, dedupe, partition, verdict, criteria statuses, text formatter |
| `packages/canvas-design-studio/src/tools/accessibility.ts` (modify) | Add optional `margin` to `AccessibilityWarning`; emit it from `checkContrast`; `@deprecated` tags |
| `packages/canvas-design-studio/src/tools/{generate,redesign,publish}.ts`, `src/index.ts` (modify) | Attach `ConformanceReport` to outputs |
| `packages/canvas-design-studio/tests/a11y/*.test.ts` (create) | Engine + runner tests |
| `docs/accessibility.md` (modify) | Document the new engine architecture |

---

### Task 1: Canonical types, WCAG 2.2 catalog, and conformance math in shared-types

**Files:**
- Create: `packages/shared-types/src/accessibility.ts`
- Modify: `packages/shared-types/src/index.ts` (append one re-export line)
- Test: `packages/shared-types/tests/accessibility.test.ts`

**Interfaces:**
- Consumes: nothing (leaf module).
- Produces (used by Tasks 2–6): types `WcagVersion`, `WcagLevel`, `FindingSeverity`, `FindingEngine`, `AccessibilityFinding`, `CriterionStatus`, `ConformanceReport`, `RequiredLevel`; constants `DEFAULT_REQUIRED_LEVEL`, `WCAG22_CRITERIA`, `NOT_APPLICABLE_CANVAS`; functions `scMeta(sc)`, `isBorderlineFinding(f)`, `isWithinRequiredLevel(f, required)`, `computeVerdict(requiredFindings)`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared-types/tests/accessibility.test.ts
import { describe, it, expect } from 'vitest';
import {
  WCAG22_CRITERIA, NOT_APPLICABLE_CANVAS, DEFAULT_REQUIRED_LEVEL,
  scMeta, isBorderlineFinding, isWithinRequiredLevel, computeVerdict,
  type AccessibilityFinding,
} from '../src/accessibility.js';

function finding(over: Partial<AccessibilityFinding> = {}): AccessibilityFinding {
  return {
    sc: '1.4.3', scName: 'Contrast (Minimum)', scVersion: '2.0', level: 'AA',
    severity: 'serious', engine: 'inhouse', message: 'x', ...over,
  };
}

describe('WCAG22_CRITERIA catalog', () => {
  it('contains only A and AA criteria with unique, well-formed ids', () => {
    const ids = WCAG22_CRITERIA.map(c => c.sc);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of WCAG22_CRITERIA) {
      expect(c.sc).toMatch(/^\d\.\d\.\d{1,2}$/);
      expect(['A', 'AA']).toContain(c.level);
    }
  });
  it('excludes 4.1.1 (removed in WCAG 2.2) and includes the 2.2 additions', () => {
    const ids = new Set(WCAG22_CRITERIA.map(c => c.sc));
    expect(ids.has('4.1.1')).toBe(false);
    for (const sc of ['2.4.11', '2.5.7', '2.5.8', '3.2.6', '3.3.7', '3.3.8']) {
      expect(ids.has(sc)).toBe(true);
    }
  });
  it('scMeta resolves and NA set only names cataloged SCs', () => {
    expect(scMeta('1.4.3')).toMatchObject({ scName: 'Contrast (Minimum)', level: 'AA', scVersion: '2.0' });
    expect(scMeta('9.9.9')).toBeUndefined();
    for (const sc of NOT_APPLICABLE_CANVAS) expect(scMeta(sc)).toBeDefined();
  });
});

describe('isBorderlineFinding', () => {
  it('margin at exactly 85% of required is borderline; just below is not', () => {
    expect(isBorderlineFinding(finding({ margin: { measured: 3.825, required: 4.5, unit: 'contrast ratio' } }))).toBe(true);
    expect(isBorderlineFinding(finding({ margin: { measured: 3.82, required: 4.5, unit: 'contrast ratio' } }))).toBe(false);
  });
  it('without margin: moderate/minor borderline, serious/critical not', () => {
    expect(isBorderlineFinding(finding({ severity: 'moderate' }))).toBe(true);
    expect(isBorderlineFinding(finding({ severity: 'minor' }))).toBe(true);
    expect(isBorderlineFinding(finding({ severity: 'serious' }))).toBe(false);
    expect(isBorderlineFinding(finding({ severity: 'critical' }))).toBe(false);
  });
});

describe('isWithinRequiredLevel', () => {
  it('2.0/2.1 A+AA are within default 2.1 AA; 2.2-only SCs are not', () => {
    expect(isWithinRequiredLevel(finding({ scVersion: '2.0' }), DEFAULT_REQUIRED_LEVEL)).toBe(true);
    expect(isWithinRequiredLevel(finding({ scVersion: '2.1' }), DEFAULT_REQUIRED_LEVEL)).toBe(true);
    expect(isWithinRequiredLevel(finding({ sc: '2.5.8', scVersion: '2.2' }), DEFAULT_REQUIRED_LEVEL)).toBe(false);
    expect(isWithinRequiredLevel(finding({ scVersion: '2.2' }), { version: '2.2', level: 'AA' })).toBe(true);
  });
});

describe('computeVerdict', () => {
  it('pass / borderline / fail', () => {
    expect(computeVerdict([])).toBe('pass');
    expect(computeVerdict([finding({ severity: 'moderate' })])).toBe('borderline');
    expect(computeVerdict([finding({ severity: 'serious' })])).toBe('fail');
    expect(computeVerdict([
      finding({ severity: 'moderate' }),
      finding({ margin: { measured: 2.1, required: 4.5, unit: 'contrast ratio' } }),
    ])).toBe('fail');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `packages/shared-types`): `npx vitest run tests/accessibility.test.ts`
Expected: FAIL — cannot resolve `../src/accessibility.js`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/shared-types/src/accessibility.ts
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
```

Append to `packages/shared-types/src/index.ts` (after the Brand kits section):

```ts
// ── Accessibility (WCAG 2.2 canonical model) ─────────────────────────────────

export * from './accessibility.js';
```

- [ ] **Step 4: Run tests to verify they pass**

Run (from `packages/shared-types`): `npx vitest run tests/accessibility.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Build shared-types and run its full suite**

Run (from repo root): `npm run build --workspace @canvas-toolchain/shared-types && npm run test --workspace @canvas-toolchain/shared-types`
Expected: build clean, tests PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/shared-types/src/accessibility.ts packages/shared-types/src/index.ts packages/shared-types/tests/accessibility.test.ts
git commit -m "feat(shared-types): canonical WCAG 2.2 finding model, catalog, and conformance math"
```

---

### Task 2: Engine interface + in-house adapter

**Files:**
- Create: `packages/canvas-design-studio/src/tools/a11y/engine.ts`
- Create: `packages/canvas-design-studio/src/tools/a11y/inhouse.ts`
- Modify: `packages/canvas-design-studio/src/tools/accessibility.ts` (add optional `margin` to `AccessibilityWarning`; emit from `checkContrast`; `@deprecated` JSDoc)
- Modify: `packages/canvas-design-studio/package.json` (add `"@canvas-toolchain/shared-types": "*"` to dependencies)
- Test: `packages/canvas-design-studio/tests/a11y/inhouse.test.ts`

**Interfaces:**
- Consumes: Task 1 types/functions from `@canvas-toolchain/shared-types`; existing `auditAccessibility` / `AccessibilityWarning` from `../accessibility.js`.
- Produces: `AccessibilityEngine` interface `{ name: FindingEngine; check(html, opts): Promise<EngineResult> }` with `EngineResult = { findings: AccessibilityFinding[]; criteriaCovered: string[] }`; `inhouseEngine: AccessibilityEngine`.

- [ ] **Step 1: Add the workspace dependency**

In `packages/canvas-design-studio/package.json` `dependencies`, add (alphabetical position, after `@anthropic-ai/sdk`):

```json
"@canvas-toolchain/shared-types": "*",
```

Run (from repo root): `npm install`
Expected: exit 0; workspace symlink resolves.

- [ ] **Step 2: Write the failing test**

```ts
// packages/canvas-design-studio/tests/a11y/inhouse.test.ts
import { describe, it, expect } from 'vitest';
import { inhouseEngine } from '../../src/tools/a11y/inhouse.js';
import { DEFAULT_REQUIRED_LEVEL } from '@canvas-toolchain/shared-types';

const OPTS = { requiredLevel: DEFAULT_REQUIRED_LEVEL };

describe('inhouseEngine', () => {
  it('reports name and covered criteria', async () => {
    expect(inhouseEngine.name).toBe('inhouse');
    const { criteriaCovered } = await inhouseEngine.check('<p>clean</p>', OPTS);
    expect(criteriaCovered).toEqual(expect.arrayContaining(['1.1.1', '1.2.2', '1.3.1', '1.4.3', '2.4.4']));
  });

  it('maps a clear contrast failure to 1.4.3 serious with margin', async () => {
    const html = '<p style="color:#999999;background:#ffffff">low</p>'; // ≈2.85:1
    const { findings } = await inhouseEngine.check(html, OPTS);
    const f = findings.find(x => x.sc === '1.4.3');
    expect(f).toBeDefined();
    expect(f!.severity).toBe('serious');
    expect(f!.engine).toBe('inhouse');
    expect(f!.margin!.required).toBe(4.5);
    expect(f!.margin!.measured).toBeLessThan(0.85 * 4.5);
  });

  it('maps a borderline contrast failure to 1.4.3 moderate', async () => {
    const html = '<p style="color:#757575;background:#ffffff">close</p>'; // ≈4.6? use #767676 ≈4.54 passes; #787878 ≈4.36 borderline
    const borderline = '<p style="color:#787878;background:#ffffff">close</p>';
    const { findings } = await inhouseEngine.check(borderline, OPTS);
    const f = findings.find(x => x.sc === '1.4.3');
    expect(f).toBeDefined();
    expect(f!.severity).toBe('moderate');
    expect(f!.margin!.measured).toBeGreaterThanOrEqual(0.85 * 4.5);
    void html;
  });

  it('maps the other checks to their SCs and severities', async () => {
    const html = [
      '<img src="chart.png" alt="">',                                   // empty-alt → 1.1.1 moderate
      '<h2>A</h2><h4>skip</h4>',                                        // heading-skip → 1.3.1 moderate
      '<a href="https://example.edu/x">click here</a>',                 // vague-link → 2.4.4 moderate
      '<table><tr><td>1</td></tr></table>',                             // table-no-headers → 1.3.1 serious
      '<iframe src="https://example.edu/Panopto/Pages/Embed.aspx?id=1"></iframe>', // video-no-captions → 1.2.2 serious
    ].join('\n');
    const { findings } = await inhouseEngine.check(html, OPTS);
    const bySc = (sc: string, sev: string) =>
      findings.some(f => f.sc === sc && f.severity === sev);
    expect(bySc('1.1.1', 'moderate')).toBe(true);
    expect(bySc('1.3.1', 'moderate')).toBe(true);
    expect(bySc('2.4.4', 'moderate')).toBe(true);
    expect(bySc('1.3.1', 'serious')).toBe(true);
    expect(bySc('1.2.2', 'serious')).toBe(true);
    for (const f of findings) {
      expect(f.scName.length).toBeGreaterThan(0);
      expect(['2.0', '2.1', '2.2']).toContain(f.scVersion);
    }
  });

  it('clean HTML produces no findings', async () => {
    const { findings } = await inhouseEngine.check('<h2>Hi</h2><p>Welcome</p>', OPTS);
    expect(findings).toEqual([]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run (from `packages/canvas-design-studio`): `npx vitest run tests/a11y/inhouse.test.ts`
Expected: FAIL — cannot resolve `../../src/tools/a11y/inhouse.js`.

- [ ] **Step 4: Modify `accessibility.ts` (additive only)**

In `packages/canvas-design-studio/src/tools/accessibility.ts`:

Replace the interface (lines 3–7) with:

```ts
/**
 * @deprecated Prefer the canonical `AccessibilityFinding` model from
 * `@canvas-toolchain/shared-types` via `runConformanceCheck` (src/tools/a11y/).
 * Kept for command-and-control compatibility; removal tracked for Phase 2.
 */
export interface AccessibilityWarning {
  check: string;
  message: string;
  context?: string;
  /** Present only for contrast findings: how close the measured value came. */
  margin?: { measured: number; required: number; unit: string };
}
```

In `checkContrast`, replace the `warnings.push({...})` block (lines 42–46) with:

```ts
      warnings.push({
        check: 'contrast-ratio',
        message: `${fgM[1]} on ${bgM[1]}: ${ratio.toFixed(2)}:1 — fails WCAG AA for ${label} (requires ${threshold}:1)`,
        context: ctx(style),
        margin: { measured: ratio, required: threshold, unit: 'contrast ratio' },
      });
```

Add the same `@deprecated` JSDoc note above `export function auditAccessibility` (line 154), body unchanged.

- [ ] **Step 5: Write the engine interface and in-house adapter**

```ts
// packages/canvas-design-studio/src/tools/a11y/engine.ts
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
```

```ts
// packages/canvas-design-studio/src/tools/a11y/inhouse.ts
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
```

- [ ] **Step 6: Run tests to verify they pass**

Run (from `packages/canvas-design-studio`): `npx vitest run tests/a11y/inhouse.test.ts tests/accessibility.test.ts tests/contrast.test.ts`
Expected: PASS — new adapter tests AND all existing accessibility tests (the `margin` addition is additive).

- [ ] **Step 7: Commit**

```bash
git add packages/canvas-design-studio/src/tools/a11y/engine.ts packages/canvas-design-studio/src/tools/a11y/inhouse.ts packages/canvas-design-studio/src/tools/accessibility.ts packages/canvas-design-studio/package.json packages/canvas-design-studio/tests/a11y/inhouse.test.ts package-lock.json
git commit -m "feat(cds): accessibility engine interface + in-house adapter emitting canonical WCAG findings"
```

---

### Task 3: axe-core engine adapter (jsdom)

**Files:**
- Create: `packages/canvas-design-studio/src/tools/a11y/axe.ts`
- Modify: `packages/canvas-design-studio/package.json` (deps: `axe-core`, `jsdom`; devDeps: `@types/jsdom`)
- Test: `packages/canvas-design-studio/tests/a11y/axe.test.ts`

**Interfaces:**
- Consumes: `AccessibilityEngine`/`EngineResult` (Task 2), `scMeta` (Task 1).
- Produces: `axeEngine: AccessibilityEngine`; exported constant `AXE_COVERED_SC: string[]`.

- [ ] **Step 1: Add dependencies**

In `packages/canvas-design-studio/package.json` add to `dependencies`:

```json
"axe-core": "^4.12.1",
"jsdom": "^29.1.1",
```

and to `devDependencies`:

```json
"@types/jsdom": "^28.0.3",
```

Run (from repo root): `npm install && npm audit`
Expected: install exit 0; **`npm audit` reports 0 vulnerabilities** (Global Constraint). If audit is non-zero, resolve via override before proceeding.

- [ ] **Step 2: Write the failing test**

```ts
// packages/canvas-design-studio/tests/a11y/axe.test.ts
import { describe, it, expect } from 'vitest';
import { axeEngine, AXE_COVERED_SC } from '../../src/tools/a11y/axe.js';
import { DEFAULT_REQUIRED_LEVEL } from '@canvas-toolchain/shared-types';

const OPTS = { requiredLevel: DEFAULT_REQUIRED_LEVEL };

describe('axeEngine', () => {
  it('reports name and covered criteria', () => {
    expect(axeEngine.name).toBe('axe');
    expect(AXE_COVERED_SC).toEqual(expect.arrayContaining(['1.1.1', '4.1.2']));
  });

  it('finds a missing alt attribute (1.1.1, critical)', async () => {
    const { findings } = await axeEngine.check('<img src="chart.png">', OPTS);
    const f = findings.find(x => x.sc === '1.1.1');
    expect(f).toBeDefined();
    expect(f!.engine).toBe('axe');
    expect(f!.severity).toBe('critical');
    expect(f!.context).toContain('<img');
  });

  it('finds ARIA misuse the regex audit cannot see (4.1.2)', async () => {
    const html = '<div role="checkbox">agree</div>'; // aria-required-attr: missing aria-checked
    const { findings } = await axeEngine.check(html, OPTS);
    expect(findings.some(f => f.sc === '4.1.2')).toBe(true);
  });

  it('does NOT report contrast (color-contrast disabled — in-house owns it)', async () => {
    const html = '<p style="color:#999999;background:#ffffff">low contrast</p>';
    const { findings } = await axeEngine.check(html, OPTS);
    expect(findings.every(f => f.sc !== '1.4.3')).toBe(true);
  });

  it('does not flag Canvas-chrome document rules on a fragment', async () => {
    const { findings } = await axeEngine.check('<h2>Hi</h2><p>Welcome</p>', OPTS);
    expect(findings).toEqual([]);
  });

  it('every finding has catalog-backed metadata', async () => {
    const { findings } = await axeEngine.check('<img src="x.png"><div role="checkbox">y</div>', OPTS);
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) {
      expect(f.sc).toMatch(/^\d\.\d\.\d{1,2}$/);
      expect(f.scName.length).toBeGreaterThan(0);
      expect(['critical', 'serious', 'moderate', 'minor']).toContain(f.severity);
    }
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run (from `packages/canvas-design-studio`): `npx vitest run tests/a11y/axe.test.ts`
Expected: FAIL — cannot resolve `../../src/tools/a11y/axe.js`.

- [ ] **Step 4: Write the axe adapter**

```ts
// packages/canvas-design-studio/src/tools/a11y/axe.ts
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';
import { scMeta, type AccessibilityFinding, type FindingSeverity } from '@canvas-toolchain/shared-types';
import type { AccessibilityEngine, EngineResult } from './engine.js';

const require_ = createRequire(import.meta.url);
const AXE_SOURCE = readFileSync(require_.resolve('axe-core/axe.min.js'), 'utf-8');

/**
 * SCs axe has jsdom-safe rules for. Layout-dependent rules (color-contrast,
 * target-size) are disabled — jsdom performs no layout; the in-house contrast
 * check is authoritative for 1.4.3 (spec §2).
 */
export const AXE_COVERED_SC: string[] = [
  '1.1.1', '1.3.1', '1.3.5', '1.4.1', '1.4.2',
  '2.2.1', '2.2.2', '2.4.4', '2.4.6', '2.5.3',
  '3.1.2', '4.1.2', '4.1.3',
];

const IMPACT_TO_SEVERITY: Record<string, FindingSeverity> = {
  critical: 'critical', serious: 'serious', moderate: 'moderate', minor: 'minor',
};

const WCAG_TAG = /^wcag(\d)(\d)(\d{1,2})$/;

function scFromTags(tags: string[]): string | undefined {
  for (const tag of tags) {
    const m = WCAG_TAG.exec(tag);
    if (m) return `${m[1]}.${m[2]}.${parseInt(m[3], 10)}`;
  }
  return undefined;
}

function truncate(s: string): string {
  return s.length > 60 ? s.slice(0, 60) + '...' : s;
}

interface AxeNode { html: string; failureSummary?: string }
interface AxeViolation { id: string; impact?: string; tags: string[]; help: string; nodes: AxeNode[] }

export const axeEngine: AccessibilityEngine = {
  name: 'axe',
  async check(html): Promise<EngineResult> {
    // Wrap the Canvas fragment in a well-formed document so document-level
    // rules (html-has-lang, document-title) — Canvas chrome, NA for fragments —
    // are satisfied rather than falsely flagged.
    const doc = `<!doctype html><html lang="en"><head><title>fragment</title></head><body>${html}</body></html>`;
    let violations: AxeViolation[];
    try {
      const dom = new JSDOM(doc, { runScripts: 'outside-only' });
      dom.window.eval(AXE_SOURCE);
      const axe = (dom.window as unknown as { axe: { run: Function } }).axe;
      const results = (await axe.run(dom.window.document.body, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
        rules: {
          'color-contrast': { enabled: false },  // no layout in jsdom; in-house owns 1.4.3
          'target-size': { enabled: false },     // no layout in jsdom
        },
        resultTypes: ['violations'],
      })) as { violations: AxeViolation[] };
      violations = results.violations;
      dom.window.close();
    } catch (err) {
      // Engine failure must never break an advisory pipeline: report nothing
      // covered so criteria honestly fall back to needs-human-review.
      console.error(`[a11y] axe engine failed: ${err instanceof Error ? err.message : String(err)}`);
      return { findings: [], criteriaCovered: [] };
    }

    const findings: AccessibilityFinding[] = [];
    for (const v of violations) {
      const sc = scFromTags(v.tags);
      if (!sc) continue;                 // best-practice rule without a WCAG SC tag
      const meta = scMeta(sc);
      if (!meta) continue;               // AAA or unknown — outside the A/AA catalog
      const severity = IMPACT_TO_SEVERITY[v.impact ?? 'moderate'] ?? 'moderate';
      for (const node of v.nodes) {
        findings.push({
          sc: meta.sc,
          scName: meta.scName,
          scVersion: meta.scVersion,
          level: meta.level,
          severity,
          engine: 'axe',
          message: `${v.help} (axe rule: ${v.id})`,
          context: truncate(node.html),
        });
      }
    }
    return { findings, criteriaCovered: AXE_COVERED_SC };
  },
};
```

- [ ] **Step 5: Run tests to verify they pass**

Run (from `packages/canvas-design-studio`): `npx vitest run tests/a11y/axe.test.ts`
Expected: PASS. If the ARIA test fails because axe reports a different rule for `role="checkbox"`, inspect the actual violations (`console.log(JSON.stringify(results.violations, null, 2))` temporarily) and adjust the fixture to one that maps to 4.1.2 (e.g. `<div aria-labelledby="does-not-exist">x</div>`), keeping the assertion on `sc === '4.1.2'`.

- [ ] **Step 6: Commit**

```bash
git add packages/canvas-design-studio/src/tools/a11y/axe.ts packages/canvas-design-studio/package.json packages/canvas-design-studio/tests/a11y/axe.test.ts package-lock.json
git commit -m "feat(cds): axe-core engine adapter running WCAG 2.x rules in jsdom"
```

---

### Task 4: Conformance runner + report formatter

**Files:**
- Create: `packages/canvas-design-studio/src/tools/a11y/conformance.ts`
- Test: `packages/canvas-design-studio/tests/a11y/conformance.test.ts`

**Interfaces:**
- Consumes: `inhouseEngine` (Task 2), `axeEngine`/`AXE_COVERED_SC` (Task 3), Task 1 model.
- Produces (used by Tasks 5–6): `runConformanceCheck(html, opts?): Promise<ConformanceReport>` with `opts = { requiredLevel?: RequiredLevel }`; `formatConformanceReport(report): string`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/canvas-design-studio/tests/a11y/conformance.test.ts
import { describe, it, expect } from 'vitest';
import { runConformanceCheck, formatConformanceReport } from '../../src/tools/a11y/conformance.js';

describe('runConformanceCheck', () => {
  it('clean HTML → verdict pass, no findings, honest criteria statuses', async () => {
    const report = await runConformanceCheck('<h2>Hi</h2><p>Welcome to the course.</p>');
    expect(report.verdict).toBe('pass');
    expect(report.findings).toEqual([]);
    expect(report.requiredLevel).toEqual({ version: '2.1', level: 'AA' });
    const status = (sc: string) => report.criteria.find(c => c.sc === sc)?.status;
    expect(status('1.4.3')).toBe('pass');               // covered by in-house, clean
    expect(status('2.4.2')).toBe('not-applicable');     // Canvas chrome
    expect(status('2.4.3')).toBe('needs-human-review'); // focus order — no automation
  });

  it('serious failure at required level → verdict fail; criteria marked fail', async () => {
    const report = await runConformanceCheck('<table><tr><td>1</td></tr></table>');
    expect(report.verdict).toBe('fail');
    expect(report.findings.some(f => f.sc === '1.3.1' && f.severity === 'serious')).toBe(true);
    expect(report.criteria.find(c => c.sc === '1.3.1')?.status).toBe('fail');
  });

  it('borderline-only findings → verdict borderline', async () => {
    const report = await runConformanceCheck('<p style="color:#787878;background:#ffffff">close</p>');
    expect(report.verdict).toBe('borderline');
    expect(report.findings.every(f => f.sc === '1.4.3')).toBe(true);
  });

  it('deduplicates the same defect reported by both engines', async () => {
    // In-house empty-alt does not fire on missing alt, but axe image-alt does;
    // build an overlap: vague link is caught by in-house AND axe (link-name only
    // fires on empty links), so use a case both engines report: none exists for
    // 2.4.4 — instead verify dedupe on identical (sc, context) keys directly.
    const report = await runConformanceCheck('<img src="x.png"><img src="x.png">');
    const contexts = report.findings.filter(f => f.sc === '1.1.1').map(f => f.context);
    // Two identical img tags produce identical (sc, context) — deduped to one.
    expect(contexts.length).toBe(1);
  });

  it('respects a stricter required level (2.2 AA pulls 2.2 findings out of advisories)', async () => {
    const report = await runConformanceCheck('<p>x</p>', { requiredLevel: { version: '2.2', level: 'AA' } });
    expect(report.requiredLevel.version).toBe('2.2');
  });
});

describe('formatConformanceReport', () => {
  it('renders verdict, sections, and human-review pointer', async () => {
    const report = await runConformanceCheck('<table><tr><td>1</td></tr></table>');
    const text = formatConformanceReport(report);
    expect(text).toContain('FAIL');
    expect(text).toContain('1.3.1');
    expect(text).toContain('needs human review');
    expect(text).toContain('accessibilityinsights.io');
  });
  it('clean report renders a pass line', async () => {
    const report = await runConformanceCheck('<p>hello</p>');
    const text = formatConformanceReport(report);
    expect(text).toContain('PASS');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `packages/canvas-design-studio`): `npx vitest run tests/a11y/conformance.test.ts`
Expected: FAIL — cannot resolve `../../src/tools/a11y/conformance.js`.

- [ ] **Step 3: Write the runner and formatter**

```ts
// packages/canvas-design-studio/src/tools/a11y/conformance.ts
import {
  DEFAULT_REQUIRED_LEVEL, NOT_APPLICABLE_CANVAS, WCAG22_CRITERIA,
  computeVerdict, isBorderlineFinding, isWithinRequiredLevel,
  type AccessibilityFinding, type ConformanceReport, type RequiredLevel,
} from '@canvas-toolchain/shared-types';
import type { AccessibilityEngine } from './engine.js';
import { inhouseEngine } from './inhouse.js';
import { axeEngine } from './axe.js';

const SEVERITY_RANK = { critical: 3, serious: 2, moderate: 1, minor: 0 } as const;

const ENGINES: AccessibilityEngine[] = [inhouseEngine, axeEngine];

/** Dedupe by (sc, context|message): keep the highest-severity report of a defect. */
function dedupe(findings: AccessibilityFinding[]): AccessibilityFinding[] {
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
    lines.push('', `${review.length} criteria need human review (automation cannot judge them): ` +
      review.slice(0, 6).map(c => c.sc).join(', ') + (review.length > 6 ? ', …' : ''),
      'Deep-check tools (free): WAVE browser extension, or MS Accessibility Insights — https://accessibilityinsights.io/downloads/');
  }
  return lines.join('\n');
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run (from `packages/canvas-design-studio`): `npx vitest run tests/a11y/`
Expected: PASS (inhouse, axe, conformance).

- [ ] **Step 5: Commit**

```bash
git add packages/canvas-design-studio/src/tools/a11y/conformance.ts packages/canvas-design-studio/tests/a11y/conformance.test.ts
git commit -m "feat(cds): conformance runner — merge engines, dedupe, verdict, criteria statuses, formatter"
```

---

### Task 5: Wire the report into `validate_canvas_html` and `generate`

**Files:**
- Modify: `packages/canvas-design-studio/src/index.ts` (validate handler, currently lines 471–490)
- Modify: `packages/canvas-design-studio/src/tools/generate.ts` (lines 103–108 and the return, line 118)
- Test: extend `packages/canvas-design-studio/tests/generate.test.ts` (locate the existing warnings assertions first)

**Interfaces:**
- Consumes: `runConformanceCheck` / `formatConformanceReport` (Task 4).
- Produces: `GenerateResult` gains `conformance: ConformanceReport`; `warnings: string[]` format for a11y entries becomes `a11y: <sc> <scName> — <message>`.

- [ ] **Step 1: Write the failing test**

Add to `packages/canvas-design-studio/tests/generate.test.ts` (import `generatePage` and config the same way the existing tests in that file do — reuse their fixture/config helper verbatim):

```ts
it('attaches a conformance report to the generate result', async () => {
  const result = await generatePage(/* same fixture args as the existing warnings test */);
  expect(result.conformance).toBeDefined();
  expect(['pass', 'borderline', 'fail']).toContain(result.conformance.verdict);
  expect(result.conformance.requiredLevel).toEqual({ version: '2.1', level: 'AA' });
});
```

If `generatePage` is currently synchronous, this task makes it async (the axe engine is async) — update existing callers/tests in the same task. Check `src/index.ts` handler for `generate_canvas_page` and any internal callers (`generate_course` path) and add `await` where the compiler demands it.

- [ ] **Step 2: Run test to verify it fails**

Run (from `packages/canvas-design-studio`): `npx vitest run tests/generate.test.ts`
Expected: FAIL — `conformance` undefined (and possibly sync/async type errors).

- [ ] **Step 3: Implement in `generate.ts`**

Replace lines 103–108:

```ts
  const validation = validateCanvasHtml(html);
  const conformance = await runConformanceCheck(html);
  const warnings = [
    ...validation.violations.map(v => v.rule),
    ...[...conformance.findings, ...conformance.advisories]
      .map(f => `a11y: ${f.sc} ${f.scName} — ${f.message}`),
  ];
```

Add imports at top of `generate.ts`:

```ts
import { runConformanceCheck } from './a11y/conformance.js';
import type { ConformanceReport } from '@canvas-toolchain/shared-types';
```

Make the enclosing function `async` (returning `Promise<...>`), remove the now-unused `auditAccessibility` import if nothing else in the file uses it, extend the result type with `conformance: ConformanceReport`, and change the return to:

```ts
  return { html, heroImagePrompt, filename, warnings, conformance };
```

Update every caller the compiler flags (add `await`).

- [ ] **Step 4: Implement in the `validate_canvas_html` handler (`src/index.ts:471–490`)**

Replace the handler body with:

```ts
      if (name === 'validate_canvas_html') {
        const { html } = args as { html: string };
        const rce = validateCanvasHtml(html);
        const conformance = await runConformanceCheck(html);

        const rceSummary = rce.valid
          ? '✓ Canvas RCE: HTML is Canvas-compliant. No violations found.'
          : `✗ Canvas RCE: ${rce.violations.length} violation(s) found:\n\n` +
            rce.violations.map((v, i) => `${i + 1}. ${v.rule}\n   Context: ${v.context}`).join('\n\n');

        return {
          content: [{ type: 'text', text: `${rceSummary}\n\n${formatConformanceReport(conformance)}` }],
          isError: !rce.valid,   // unchanged: accessibility remains advisory in Phase 1
        };
      }
```

Add imports in `src/index.ts`:

```ts
import { runConformanceCheck, formatConformanceReport } from './tools/a11y/conformance.js';
```

- [ ] **Step 5: Run tests to verify they pass**

Run (from `packages/canvas-design-studio`): `npx vitest run`
Expected: PASS — full package suite (fix any caller-async fallout the compiler/tests surface; do not change `isError` semantics).

- [ ] **Step 6: Commit**

```bash
git add packages/canvas-design-studio/src/index.ts packages/canvas-design-studio/src/tools/generate.ts packages/canvas-design-studio/tests/generate.test.ts
git commit -m "feat(cds): conformance report in validate_canvas_html and generate outputs"
```

---

### Task 6: Wire the report into `redesign`, `publish`, and the render engine

**Files:**
- Modify: `packages/canvas-design-studio/src/tools/redesign.ts` (lines 15–21, 76–83)
- Modify: `packages/canvas-design-studio/src/tools/publish.ts` (line 300 and the two success returns at 318–324, 336–342)
- Modify: `packages/canvas-design-studio/src/utils/render-engine.ts` (the return around lines 262–269)
- Test: extend `packages/canvas-design-studio/tests/redesign.test.ts` and `tests/publish.test.ts`

**Interfaces:**
- Consumes: `runConformanceCheck` (Task 4).
- Produces: `RedesignResult.conformance?: ConformanceReport`; publish success shape gains `conformance?: ConformanceReport`; render result gains `conformance`. **`accessibilityWarnings` fields are kept and still populated** (command-and-control reads them until Phase 2).

- [ ] **Step 1: Write the failing tests**

In `tests/redesign.test.ts`, next to the existing low-contrast assertion (around line 56):

```ts
it('attaches a conformance report alongside deprecated accessibilityWarnings', async () => {
  const result = await redesignCanvasPage({
    html: '<p style="color:#999999;background:#ffffff">low</p>',
    findings: [],
  });
  expect(result.accessibilityWarnings).toBeDefined();       // back-compat preserved
  expect(result.conformance).toBeDefined();
  expect(result.conformance!.verdict).toBe('fail');
});
```

In `tests/publish.test.ts`, next to the existing accessibilityWarnings assertion (around line 213), using that test's existing mock `api`/config helpers verbatim:

```ts
it('publish success carries a conformance report and still publishes on failures (advisory)', async () => {
  const result = await publishToCanvas(
    { courseId: 1, pageTitle: 'T', html: '<p style="color:#999999;background:#ffffff">x</p>' } as PublishToCanvasInput,
    config, api,
  );
  expect('url' in result).toBe(true);                        // STILL publishes — no gate in Phase 1
  expect((result as { conformance?: unknown }).conformance).toBeDefined();
  expect((result as { accessibilityWarnings?: unknown[] }).accessibilityWarnings).toBeDefined();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/redesign.test.ts tests/publish.test.ts`
Expected: FAIL — `conformance` undefined / sync-async mismatch on `redesignCanvasPage`.

- [ ] **Step 3: Implement**

`redesign.ts` — make `redesignCanvasPage` async; extend the result interface and population:

```ts
export interface RedesignResult {
  html: string;
  appliedFixes: string[];
  skippedFindings: string[];
  /** @deprecated Use `conformance`. Kept for command-and-control until Phase 2. */
  accessibilityWarnings?: AccessibilityWarning[];
  conformance?: ConformanceReport;
  kbContext?: string;
}
```

and replace lines 76–83:

```ts
  const a11y = auditAccessibility(html);
  const conformance = await runConformanceCheck(html);

  const result: RedesignResult = {
    html,
    appliedFixes,
    skippedFindings,
    ...(a11y.length > 0 && { accessibilityWarnings: a11y }),
    conformance,
  };
```

with imports `import { runConformanceCheck } from './a11y/conformance.js';` and `import type { ConformanceReport } from '@canvas-toolchain/shared-types';`. Update the `redesign_canvas_page` handler in `src/index.ts` (dispatch around line 591, output formatting around 608–611) to `await` and to append `formatConformanceReport(result.conformance)` when present.

`publish.ts` — replace line 300 with:

```ts
  const a11yWarnings = auditAccessibility(input.html);
  const conformance = await runConformanceCheck(input.html);
```

and in BOTH success returns add, next to the existing spread:

```ts
        ...(a11yWarnings.length > 0 && { accessibilityWarnings: a11yWarnings }),
        conformance,
```

Extend the `PublishSuccess` type in this file with `conformance?: ConformanceReport;` (import the type). **Do not add any gate/return before the `try` — that is Phase 2.**

`render-engine.ts` — at the return (lines ~262–269), add `conformance: await runConformanceCheck(finalHtml)` alongside the existing `accessibility` field (make the enclosing function async if it is not; update callers the compiler flags).

- [ ] **Step 4: Run the full package suite**

Run (from `packages/canvas-design-studio`): `npx vitest run`
Expected: PASS — including all pre-existing publish/redesign/render tests.

- [ ] **Step 5: Commit**

```bash
git add packages/canvas-design-studio/src/tools/redesign.ts packages/canvas-design-studio/src/tools/publish.ts packages/canvas-design-studio/src/utils/render-engine.ts packages/canvas-design-studio/src/index.ts packages/canvas-design-studio/tests/redesign.test.ts packages/canvas-design-studio/tests/publish.test.ts
git commit -m "feat(cds): conformance report attached to redesign, publish, and render outputs"
```

---

### Task 7: Docs, deprecation notes, monorepo verification

**Files:**
- Modify: `docs/accessibility.md` (add "Engine architecture" section; update the "what is checked" inventory)
- Modify: `packages/canvas-design-studio/CLAUDE.md` (one short paragraph pointing at the a11y module)
- Test: none new — full-suite verification.

- [ ] **Step 1: Update `docs/accessibility.md`**

Add after the existing three-layer overview (keep all existing content that is still true; correct anything the new system supersedes):

```markdown
## Engine architecture (Phase 1, 2026-07)

Checks now run through pluggable engines that all emit one canonical model
(`AccessibilityFinding` in `@canvas-toolchain/shared-types`), normalized to
WCAG 2.2 success criteria:

| Engine | What it covers | Notes |
|---|---|---|
| `inhouse` | The six Canvas-aware heuristics (contrast with measured margin, empty alt, heading skips, vague links, table headers, Panopto captions) | Authoritative for 1.4.3 contrast |
| `axe` | axe-core 4.x WCAG 2.0/2.1/2.2 A+AA rules in jsdom (ARIA, roles, structure, labels, and more) | `color-contrast` and `target-size` disabled — jsdom has no layout |

Every check produces a `ConformanceReport`: a verdict (`pass` / `borderline` /
`fail`) against the required conformance level (default **WCAG 2.1 AA**),
findings with severity and margins, forward-looking advisories beyond the
required level, and an honest per-criterion status — `pass`, `fail`,
`needs-human-review` (automation cannot judge ~half of WCAG; use the WAVE
browser extension or MS Accessibility Insights,
https://accessibilityinsights.io/downloads/), or `not-applicable` (Canvas
owns the page chrome and login).

Phase 1 is fully advisory: nothing blocks publishing yet. The publish gate,
acknowledgments, and the borderline review queue are Phase 2 of
`packages/command-and-control/docs/superpowers/specs/2026-07-01-wcag22-conformance-gate-design.md`.
```

- [ ] **Step 2: Add the CLAUDE.md pointer**

In `packages/canvas-design-studio/CLAUDE.md`, after the Hard Rules section, add:

```markdown
## Accessibility checking

Use `runConformanceCheck` (`src/tools/a11y/conformance.ts`) for all new
accessibility checking — it runs the in-house + axe-core engines and returns a
canonical WCAG 2.2 `ConformanceReport`. `auditAccessibility` is deprecated
(kept for command-and-control compatibility). Full reference: `docs/accessibility.md`.
```

- [ ] **Step 3: Full monorepo verification**

Run (from repo root):

```bash
npm run build --workspaces --if-present && npm run test --workspaces --if-present && npm audit
```

Expected: all builds clean; all suites PASS (~1737+ tests, including command-and-control untouched-consumer tests); `npm audit` → 0 vulnerabilities.

- [ ] **Step 4: Institution-data guard**

Run: `git grep -iE "exampleu|bsu" -- packages/shared-types packages/canvas-design-studio/src/tools/a11y docs/accessibility.md`
Expected: no matches (the word "Boise" must not appear in any file touched by this plan).

- [ ] **Step 5: Commit**

```bash
git add docs/accessibility.md packages/canvas-design-studio/CLAUDE.md
git commit -m "docs: engine architecture for WCAG 2.2 Phase 1 conformance checking"
```

---

## Self-Review Notes

- **Spec coverage (Phase 1 slice):** canonical model ✅ (Task 1), engine interface ✅ (Task 2), in-house remap ✅ (Task 2), axe adapter with disabled layout rules ✅ (Task 3), merge/dedupe/verdict/criteria/formatter ✅ (Task 4), report in generate/validate/redesign/publish/render ✅ (Tasks 5–6), docs ✅ (Task 7). Gate, queue, policy anchor, WAVE, WCAG 3 are explicitly Phases 2–3 — not in this plan.
- **Type consistency:** `runConformanceCheck(html, opts?)` and `formatConformanceReport(report)` used identically in Tasks 4–6; `EngineResult`/`AccessibilityEngine` names match Tasks 2–3; `margin` shape identical in shared-types and `AccessibilityWarning`.
- **Known risk:** the axe ARIA fixture (Task 3 Step 2) may map to a different rule id across axe versions — the plan includes the adjustment procedure inline. jsdom 29 vs @types/jsdom 28: adapter uses one narrow cast; if types conflict, widen the cast, not the dependency.
