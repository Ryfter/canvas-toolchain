# AI Assessment Scale (AIAS) Labeling — Design Spec

**Date:** 2026-06-06
**Issue:** [#92](https://github.com/Ryfter/canvas-toolchain/issues/92)
**Scope:** Add Leon Furze's [AI Assessment Scale](https://aiassessmentscale.com/) (5 levels, CC BY-NC-SA 4.0) as first-class metadata on canvas-toolchain pages. Course-wide default plus per-page override. Rendered as a single inline callout on assignment and rubric pages.

---

## Goal

Professors lack a standard way to tell students "what AI use is permitted on this assignment?" Furze's AIAS provides a 5-level vocabulary (No AI → AI Planning → AI Collaboration → Full AI → AI Exploration) that maps to concrete student expectations. This spec wires AIAS into canvas-toolchain so:

1. Faculty set a course-wide AIAS default once.
2. Any assignment can override the default.
3. The assignment and rubric pages render a clear callout telling students which level applies and what they may/must do.

---

## Motivation

- The professor's own words: *"Something I DO want added, the AI Assessment scale."*
- Course-wide policy without per-assignment friction: most assignments fit one baseline; only outliers need overrides.
- Visible at the point of action: students see the AI policy on the assignment page they're working from, and again on the rubric page when they re-check expectations.
- Open-licensed, well-documented framework with broad pedagogical adoption — using Furze's vocabulary means students who've seen it elsewhere recognize it instantly.

---

## Architectural Decisions (ADRs)

### ADR 1 — AIAS is professor-tagged, NOT LLM-inferred

**Decision:** The AIAS level is set by faculty intent, not derived by an LLM. Course default is set via an MCP tool; per-page overrides are manual front-matter edits.

**Rationale:** AIAS is a pedagogical decision about what students should learn — a tool inferring it would be presumptuous. (This contrasts with #66's tier system, which is mechanical "which content is important" and IS LLM-inferred.)

### ADR 2 — Course-wide default + per-page override

**Decision:** A course-level `defaultAiasLevel` (optional `defaultAiasNote`) is the baseline. Pages can set their own `aiasLevel` / `aiasNote` in front matter. Resolution: page override > course default > omit.

**Rejected alternatives:**
- *Per-page only*: pushes burden onto faculty for every assignment.
- *Course-only*: misses cases like "default Level 3, but this exam is Level 1."

### ADR 3 — Single inline callout (matches existing CDS callout-box visual)

**Decision:** Render the AIAS as a single inline callout block at the top of the page, using the same visual language as CDS's existing callout-box pattern. No color coding by level (uses the standard callout palette).

**Rejected alternatives:**
- *Full-page color-coded banner*: louder, but competes with the TL;DR card from #66 and risks visual fatigue.
- *Inline callout + per-rubric-criterion tag*: most coverage, but maintenance-heavy and not yet justified by demand.

### ADR 4 — Banner on assignment and rubric pages only

**Decision:** The callout renders on pages classified as `assignment` or `rubric` per CDS's `PAGE_TYPES`. Other page types (front-page, week overview, resources, slides) get no callout.

**Rationale:** AIAS governs assignment expectations. Assignment pages are where students start the work; rubric pages are where they re-check expectations during the work. Other page types would be noise (banner on a Resources page tells students nothing useful).

---

## Architecture

```
shared-types
  AiasLevel, PageAias                  [NEW types]

CDS (canvas-design-studio)
  src/course/
    aias_config.ts                     [NEW — read/write defaultAiasLevel from course-config.md]
    aias_resolver.ts                   [NEW — resolve(pageFm, courseConfig) → PageAias | undefined]
    aias_canonical.ts                  [NEW — canonical AIAS text per level (Furze, CC BY-NC-SA 4.0)]
  src/templates/
    aias_callout.ts                    [NEW — renders the inline callout HTML]
  src/tools/
    extract_aias.ts                    [NEW — pulls aiasLevel/aiasNote from page front matter via yaml parse]
    generate-page.ts                   [MODIFY — for assignment/rubric pages, prepend aias_callout when level resolves]

C&C (command-and-control)
  src/tools/
    set_course_aias_default.ts         [NEW MCP tool — { courseDir, level, note? } → writes course config]
  src/index.ts                         [MODIFY — register the new tool]
```

**Key invariants:**
- AIAS data is plain front-matter / course-config text — no LLM involvement at any point.
- Render is additive only. Pages with no resolved level render exactly as today.
- Render is *conditional on page type*. Even when a level is set, non-assignment/non-rubric pages don't show the callout.
- All file writes atomic (tmp + rename).

---

## Data Model

### Shared types (`@canvas-toolchain/shared-types`)

```ts
export type AiasLevel = 1 | 2 | 3 | 4 | 5;

export interface PageAias {
  level: AiasLevel;
  note: string;  // resolved at render time — never the raw "no note set" sentinel
}
```

### Course-level config (CDS `course-config.md` front matter)

```yaml
---
title: ITM 370
short_name: ITM370
semester: F26
# NEW optional fields:
defaultAiasLevel: 3
defaultAiasNote: "Default for this course: you may draft with AI; you must edit and cite."
---
```

Both new fields optional. If `defaultAiasLevel` is absent, no course default exists — only per-page overrides resolve.

### Per-page front matter

```yaml
---
title: Final Exam
week: 12
# NEW optional override:
aiasLevel: 1
aiasNote: "Closed-book exam. No AI tools of any kind."
---
```

If `aiasNote` is omitted but `aiasLevel` is set, the canonical text for that level applies.

### Resolution at render time

```
pageLevel = pageFm.aiasLevel
courseLevel = courseConfig.defaultAiasLevel
effectiveLevel = pageLevel ?? courseLevel ?? undefined

if effectiveLevel === undefined:
  return undefined  # no callout

pageNote = pageFm.aiasNote
courseNote = courseConfig.defaultAiasNote
canonicalNote = CANONICAL_AIAS_NOTES[effectiveLevel]
effectiveNote = pageNote ?? courseNote ?? canonicalNote

return { level: effectiveLevel, note: effectiveNote }
```

### Canonical AIAS text per level (shipped constant)

```ts
// Attribution: Leon Furze, AI Assessment Scale, https://aiassessmentscale.com/
// Licensed CC BY-NC-SA 4.0.
export const CANONICAL_AIAS_NOTES: Record<AiasLevel, string> = {
  1: "No AI permitted — demonstrate knowledge without AI assistance.",
  2: "AI Planning only — brainstorm and outline; develop and refine ideas independently.",
  3: "AI Collaboration — draft with AI; you must critically edit, cite, and disclose what you used.",
  4: "Full AI — use AI throughout; demonstrate critical thinking by directing it strategically.",
  5: "AI Exploration — leverage AI creatively for novel, innovative approaches.",
};

export const CANONICAL_AIAS_NAMES: Record<AiasLevel, string> = {
  1: "No AI",
  2: "AI Planning",
  3: "AI Collaboration",
  4: "Full AI",
  5: "AI Exploration",
};
```

---

## MCP Tool: `set_course_aias_default`

### Input

```ts
interface SetCourseAiasDefaultInput {
  courseDir: string;      // path to the CDS course folder containing course-config.md
  level: 1 | 2 | 3 | 4 | 5;
  note?: string;          // optional override of the canonical text
}
```

### Output

```ts
type SetCourseAiasDefaultResult =
  | { ok: true; courseDir: string; level: AiasLevel; effectiveNote: string; configPath: string }
  | { ok: false; error: 'COURSE_CONFIG_NOT_FOUND' | 'INVALID_LEVEL'; message: string; fix: string[] };
```

### Behavior

1. Resolve `${courseDir}/course-config.md`. If absent: return `COURSE_CONFIG_NOT_FOUND` with fix `["Check that courseDir is a CDS course folder containing course-config.md"]`.
2. Validate `level ∈ {1,2,3,4,5}`. If not: return `INVALID_LEVEL` with fix `["level must be 1-5"]`.
3. Parse course-config.md's front matter (YAML), merge `defaultAiasLevel: level` and (if provided) `defaultAiasNote: note`, atomic write back.
4. Compute `effectiveNote = note ?? CANONICAL_AIAS_NOTES[level]`.
5. Return `{ ok: true, courseDir, level, effectiveNote, configPath }`.

---

## CDS — `aias_callout.ts` template

### Input

```ts
export interface RenderAiasCalloutInput {
  aias: PageAias;
}
```

### Output

HTML string (Canvas-safe inline CSS only).

### Card template

```html
<div style="background:#FAEEDA; border-left:4px solid #854F0B; padding:1em 1.25em; margin-bottom:1.25em; border-radius:0 4px 4px 0;">
  <p style="margin:0; color:#854F0B;">
    <strong>AI Use Policy — Level {LEVEL} ({NAME_ESC})</strong>
  </p>
  <p style="margin:0.5em 0 0 0;">{NOTE_ESC}</p>
</div>
```

`{LEVEL}` is the integer; `{NAME_ESC}` is the canonical name (e.g., "AI Collaboration"); `{NOTE_ESC}` is the resolved note text. Both name and note are HTML-escaped.

Uses the University warning-tan palette (`#FAEEDA` / `#854F0B`) — visually distinct from the TL;DR card's primary-blue palette, so when both render they don't visually compete.

---

## CDS — `generate-page.ts` modification

Single addition: after the existing TL;DR-card prepend logic (from #66) AND before `substituteWidgetPlaceholders`:

```ts
const isAiasEligible = pageType === 'assignment' || pageType === 'rubric';
const aias = isAiasEligible ? resolveAias(absPath, config) : undefined;
const aiasHtml = aias ? renderAiasCallout({ aias }) : '';
const withCallouts = aiasHtml + withTldr;  // AIAS sits ABOVE TL;DR
const html = substituteWidgetPlaceholders(withCallouts, pageType);
```

`resolveAias(absPath, config)` returns `PageAias | undefined` by combining per-page front matter + course-config defaults per the resolution rules above.

**Order:** AIAS callout appears ABOVE the TL;DR card. Reasoning: AIAS is structural policy ("how do I engage?") while TL;DR is content summary ("what do I do?"). Policy reads first.

---

## Error Handling

| Code | Where raised | Fix |
|---|---|---|
| `COURSE_CONFIG_NOT_FOUND` | `set_course_aias_default` | "Check that courseDir is a CDS course folder containing course-config.md" |
| `INVALID_LEVEL` | `set_course_aias_default` | "level must be 1-5" |
| `COURSE_CONFIG_PARSE_FAILED` | `aias_config.ts` reader | "Verify course-config.md front matter is valid YAML" |

Render-side gracefully degrades:
- Invalid `aiasLevel` in page front matter (not 1-5) → ignored; falls back to course default.
- Invalid `defaultAiasLevel` in course config → ignored; no callout renders.
- No errors thrown at render time. The callout is best-effort.

---

## Testing (~14 new tests)

### New unit test files

| File | Tests |
|---|---|
| `packages/shared-types/tests/index.test.ts` | (+1) `PageAias` and `AiasLevel` types compile and round-trip. |
| `packages/canvas-design-studio/tests/course/aias_config.test.ts` | (3) Read defaults from course-config.md; missing fields → undefined; atomic write merges into existing front matter. |
| `packages/canvas-design-studio/tests/course/aias_resolver.test.ts` | (4) Page override wins; course default applies when page absent; canonical note when no `note` supplied; returns undefined when neither set. |
| `packages/canvas-design-studio/tests/templates/aias_callout.test.ts` | (3) Renders with all three fields (level, name, note); HTML-escapes name + note; uses warning-tan palette. |
| `packages/canvas-design-studio/tests/generate-page.test.ts` (modify) | (+3) Assignment page with level → callout rendered above TL;DR card; rubric page with level → callout rendered; non-eligible page type (e.g., front-page) → no callout even when level set. |

### MCP tool

| File | Tests |
|---|---|
| `packages/command-and-control/tests/tools/set_course_aias_default.test.ts` | (4) Happy path writes course config and returns ok; `COURSE_CONFIG_NOT_FOUND` when file absent; `INVALID_LEVEL` for out-of-range input; merges into existing front matter without losing other fields. |

### What's intentionally not tested

- Real LLM behavior (no LLM involved).
- Visual rendering quality of the callout (snapshot tests are brittle for CSS).

---

## Out of Scope

| Item | Why |
|---|---|
| **Per-rubric-criterion AIAS tags** | Beyond what Furze proposes; v2 if demand surfaces |
| **Color coding by level (red/yellow/green/etc.)** | Adds visual complexity; defer until students request it |
| **AIAS banner on non-assignment/non-rubric pages** | Q2 ADR 4 — would be noise |
| **Auto-translation of AIAS levels for non-English courses** | YAGNI |
| **AIAS history / audit trail per assignment** | YAGNI; git already tracks changes |
| **MCP tool to bulk-override AIAS on many pages** | Front-matter edits cover the realistic use case |

---

## Acceptance Criteria

1. **`set_course_aias_default` MCP tool works end-to-end.** Sets `defaultAiasLevel` (and optional `defaultAiasNote`) atomically in the target course's `course-config.md`.

2. **Page override resolves correctly.** A page with `aiasLevel:` in its front matter wins over the course default. A page without it inherits the course default. When neither is set, no callout renders.

3. **Render is restricted to eligible page types.** Assignment pages and rubric pages render the callout when an effective level resolves. Other page types (front-page, overview, resources, slides) render unchanged regardless of effective level.

4. **Render position.** When both AIAS callout and TL;DR card (from #66) apply, the AIAS callout appears ABOVE the TL;DR card.

5. **Canonical text applies when no custom note is provided.** With `aiasLevel: 3` and no `aiasNote` on the page and no `defaultAiasNote` in course config, the callout shows the canonical "AI Collaboration — draft with AI..." text.

6. **Attribution shipped.** A code comment in `aias_canonical.ts` credits Leon Furze + CC BY-NC-SA 4.0. `packages/canvas-design-studio/CLAUDE.md` documents the attribution.

7. **All ~14 new tests pass; no existing tests regress.**

8. **Documentation.** `packages/canvas-design-studio/CLAUDE.md` documents the AIAS data fields, render conditions, and attribution. `packages/command-and-control/CLAUDE.md` lists the new MCP tool.
