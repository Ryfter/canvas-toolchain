# WCAG 2.2 Phase 3 — Institution Policy Anchor, WCAG 3 Advisory, WAVE Deep Check

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship spec Phase 3 (`packages/command-and-control/docs/superpowers/specs/2026-07-01-wcag22-conformance-gate-design.md` §4, §7, §8): the institutional policy anchor with cadence nudge + `review_accessibility_policy` tool, the opt-in WCAG 3 draft advisory layer, and the WAVE API deep-check adapter + `wave_deep_check` tool — plus the V&R-wide relative-path keying of the `approvals`/`a11yAcknowledgments` maps deferred here by #111/#112/#113. Ships as **v1.11.0**, closes **#108**.

**Architecture:** The policy lives inside the existing CDS institution config (`~/.canvas-design-mcp/institution.json`, owned by `src/config.ts`) as an `accessibilityPolicy` block; a new CDS `src/tools/a11y/policy.ts` owns load/save/decorate and exposes `runPolicyConformanceCheck` — a policy-aware wrapper around the existing pure `runConformanceCheck`. All seven production conformance call sites switch to the wrapper; the pure function stays for hermetic tests. C&C gains two tools (`review_accessibility_policy`, `wave_deep_check`) that reach the CDS layer via `canvas-design-mcp/dist/...` imports, exactly like `records.js` today. The WAVE adapter is **not** in the `ENGINES` list — it evaluates by public URL, not by HTML string, so it is a standalone deep-check function with a pre-flight auth-gate refusal that never spends credits on Canvas-login pages.

**Tech Stack:** TypeScript, vitest, existing Phase 1/2 conformance stack, Node's global `fetch` (Node ≥ 20 — no new dependency), fixture-driven WAVE tests (no live API calls in CI).

## Global Constraints

- **TDD** — every task: failing test first, watch it fail, minimal code, watch it pass, commit.
- **No new runtime dependencies.** WAVE uses global `fetch`.
- **No live WAVE API calls in tests/CI** (spec §9) — recorded JSON fixtures only.
- **No automatic WAVE spending** (spec non-goal) — `wave_deep_check` uses a two-call confirm gate; nothing runs without `confirm: true`.
- **WCAG 3 never gates** (spec §8) — `wcag3Advisory` has zero effect on `verdict` or the publish gate.
- **The professor is the final arbiter** — all Phase 3 output informs and nudges; nothing new blocks.
- **No institution-specific data in this public repo** — tests and docs use `example.edu` / `example.instructure.com` placeholders only (spec non-goal; standing rule).
- **Default required level stays WCAG 2.1 AA** (`DEFAULT_REQUIRED_LEVEL`); absent policy config, every output is byte-identical to today.
- Branch: `feat/wcag22-phase3`. One PR, squash-merge, body `Closes #108`.
- Verification floor before the PR: root `npm run build` exit 0, root `npm test` all green, `npm run smoke:integration --workspace=packages/command-and-control` green, BSU-grep guard clean.

**Explicitly deferred (not in this plan):** `setup_institution` onboarding prompts for policy URLs (spec §7 marks them skippable-with-defaults; `review_accessibility_policy` fully covers configuration — worksheet/wizard fields can ride a later polish PR). WAVE triage auto-recommendation *before an acknowledgment call* (spec §4 item 3) is covered by the deep-check line already present in blocked-gate conformance reports; no separate interception is built.

---

### Task 1: shared-types — policy model, cadence nudge, WCAG 3 map

**Files:**
- Modify: `packages/shared-types/src/accessibility.ts` (append after the `evaluateAcknowledgment` block; also add three optional fields to `ConformanceReport`)
- Test: `packages/shared-types/tests/accessibility-policy.test.ts` (new)

**Interfaces:**
- Consumes: existing `RequiredLevel`, `DEFAULT_REQUIRED_LEVEL`, `AccessibilityFinding`, `ConformanceReport` in the same file.
- Produces (used by Tasks 2, 3, 5): `AccessibilityPolicy` interface; `DEFAULT_ACCESSIBILITY_POLICY`; `policyNudge(policy: AccessibilityPolicy, now?: Date): string | undefined`; `Wcag3Advisory`; `WCAG3_DRAFT_DATE`; `WCAG3_OUTCOME_MAP`; `mapFindingsToWcag3(findings: AccessibilityFinding[]): Wcag3Advisory[]`; `ConformanceReport` gains `wcag3?: Wcag3Advisory[]`, `policyNudge?: string`, `recommendedChecker?: string`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared-types/tests/accessibility-policy.test.ts
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_ACCESSIBILITY_POLICY, policyNudge, mapFindingsToWcag3, WCAG3_OUTCOME_MAP,
  type AccessibilityPolicy, type AccessibilityFinding,
} from '../src/accessibility.js';

const finding = (sc: string, message = 'msg'): AccessibilityFinding => ({
  sc, scName: 'x', scVersion: '2.1', level: 'AA', severity: 'serious', engine: 'inhouse', message,
});

describe('DEFAULT_ACCESSIBILITY_POLICY', () => {
  it('defaults to WCAG 2.1 AA, 4-week cadence, WCAG 3 off', () => {
    expect(DEFAULT_ACCESSIBILITY_POLICY.requiredConformance).toEqual({ version: '2.1', level: 'AA' });
    expect(DEFAULT_ACCESSIBILITY_POLICY.recheckWeeks).toBe(4);
    expect(DEFAULT_ACCESSIBILITY_POLICY.wcag3Advisory).toBe(false);
    expect(DEFAULT_ACCESSIBILITY_POLICY.urls).toEqual([]);
  });
});

describe('policyNudge', () => {
  const base: AccessibilityPolicy = { ...DEFAULT_ACCESSIBILITY_POLICY, urls: ['https://www.example.edu/accessibility/'] };

  it('is undefined when the policy has never been verified', () => {
    expect(policyNudge(base, new Date('2026-08-01T00:00:00Z'))).toBeUndefined();
  });

  it('is undefined inside the cadence window (exactly at the boundary passes)', () => {
    const p = { ...base, lastVerifiedAt: '2026-07-01' };
    // exactly 28 days later — not yet overdue
    expect(policyNudge(p, new Date('2026-07-29T00:00:00Z'))).toBeUndefined();
  });

  it('fires past the cadence and names the date + urls', () => {
    const p = { ...base, lastVerifiedAt: '2026-05-01' };
    const nudge = policyNudge(p, new Date('2026-07-01T00:00:00Z'));
    expect(nudge).toContain('2026-05-01');
    expect(nudge).toContain('https://www.example.edu/accessibility/');
  });

  it('honors a custom recheckWeeks', () => {
    const p = { ...base, lastVerifiedAt: '2026-06-20', recheckWeeks: 1 };
    expect(policyNudge(p, new Date('2026-07-01T00:00:00Z'))).toBeDefined();
    expect(policyNudge(p, new Date('2026-06-25T00:00:00Z'))).toBeUndefined();
  });

  it('is undefined for a malformed lastVerifiedAt', () => {
    expect(policyNudge({ ...base, lastVerifiedAt: 'not-a-date' }, new Date())).toBeUndefined();
  });
});

describe('mapFindingsToWcag3', () => {
  it('maps known SCs to draft outcome names', () => {
    const out = mapFindingsToWcag3([finding('1.4.3'), finding('1.1.1')]);
    expect(out).toEqual([
      { sc: '1.4.3', outcome: WCAG3_OUTCOME_MAP['1.4.3'], message: 'msg' },
      { sc: '1.1.1', outcome: WCAG3_OUTCOME_MAP['1.1.1'], message: 'msg' },
    ]);
    expect(WCAG3_OUTCOME_MAP['1.4.3']).toBe('Text and visual contrast');
  });

  it('skips SCs without a draft mapping and dedupes identical findings', () => {
    const out = mapFindingsToWcag3([finding('9.9.9'), finding('1.4.3'), finding('1.4.3')]);
    expect(out).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/shared-types && npx vitest run tests/accessibility-policy.test.ts`
Expected: FAIL — `DEFAULT_ACCESSIBILITY_POLICY` (etc.) has no exported member.

- [ ] **Step 3: Write minimal implementation**

Append to `packages/shared-types/src/accessibility.ts`:

```ts
/** Institution accessibility policy (spec §7). Stored in the CDS institution config
 *  (`accessibilityPolicy` block) — per-professor runtime data, never in this repo. */
export interface AccessibilityPolicy {
  /** Institution policy / guidance URLs the professor re-reads on cadence. */
  urls: string[];
  requiredConformance: RequiredLevel;
  /** Re-verification cadence in weeks (default 4 — fits back-to-back 5-week summer sessions). */
  recheckWeeks: number;
  /** YYYY-MM-DD the professor last re-read the policy. Unset = never verified (no nudge). */
  lastVerifiedAt?: string;
  /** WCAG 3 draft advisory layer toggle (spec §8). Structurally incapable of gating. */
  wcag3Advisory: boolean;
}

export const DEFAULT_ACCESSIBILITY_POLICY: AccessibilityPolicy = {
  urls: [],
  requiredConformance: DEFAULT_REQUIRED_LEVEL,
  recheckWeeks: 4,
  wcag3Advisory: false,
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Cadence nudge (spec §7): due only when a verification date exists and has aged past
 *  the cadence. Absent/never-verified policy never nags — the professor opted into
 *  cadence tracking by stamping lastVerifiedAt via review_accessibility_policy. */
export function policyNudge(policy: AccessibilityPolicy, now: Date = new Date()): string | undefined {
  if (!policy.lastVerifiedAt) return undefined;
  const verified = new Date(`${policy.lastVerifiedAt}T00:00:00Z`);
  if (Number.isNaN(verified.getTime())) return undefined;
  if (now.getTime() - verified.getTime() <= policy.recheckWeeks * WEEK_MS) return undefined;
  const urls = policy.urls.length > 0 ? ` — re-read: ${policy.urls.join(' , ')}` : '';
  return `Institution accessibility policy last verified ${policy.lastVerifiedAt}${urls}`;
}

/** W3C WCAG 3.0 Working Draft this mapping was built against. Revisit when W3C advances the spec. */
export const WCAG3_DRAFT_DATE = '2024-12-12';

/** 2.x SC → draft WCAG 3 outcome name (spec §8). Static, deliberately small: only
 *  outcomes with a clear 2.x analogue; draft outcomes with no analogue can't be
 *  automated and are noted in the report copy, not mapped. */
export const WCAG3_OUTCOME_MAP: Record<string, string> = {
  '1.1.1': 'Text alternatives',
  '1.2.2': 'Captions',
  '1.3.1': 'Structured content',
  '1.4.3': 'Text and visual contrast',
  '1.4.11': 'Non-text contrast',
  '2.4.4': 'Link purpose',
  '2.4.6': 'Section labels',
  '2.5.8': 'Target size',
  '3.1.1': 'Language',
  '3.3.2': 'Form labels and instructions',
  '4.1.2': 'Name, role, value',
};

export interface Wcag3Advisory {
  sc: string;        // the 2.x SC the advisory maps from
  outcome: string;   // draft WCAG 3 outcome name
  message: string;   // the underlying finding's message
}

export function mapFindingsToWcag3(findings: AccessibilityFinding[]): Wcag3Advisory[] {
  const out: Wcag3Advisory[] = [];
  const seen = new Set<string>();
  for (const f of findings) {
    const outcome = WCAG3_OUTCOME_MAP[f.sc];
    if (!outcome) continue;
    const key = `${f.sc}|${f.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ sc: f.sc, outcome, message: f.message });
  }
  return out;
}
```

And add three optional fields to the existing `ConformanceReport` interface (same file, ~line 40):

```ts
  /** Phase 3 (spec §8): draft WCAG 3 advisories — present only when the policy toggle is on. */
  wcag3?: Wcag3Advisory[];
  /** Phase 3 (spec §7): cadence reminder — present only when re-verification is overdue. */
  policyNudge?: string;
  /** Phase 3 (spec §4): set when the institution's policy URLs name a recommended checker. */
  recommendedChecker?: string;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/shared-types && npx vitest run && npm run build`
Expected: all PASS, build exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/shared-types/src/accessibility.ts packages/shared-types/tests/accessibility-policy.test.ts
git commit -m "feat(shared-types): accessibility policy model, cadence nudge, WCAG 3 draft map (Phase 3 Task 1)"
```

---

### Task 2: CDS — policy store + policy-aware conformance wrapper (`policy.ts`)

**Files:**
- Create: `packages/canvas-design-studio/src/tools/a11y/policy.ts`
- Modify: `packages/canvas-design-studio/src/types.ts` (add `accessibilityPolicy?` + `waveApiKey?` to `InstitutionConfig`, ~line 15-25)
- Test: `packages/canvas-design-studio/tests/a11y-policy.test.ts` (new)

**Interfaces:**
- Consumes: `configExists`/`loadConfig`/`saveConfig` from `../../config.js`; Task 1's `AccessibilityPolicy`, `DEFAULT_ACCESSIBILITY_POLICY`, `policyNudge`, `mapFindingsToWcag3`; existing `runConformanceCheck` from `./conformance.js`.
- Produces (used by Tasks 3-5, 7):
  - `interface PolicyDeps { exists?: () => boolean; load?: () => InstitutionConfig; save?: (c: InstitutionConfig) => void; }`
  - `loadAccessibilityPolicy(deps?: PolicyDeps): AccessibilityPolicy | undefined` — never throws
  - `saveAccessibilityPolicy(patch: Partial<AccessibilityPolicy>, deps?: PolicyDeps): AccessibilityPolicy` — throws `Error('No institution config found. Run setup_institution first.')` when config absent
  - `loadWaveApiKey(deps?: PolicyDeps): string | undefined` / `saveWaveApiKey(key: string, deps?: PolicyDeps): void`
  - `runPolicyConformanceCheck(html: string, deps?: PolicyDeps): Promise<ConformanceReport>`

- [ ] **Step 1: Write the failing test**

```ts
// packages/canvas-design-studio/tests/a11y-policy.test.ts
import { describe, it, expect } from 'vitest';
import {
  loadAccessibilityPolicy, saveAccessibilityPolicy, loadWaveApiKey, saveWaveApiKey,
  runPolicyConformanceCheck, type PolicyDeps,
} from '../src/tools/a11y/policy.js';
import type { InstitutionConfig } from '../src/types.js';

const BASE_CONFIG: InstitutionConfig = {
  institution: 'Example U', canvasUrl: 'https://example.instructure.com',
  colors: { primary: '#0033A0', primaryDark: '#002277', primaryLight: '#E6ECF9', secondary: '#F4F3EF' },
};

/** In-memory institution config: hermetic stand-in for ~/.canvas-design-mcp/institution.json. */
function memDeps(initial?: InstitutionConfig): PolicyDeps & { current: () => InstitutionConfig | undefined } {
  let cfg = initial;
  return {
    exists: () => cfg !== undefined,
    load: () => { if (!cfg) throw new Error('no config'); return cfg; },
    save: (c) => { cfg = c; },
    current: () => cfg,
  };
}

// Deterministic in-house findings (same fixtures as publish.test.ts):
const BORDERLINE_HTML = '<p>Course intro. <a href="https://example.edu/syllabus">click here</a></p>';
const CLEAN_HTML = '<p>Welcome to the course. Read the <a href="https://example.edu/syllabus">course syllabus</a> before week one.</p>';

describe('loadAccessibilityPolicy', () => {
  it('is undefined with no institution config and never throws', () => {
    expect(loadAccessibilityPolicy(memDeps())).toBeUndefined();
  });

  it('is undefined when the config has no accessibilityPolicy block', () => {
    expect(loadAccessibilityPolicy(memDeps(BASE_CONFIG))).toBeUndefined();
  });

  it('fills omitted fields from defaults', () => {
    const deps = memDeps({ ...BASE_CONFIG, accessibilityPolicy: { urls: ['https://www.example.edu/a11y/'] } as never });
    const p = loadAccessibilityPolicy(deps)!;
    expect(p.recheckWeeks).toBe(4);
    expect(p.requiredConformance).toEqual({ version: '2.1', level: 'AA' });
    expect(p.urls).toEqual(['https://www.example.edu/a11y/']);
  });
});

describe('saveAccessibilityPolicy', () => {
  it('merges the patch and preserves config siblings', () => {
    const deps = memDeps({ ...BASE_CONFIG, apiToken: 'keep-me' });
    const p = saveAccessibilityPolicy({ requiredConformance: { version: '2.2', level: 'AA' } }, deps);
    expect(p.requiredConformance.version).toBe('2.2');
    expect(deps.current()!.apiToken).toBe('keep-me');
    expect(deps.current()!.accessibilityPolicy!.recheckWeeks).toBe(4);
  });

  it('throws with the setup_institution hint when no config exists', () => {
    expect(() => saveAccessibilityPolicy({ recheckWeeks: 2 }, memDeps()))
      .toThrow(/setup_institution/);
  });
});

describe('wave api key storage', () => {
  it('round-trips through the institution config', () => {
    const deps = memDeps(BASE_CONFIG);
    expect(loadWaveApiKey(deps)).toBeUndefined();
    saveWaveApiKey('wave-key-123', deps);
    expect(loadWaveApiKey(deps)).toBe('wave-key-123');
    expect(deps.current()!.institution).toBe('Example U');
  });
});

describe('runPolicyConformanceCheck', () => {
  it('is identical to the bare check when no policy is configured', async () => {
    const report = await runPolicyConformanceCheck(CLEAN_HTML, memDeps());
    expect(report.requiredLevel).toEqual({ version: '2.1', level: 'AA' });
    expect(report.policyNudge).toBeUndefined();
    expect(report.wcag3).toBeUndefined();
  });

  it('uses the policy required level', async () => {
    const deps = memDeps({ ...BASE_CONFIG, accessibilityPolicy: {
      urls: [], requiredConformance: { version: '2.2', level: 'AA' }, recheckWeeks: 4, wcag3Advisory: false,
    } });
    const report = await runPolicyConformanceCheck(CLEAN_HTML, deps);
    expect(report.requiredLevel).toEqual({ version: '2.2', level: 'AA' });
  });

  it('attaches the nudge when overdue and the WCAG 3 section when toggled on', async () => {
    const deps = memDeps({ ...BASE_CONFIG, accessibilityPolicy: {
      urls: ['https://www.example.edu/publishing/wave-evaluation-tool/'],
      requiredConformance: { version: '2.1', level: 'AA' },
      recheckWeeks: 4, lastVerifiedAt: '2020-01-01', wcag3Advisory: true,
    } });
    const report = await runPolicyConformanceCheck(BORDERLINE_HTML, deps);
    expect(report.policyNudge).toContain('2020-01-01');
    expect(report.wcag3).toBeDefined();
    expect(report.wcag3!.some(w => w.sc === '2.4.4' && w.outcome === 'Link purpose')).toBe(true);
    expect(report.recommendedChecker).toContain('WAVE');
    // WCAG 3 never gates: verdict unchanged by the toggle
    expect(report.verdict).toBe('borderline');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/canvas-design-studio && npx vitest run tests/a11y-policy.test.ts`
Expected: FAIL — cannot resolve `../src/tools/a11y/policy.js`.

- [ ] **Step 3: Write minimal implementation**

`packages/canvas-design-studio/src/types.ts` — add to `InstitutionConfig` (after `brandUrl?: string;`):

```ts
  /** Phase 3 (spec §7): institution accessibility policy anchor. */
  accessibilityPolicy?: import('@canvas-toolchain/shared-types').AccessibilityPolicy;
  /** WAVE subscription API key for wave_deep_check (optional; per-professor). */
  waveApiKey?: string;
```

`packages/canvas-design-studio/src/tools/a11y/policy.ts`:

```ts
import {
  DEFAULT_ACCESSIBILITY_POLICY, mapFindingsToWcag3, policyNudge,
  type AccessibilityPolicy, type ConformanceReport,
} from '@canvas-toolchain/shared-types';
import { configExists, loadConfig, saveConfig } from '../../config.js';
import { runConformanceCheck } from './conformance.js';
import type { InstitutionConfig } from '../../types.js';

/** Injectable config access — production uses the real institution.json; tests inject memory. */
export interface PolicyDeps {
  exists?: () => boolean;
  load?: () => InstitutionConfig;
  save?: (config: InstitutionConfig) => void;
}

function resolve(deps: PolicyDeps) {
  return {
    exists: deps.exists ?? configExists,
    load: deps.load ?? loadConfig,
    save: deps.save ?? saveConfig,
  };
}

/** The stored policy (defaults filled), or undefined when the professor has never
 *  configured one. Never throws — an unreadable config means "no policy". */
export function loadAccessibilityPolicy(deps: PolicyDeps = {}): AccessibilityPolicy | undefined {
  const { exists, load } = resolve(deps);
  try {
    if (!exists()) return undefined;
    const cfg = load();
    if (!cfg.accessibilityPolicy) return undefined;
    return { ...DEFAULT_ACCESSIBILITY_POLICY, ...cfg.accessibilityPolicy };
  } catch {
    return undefined;
  }
}

/** Merge a partial policy into the institution config, preserving all siblings. */
export function saveAccessibilityPolicy(patch: Partial<AccessibilityPolicy>, deps: PolicyDeps = {}): AccessibilityPolicy {
  const { exists, load, save } = resolve(deps);
  if (!exists()) throw new Error('No institution config found. Run setup_institution first.');
  const cfg = load();
  const next: AccessibilityPolicy = { ...DEFAULT_ACCESSIBILITY_POLICY, ...cfg.accessibilityPolicy, ...patch };
  save({ ...cfg, accessibilityPolicy: next });
  return next;
}

export function loadWaveApiKey(deps: PolicyDeps = {}): string | undefined {
  const { exists, load } = resolve(deps);
  try {
    return exists() ? load().waveApiKey : undefined;
  } catch {
    return undefined;
  }
}

export function saveWaveApiKey(key: string, deps: PolicyDeps = {}): void {
  const { exists, load, save } = resolve(deps);
  if (!exists()) throw new Error('No institution config found. Run setup_institution first.');
  save({ ...load(), waveApiKey: key });
}

/** Policy-aware conformance run (spec §7/§8): resolves the required level from the
 *  stored policy and decorates the report with the cadence nudge, the WCAG 3 draft
 *  advisory section, and the institution-recommended checker. With no policy
 *  configured the result is byte-identical to a bare runConformanceCheck — the
 *  toggle and nudge only exist for professors who opted in. */
export async function runPolicyConformanceCheck(html: string, deps: PolicyDeps = {}): Promise<ConformanceReport> {
  const policy = loadAccessibilityPolicy(deps);
  const report = await runConformanceCheck(html, policy ? { requiredLevel: policy.requiredConformance } : {});
  if (!policy) return report;
  const nudge = policyNudge(policy);
  if (nudge) report.policyNudge = nudge;
  if (policy.wcag3Advisory) report.wcag3 = mapFindingsToWcag3([...report.findings, ...report.advisories]);
  const wave = policy.urls.find(u => /wave/i.test(u));
  if (wave) report.recommendedChecker = `Your institution's published guidance recommends WAVE (${wave})`;
  return report;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/canvas-design-studio && npx vitest run tests/a11y-policy.test.ts && npm run build`
Expected: all PASS, build exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/canvas-design-studio/src/tools/a11y/policy.ts packages/canvas-design-studio/src/types.ts packages/canvas-design-studio/tests/a11y-policy.test.ts
git commit -m "feat(cds): accessibility policy store + policy-aware conformance wrapper (Phase 3 Task 2)"
```

---

### Task 3: CDS — formatter renders nudge, WCAG 3 section, recommended checker

**Files:**
- Modify: `packages/canvas-design-studio/src/tools/a11y/conformance.ts` (`formatConformanceReport`, ~lines 60-86)
- Test: `packages/canvas-design-studio/tests/conformance.test.ts` (append a describe block)

**Interfaces:**
- Consumes: Task 1's `WCAG3_DRAFT_DATE` (add to the existing shared-types import in `conformance.ts`); the three optional `ConformanceReport` fields.
- Produces: unchanged signature `formatConformanceReport(report: ConformanceReport): string` — now renders the optional sections when present.

- [ ] **Step 1: Write the failing test**

Append to `packages/canvas-design-studio/tests/conformance.test.ts`:

```ts
describe('formatConformanceReport — Phase 3 sections', () => {
  it('renders recommended checker, WCAG 3 draft section, and policy nudge when present', async () => {
    const report = await runConformanceCheck('<p>Course intro. <a href="https://example.edu/syllabus">click here</a></p>');
    report.recommendedChecker = "Your institution's published guidance recommends WAVE (https://www.example.edu/publishing/wave-evaluation-tool/)";
    report.wcag3 = [{ sc: '2.4.4', outcome: 'Link purpose', message: 'vague link text' }];
    report.policyNudge = 'Institution accessibility policy last verified 2026-05-01 — re-read: https://www.example.edu/accessibility/';

    const text = formatConformanceReport(report);
    expect(text).toContain('recommends WAVE');
    expect(text).toContain('WCAG 3 (pre-release draft');
    expect(text).toContain('advisory only');
    expect(text).toContain('Link purpose (maps from 2.4.4)');
    expect(text).toContain('last verified 2026-05-01');
  });

  it('renders none of the Phase 3 sections on a plain report', async () => {
    const report = await runConformanceCheck('<p>hello</p>');
    const text = formatConformanceReport(report);
    expect(text).not.toContain('WCAG 3');
    expect(text).not.toContain('last verified');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/canvas-design-studio && npx vitest run tests/conformance.test.ts`
Expected: FAIL — `expected ... to contain 'WCAG 3 (pre-release draft'`.

- [ ] **Step 3: Write minimal implementation**

In `formatConformanceReport` (`conformance.ts`), add `WCAG3_DRAFT_DATE` to the shared-types import, then append before the final `return lines.join('\n');`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/canvas-design-studio && npx vitest run tests/conformance.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/canvas-design-studio/src/tools/a11y/conformance.ts packages/canvas-design-studio/tests/conformance.test.ts
git commit -m "feat(cds): conformance report renders policy nudge, WCAG 3 draft section, recommended checker (Phase 3 Task 3)"
```

---

### Task 4: Switch all seven production call sites to `runPolicyConformanceCheck`

**Files:**
- Modify: `packages/canvas-design-studio/src/tools/generate.ts:3,106`
- Modify: `packages/canvas-design-studio/src/tools/redesign.ts:5,81`
- Modify: `packages/canvas-design-studio/src/tools/publish.ts:7,355`
- Modify: `packages/canvas-design-studio/src/utils/render-engine.ts:4,266`
- Modify: `packages/canvas-design-studio/src/index.ts:21,486` (validate handler)
- Modify: `packages/command-and-control/src/tools/publish/scan_warnings.ts:3,29`
- Modify: `packages/command-and-control/src/tools/workflows/audit_course_accessibility.ts:3,71,91` (also: policy-aware header + nudge line)
- Test: `packages/command-and-control/tests/workflows/audit_course_accessibility.test.ts` (extend); existing suites in both packages are the regression net

**Interfaces:**
- Consumes: Task 2's `runPolicyConformanceCheck(html)` — from `./a11y/policy.js` (CDS-internal) or `canvas-design-mcp/dist/tools/a11y/policy.js` (C&C).
- Produces: no signature changes anywhere; `auditCourseAccessibility`'s `text` now derives its level from the report and appends `policyNudge` once when present.

**The mechanical swap (identical at every site):** change the import to the policy module and the call to the wrapper. Example (`generate.ts`):

```ts
// before
import { runConformanceCheck } from './a11y/conformance.js';
...
const conformance = await runConformanceCheck(html);
// after
import { runPolicyConformanceCheck } from './a11y/policy.js';
...
const conformance = await runPolicyConformanceCheck(html);
```

C&C sites import from `'canvas-design-mcp/dist/tools/a11y/policy.js'`. Where a file also uses `formatConformanceReport`, keep that import from `./a11y/conformance.js` (or dist equivalent) — only the check call moves.

**IMPORTANT — test mocks:** C&C suites mock the dist module they import. Every `vi.mock('canvas-design-mcp/dist/tools/a11y/conformance.js', ...)` whose file under test now imports the policy module must be re-pointed to `'canvas-design-mcp/dist/tools/a11y/policy.js'` with the mocked export renamed `runPolicyConformanceCheck`. Grep for the old mock path in `packages/command-and-control/tests/` (expect hits in the `scan_warnings` and `audit_course_accessibility` suites) and update each.

- [ ] **Step 1: Write the failing test (audit policy awareness)**

Append to `packages/command-and-control/tests/workflows/audit_course_accessibility.test.ts` (inside the existing describe; reuse its temp-dir + mock setup; the suite's conformance mock must first be re-pointed per the note above):

```ts
  it('headers with the report required level and appends the policy nudge once (Phase 3)', async () => {
    vi.mocked(runPolicyConformanceCheck).mockResolvedValue({
      requiredLevel: { version: '2.2', level: 'AA' },
      verdict: 'pass', findings: [], advisories: [], criteria: [],
      policyNudge: 'Institution accessibility policy last verified 2026-05-01 — re-read: https://www.example.edu/accessibility/',
    } as never);
    writeFileSync(join(outDir, 'a.html'), '<p>ok</p>');
    writeFileSync(join(outDir, 'b.html'), '<p>ok</p>');

    const result = await auditCourseAccessibility({ courseDir, outputDir: outDir });

    expect(result.text).toContain('WCAG 2.2 AA');
    const nudges = result.text.split('last verified 2026-05-01').length - 1;
    expect(nudges).toBe(1);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/command-and-control && npx vitest run tests/workflows/audit_course_accessibility.test.ts`
Expected: FAIL — text contains the hardcoded `WCAG 2.1 AA` and no nudge.

- [ ] **Step 3: Implement**

Do the mechanical swap at all seven sites. In `audit_course_accessibility.ts` additionally:

```ts
// track the level actually applied (all pages share one policy):
let requiredLevel = 'WCAG 2.1 AA';
let nudge: string | undefined;
// inside the file loop, after `const report = await runPolicyConformanceCheck(...)`:
requiredLevel = `WCAG ${report.requiredLevel.version} ${report.requiredLevel.level}`;
if (report.policyNudge) nudge = report.policyNudge;
// header line becomes:
`Course accessibility audit — ${files.length} page(s) against ${requiredLevel} (checked with WCAG 2.2 rules)`,
// and after the review-queue line, when nudge is set:
...(nudge ? ['', `⏰ ${nudge}`] : []),
```

Then rebuild CDS so C&C's dist import resolves: `cd packages/canvas-design-studio && npm run build`.

- [ ] **Step 4: Run both package suites to verify green**

Run: `cd packages/canvas-design-studio && npx vitest run && cd ../command-and-control && npm run build && npx vitest run`
Expected: all PASS (absent a policy config the wrapper is behavior-identical, so every existing test stays green unmodified except the re-pointed mocks).

- [ ] **Step 5: Commit**

```bash
git add packages/canvas-design-studio/src packages/command-and-control/src packages/command-and-control/tests
git commit -m "feat(cds,cc): all conformance call sites go policy-aware (Phase 3 Task 4)"
```

---

### Task 5: C&C — `review_accessibility_policy` tool

**Files:**
- Create: `packages/command-and-control/src/tools/review_accessibility_policy.ts`
- Modify: `packages/command-and-control/src/index.ts` (import ~line 83; ListTools entry after `accessibility_review_queue` ~line 640; dispatch case after ~line 938)
- Test: `packages/command-and-control/tests/review_accessibility_policy.test.ts` (new)

**Interfaces:**
- Consumes: Task 2's `loadAccessibilityPolicy`, `saveAccessibilityPolicy`, `PolicyDeps` from `canvas-design-mcp/dist/tools/a11y/policy.js`; `policyNudge`, `DEFAULT_ACCESSIBILITY_POLICY` from shared-types.
- Produces: `reviewAccessibilityPolicy(input: ReviewAccessibilityPolicyInput, deps?: PolicyDeps): ReviewAccessibilityPolicyResult` with `{ ok: true, policy, text } | { ok: false, error, message, fix }` (mirrors `set_module_enabled`'s result idiom).

- [ ] **Step 1: Write the failing test**

```ts
// packages/command-and-control/tests/review_accessibility_policy.test.ts
import { describe, it, expect } from 'vitest';
import { reviewAccessibilityPolicy } from '../src/tools/review_accessibility_policy.js';
import type { PolicyDeps } from 'canvas-design-mcp/dist/tools/a11y/policy.js';
import type { InstitutionConfig } from 'canvas-design-mcp/dist/types.js';

const BASE: InstitutionConfig = {
  institution: 'Example U', canvasUrl: 'https://example.instructure.com',
  colors: { primary: '#0033A0', primaryDark: '#002277', primaryLight: '#E6ECF9', secondary: '#F4F3EF' },
};

function memDeps(initial?: InstitutionConfig): PolicyDeps & { current: () => InstitutionConfig | undefined } {
  let cfg = initial;
  return {
    exists: () => cfg !== undefined,
    load: () => { if (!cfg) throw new Error('no config'); return cfg; },
    save: (c) => { cfg = c as InstitutionConfig; },
    current: () => cfg,
  };
}

describe('review_accessibility_policy', () => {
  it('no args → shows the defaults note when nothing is configured', () => {
    const r = reviewAccessibilityPolicy({}, memDeps(BASE));
    expect(r.ok).toBe(true);
    expect(r.text).toContain('WCAG 2.1 AA');
    expect(r.text).toContain('defaults');
  });

  it('confirm: true stamps lastVerifiedAt today', () => {
    const deps = memDeps(BASE);
    const r = reviewAccessibilityPolicy({ confirm: true }, deps);
    expect(r.ok).toBe(true);
    expect(r.policy!.lastVerifiedAt).toBe(new Date().toISOString().slice(0, 10));
    expect(deps.current()!.accessibilityPolicy!.lastVerifiedAt).toBe(r.policy!.lastVerifiedAt);
  });

  it('accepts updates and persists them', () => {
    const deps = memDeps(BASE);
    const r = reviewAccessibilityPolicy({
      urls: ['https://www.example.edu/accessibility/'],
      requiredConformance: { version: '2.2', level: 'AA' },
      recheckWeeks: 2,
      wcag3Advisory: true,
    }, deps);
    expect(r.ok).toBe(true);
    const saved = deps.current()!.accessibilityPolicy!;
    expect(saved.requiredConformance.version).toBe('2.2');
    expect(saved.recheckWeeks).toBe(2);
    expect(saved.wcag3Advisory).toBe(true);
  });

  it('rejects a bad recheckWeeks without writing', () => {
    const deps = memDeps(BASE);
    const r = reviewAccessibilityPolicy({ recheckWeeks: 0 }, deps);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('INVALID_RECHECK_WEEKS');
    expect(deps.current()!.accessibilityPolicy).toBeUndefined();
  });

  it('rejects an unknown conformance version without writing', () => {
    const r = reviewAccessibilityPolicy({ requiredConformance: { version: '3.0', level: 'AA' } as never }, memDeps(BASE));
    expect(r.ok).toBe(false);
    expect(r.error).toBe('INVALID_CONFORMANCE');
  });

  it('surfaces the setup_institution fix when no config exists', () => {
    const r = reviewAccessibilityPolicy({ confirm: true }, memDeps());
    expect(r.ok).toBe(false);
    expect(r.error).toBe('NO_INSTITUTION_CONFIG');
    expect(r.fix!.join(' ')).toContain('setup_institution');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/command-and-control && npx vitest run tests/review_accessibility_policy.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/command-and-control/src/tools/review_accessibility_policy.ts
import {
  loadAccessibilityPolicy, saveAccessibilityPolicy, type PolicyDeps,
} from 'canvas-design-mcp/dist/tools/a11y/policy.js';
import {
  DEFAULT_ACCESSIBILITY_POLICY, policyNudge,
  type AccessibilityPolicy, type RequiredLevel,
} from '@canvas-toolchain/shared-types';

export interface ReviewAccessibilityPolicyInput {
  /** Stamp lastVerifiedAt = today (the professor re-read the policy). */
  confirm?: boolean;
  urls?: string[];
  requiredConformance?: RequiredLevel;
  recheckWeeks?: number;
  wcag3Advisory?: boolean;
}

export interface ReviewAccessibilityPolicyResult {
  ok: boolean;
  policy?: AccessibilityPolicy;
  text?: string;
  error?: string;
  message?: string;
  fix?: string[];
}

const VERSIONS = new Set(['2.0', '2.1', '2.2']);
const LEVELS = new Set(['A', 'AA', 'AAA']);

function render(policy: AccessibilityPolicy | undefined): string {
  const p = policy ?? DEFAULT_ACCESSIBILITY_POLICY;
  const lines = [
    'Institution accessibility policy' + (policy ? '' : ' — not configured; defaults in effect'),
    `Required conformance: WCAG ${p.requiredConformance.version} ${p.requiredConformance.level}` +
      (policy ? '' : ' (ADA Title II baseline)'),
    `Re-verification cadence: every ${p.recheckWeeks} week(s)`,
    `Last verified: ${p.lastVerifiedAt ?? 'never'}`,
    `WCAG 3 draft advisories: ${p.wcag3Advisory ? 'ON (advisory only — never gates)' : 'off'}`,
    p.urls.length > 0 ? `Policy URLs:\n${p.urls.map(u => `  - ${u}`).join('\n')}` : 'Policy URLs: none recorded',
  ];
  const nudge = policy ? policyNudge(policy) : undefined;
  if (nudge) lines.push('', `⏰ ${nudge}`, 'Re-read the policy, then call review_accessibility_policy with confirm: true.');
  return lines.join('\n');
}

export function reviewAccessibilityPolicy(
  input: ReviewAccessibilityPolicyInput,
  deps: PolicyDeps = {},
): ReviewAccessibilityPolicyResult {
  const updates: Partial<AccessibilityPolicy> = {};
  if (input.urls !== undefined) updates.urls = input.urls;
  if (input.wcag3Advisory !== undefined) updates.wcag3Advisory = input.wcag3Advisory;
  if (input.recheckWeeks !== undefined) {
    if (!Number.isInteger(input.recheckWeeks) || input.recheckWeeks < 1) {
      return {
        ok: false, error: 'INVALID_RECHECK_WEEKS',
        message: `recheckWeeks must be a whole number of weeks >= 1 (got ${input.recheckWeeks}).`,
        fix: ['Pass recheckWeeks as a positive integer, e.g. 4.'],
      };
    }
    updates.recheckWeeks = input.recheckWeeks;
  }
  if (input.requiredConformance !== undefined) {
    const { version, level } = input.requiredConformance;
    if (!VERSIONS.has(version) || !LEVELS.has(level)) {
      return {
        ok: false, error: 'INVALID_CONFORMANCE',
        message: `requiredConformance must be a WCAG 2.x level (versions ${[...VERSIONS].join('/')}, levels ${[...LEVELS].join('/')}).`,
        fix: ['Example: { "version": "2.1", "level": "AA" } — the ADA Title II baseline.'],
      };
    }
    updates.requiredConformance = input.requiredConformance;
  }
  if (input.confirm) updates.lastVerifiedAt = new Date().toISOString().slice(0, 10);

  try {
    if (Object.keys(updates).length > 0) {
      const policy = saveAccessibilityPolicy(updates, deps);
      return { ok: true, policy, text: render(policy) };
    }
    const policy = loadAccessibilityPolicy(deps);
    return { ok: true, policy, text: render(policy) };
  } catch (e) {
    return {
      ok: false, error: 'NO_INSTITUTION_CONFIG',
      message: e instanceof Error ? e.message : String(e),
      fix: ['Run setup_institution first — the accessibility policy lives in the institution config.'],
    };
  }
}
```

Register in `packages/command-and-control/src/index.ts` — import next to the other tool imports:

```ts
import { reviewAccessibilityPolicy } from './tools/review_accessibility_policy.js';
```

ListTools entry (place directly after the `audit_course_accessibility` entry):

```ts
    {
      name: 'review_accessibility_policy',
      description:
        "The institution accessibility policy anchor (spec §7): shows the policy URLs, required conformance level, cadence, and last-verified date; confirm: true stamps today's date after the professor re-reads the policy. Also accepts updates to urls / requiredConformance / recheckWeeks / wcag3Advisory so nobody edits JSON by hand. Default level: WCAG 2.1 AA (ADA Title II baseline).",
      inputSchema: {
        type: 'object' as const,
        properties: {
          confirm: { type: 'boolean', description: 'The professor re-read the policy today — stamp lastVerifiedAt.' },
          urls: { type: 'array', items: { type: 'string' }, description: 'Institution policy / guidance URLs.' },
          requiredConformance: {
            type: 'object',
            properties: { version: { type: 'string', enum: ['2.0', '2.1', '2.2'] }, level: { type: 'string', enum: ['A', 'AA', 'AAA'] } },
            required: ['version', 'level'],
            description: 'Gate level. Default WCAG 2.1 AA.',
          },
          recheckWeeks: { type: 'number', description: 'Re-verification cadence in weeks (default 4).' },
          wcag3Advisory: { type: 'boolean', description: 'Toggle the WCAG 3 draft advisory section (never gates).' },
        },
      },
    },
```

Dispatch case (mirror the `accessibility_review_queue` case):

```ts
      case 'review_accessibility_policy': {
        const result = reviewAccessibilityPolicy(args as never);
        return { content: [{ type: 'text', text: result.ok ? result.text! : JSON.stringify(result, null, 2) }] };
      }
```

(Adapt the exact return shape to whatever the neighboring cases at ~line 938 do — copy their idiom verbatim.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/command-and-control && npm run build && npx vitest run tests/review_accessibility_policy.test.ts`
Expected: all PASS, build exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/command-and-control/src/tools/review_accessibility_policy.ts packages/command-and-control/src/index.ts packages/command-and-control/tests/review_accessibility_policy.test.ts
git commit -m "feat(cc): review_accessibility_policy tool — policy anchor, cadence stamp, WCAG 3 toggle (Phase 3 Task 5)"
```

---

### Task 6: CDS — WAVE deep-check adapter

**Files:**
- Create: `packages/canvas-design-studio/src/tools/a11y/wave.ts`
- Test: `packages/canvas-design-studio/tests/a11y-wave.test.ts` (new)

**Interfaces:**
- Consumes: `AccessibilityFinding`, `FindingSeverity` from shared-types.
- Produces (used by Task 7):

```ts
export interface WaveDeepCheckInput { url: string; apiKey: string; fetchFn?: typeof fetch; }
export interface WaveDeepCheckResult {
  url: string;
  findings: AccessibilityFinding[];
  unmapped: Array<{ id: string; description: string; count: number; category: string }>;
  creditsRemaining?: number;
  error?: string;   // 'AUTH_GATED_URL' | 'WAVE_API_ERROR' | 'WAVE_UNREACHABLE'
  message?: string;
  fix?: string[];
}
export async function waveDeepCheck(input: WaveDeepCheckInput): Promise<WaveDeepCheckResult>
```

**Behavior (spec §4):** pre-flight `fetchFn(url, { redirect: 'manual' })` — a 3xx whose `location` header matches `/login/i`, or a 401/403, refuses with `AUTH_GATED_URL` **before any API call** (no credits wasted; message explains the WAVE API cannot log into Canvas and points at the free browser-extension route). Otherwise call `https://wave.webaim.org/api/request?key=<key>&url=<encoded>&reporttype=2`, map WAVE `categories.error/contrast/alert` items to canonical findings (engine `'wave'`) via a static id→SC table with category-level severity defaults (error → serious, contrast → 1.4.3 serious, alert → moderate); ids not in the table go to `unmapped` (never fabricate an SC).

- [ ] **Step 1: Write the failing test**

```ts
// packages/canvas-design-studio/tests/a11y-wave.test.ts
import { describe, it, expect, vi } from 'vitest';
import { waveDeepCheck } from '../src/tools/a11y/wave.js';

const WAVE_OK = {
  status: { success: true, creditsremaining: 97 },
  categories: {
    error: { count: 2, items: {
      alt_missing: { id: 'alt_missing', description: 'Missing alternative text', count: 1 },
      totally_new_rule: { id: 'totally_new_rule', description: 'Something WAVE added', count: 1 },
    } },
    contrast: { count: 1, items: {
      contrast: { id: 'contrast', description: 'Very low contrast', count: 3 },
    } },
    alert: { count: 1, items: {
      heading_skipped: { id: 'heading_skipped', description: 'Skipped heading level', count: 1 },
    } },
  },
};

const okResponse = (body: unknown) => ({ status: 200, ok: true, headers: new Headers(), json: async () => body }) as unknown as Response;
const redirectTo = (location: string) => ({ status: 302, ok: false, headers: new Headers({ location }), json: async () => ({}) }) as unknown as Response;

describe('waveDeepCheck', () => {
  it('refuses an auth-gated URL before spending any credits', async () => {
    const fetchFn = vi.fn().mockResolvedValue(redirectTo('https://example.instructure.com/login/canvas'));
    const r = await waveDeepCheck({ url: 'https://example.instructure.com/courses/1/pages/x', apiKey: 'k', fetchFn });
    expect(r.error).toBe('AUTH_GATED_URL');
    expect(fetchFn).toHaveBeenCalledTimes(1); // pre-flight only — no API call
    expect(r.message).toMatch(/cannot log into Canvas/i);
    expect(r.fix!.join(' ')).toMatch(/browser extension/i);
  });

  it('maps categories to canonical findings and collects unmapped ids', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(okResponse('<html>public page</html>'))
      .mockResolvedValueOnce(okResponse(WAVE_OK));
    const r = await waveDeepCheck({ url: 'https://www.example.edu/open-course/', apiKey: 'k', fetchFn });

    expect(r.error).toBeUndefined();
    const byId = Object.fromEntries(r.findings.map(f => [f.message, f]));
    const alt = r.findings.find(f => f.sc === '1.1.1')!;
    expect(alt.severity).toBe('critical');
    expect(alt.engine).toBe('wave');
    const contrast = r.findings.find(f => f.sc === '1.4.3')!;
    expect(contrast.severity).toBe('serious');
    const heading = r.findings.find(f => f.sc === '1.3.1')!;
    expect(heading.severity).toBe('moderate');
    expect(r.unmapped).toEqual([{ id: 'totally_new_rule', description: 'Something WAVE added', count: 1, category: 'error' }]);
    expect(r.creditsRemaining).toBe(97);
    // the API call carried the key and encoded url
    const apiUrl = String(fetchFn.mock.calls[1][0]);
    expect(apiUrl).toContain('wave.webaim.org/api/request');
    expect(apiUrl).toContain('key=k');
    expect(apiUrl).toContain('reporttype=2');
  });

  it('surfaces a WAVE-side failure as WAVE_API_ERROR', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(okResponse('<html>ok</html>'))
      .mockResolvedValueOnce(okResponse({ status: { success: false, error: 'invalid key' } }));
    const r = await waveDeepCheck({ url: 'https://www.example.edu/x', apiKey: 'bad', fetchFn });
    expect(r.error).toBe('WAVE_API_ERROR');
    expect(r.message).toContain('invalid key');
  });

  it('surfaces network failure as WAVE_UNREACHABLE', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('network down'));
    const r = await waveDeepCheck({ url: 'https://www.example.edu/x', apiKey: 'k', fetchFn });
    expect(r.error).toBe('WAVE_UNREACHABLE');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/canvas-design-studio && npx vitest run tests/a11y-wave.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/canvas-design-studio/src/tools/a11y/wave.ts
import type { AccessibilityFinding, FindingSeverity } from '@canvas-toolchain/shared-types';

export interface WaveDeepCheckInput {
  url: string;
  apiKey: string;
  /** Injectable for tests. Production uses global fetch (Node >= 20). */
  fetchFn?: typeof fetch;
}

export interface WaveDeepCheckResult {
  url: string;
  findings: AccessibilityFinding[];
  unmapped: Array<{ id: string; description: string; count: number; category: string }>;
  creditsRemaining?: number;
  error?: string;
  message?: string;
  fix?: string[];
}

/** WAVE item id → canonical SC. Small and honest: only ids with a clear SC mapping;
 *  anything else lands in `unmapped` rather than fabricating a criterion. */
const WAVE_ID_SC: Record<string, { sc: string; scName: string; severity: FindingSeverity }> = {
  alt_missing:      { sc: '1.1.1', scName: 'Non-text Content', severity: 'critical' },
  alt_link_missing: { sc: '1.1.1', scName: 'Non-text Content', severity: 'serious' },
  alt_input_missing:{ sc: '1.1.1', scName: 'Non-text Content', severity: 'serious' },
  label_missing:    { sc: '3.3.2', scName: 'Labels or Instructions', severity: 'serious' },
  button_empty:     { sc: '4.1.2', scName: 'Name, Role, Value', severity: 'serious' },
  link_empty:       { sc: '2.4.4', scName: 'Link Purpose (In Context)', severity: 'serious' },
  title_invalid:    { sc: '2.4.2', scName: 'Page Titled', severity: 'serious' },
  language_missing: { sc: '3.1.1', scName: 'Language of Page', severity: 'serious' },
  heading_empty:    { sc: '1.3.1', scName: 'Info and Relationships', severity: 'serious' },
  heading_skipped:  { sc: '1.3.1', scName: 'Info and Relationships', severity: 'moderate' },
  contrast:         { sc: '1.4.3', scName: 'Contrast (Minimum)', severity: 'serious' },
  link_suspicious:  { sc: '2.4.4', scName: 'Link Purpose (In Context)', severity: 'moderate' },
  table_layout:     { sc: '1.3.1', scName: 'Info and Relationships', severity: 'moderate' },
};

interface WaveItem { id: string; description: string; count: number; }
interface WaveResponse {
  status: { success: boolean; error?: string; creditsremaining?: number };
  categories?: Record<string, { count: number; items?: Record<string, WaveItem> }>;
}

const MAPPED_CATEGORIES = ['error', 'contrast', 'alert'] as const;

export async function waveDeepCheck(input: WaveDeepCheckInput): Promise<WaveDeepCheckResult> {
  const fetchFn = input.fetchFn ?? fetch;
  const base: WaveDeepCheckResult = { url: input.url, findings: [], unmapped: [] };

  // Pre-flight (spec §4): the WAVE API fetches by public URL and cannot log into
  // Canvas. Refuse auth-gated URLs BEFORE the API call so no credit is wasted.
  try {
    const probe = await fetchFn(input.url, { redirect: 'manual' });
    const location = probe.headers.get('location') ?? '';
    if (probe.status === 401 || probe.status === 403 ||
        (probe.status >= 300 && probe.status < 400 && /login/i.test(location))) {
      return {
        ...base, error: 'AUTH_GATED_URL',
        message: `This URL requires a login (${probe.status}${location ? ` → ${location}` : ''}). The WAVE API cannot log into Canvas, so running it here would waste credits without producing a result.`,
        fix: [
          'Open the page in your own browser (already logged in) and run the free WAVE browser extension — same WebAIM engine.',
          'Or use MS Accessibility Insights for Web (free): https://accessibilityinsights.io/downloads/',
          'The paid WAVE API works on publicly-visible pages only.',
        ],
      };
    }
  } catch (e) {
    return { ...base, error: 'WAVE_UNREACHABLE', message: e instanceof Error ? e.message : String(e),
      fix: ['Check the URL and your network connection, then retry.'] };
  }

  let body: WaveResponse;
  try {
    const api = `https://wave.webaim.org/api/request?key=${encodeURIComponent(input.apiKey)}&url=${encodeURIComponent(input.url)}&reporttype=2`;
    const res = await fetchFn(api);
    body = await res.json() as WaveResponse;
  } catch (e) {
    return { ...base, error: 'WAVE_UNREACHABLE', message: e instanceof Error ? e.message : String(e),
      fix: ['Check your network connection, then retry.'] };
  }

  if (!body.status?.success) {
    return { ...base, error: 'WAVE_API_ERROR', message: body.status?.error ?? 'WAVE returned an unsuccessful status.',
      fix: ['Verify the WAVE API key (https://wave.webaim.org/api/) and remaining credits, then retry.'] };
  }

  const findings: AccessibilityFinding[] = [];
  const unmapped: WaveDeepCheckResult['unmapped'] = [];
  for (const category of MAPPED_CATEGORIES) {
    const items = body.categories?.[category]?.items ?? {};
    for (const item of Object.values(items)) {
      const mapped = WAVE_ID_SC[item.id];
      if (!mapped) { unmapped.push({ ...item, category }); continue; }
      findings.push({
        sc: mapped.sc, scName: mapped.scName, scVersion: '2.0', level: 'AA',
        severity: mapped.severity, engine: 'wave',
        message: `${item.description} (${item.count} instance${item.count === 1 ? '' : 's'}, WAVE ${category})`,
      });
    }
  }

  return { ...base, findings, unmapped, creditsRemaining: body.status.creditsremaining };
}
```

Note: `scVersion: '2.0'`/`level: 'AA'` — every mapped SC above exists at WCAG 2.0 except 2.5.8 (not in this table), so the constant is accurate for the mapped set; if the reviewer prefers exact per-SC versions, extend `WAVE_ID_SC` with them.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/canvas-design-studio && npx vitest run tests/a11y-wave.test.ts && npm run build`
Expected: all PASS, build exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/canvas-design-studio/src/tools/a11y/wave.ts packages/canvas-design-studio/tests/a11y-wave.test.ts
git commit -m "feat(cds): WAVE API deep-check adapter with auth-gate refusal (Phase 3 Task 6)"
```

---

### Task 7: C&C — `wave_deep_check` tool (two-call confirm gate)

**Files:**
- Create: `packages/command-and-control/src/tools/wave_deep_check.ts`
- Modify: `packages/command-and-control/src/index.ts` (import + ListTools entry + dispatch case, same three spots as Task 5)
- Test: `packages/command-and-control/tests/wave_deep_check.test.ts` (new)

**Interfaces:**
- Consumes: Task 6's `waveDeepCheck` (`canvas-design-mcp/dist/tools/a11y/wave.js`); Task 2's `loadWaveApiKey`/`saveWaveApiKey` (`canvas-design-mcp/dist/tools/a11y/policy.js`).
- Produces:

```ts
export interface WaveDeepCheckToolInput { url: string; confirm?: boolean; apiKey?: string; }
export interface WaveDeepCheckToolDeps {
  wave?: typeof waveDeepCheck;
  loadKey?: () => string | undefined;
  saveKey?: (key: string) => void;
}
export async function waveDeepCheckTool(input: WaveDeepCheckToolInput, deps?: WaveDeepCheckToolDeps):
  Promise<{ ok: boolean; text?: string; error?: string; message?: string; fix?: string[] }>
```

**Behavior:** without `confirm: true` → preview only (URL, ~2 credits for reporttype 2, public-URL-only warning, "call again with confirm: true") — **nothing is fetched, no credits spent** (spec non-goal: no automatic spending; mirror of `submit_usage_feedback`'s stateless two-call gate). With `confirm: true` → resolve the key (`input.apiKey` wins and is persisted via `saveKey`; else `loadKey()`; neither → `NO_WAVE_API_KEY` with a fix pointing at https://wave.webaim.org/api/), run the adapter, and render findings + unmapped + credits remaining. Adapter error results pass through as `{ ok: false, error, message, fix }`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/command-and-control/tests/wave_deep_check.test.ts
import { describe, it, expect, vi } from 'vitest';
import { waveDeepCheckTool } from '../src/tools/wave_deep_check.js';

const FINDINGS_RESULT = {
  url: 'https://www.example.edu/open/', creditsRemaining: 42,
  findings: [{ sc: '1.1.1', scName: 'Non-text Content', scVersion: '2.0', level: 'AA', severity: 'critical', engine: 'wave', message: 'Missing alternative text (1 instance, WAVE error)' }],
  unmapped: [{ id: 'new_rule', description: 'Novel WAVE rule', count: 2, category: 'alert' }],
};

describe('wave_deep_check tool', () => {
  it('previews without spending when confirm is absent', async () => {
    const wave = vi.fn();
    const r = await waveDeepCheckTool({ url: 'https://www.example.edu/open/' }, { wave, loadKey: () => 'k' });
    expect(r.ok).toBe(true);
    expect(r.text).toMatch(/2 credit/i);
    expect(r.text).toMatch(/confirm: ?true/);
    expect(r.text).toMatch(/public/i);
    expect(wave).not.toHaveBeenCalled();
  });

  it('errors with the WAVE signup fix when no key is available', async () => {
    const r = await waveDeepCheckTool({ url: 'https://x.example.edu/', confirm: true }, { wave: vi.fn(), loadKey: () => undefined });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('NO_WAVE_API_KEY');
    expect(r.fix!.join(' ')).toContain('wave.webaim.org/api');
  });

  it('persists a supplied key and runs the adapter on confirm', async () => {
    const wave = vi.fn().mockResolvedValue(FINDINGS_RESULT);
    const saveKey = vi.fn();
    const r = await waveDeepCheckTool(
      { url: 'https://www.example.edu/open/', confirm: true, apiKey: 'fresh-key' },
      { wave, loadKey: () => undefined, saveKey },
    );
    expect(saveKey).toHaveBeenCalledWith('fresh-key');
    expect(wave).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://www.example.edu/open/', apiKey: 'fresh-key' }));
    expect(r.ok).toBe(true);
    expect(r.text).toContain('1.1.1');
    expect(r.text).toContain('Novel WAVE rule');
    expect(r.text).toContain('42');
  });

  it('passes adapter refusals through unchanged', async () => {
    const wave = vi.fn().mockResolvedValue({ url: 'x', findings: [], unmapped: [], error: 'AUTH_GATED_URL', message: 'login required', fix: ['use the browser extension'] });
    const r = await waveDeepCheckTool({ url: 'https://example.instructure.com/courses/1', confirm: true }, { wave, loadKey: () => 'k' });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('AUTH_GATED_URL');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/command-and-control && npx vitest run tests/wave_deep_check.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/command-and-control/src/tools/wave_deep_check.ts
import { waveDeepCheck } from 'canvas-design-mcp/dist/tools/a11y/wave.js';
import { loadWaveApiKey, saveWaveApiKey } from 'canvas-design-mcp/dist/tools/a11y/policy.js';

export interface WaveDeepCheckToolInput {
  url: string;
  /** Explicit spend approval — nothing runs (and no credits are spent) without it. */
  confirm?: boolean;
  /** WAVE API key; persisted to the institution config on first use. */
  apiKey?: string;
}

export interface WaveDeepCheckToolDeps {
  wave?: typeof waveDeepCheck;
  loadKey?: () => string | undefined;
  saveKey?: (key: string) => void;
}

export interface WaveDeepCheckToolResult {
  ok: boolean;
  text?: string;
  error?: string;
  message?: string;
  fix?: string[];
}

export async function waveDeepCheckTool(
  input: WaveDeepCheckToolInput,
  deps: WaveDeepCheckToolDeps = {},
): Promise<WaveDeepCheckToolResult> {
  const wave = deps.wave ?? waveDeepCheck;
  const loadKey = deps.loadKey ?? loadWaveApiKey;
  const saveKey = deps.saveKey ?? saveWaveApiKey;

  if (!input.confirm) {
    return {
      ok: true,
      text: [
        `WAVE deep check — preview (nothing has run, no credits spent)`,
        `URL: ${input.url}`,
        `Cost: ~2 credits (WAVE API reporttype 2).`,
        `Works on PUBLICLY visible pages only — the WAVE API cannot log into Canvas.`,
        `For login-gated pages use the free WAVE browser extension or MS Accessibility Insights instead.`,
        ``,
        `To spend the credits and run it, call wave_deep_check again with confirm: true.`,
      ].join('\n'),
    };
  }

  let key = input.apiKey;
  if (key) {
    try { saveKey(key); } catch { /* persistence is convenience; the run proceeds */ }
  } else {
    key = loadKey();
  }
  if (!key) {
    return {
      ok: false, error: 'NO_WAVE_API_KEY',
      message: 'No WAVE API key is configured.',
      fix: ['Get a key + credits at https://wave.webaim.org/api/', 'Re-call wave_deep_check with apiKey: "<your key>" — it is saved for next time.'],
    };
  }

  const result = await wave({ url: input.url, apiKey: key });
  if (result.error) {
    return { ok: false, error: result.error, message: result.message, fix: result.fix };
  }

  const lines = [
    `WAVE deep check — ${input.url}`,
    result.findings.length === 0 ? 'No WAVE-detected errors, contrast failures, or alerts.' :
      `Findings (${result.findings.length}):`,
    ...result.findings.map((f, i) => `${i + 1}. ${f.sc} ${f.scName} (${f.severity}): ${f.message}`),
  ];
  if (result.unmapped.length > 0) {
    lines.push('', `WAVE items without a WCAG mapping (review in the WAVE extension):`,
      ...result.unmapped.map(u => `- [${u.category}] ${u.description} (${u.count})`));
  }
  if (result.creditsRemaining !== undefined) lines.push('', `WAVE credits remaining: ${result.creditsRemaining}`);
  lines.push('', 'The professor is the final arbiter — fix, mark reviewed in accessibility_review_queue, or acknowledge at publish.');
  return { ok: true, text: lines.join('\n') };
}
```

Register in `index.ts` (import + entry + case, mirroring Task 5). ListTools entry:

```ts
    {
      name: 'wave_deep_check',
      description:
        'Deep accessibility check of a PUBLICLY-visible page via the paid WAVE API (WebAIM). Two-call spend gate: first call previews the cost (~2 credits) and runs nothing; re-call with confirm: true to spend. Auth-gated Canvas URLs are refused before any spend — use the free WAVE browser extension or MS Accessibility Insights for those. Optional apiKey is saved to the institution config on first use.',
      inputSchema: {
        type: 'object' as const,
        required: ['url'],
        properties: {
          url: { type: 'string', description: 'Publicly reachable page URL.' },
          confirm: { type: 'boolean', description: 'Explicit approval to spend WAVE credits.' },
          apiKey: { type: 'string', description: 'WAVE API key (https://wave.webaim.org/api/); persisted on first use.' },
        },
      },
    },
```

Dispatch case:

```ts
      case 'wave_deep_check': {
        const result = await waveDeepCheckTool(args as never);
        return { content: [{ type: 'text', text: result.ok ? result.text! : JSON.stringify(result, null, 2) }] };
      }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/command-and-control && npm run build && npx vitest run tests/wave_deep_check.test.ts`
Expected: all PASS, build exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/command-and-control/src/tools/wave_deep_check.ts packages/command-and-control/src/index.ts packages/command-and-control/tests/wave_deep_check.test.ts
git commit -m "feat(cc): wave_deep_check tool with two-call spend gate (Phase 3 Task 7)"
```

---

### Task 8: C&C — canonical relative-path keys for `approvals` + `a11yAcknowledgments`

The V&R follow-through deferred to Phase 3 by #111/#112/#113: both professor-facing maps are keyed by bare `filename`, which is not unique across weeks. Make the canonical key the **output-relative path** (`entry.relPath`, present since #111), accepting `filename` as a back-compat alias **only when it is unambiguous** (a filename appearing in exactly one manifest entry).

**Files:**
- Modify: `packages/command-and-control/src/tools/publish/approvals.ts` (whole file — small)
- Modify: `packages/command-and-control/src/tools/workflows/publish_course.ts` (approval/ack lookups ~lines 261, 276; gate `fix` strings ~lines 288-289 and the #112 re-gate block; `PublishCourseInput` doc comments ~lines 37, 44-46)
- Test: `packages/command-and-control/tests/publish/approvals.test.ts` (extend); `packages/command-and-control/tests/workflows/publish_course-a11y-gate.test.ts` (extend)

**Interfaces:**
- Consumes: `ManifestEntry.relPath?: string` (exists since #111); `queuePage = entry.relPath ?? entry.filename` (already computed in `publish_course`).
- Produces: `validateApprovals(manifest, approvals)` unchanged signature — now accepts relPath keys and unambiguous filename aliases, reports `missing` by canonical key; new exported helper `entryKeyLookup<T>(map: Record<string, T> | undefined, entry: { filename: string; relPath?: string }): T | undefined` used for both maps in `publish_course`.

- [ ] **Step 1: Write the failing tests**

Append to `packages/command-and-control/tests/publish/approvals.test.ts` (reuse the file's existing manifest fixture builder; if it builds entries without `relPath`, extend the builder with an optional relPath parameter the same way `PAGE_ENTRY` does in the a11y-gate suite):

```ts
describe('validateApprovals — canonical relPath keys (Phase 3)', () => {
  it('accepts approvals keyed by relPath', () => {
    const manifest = manifestWith([
      pageEntry('overview.html', { relPath: 'week-01/overview.html' }),
      pageEntry('overview2.html', { relPath: 'week-02/overview.html' }),
    ]);
    const v = validateApprovals(manifest, {
      'week-01/overview.html': 'approve',
      'week-02/overview.html': 'skip',
    });
    expect(v.ok).toBe(true);
  });

  it('still accepts a filename key when it is unambiguous', () => {
    const manifest = manifestWith([pageEntry('overview.html', { relPath: 'week-01/overview.html' })]);
    expect(validateApprovals(manifest, { 'overview.html': 'approve' }).ok).toBe(true);
  });

  it('reports missing entries by their canonical relPath', () => {
    const manifest = manifestWith([pageEntry('overview.html', { relPath: 'week-01/overview.html' })]);
    const v = validateApprovals(manifest, {});
    expect(v.missing).toEqual(['week-01/overview.html']);
  });

  it('rejects a filename alias that matches two entries (ambiguous across weeks)', () => {
    const manifest = manifestWith([
      pageEntry('overview.html', { relPath: 'week-01/overview.html' }),
      pageEntry('overview.html', { relPath: 'week-02/overview.html' }),
    ]);
    const v = validateApprovals(manifest, { 'overview.html': 'approve' });
    expect(v.ok).toBe(false);
    expect(v.unknown).toContain('overview.html');
    expect(v.missing).toEqual(['week-01/overview.html', 'week-02/overview.html']);
  });
});
```

Append to `publish_course-a11y-gate.test.ts`:

```ts
describe('publishCourse — relPath-keyed approvals and acknowledgments (Phase 3)', () => {
  it('publishes with both maps keyed by relPath', async () => {
    seedSnapshot('snap-relpath-maps', [
      PAGE_ENTRY('overview.html', 'Week 1 Overview', [BORDERLINE_WARNING], 'week-01/overview.html'),
    ]);
    const result = await publishCourse({
      snapshotId: 'snap-relpath-maps',
      approvals: { 'week-01/overview.html': 'approve' },
      a11yAcknowledgments: { 'week-01/overview.html': true },
      canvasBreadcrumbs: false,
    });
    expect(result.phase).toBe('published');
  });

  it('gate fix text names the relPath key, not the bare filename', async () => {
    seedSnapshot('snap-relpath-fix', [
      PAGE_ENTRY('overview.html', 'Week 1 Overview', [CLEAR_WARNING], 'week-01/overview.html'),
    ]);
    const result = await publishCourse({
      snapshotId: 'snap-relpath-fix',
      approvals: { 'week-01/overview.html': 'approve' },
      canvasBreadcrumbs: false,
    });
    expect(result.failed?.code).toBe('ACCESSIBILITY_ACK_REQUIRED');
    expect(result.fix?.[0]).toContain('"week-01/overview.html"');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/command-and-control && npx vitest run tests/publish/approvals.test.ts tests/workflows/publish_course-a11y-gate.test.ts`
Expected: the new tests FAIL (relPath keys reported unknown / filename in fix text); all pre-existing tests still pass.

- [ ] **Step 3: Implement**

`approvals.ts` becomes:

```ts
import type { PreviewManifest } from './manifest_types.js';

export type ApprovalAction = 'approve' | 'skip';
export type ApprovalMap = Record<string, ApprovalAction>;

export interface ApprovalValidation {
  ok: boolean;
  missing: string[];
  unknown: string[];
}

interface KeyedEntry { filename: string; relPath?: string; }

/** Canonical key: the output-relative path (#111); bare filename for pre-#111 snapshots. */
export function canonicalKey(entry: KeyedEntry): string {
  return entry.relPath ?? entry.filename;
}

/** Look up a professor-supplied per-file map by canonical key, falling back to the
 *  bare filename alias (back-compat; safe here because validateApprovals rejected
 *  ambiguous filename aliases up front). */
export function entryKeyLookup<T>(map: Record<string, T> | undefined, entry: KeyedEntry): T | undefined {
  if (!map) return undefined;
  return map[canonicalKey(entry)] ?? map[entry.filename];
}

export function validateApprovals(manifest: PreviewManifest, approvals: ApprovalMap): ApprovalValidation {
  const entries = manifest.entries.filter(e => e.type !== 'skipped');
  const canonical = new Set(entries.map(canonicalKey));

  // A filename is a usable alias only when exactly one entry carries it.
  const filenameCounts = new Map<string, number>();
  for (const e of entries) filenameCounts.set(e.filename, (filenameCounts.get(e.filename) ?? 0) + 1);
  const aliasToCanonical = new Map<string, string>();
  for (const e of entries) {
    const canon = canonicalKey(e);
    aliasToCanonical.set(canon, canon);
    if (filenameCounts.get(e.filename) === 1) aliasToCanonical.set(e.filename, canon);
  }

  const covered = new Set<string>();
  const unknown: string[] = [];
  for (const key of Object.keys(approvals)) {
    const canon = aliasToCanonical.get(key);
    if (canon) covered.add(canon);
    else unknown.push(key);
  }
  const missing = [...canonical].filter(c => !covered.has(c));
  return { ok: missing.length === 0 && unknown.length === 0, missing, unknown };
}

export function approvedFilenames(approvals: ApprovalMap): string[] {
  return Object.entries(approvals).filter(([, a]) => a === 'approve').map(([f]) => f);
}
```

`publish_course.ts` — import `entryKeyLookup` from `../publish/approvals.js`, then:

- ~line 261: `if (input.approvals[entry.filename] !== 'approve') continue;` → `if (entryKeyLookup(input.approvals, entry) !== 'approve') continue;`
- ~line 276: `evaluateEntryA11yGate(entryWarnings, input.a11yAcknowledgments?.[entry.filename])` → `evaluateEntryA11yGate(entryWarnings, entryKeyLookup(input.a11yAcknowledgments, entry))`
- The `publishToCanvas` call's `acknowledgeAccessibility: input.a11yAcknowledgments?.[entry.filename]` → `acknowledgeAccessibility: entryKeyLookup(input.a11yAcknowledgments, entry)`
- In both gate `fix` templates (the pre-gate strings and the #112 re-gate block), replace `"${entry.filename}"` with `"${queuePage}"` (the constant already in scope). In the #112 block `queuePage` is already computed above it — no new derivation needed.
- Update the `PublishCourseInput` doc comments: `approvals` / `a11yAcknowledgments` keys are the output-relative path shown by `preview_course_publish` (bare filename accepted for pre-#111 snapshots and unambiguous names).

- [ ] **Step 4: Run the full C&C suite to verify green**

Run: `cd packages/command-and-control && npm run build && npx vitest run`
Expected: all PASS — every legacy filename-keyed test still passes via the alias.

- [ ] **Step 5: Commit**

```bash
git add packages/command-and-control/src/tools/publish/approvals.ts packages/command-and-control/src/tools/workflows/publish_course.ts packages/command-and-control/tests
git commit -m "feat(cc): canonical relPath keys for approvals + a11yAcknowledgments with unambiguous-filename alias (Phase 3 Task 8)"
```

---

### Task 9: Docs — accessibility.md Phase 3 section, tool overview, roadmap, handoffs

**Files:**
- Modify: `docs/accessibility.md` (new "Phase 3 — institution policy, WCAG 3 advisories, WAVE deep check" section)
- Modify: `docs/tool-overview.md` (two new tool rows)
- Modify: `docs/roadmap.md` ("Now" section: Phase 3 built; next = v1.11.0 release; drop the completed immediate-step)
- Modify: `packages/canvas-design-studio/CLAUDE.md` (Accessibility checking section: policy wrapper + wave adapter pointers)
- Modify: `AGENTS.md` (WCAG paragraph: Phase 3 BUILT on this branch; #108 closes with the PR)
- Test: none (docs)

- [ ] **Step 1: Write the docs**

`docs/accessibility.md` — append a Phase 3 section covering, in professor-facing language: the `accessibilityPolicy` block (fields + defaults table: WCAG 2.1 AA / 4 weeks / WCAG 3 off), `review_accessibility_policy` usage (view / confirm / update), how the required level moves the gate line while engines always run full 2.2, the cadence nudge behavior (only after a first `confirm: true`), the WCAG 3 draft advisory section (never gates; draft date constant), and the WAVE routes (free extension for gated pages; `wave_deep_check` two-call spend gate for public pages; auth-gate refusal). Use `example.edu` placeholders only.

`docs/tool-overview.md` — add rows for `review_accessibility_policy` and `wave_deep_check` matching the table's existing one-line style.

`docs/roadmap.md` — "Where we are": current release v1.10.1; immediate next steps become 1) release v1.11.0 (Phase 3), 2) #78 design conversation. Move the "Now: Phase 3" section content into a "Shipped in v1.11.0" section patterned on the v1.10.0 one; note #108 closed.

`packages/canvas-design-studio/CLAUDE.md` — in "Accessibility checking", note: new code should call `runPolicyConformanceCheck` (`src/tools/a11y/policy.ts`) rather than bare `runConformanceCheck`; the WAVE adapter lives in `src/tools/a11y/wave.ts`; the policy block lives in the institution config.

`AGENTS.md` — extend the WCAG paragraph: "**Phase 3 BUILT on this branch** (policy anchor + `review_accessibility_policy`, WCAG 3 advisory toggle, WAVE adapter + `wave_deep_check`, relPath keying for approvals/acknowledgments maps); ships as v1.11.0; closes #108."

- [ ] **Step 2: Grep guard + final verification**

Run from the repo root:

```powershell
# BSU/PII guard — must return nothing:
git grep -niE "exampleu|bsu|krank|rank85|20244|20255" -- ':!*.lock' | Select-String -NotMatch "example"
# Full verification floor:
npm run build; npm test; npm run smoke:integration --workspace=packages/command-and-control
```

Expected: guard empty; build exit 0; all suites green; smoke green.

- [ ] **Step 3: Commit**

```bash
git add docs/ packages/canvas-design-studio/CLAUDE.md AGENTS.md
git commit -m "docs: Phase 3 — policy anchor, WCAG 3 advisories, WAVE deep check (Task 9)"
```

---

## Completion

1. Push `feat/wcag22-phase3`; open one PR titled `feat: WCAG 2.2 Phase 3 — institution policy anchor, WCAG 3 advisories, WAVE deep check` with body ending `Closes #108`.
2. After CI is green and the merge lands (squash, per convention): cut **v1.11.0** — prepend release notes to `.github/RELEASE_TEMPLATE/installer-release.md`, `docs(release)` commit, annotated tag, push, verify `release-installer.yml` publishes all 4 assets.
3. Post-release: update `docs/roadmap.md` "Where we are", memory, and the KB per standing rules.

## Self-Review (done at write time)

- **Spec coverage:** §7 policy anchor → Tasks 1, 2, 5; §7 nudge-in-reports + §5 audit nudge → Tasks 3, 4; §8 WCAG 3 → Tasks 1, 3; §4 WAVE adapter + auth refusal + recommended-checker naming → Tasks 2 (recommendedChecker), 3, 6, 7; deferred V&R keying (#112/#113 adjudications) → Task 8; docs → Task 9. `setup_institution` onboarding prompts explicitly deferred (Global Constraints note) — spec marks them skippable-with-defaults.
- **Placeholder scan:** no TBDs; all code complete.
- **Type consistency:** `PolicyDeps` defined once (Task 2), consumed by Tasks 5/7 via dist; `AccessibilityPolicy`/`policyNudge`/`mapFindingsToWcag3` defined in Task 1, consumed in 2/3/5; `entryKeyLookup`/`canonicalKey` defined and consumed in Task 8; `waveDeepCheck` input/result defined in Task 6, consumed in Task 7.
