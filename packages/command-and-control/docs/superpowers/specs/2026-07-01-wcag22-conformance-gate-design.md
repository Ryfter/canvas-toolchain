# WCAG 2.2 Conformance Gate & Acknowledged Launch — Design

**Date:** 2026-07-01
**Status:** Draft for review
**Packages touched:** `canvas-design-studio` (checks, single-page publish gate), `command-and-control` (course publish gate, review queue, policy anchor), `shared-types` (canonical finding model)

## Governing principle

**The professor is the final arbiter.** The system informs, recommends, and records — it never permanently blocks. Every gate has an acknowledgment path; every automated verdict can be overridden by human judgment. Accountability comes from the paper trail (acknowledgments and human reviews), not from a hard wall.

## Problem

Today's accessibility system (see `docs/accessibility.md`) is three layers: six regex heuristics (`auditAccessibility`), a blocking missing-`alt` rule in the Canvas RCE validator, and accessibility-by-construction widget scaffolding. Two gaps:

1. **Checks are shallow.** Regex over HTML source cannot see ARIA correctness, form labels, landmark structure, duplicate IDs, focus order, or most of WCAG. Coverage is 6 rules against a standard with ~50 applicable success criteria.
2. **Accessibility never gates.** Both publish paths (`publish_to_canvas`, `publish_course`) run the audit and attach warnings to the *success* result. A page with serious failures publishes silently. There is no decision point, no acknowledgment, no record.

## Goals

- Check content against **WCAG 2.2 AA** (the current ratified standard), reporting per-criterion status honestly: pass / fail / needs-human-review / not-applicable.
- **Gate publishing at the institution's required conformance level** (Boise State: WCAG 2.1 AA), two-tier: borderline results need a light acknowledgment, clear failures need an explicit acknowledgment naming the criteria. Both are recorded.
- Criteria beyond the required level report as **forward-looking advisories** (never gate).
- **Deep-check escalation** offering an automated route (WAVE API, paid credits, explicit approval per spend) and free manual routes (WAVE browser extension, MS Accessibility Insights).
- A per-course **borderline review queue**: live Canvas URLs of pages near the line, for human-eyes verification.
- **Institutional policy anchor**: policy URLs + required level in institution config, with a periodic (default 4-week) re-verification nudge.
- Optional **WCAG 3 (draft) advisory layer**, off by default, never gating.

## Non-goals

- No headless-browser bundling (Playwright/Chromium ~150 MB — breaks the installer's lean bundle). Rendered-layout checks belong to the deep-check tier.
- No automatic WAVE API spending. Every credit spend requires explicit approval in-conversation.
- No scraping/diffing of institutional policy pages. A human reads policy; the tool nudges on cadence.
- No WCAG 3 gating (working draft; not ratified; different conformance model).
- The manual "generate HTML and paste into Canvas" path stays first-class and ungated — the gate guards tool-driven publishes only.
- Existing FERPA and Canvas-RCE validation gates are untouched.

---

## 1. Canonical finding model (`shared-types`)

Every finding — regardless of engine — normalizes to a WCAG success criterion. Downstream code speaks WCAG, never tool dialects.

```ts
export type WcagVersion = '2.0' | '2.1' | '2.2';
export type WcagLevel = 'A' | 'AA' | 'AAA';
export type FindingSeverity = 'critical' | 'serious' | 'moderate' | 'minor';
export type FindingEngine = 'inhouse' | 'axe' | 'wave';

export interface AccessibilityFinding {
  sc: string;                 // "1.4.3"
  scName: string;             // "Contrast (Minimum)"
  scVersion: WcagVersion;     // version that introduced the SC
  level: WcagLevel;
  severity: FindingSeverity;
  engine: FindingEngine;
  message: string;            // human-readable, includes the fix suggestion
  context?: string;           // offending HTML snippet
  margin?: {                  // present only for measurable criteria (contrast)
    measured: number;         // e.g. 4.32
    required: number;         // e.g. 4.5
    unit: string;             // "contrast ratio"
  };
}

export type CriterionStatus = 'pass' | 'fail' | 'needs-human-review' | 'not-applicable';

export interface ConformanceReport {
  requiredLevel: { version: WcagVersion; level: WcagLevel };  // from institution config
  verdict: 'pass' | 'borderline' | 'fail';                    // vs. required level only
  findings: AccessibilityFinding[];                           // at or below required level
  advisories: AccessibilityFinding[];                         // beyond required level (e.g. 2.2-only when required is 2.1)
  criteria: Array<{ sc: string; scName: string; status: CriterionStatus }>;
  wcag3?: Wcag3Advisory[];                                    // only when the toggle is on (§8)
  policyNudge?: string;                                       // §7 cadence reminder, when due
}
```

**Borderline definition (exact):**
- A **measurable** finding (contrast) is *borderline* when `measured >= 0.85 * required` (body text: ≥ 3.825 vs. 4.5; large text: ≥ 2.55 vs. 3.0). Below 85% it is a clear failure with severity `serious`.
- A **non-measurable** finding is *borderline* when its severity is `moderate` or `minor`; `serious`/`critical` findings are clear failures.
- Report `verdict`: `fail` if any required-level finding is a clear failure; else `borderline` if any required-level finding exists; else `pass`.

**Severity map for the six in-house checks:**

| Check | SC | Severity |
|---|---|---|
| `contrast-ratio` | 1.4.3 | serious (moderate when in the 85% borderline band) |
| `empty-alt` (suspicious empty alt) | 1.1.1 | moderate |
| `heading-skip` | 1.3.1 | moderate |
| `vague-link` | 2.4.4 | moderate |
| `table-no-headers` | 1.3.1 | serious |
| `video-no-captions` (Panopto) | 1.2.2 | serious |

The Canvas RCE validator's missing-`alt` hard rule stays where it is (structural requirement), but also emits a canonical finding (SC 1.1.1, `critical`) so reports are complete.

## 2. Engines as adapters

One interface; three implementations plus a manual route.

```ts
export interface AccessibilityEngine {
  readonly name: FindingEngine;
  check(html: string, opts: { requiredLevel: { version: WcagVersion; level: WcagLevel } }):
    Promise<{ findings: AccessibilityFinding[]; criteriaCovered: string[] }>;
}
```

- **`inhouse`** — the existing six checks, remapped to emit `AccessibilityFinding` (keeping their Canvas-specific knowledge, e.g. Panopto captions). The current `AccessibilityWarning` shape remains exported for one release for compatibility, marked deprecated.
- **`axe`** — new: axe-core running against a DOM built with jsdom, rule tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`. **axe's `color-contrast` rule is disabled** (it needs real layout, which jsdom lacks); the in-house contrast check remains the authoritative contrast source. axe's native severities map 1:1 to `FindingSeverity`; its rule→SC tags populate `sc`. Free, offline, runs on every generate / validate / redesign / publish.
- **`wave`** — opt-in adapter for the WAVE subscription API (§4). Maps WAVE categories (errors → serious/critical, contrast errors → 1.4.3, alerts → moderate) to the canonical model.
- **Manual route** — not an engine: the criteria automation cannot judge are reported as `needs-human-review` with a short checklist and links to the free tools (§4).

Criteria no engine covered and no manual review confirmed stay `needs-human-review` — the report never claims "fully compliant"; it claims exactly what was checked.

## 3. The gate (two-tier, both publish paths)

The gate evaluates the `ConformanceReport.verdict` **against the institution's required level** (§7).

**Single-page (`publish_to_canvas`, canvas-design-studio `publish.ts`):** a new gate directly after the audit call (currently `publish.ts:300`), mirroring the FERPA (`:284`) and validation (`:295`) gates:

- `verdict: 'pass'` → publish; report attached to the result.
- `verdict: 'borderline'` → blocked with code `ACCESSIBILITY_ACK_REQUIRED` unless `acknowledgeAccessibility` is supplied. Light form suffices: `acknowledgeAccessibility: true`.
- `verdict: 'fail'` → blocked with code `ACCESSIBILITY_ACK_REQUIRED` listing the failing SC ids. Only the explicit form unblocks: `acknowledgeAccessibility: ["1.4.3", "1.3.1"]` — the array must cover **every** clear-failure SC (extras are an error; `true` is insufficient). This forces the acknowledgment to name what is being overridden.

New input on `PublishToCanvasInput` and the MCP schema (same three-touch pattern as `forcePublish`):

```ts
acknowledgeAccessibility?: boolean | string[];
```

**Course (`publish_course`, command-and-control):**
- `scan_warnings.ts` upgrades: a11y findings that are clear failures at the required level get `severity: 'block'`; borderline stay `'warn'` but are surfaced prominently in `preview_course_publish`.
- The existing block guard (`publish_course.ts:257`) passes for a file when the new per-file map covers it:

```ts
a11yAcknowledgments?: { [filename: string]: true | string[] };  // true = borderline-only; string[] = named SC override
```

Same semantics as single-page: files with clear failures need the array form naming every blocked SC.

**Acknowledgment record (audit trail):** every acknowledgment appends to `<course project>/.a11y/acknowledgments.json`:

```json
{ "at": "2026-07-01T20:14:00Z", "page": "week-3-lab.html", "canvasUrl": "https://boisestate.instructure.com/courses/123/pages/week-3-lab", "tier": "fail", "scIds": ["1.4.3"], "requiredLevel": "WCAG 2.1 AA" }
```

## 4. Deep-check escalation (triage)

axe + in-house run first, free, on everything. The gate **recommends** a deep check when any of:

1. clear failures exist at the required level;
2. the page contains automation blind spots — complex tables, forms, `<iframe>` embeds, custom widgets;
3. the professor is about to acknowledge past a failure (an override deserves a second opinion first).

The recommendation presents both routes side by side; nothing runs without an explicit yes:

- **Automated — WAVE API** (paid, ~1–3 credits/page). **Hard constraint: the WAVE API fetches by public URL and cannot log into Canvas.** It is therefore only usable for publicly-visible pages. The adapter refuses URLs it detects as auth-gated (Canvas login redirect) and says why, so no credit is wasted.
- **Manual (free):** for auth-gated pages — which is most Canvas content — the professor opens the page in their browser (already logged in) and runs either the **WAVE browser extension** (free, same WebAIM engine as the API; Chrome/Firefox; catches dynamically loaded content the online tool misses) or **MS Accessibility Insights for Web** (free; Windows + Chromium-based browser; FastPass automation is axe-core plus guided manual assessments for the `needs-human-review` criteria). Link: <https://accessibilityinsights.io/downloads/>. The review queue (§5) is built to make this walkable.
- The WAVE route is not just a fallback: Boise State **officially recommends WAVE as the pre-publish accessibility check** (<https://www.boisestate.edu/webguide/publishing/wave-web-accessibility-evaluation-tool/>), citing the same WCAG AA 4.5:1 contrast bar this design gates on, and the same caveat this design encodes as `needs-human-review`: "a person must identify many accessibility issues manually." When an institution's policy URLs (§7) include a recommended checker, reports name it in the deep-check recommendation.

Manual results don't flow back automatically; the professor either fixes, marks the page reviewed (§5), or acknowledges.

## 5. Borderline review queue ("near the edge" list)

Per-course, persisted at `<course project>/.a11y/review-queue.json`. An entry is added/updated whenever a check or publish produces:

- a borderline finding (contrast in the 85% band, moderate findings at required level),
- `needs-human-review` criteria on a content-heavy page, or
- a publish that went through via acknowledgment.

Entry shape:

```json
{ "page": "week-3-lab.html", "canvasUrl": "https://boisestate.instructure.com/courses/123/pages/week-3-lab", "reasons": [{ "sc": "1.4.3", "detail": "4.32:1 measured, 4.5:1 required" }], "lastCheckedAt": "2026-07-01", "status": "open" }
```

New C&C MCP tool **`accessibility_review_queue`**:
- `action: "list"` (default) — prints the open queue as a clickable worklist: URL, criteria + margins, last checked. Sorted worst-margin first.
- `action: "resolve", page, note?` — marks an entry `reviewed-by-human` with timestamp + optional note (recorded like acknowledgments).
- Entries also auto-clear when a re-check comes back clean.

New C&C MCP tool **`audit_course_accessibility`** — runs the full engine stack across all course pages (from the course backup / snapshot), produces one course-level `ConformanceReport` summary, and refreshes the review queue. This is the "regular check" a professor runs between semesters or mid-course; it also fires the policy nudge (§7).

## 6. Reporting

Everywhere a check runs (generate, validate, redesign, publish, audit), output leads with the verdict against the required level, then:

1. **Failures** (SC id, name, severity, margin, fix suggestion) — grouped clear vs. borderline;
2. **Advisories** beyond the required level, labeled e.g. "WCAG 2.2 AA (beyond your institution's 2.1 AA requirement)";
3. **Needs human review** — the unautomatable criteria with the manual checklist + tool links;
4. **WCAG 3 (draft)** section when toggled on (§8);
5. **Policy nudge** when due (§7).

## 7. Institutional policy anchor

The institution config (written by `setup_institution`) gains:

```json
"accessibilityPolicy": {
  "urls": [
    "https://www.boisestate.edu/webguide/accessibility/title-ii-accessibility-requirements/",
    "https://www.boisestate.edu/webguide/accessibility/accessibility-guides-and-resources/",
    "https://www.boisestate.edu/webguide/publishing/wave-web-accessibility-evaluation-tool/"
  ],
  "requiredConformance": { "version": "2.1", "level": "AA" },
  "recheckWeeks": 4,
  "lastVerifiedAt": "2026-07-01",
  "wcag3Advisory": false
}
```

- **Default required level when unset: WCAG 2.1 AA** (the ADA Title II baseline for public institutions). Setting `"2.2"` tightens the gate with a single config change; the check engines always run the full 2.2 rule set regardless — the level only moves the gate/advisory line.
- **Cadence:** default `recheckWeeks: 4` (fits back-to-back 5-week summer sessions), configurable. When `now - lastVerifiedAt > recheckWeeks`, every report leads with one nudge: *"Institution accessibility policy last verified ⟨date⟩ — re-read: ⟨urls⟩"*.
- New C&C MCP tool **`review_accessibility_policy`**: no args → shows URLs, required level, last verified; `confirm: true` → stamps `lastVerifiedAt` today; also accepts updates to `urls` / `requiredConformance` / `recheckWeeks` / `wcag3Advisory` so the professor never edits JSON by hand.
- `setup_institution` prompts for policy URLs + required level during onboarding (skippable; defaults apply).

## 8. WCAG 3 advisory layer (opt-in, never a gate)

- Controlled by `wcag3Advisory` (default **false**). Toggle via `review_accessibility_policy`.
- When on, reports append a clearly-labeled **"WCAG 3 (pre-release draft — advisory only)"** section: existing findings mapped to draft WCAG 3 outcome names via a small static table (e.g. 1.4.3 → "Text and visual contrast", 1.1.1 → "Text alternatives"), plus a note of draft outcomes with no 2.x analogue that automation can't yet assess.
- Structurally incapable of gating: WCAG 3 is a working draft with a different conformance model (outcome ratings, not SC pass/fail). The mapping table carries the draft date it was built against and gets revisited when W3C advances the spec. Zero effect on `verdict`.

## 9. Testing strategy (TDD throughout)

- **Adapter contract tests** — one shared suite run against every engine: same fixture HTML in, canonical findings out (correct SC ids, severities, margins).
- **Fixture pages** with known violations per criterion (missing alt, 4.3:1 contrast, skipped heading, ARIA misuse for axe, 2.2-only target-size case) and one fully-clean page.
- **Borderline math tests** — exact 85% boundary, exactly-at-threshold (4.5 passes), large-text thresholds.
- **Gate tests** — both paths × {pass, borderline+true, borderline without ack, fail+named array, fail with incomplete array, fail with `true` only (rejected)}; acknowledgment records written; existing FERPA/validation gates unaffected.
- **Queue tests** — add/update/resolve/auto-clear; sort order.
- **Policy tests** — default level, nudge timing (4 weeks), config round-trip, WCAG 3 toggle on/off output.
- **WAVE adapter tests** — response mapping from recorded API fixtures; auth-gated URL refusal. No live API calls in CI.

## 10. Phased delivery (one plan per phase)

1. **Phase 1 — Thorough checking:** canonical model in shared-types, engine interface, in-house remap, axe-core adapter (jsdom), unified `ConformanceReport` in all existing outputs. *Deliverable: dramatically deeper checks, everywhere, still advisory.*
2. **Phase 2 — Gate + queue:** two-tier gate in both publish paths, acknowledgment plumbing + records, review queue + `accessibility_review_queue`, `audit_course_accessibility`. *Deliverable: acknowledge-to-launch with audit trail.*
3. **Phase 3 — Policy + escalation extras:** institutional policy anchor + cadence + `review_accessibility_policy`, WCAG 3 advisory toggle, WAVE API adapter + triage recommendations. *Deliverable: institution-anchored gating and the deep-check tier.*

Each phase ships independently useful software; each gets its own implementation plan.

## Open items acknowledged

- The WAVE API public-URL constraint (§4) means the paid automated deep check does **not** work on auth-gated Canvas pages — the common case. The free browser-extension route + review queue is the designed answer; the API remains useful for public course pages. Flagged to the professor before any credit purchase.
- axe-core in jsdom cannot evaluate layout-dependent rules (contrast, target size as rendered). In-house contrast covers the main case; rendered-layout verification belongs to the manual deep-check tier.
