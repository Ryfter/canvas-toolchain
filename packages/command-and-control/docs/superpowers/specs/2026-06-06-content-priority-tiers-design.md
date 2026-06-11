# Content Priority Tier System (TL;DR Card) — Design Spec

**Date:** 2026-06-06
**Issue:** [#66](https://github.com/Ryfter/canvas-toolchain/issues/66)
**Scope:** Add a 3-tier importance ranking (At a glance / Working detail / Deep support) to CDS page sections. CI assigns tiers + short summaries via `analyze_course`; CDS prepends a TL;DR card built from tier-1 summaries at render time. Additive only — pages without tier data render exactly as today.

---

## Goal

Professors today have no way to surface "what does the student need to know in 5 seconds?" on a Canvas page. A long page with a buried due date is the norm; the deliverable, the deadline, and the one-sentence context get lost in the same visual weight as the rubric breakdown.

This spec adds a tier label per page section and a TL;DR card built from the highest-priority (tier-1) summaries.

---

## Motivation

- The professor's own words: *"Maybe create a ranking of sorts that helps identify what information on a page needs to be really easy to find — just a glance / get the gist — vs what is needed for a deeper look, all the deeper supporting docs."*
- Tier-1 content (due date, deliverable, one-sentence context) currently has the same visual weight as tier-3 content (rubric breakdowns, examples).
- The CI pipeline already understands the *content* of each page; assigning a tier is a natural extension of that analysis.
- Additive rendering (a card prepended to existing body) means zero regression risk on pages that already work.

---

## Architectural Decisions (ADRs)

### ADR 1 — CI assigns tiers, professor can override

**Decision:** CI's `analyze_course` runs an LLM-driven tier-assignment phase per section. Professor edits the resulting front-matter `tiers:` block to override, and sets `tiers.locked: true` to keep manual edits from being overwritten on re-analysis.

**Rejected alternatives:**
- *Type-driven mapping* (section type → fixed tier): too rigid; the same heading text can mean different things across courses.
- *Manual tagging only*: pushes the work onto the professor that the tool was supposed to do.

### ADR 2 — TL;DR card only at v1; per-section prominence deferred

**Decision:** v1 renders ONE thing: a TL;DR card built from tier-1 section summaries, prepended to the page body. Tier-2 and tier-3 data is stored but not visibly rendered.

**Rationale:**
- Additive: pages without tier-1 sections render exactly as today (zero regression).
- High-value single deliverable (the 5-second answer to "what does the student need to know?").
- Tier-2/3 data is captured by CI's pass — v2 can layer per-section prominence or `<details>` collapse without re-running analysis.

### ADR 3 — Tier data lives in page front matter

**Decision:** CI writes `tiers:` into the page's existing YAML front matter. Professor override is a normal front-matter edit.

**Rejected alternatives:**
- *Sidecar JSON file per page*: scatters data; tier is page-scoped, belongs on the page.
- *Centralized per-course index*: weak locality; conflicts on parallel edits.

### ADR 4 — Tier assignment folds into `analyze_course`, not a separate tool

**Decision:** No new MCP tool. Tier assignment is a new phase inside the existing `analyze_course` CI tool.

**Rejected alternatives:**
- *Standalone `assign_content_tiers` MCP tool*: extra cognitive load; professor has to remember a new step.
- *Lazy from `generate_page`*: surprising LLM costs at render time.

**Implementation note (added post-brainstorm during plan recon):** Today's `analyze_course` operates on a Canvas-Backup archive (`archivePath`), not on the CDS markdown course folder. To fold tier assignment in without breaking existing callers, `analyze_course` gains an OPTIONAL `courseDir` input. When `courseDir` is supplied, the tier-assignment phase runs after the existing trajectory analysis. When `courseDir` is omitted, behavior is unchanged. C&C's wrapper passes both when invoking — the professor still sees "one tool."

---

## Architecture

```
CI (curriculum-intelligence) — analysis pass
  src/analyze/
    assign_tiers.ts                  [NEW — given a page's sections, calls
                                      LLM to assign tier (1/2/3) + short
                                      summary per section. Returns PageTiers.]
  src/tools/analyze_course.ts        [MODIFY — adds tier-assignment phase
                                      after existing semantic analysis.
                                      Writes results to each page's front
                                      matter. Skips pages with locked tiers.]

CDS (canvas-design-studio) — render pass
  src/templates/
    tldr_card.ts                     [NEW — renders the TL;DR card HTML from
                                      tier-1 summaries. Canvas-safe inline
                                      CSS; University primary blue palette.]
  src/tools/generate-page.ts         [MODIFY — at render time, if the page
                                      front matter has tier-1 sections,
                                      prepend the TL;DR card to the body.]

Shared types
  @canvas-toolchain/shared-types
    Tier, SectionTier, PageTiers     [NEW exports]
```

**Key invariants:**
- CI owns tier *assignment*; CDS owns tier *rendering*. Clean package boundary; either can be tested in isolation.
- Tier data lives in page front matter (ADR 3) — single source of truth, professor-overridable, git-diffable.
- Render is additive only (ADR 2). Pages without tier data render exactly as today.
- `tiers.locked: true` is sacred — re-analysis must never overwrite it.

---

## Data Model

### Per-page front matter

```yaml
---
title: Week 5 Assignment — Data Storytelling
module: Module 5
# CI-assigned; professor can edit any field, set locked: true to preserve
tiers:
  locked: false                       # default false; true → re-analyze skips
  sections:
    - heading: "Due Date"
      tier: 1
      summary: "Friday Oct 17 at 11:59 PM"
    - heading: "Submission Instructions"
      tier: 2
      summary: "Single PDF, max 3 pages, named lastname-w5.pdf"
    - heading: "Rubric Breakdown"
      tier: 3
      summary: "Analytical rigor + writing quality + on-time"
---
```

Field rules:

| Field | Required | Rule |
|---|---|---|
| `tiers` | optional | Whole block absent → page renders without TL;DR card |
| `tiers.locked` | optional | Boolean; defaults `false`. `true` → `analyze_course` skips re-assignment for this page. |
| `tiers.sections` | required if `tiers` present | Non-empty array |
| `tiers.sections[].heading` | required | Must match a heading in the page body (case-insensitive). Used for re-alignment if body sections change. |
| `tiers.sections[].tier` | required | Integer 1, 2, or 3. Anything else → `TIER_INVALID_RESPONSE` (skip + warn). |
| `tiers.sections[].summary` | required | Non-empty string. Used verbatim in the TL;DR card (HTML-escaped at render). |

### Shared types (`@canvas-toolchain/shared-types`)

```ts
export type Tier = 1 | 2 | 3;

export interface SectionTier {
  heading: string;
  tier: Tier;
  summary: string;
}

export interface PageTiers {
  locked?: boolean;
  sections: SectionTier[];
}
```

---

## CI — `assign_tiers.ts`

### Input

```ts
export interface AssignTiersInput {
  pageTitle: string;
  sections: Array<{ heading: string; body: string }>;
  llm: LlmClient;
}
```

### Output

```ts
export interface AssignTiersResult {
  tiers: PageTiers;
  warnings: string[];
}
```

### Behavior

1. Build a single LLM call: system prompt explains the tier scale; user prompt lists each section's heading + body.
2. Request a strict JSON response: `{ sections: [{ heading, tier, summary }, ...] }`.
3. Validate the response: every input section heading appears in the response; every `tier ∈ {1,2,3}`; every `summary` is non-empty.
4. For sections where validation fails, log a warning and skip (don't fail the whole page).
5. Return `{ tiers: { sections: validatedSections }, warnings }`.
6. If validation drops ALL sections, throw `TIER_ASSIGN_FAILED`.

### System prompt (canonical text)

```
You are tagging course-page sections by importance for a student reading the page.

Tier 1 (At a glance):    What a student must know in 5 seconds — due date,
                         deliverable, one-sentence context.
Tier 2 (Working detail): What a student needs to actually complete the work —
                         submission steps, required tools, key resources.
Tier 3 (Deep support):   Rubric breakdowns, examples, reference docs.

For each section provided, return:
  - heading (verbatim from input)
  - tier (1, 2, or 3)
  - summary: ONE LINE, max 12 words, suitable for a "Quick Reference" card.

Return strict JSON: { "sections": [{ "heading": "...", "tier": N, "summary": "..." }] }
```

---

## CI — `analyze_course.ts` modification

`AnalyzeCourseInput` gains an OPTIONAL `courseDir?: string` field. When supplied, a new phase runs after existing trajectory analysis, before the function returns:

```
existing trajectory analysis (Canvas archive → topic-map / per-assignment)
  ↓
NEW (only if input.courseDir is provided):
  for each .md file under courseDir/ (excluding course-config.md):
    parse YAML front matter + body
    if front_matter.tiers && front_matter.tiers.locked === true: continue
    split body into { heading, body } sections by H2 / H3
    call assignTiers({ pageTitle, sections, llm: resolvedLlmClient })
    merge result.tiers into front matter (preserve other fields)
    atomic-write the page (preserving body unchanged)
    accumulate warnings
  ↓
return AnalyzeCourseReport extended with optional .tierAssignments[] and .tierWarnings[]
```

`resolvedLlmClient` comes from #89's `resolveActiveLlmClient` — so this phase honors the user's active provider (Anthropic or Ollama).

**Backward compatibility:** existing callers that pass no `courseDir` see exactly the prior behavior. The new fields on `AnalyzeCourseReport` are both optional.

---

## CDS — `tldr_card.ts`

### Input

```ts
export interface RenderTldrCardInput {
  tiers: PageTiers;
}
```

### Output

Markdown-safe HTML string (or empty string if there are no tier-1 sections).

### Card template

```html
<div style="background:#E6ECF9; border-left:4px solid #0033A0; padding:1em 1.25em; margin-bottom:1.5em; border-radius:0 4px 4px 0;">
  <h3 style="margin-top:0; color:#0033A0;">📌 Quick Reference</h3>
  <ul style="margin:0.5em 0; padding-left:1.25em;">
    <li><strong>{HEADING_ESC}:</strong> {SUMMARY_ESC}</li>
    <!-- one <li> per tier-1 section, in source order -->
  </ul>
</div>
```

Behavior:

1. Filter `tiers.sections` to those with `tier === 1`.
2. If empty → return empty string (caller decides what to do with that).
3. Render the card; HTML-escape `heading` and `summary` per row.
4. Section order matches `tiers.sections` order (which matches source-body section order from CI).

---

## CDS — `generate-page.ts` modification

Single change:

1. After parsing front matter, before rendering the body:
   - `const tldr = page.tiers ? renderTldrCard({ tiers: page.tiers }) : '';`
2. After rendering the body to `bodyHtml`:
   - `return tldr + bodyHtml;`

Pages without `tiers` in front matter → `tldr === ''` → output is unchanged from today.

---

## Error Handling

| Code | Where raised | Behavior |
|---|---|---|
| `TIER_ASSIGN_FAILED` | `assign_tiers.ts` — all sections drop validation OR LLM call throws | Thrown; caller (`analyze_course`) catches per-page, skips, accumulates warning |
| `TIER_INVALID_RESPONSE` | `assign_tiers.ts` — per-section validation drops a section | Skipped; warning accumulated; partial result returned |
| `PAGE_FM_PARSE_FAILED` | `analyze_course` | Skipped + warn; page front matter is corrupt; manual fix needed |
| `PAGE_BODY_WRITE_FAILED` | `analyze_course` atomic write | Caught per-page; warning accumulated; original page untouched (atomic via tmp+rename) |

### Behavior contract

- One section fails → other sections still get written.
- One page fails → other pages still get analyzed.
- LLM provider unreachable mid-run → analyze surfaces the structured error from #89's resolver chain; analyze fails fast for the whole run (no per-page silent retry).
- Atomic writes throughout. Never leave a page with corrupt front matter.

---

## Testing

### New unit test files

| File | Coverage |
|---|---|
| `packages/curriculum-intelligence/tests/analyze/assign_tiers.test.ts` | (6) Happy path with mocked LlmClient returning valid response; rejects out-of-range tier value; rejects empty summary; partial-section failure (1 of 3 invalid) → other 2 still returned; LLM call throws → `TIER_ASSIGN_FAILED`; respects `tiers.locked: true` (returns existing tiers unchanged). |
| `packages/curriculum-intelligence/tests/tools/analyze_course.test.ts` (modify) | (+3) Tier-assignment phase runs after semantic analysis; tier data lands in front matter atomically; locked pages skipped. |
| `packages/canvas-design-studio/tests/templates/tldr_card.test.ts` | (5) Renders bullet list from tier-1 summaries; returns empty string when no tier-1 sections; respects section order; HTML-escapes summary content; uses University primary blue palette (`#0033A0`). |
| `packages/canvas-design-studio/tests/generate-page.test.ts` (modify) | (+4) Page with tier-1 sections → card prepended (assert HTML order: card before body); page with only tier-2/3 → no card; page with no tier data → no card (output unchanged from today); existing tests still pass. |

### Test counts

- New unit tests: **~18** (6 + 5 + 3 + 4)
- Estimated +18 across CI + CDS workspaces.

### What's intentionally not tested

- Real LLM behavior (mocked everywhere).
- The visual appearance of the rendered card (snapshot tests are brittle for CSS; assert structural HTML only).
- End-to-end MCP server invocation (analyze_course already has test coverage; we just add new assertions).

---

## Out of Scope

| Item | Why |
|---|---|
| **AIAS labeling** | Now its own issue (#92) |
| **CLO mapping per assignment** | Now its own issue (#91) |
| **Tier 2/3 rendering** | ADR 2 — TL;DR card only at v1; data captured for v2 |
| **Page reordering** | Narrative flow matters; tier doesn't change source order |
| **Per-page TL;DR card OFF switch beyond `tiers.locked`** | YAGNI — locked + front-matter deletion covers it |
| **Card customization (color, position, heading)** | YAGNI — one University-themed shape ships in v1 |
| **Bulk-edit tier data via dedicated MCP tool** | YAGNI — front-matter edits are how every CDS field works |
| **Tier suggestions during `brainstorm_interactive`** | `analyze_course` is the right place; brainstorm stays focused |

---

## Acceptance Criteria

1. **CI tier-assignment phase runs in `analyze_course`.** After existing semantic analysis, every page's body is section-split by H2/H3 heading, tiered via LLM, and the result is written to that page's front matter as a `tiers:` block.

2. **`tiers.locked: true` is respected.** Re-running `analyze_course` skips pages where this is set. Manual edits survive.

3. **TL;DR card renders only when tier-1 sections exist.** Pages without tier-1 sections (whether the `tiers` block is absent entirely or only contains tier-2/3 entries) render exactly as today.

4. **Card content matches stored summaries.** The `<li>` entries are the tier-1 `summary` fields verbatim (HTML-escaped). Order matches source-body section order.

5. **Partial LLM failures degrade gracefully.**
   - Per-section validation failures: drop that section, write the rest, accumulate warnings.
   - Per-page failures: skip that page, accumulate warnings, continue.
   - Atomic writes throughout — never leave a page with corrupt front matter.

6. **All ~18 new tests pass; no existing tests regress.**

7. **Documentation.**
   - `packages/curriculum-intelligence/CLAUDE.md` documents the new `analyze_course` phase + the `tiers:` front-matter block + the `locked` flag.
   - `packages/canvas-design-studio/CLAUDE.md` documents the TL;DR card prepend behavior + the card's visual contract.
