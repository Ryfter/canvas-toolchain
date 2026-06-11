# Course Learning Outcomes (CLO) Mapping — Design Spec

**Date:** 2026-06-07
**Issue:** [#91](https://github.com/Ryfter/canvas-toolchain/issues/91)
**Scope:** Add Course Learning Outcomes (CLOs) as first-class metadata. Catalog lives in `course-config.md` front matter under `clos:`. Per-assignment mapping via `clos: [ids]` in page front matter. Rendered as a "Supports CLOs:" line inside the existing TL;DR card from #66 on assignment + rubric pages only.

---

## Goal

Faculty have no way to declare what skills a course measures or to tag which assignments serve which outcomes. CLOs are foundational to assessment design, accreditation, and program review — but today the toolchain treats every assignment as if it floats free of any pedagogical hierarchy.

This spec adds:
1. A course-level CLO catalog (id + name + statement + optional tag per CLO).
2. Per-assignment tagging (`clos: [1, 3]` in page front matter — referencing catalog IDs).
3. A render surface that surfaces "Supports CLOs:" inside the #66 TL;DR card on assignment + rubric pages.

Pedagogical-framework-agnostic in v1: doesn't require Bloom's, doesn't require any specific gradebook structure. Just declares which assignments serve which course-level outcomes.

---

## Motivation

- Standard accreditation expectation across higher ed.
- Concrete v1.x request from #91, with the "alternative assessment" article (Gulya) as the trigger context. The professor: confirmed catalog + tagging + render scope without the gradebook reorganization.
- Naturally complements #92 (AIAS — *how* you may engage) and #66 (tier system — *what's important on this page*). CLOs answer *why this assignment exists.*

---

## Architectural Decisions (ADRs)

### ADR 1 — Catalog + tagging + render only at v1

**Decision:** No brainstorm-flow upgrade (#45 stays as-is). No assessment-track tagging. No gradebook reorganization. Just three pieces: catalog, per-assignment tags, render.

**Rationale:** Smallest viable footprint. Once CLOs exist as real data in the system, layered features (brainstorm steering, track tagging, compliance reports) become tractable follow-up issues.

### ADR 2 — Catalog lives in `course-config.md` front matter

**Decision:** New optional `clos:` block in the course-config.md front matter, sibling to `defaultAiasLevel` and other course-level fields. Faculty edits one file.

**Rejected alternatives:**
- *Sidecar `course-clos.yaml`*: cleaner separation; but every faculty edit then touches two files when they want to add a CLO and reference it on an assignment. Single source wins for v1.
- *Sidecar `course-clos.md` with prose*: more readable for humans; harder to parse; over-design for v1.

### ADR 3 — Rich CLO record: id + name + statement + optional tag

**Decision:** Each CLO has:
- `id: string` (kebab-case or numeric — author's choice)
- `name: string` (short label, e.g., "Analyzing")
- `statement: string` (full text)
- `tag?: 'core' | 'supporting'` (optional — distinguishes load-bearing CLOs from supporting ones)

**Rejected:**
- *id + statement only*: loses the compact "CLO 1 — Analyzing" rendering form.
- *id + name + statement + Bloom's level + assessment-type hint*: pedagogically opinionated; v1 stays framework-neutral.

### ADR 4 — Fold rendering into #66's TL;DR card

**Decision:** The TL;DR card from #66 grows an optional "Supports CLOs:" line at the bottom. CLO mapping renders ONLY on assignment + rubric pages.

**Rationale:**
- Avoids stacking a third callout above page content (already have AIAS + TL;DR; a third would be visually heavy).
- TL;DR card is already the "what do I need to know" surface — CLOs answer "why" which fits.

**Implementation coupling cost:** modifies the v1.0 TL;DR card data shape from #66. Acceptable — the change is additive (new optional field) and #66 just shipped today, so the surface is fresh in our heads.

---

## Architecture

```
shared-types
  Clo, CourseClos, PageClos          [NEW types]

CDS (canvas-design-studio)
  src/course/
    clos_catalog.ts                  [NEW — read CLO catalog from course-config.md]
  src/tools/
    extract_clos.ts                  [NEW — extract per-page clos list from front matter]
  src/templates/
    tldr_card.ts                     [MODIFY — accept optional clos prop; render
                                      "Supports CLOs:" line at bottom of card]
  src/tools/generate-page.ts         [MODIFY — for assignment/rubric pages, pass
                                      resolved CLOs into renderTldrCard]
  Tests for all of the above

C&C (command-and-control)
  No new MCP tools at v1 — faculty edits course-config.md directly.
  CLO catalog editing via a dedicated tool is a v2 follow-up if demand surfaces.
```

**Key invariants:**
- Catalog data is plain front-matter text. No LLM involvement at any point.
- Per-page tagging references catalog IDs. Unknown IDs degrade gracefully (skip silently with a warning in the render result if we surface one — render-only; no errors thrown).
- TL;DR card already renders conditional on tier-1 sections (#66); now also renders if CLO mapping exists on assignment/rubric pages. Either source triggers the card.

---

## Data Model

### Shared types (`@canvas-toolchain/shared-types`)

```ts
export type CloTag = 'core' | 'supporting';

export interface Clo {
  id: string;
  name: string;
  statement: string;
  tag?: CloTag;
}

export interface CourseClos {
  clos: Clo[];
}

export interface PageClos {
  /** Resolved CLO records for the page (joined from catalog by id). */
  resolved: Clo[];
  /** IDs the page referenced that weren't found in the catalog (for graceful degradation). */
  unknownIds: string[];
}
```

### Course-level config (CDS `course-config.md` front matter)

```yaml
---
title: ITM 370
short_name: ITM370
semester: F26
# NEW optional CLO catalog:
clos:
  - id: '1'
    name: Analyzing
    statement: Students will be able to analyze business data to identify trends and anomalies.
    tag: core
  - id: '2'
    name: Communicating
    statement: Students will be able to communicate data-driven insights to non-technical stakeholders.
    tag: core
  - id: '3'
    name: Collaborating
    statement: Students will be able to collaborate effectively on data projects using version-controlled artifacts.
    tag: supporting
---
```

Validation: each `clos[i].id` must be a non-empty string and unique within the course. Each `clos[i].name` and `clos[i].statement` must be non-empty strings. `tag` optional; if present must be `'core'` or `'supporting'`.

### Per-page front matter

```yaml
---
title: Week 5 Assignment — Data Storytelling
week: 5
# NEW optional CLO mapping (list of ids matching catalog):
clos: ['1', '2']
---
```

If `clos` field is absent, the page maps to no CLOs. If `clos` references unknown IDs, those are silently dropped at resolution time (recorded in `unknownIds` for diagnostics).

### Resolution

```
catalog = readClosCatalog(courseConfigPath)  // CourseClos | { clos: [] }
pageIds = extractClosFromPage(mdPath)        // string[] | []
resolved = pageIds.map(id => catalog.clos.find(c => c.id === id)).filter(Boolean)
unknownIds = pageIds.filter(id => !catalog.clos.some(c => c.id === id))
return resolved.length > 0 ? { resolved, unknownIds } : undefined
```

Returns `undefined` when there are no resolved CLOs — the TL;DR card simply omits the line.

---

## CDS Modules

### `src/course/clos_catalog.ts`

```ts
export interface ReadClosCatalogResult {
  clos: Clo[];
  warnings: string[];  // for invalid entries (skipped, not thrown)
}

export function readClosCatalog(courseConfigPath: string): ReadClosCatalogResult;
```

Behavior:
- Reads the YAML front matter from course-config.md.
- Looks for `clos:` array.
- For each entry: validates `id`, `name`, `statement` are non-empty strings; `tag` (if present) is `'core'` or `'supporting'`.
- Skips invalid entries with a warning rather than throwing — render-side is best-effort.
- Returns `{ clos: [], warnings: [] }` if no catalog block present.

### `src/tools/extract_clos.ts`

```ts
export function extractClosFromFile(mdPath: string): string[];
```

Reads the page's YAML front matter, returns the `clos:` array as `string[]` (or `[]` if absent/malformed). All IDs are coerced to strings.

### `src/templates/tldr_card.ts` — MODIFY

The existing `renderTldrCard({ tiers })` signature grows an optional second-field input:

```ts
export interface RenderTldrCardInput {
  tiers?: PageTiers;        // now optional (was required)
  clos?: PageClos;          // NEW optional
}
```

Render logic:
- If neither tier-1 sections nor any resolved CLOs exist → return empty string (unchanged behavior).
- Otherwise render the card with:
  - Tier-1 bullet list (if tier-1 sections present) — unchanged from #66.
  - "Supports CLOs:" line at the bottom (if `clos.resolved` non-empty), formatted as `**Supports CLOs:** CLO 1 — Analyzing · CLO 2 — Communicating`. Names are HTML-escaped.

### `src/tools/generate-page.ts` — MODIFY

After the existing AIAS resolution (which gives `aias`), add CLO resolution:

```ts
const isCloEligible = pageType === 'assignment' || pageType === 'rubric';
let pageClos: PageClos | undefined;
if (isCloEligible) {
  const catalog = readClosCatalog(configPath);
  const pageIds = extractClosFromFile(absPath);
  if (pageIds.length > 0) {
    const resolved = pageIds.map((id) => catalog.clos.find((c) => c.id === id)).filter(Boolean) as Clo[];
    const unknownIds = pageIds.filter((id) => !catalog.clos.some((c) => c.id === id));
    if (resolved.length > 0) {
      pageClos = { resolved, unknownIds };
    }
  }
}

// Existing tldr handling — pass clos in:
const tldrHtml = (tiers || pageClos) ? renderTldrCard({ tiers, clos: pageClos }) : '';
```

The existing line `const tldrHtml = tiers ? renderTldrCard({ tiers }) : '';` becomes the above.

---

## Error Handling

| Code | Where | Behavior |
|---|---|---|
| `CLOS_CATALOG_INVALID` | clos_catalog.ts | Per-entry validation failures result in skipped entries + warning. NEVER thrown — render-side stays best-effort. |
| (none — unknown id on page) | extract_clos.ts → resolver | Unknown IDs silently dropped; recorded in `unknownIds` for diagnostics. No render error. |

No structured error returns. Render is purely additive — when CLO data is malformed, the line just doesn't render.

---

## Testing (~13 new tests)

| File | Tests |
|---|---|
| `packages/shared-types/tests/index.test.ts` | (+1) `Clo`, `CourseClos`, `PageClos` types compile. |
| `packages/canvas-design-studio/tests/course/clos_catalog.test.ts` | (4) Parses well-formed catalog; returns empty when no `clos:` block; skips entries with missing fields + warns; rejects invalid `tag` value. |
| `packages/canvas-design-studio/tests/tools/extract_clos.test.ts` | (3) Returns ID array when present; returns `[]` when absent; returns `[]` for malformed front matter. |
| `packages/canvas-design-studio/tests/templates/tldr_card.test.ts` (modify) | (+3) Renders "Supports CLOs:" line when `clos.resolved` non-empty; omits line when `clos` absent; HTML-escapes CLO names. |
| `packages/canvas-design-studio/tests/generate-page.test.ts` (modify) | (+2) Assignment page with `clos: ['1','2']` in front matter + catalog in course-config renders the line; rubric page same; non-eligible page type (`resources.md`) with `clos:` set → no CLO line; CLO mapping with all-unknown IDs → no card line. |

---

## Out of Scope

| Item | Why |
|---|---|
| **`brainstorm_interactive` CLO steering** | #45 stays as-is; v2 follow-up if useful. |
| **Assessment-track tagging (Gulya framework)** | Pedagogically opinionated; separate v2 issue. |
| **Gradebook reorganization** | Out of toolchain scope. |
| **MCP tool to manage catalog** | Faculty edits course-config.md directly. v2 if pain surfaces. |
| **Program-level outcomes** | Institutional integration territory. |
| **CLO compliance reports / dashboards** | v2 feature on top of v1 data. |
| **Per-rubric-criterion CLO mapping** | v2 — couples to rubric structure. |

---

## Acceptance Criteria

1. **Catalog parses cleanly.** `readClosCatalog` returns the parsed `Clo[]` from a well-formed `clos:` block in course-config.md. Returns `{ clos: [], warnings: [] }` when the block is absent.

2. **Per-page extraction works.** `extractClosFromFile` returns the page's `clos:` IDs as `string[]`, or `[]` if absent.

3. **Render is restricted to eligible page types.** Assignment + rubric pages render the "Supports CLOs:" line when CLOs resolve. Non-eligible page types render unchanged.

4. **TL;DR card co-renders with #66 tier data.** When a page has both tier-1 sections AND CLOs, the card shows tier-1 bullets followed by the "Supports CLOs:" line. When a page has CLOs but no tier-1 sections, the card renders just the CLO line.

5. **Unknown IDs degrade gracefully.** A page referencing CLO IDs not in the catalog produces no error; the line shows only known CLOs (or omits the line if zero resolve).

6. **Validation failures degrade gracefully.** A malformed catalog entry produces a warning but doesn't throw; the rest of the catalog still loads.

7. **All ~13 new tests pass; no existing tests regress.** This means #66's existing TL;DR card tests still pass after the `tiers` field becomes optional and `clos` is added.

8. **Documentation.** `packages/canvas-design-studio/CLAUDE.md` documents the `clos:` catalog block, the per-page `clos: [ids]` field, the render conditions, and the "Supports CLOs:" line inside the TL;DR card.
