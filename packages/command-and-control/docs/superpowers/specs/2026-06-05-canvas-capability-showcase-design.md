# Canvas Capability Showcase — Design Spec

**Date:** 2026-06-05
**Issue:** [#65](https://github.com/Ryfter/canvas-toolchain/issues/65)
**Scope:** Build a Canvas-capability showcase that lets professors see what patterns are possible inside Canvas's no-script constraint. Two MCP tools: `show_canvas_capabilities` returns a catalog of patterns; `preview_canvas_pattern` writes a standalone HTML preview file for any specific pattern. Catalog is data-driven (YAML), grows by content PR.

---

## Goal

Professors currently don't know what design patterns are possible inside Canvas because they've never seen the full surface. Today's CDS pipeline generates pages, but there's no inventory of "what kinds of pages?" or "what kinds of widgets?". This spec adds that inventory, with per-pattern visual previews.

---

## Motivation

- The professor's own words: *"I don't know what all is possible within the capacity of what Canvas gives us. So I need a way to show off features and capabilities."*
- Canvas's constraints (no JS, no `<style>` blocks at the page level, inline CSS only) make "what's achievable" genuinely non-obvious.
- Professors can't ask `brainstorm_interactive` for patterns they don't know exist.
- The owner-triage note on #65 says it's adjacent to #45 (brainstorm_interactive). Since #45 already shipped (v1.2.0), the missing piece is the *discovery surface* — what to ask for. This spec is that piece.

---

## Architectural Decisions (ADRs)

Four foundational decisions were made during brainstorming.

### ADR 1 — Showcase only; no separate template creator in v1

**Decision:** Build the showcase only. Defer any form-driven "template creator" to a follow-up issue.

**Rationale:** `brainstorm_interactive` (#45, shipped) already handles guided page creation conversationally. Adding a parallel form-driven creator risks two competing paths with overlapping scope. Once professors *see* the option space, they can use `brainstorm_interactive` to *build* what they pick.

### ADR 2 — Hybrid surface: MCP catalog + on-demand per-pattern HTML preview

**Decision:** Two MCP tools — `show_canvas_capabilities` returns a categorized catalog as markdown; `preview_canvas_pattern` writes a standalone HTML file for any specific pattern that opens in any browser.

**Rejected alternatives:**
- *Static HTML gallery alone.* Disconnected from Claude workflow; professors discover via chat today.
- *MCP catalog alone.* Misses the "what does it look like?" experience — Claude can't reliably render arbitrary HTML inline.

### ADR 3 — Data-driven catalog (YAML), not hardcoded TypeScript

**Decision:** Patterns live in `packages/canvas-design-studio/data/canvas-capabilities.yaml`. Catalog is editable by content PR; no code change needed to add a pattern. Mirrors the `recommended-models.md` pattern from #89.

**Rejected:** Hardcoded array of patterns. Doesn't scale; every new pattern requires a release.

### ADR 4 — Two-section catalog: "Currently supported" + "Aspirational"

**Decision:** Each pattern carries a `supportStatus` field (`supported` / `partial` / `aspirational`). The showcase splits the catalog into two sections so professors know what CDS produces *today* vs what's possible but not yet wired.

**Rationale:**
- Showing only what CDS produces underestimates Canvas.
- Showing only "Canvas-safe possibilities" creates frustration when a professor asks for one and CDS can't generate it.
- Explicit separation respects both: discoverability + truth-in-advertising. Aspirational entries also serve as a roadmap signal — popular requests become next sprints.

---

## Architecture

```
Data (single source of truth)
  packages/canvas-design-studio/data/canvas-capabilities.yaml   [NEW]

CDS — domain logic
  packages/canvas-design-studio/src/tools/showcase/
    catalog.ts            [NEW]   loads + validates YAML, typed access
    render_preview.ts     [NEW]   pattern id → standalone preview HTML
                                  written to global cache dir

C&C — MCP tool layer
  packages/command-and-control/src/tools/showcase/
    show_canvas_capabilities.ts   [NEW MCP tool]
    preview_canvas_pattern.ts     [NEW MCP tool]
  src/index.ts                    [MODIFY — register both tools]

Cache (write target for preview)
  ~/.command-and-control/showcase-previews/<patternId>.html
```

**Key invariants:**
- YAML is authoritative. No patterns hardcoded in TypeScript.
- `supportStatus` field drives the section split — pure data, no code branching on category names.
- Preview is a complete standalone HTML page (uses `<style>` wrapper for the local-browser context). The pattern's own `exampleHtml` inside the wrapper stays Canvas-safe.
- CDS owns catalog parsing + rendering; C&C owns MCP tool registration + result formatting.

---

## YAML Schema

### File location

`packages/canvas-design-studio/data/canvas-capabilities.yaml`

Loaded relative to the CDS package — same convention as other CDS data assets.

### Top-level shape

```yaml
version: 1
updated: "YYYY-MM-DD"

categories:
  - id: <kebab-case>
    name: <display name>
    description: <one-line>

patterns:
  - id: <kebab-case>          # unique, stable, also the preview filename
    name: <display name>
    category: <category-id>   # must match a categories[].id
    supportStatus: supported | partial | aspirational
    description: <one-paragraph>
    whenToUse: <one-line trigger>
    notes: <optional Canvas-constraint commentary>
    exampleHtml: |
      <self-contained Canvas-safe HTML snippet>
```

### Field rules

| Field | Required | Rule |
|---|---|---|
| `version` | yes | Currently `1`. Bumps when schema changes. |
| `updated` | yes | ISO date. |
| `categories` | yes | At least 1 entry. |
| `categories[].id` | yes | kebab-case, unique. |
| `categories[].name` | yes | Display name. |
| `categories[].description` | yes | One-line. |
| `patterns` | yes | Can be empty (no patterns yet) but the key must exist. |
| `patterns[].id` | yes | kebab-case, unique, stable. Filenames depend on this. |
| `patterns[].name` | yes | Display name. |
| `patterns[].category` | yes | Must match a `categories[].id`. Unknown category → `CATALOG_INVALID`. |
| `patterns[].supportStatus` | yes | One of `supported`, `partial`, `aspirational`. Any other value → `CATALOG_INVALID`. |
| `patterns[].description` | yes | One paragraph. |
| `patterns[].whenToUse` | yes | One line. |
| `patterns[].notes` | optional | Free text. |
| `patterns[].exampleHtml` | yes | Non-empty HTML snippet. |

### Initial v1 patterns (8)

**Categories shipped:** layout, information, interactive, pedagogical, branded.

**Supported (5)** — patterns CDS produces today:

1. `comparison-card` — Information
2. `accordion-details` — Interactive (`<details>`/`<summary>`)
3. `callout-box` — Information (highlighted advice / warning blocks)
4. `learning-objectives-list` — Pedagogical
5. `vocab-table` — Information (term + definition)

**Aspirational (3)** — Canvas-safe but not yet generated by CDS:

6. `tabbed-layout-target` — Interactive (`:target`-based tabs)
7. `jump-link-nav` — Layout (in-page anchor nav bar)
8. `rubric-help-callout` — Pedagogical (per-criterion student-language rubric explainer)

These seed the catalog. New patterns added by content PR — no spec change required.

---

## CDS Modules

### `src/tools/showcase/catalog.ts`

```ts
export type SupportStatus = 'supported' | 'partial' | 'aspirational';

export interface CatalogCategory {
  id: string;
  name: string;
  description: string;
}

export interface CatalogPattern {
  id: string;
  name: string;
  category: string;
  supportStatus: SupportStatus;
  description: string;
  whenToUse: string;
  notes?: string;
  exampleHtml: string;
}

export interface CapabilityCatalog {
  version: number;
  updated: string;
  categories: CatalogCategory[];
  patterns: CatalogPattern[];
}

/** Loads canvas-capabilities.yaml, validates it, returns typed catalog.
 *  Throws { error: 'CATALOG_NOT_FOUND' | 'CATALOG_INVALID', message, fix } */
export function loadCatalog(): CapabilityCatalog;

/** O(n) lookup. Returns null if not found. */
export function getPatternById(catalog: CapabilityCatalog, id: string): CatalogPattern | null;
```

### `src/tools/showcase/render_preview.ts`

```ts
export interface RenderPreviewResult {
  previewPath: string;   // absolute path to the written HTML file
  patternId: string;
}

/** Wraps pattern.exampleHtml in a local-browser preview page.
 *  Writes to ~/.command-and-control/showcase-previews/<id>.html atomically.
 *  Caller passes the catalog so we don't re-parse; this is pure data → file. */
export function renderPreview(
  catalog: CapabilityCatalog,
  patternId: string,
): RenderPreviewResult;
```

The wrapper page HTML:

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>{name} — Canvas Capability Preview</title>
  <style>
    body { max-width: 900px; margin: 2em auto; font-family: system-ui, sans-serif;
           padding: 0 1em; color: #222; }
    .preview-meta { background: #f5f5f5; padding: 1em 1.25em;
                    border-left: 4px solid #003a70; margin-bottom: 2em;
                    border-radius: 2px; }
    .preview-meta h1 { margin-top: 0; }
    .status { display: inline-block; padding: 2px 8px; border-radius: 3px;
              font-size: 0.85em; }
    .status-supported { background: #d4edda; color: #155724; }
    .status-partial { background: #ffeeba; color: #856404; }
    .status-aspirational { background: #fff3cd; color: #856404; }
    .preview-content { border: 1px dashed #ccc; padding: 1em; margin-top: 1em; }
  </style>
</head>
<body>
  <div class="preview-meta">
    <h1>{name}</h1>
    <p><strong>Category:</strong> {category}
       · <strong>Status:</strong> <span class="status status-{supportStatus}">{supportStatus}</span></p>
    <p>{description}</p>
    <p><em>When to use:</em> {whenToUse}</p>
    <!-- notes block emitted only when present -->
  </div>
  <h2>Rendered example</h2>
  <div class="preview-content">
    {exampleHtml}
  </div>
</body>
</html>
```

Write atomically via tmp + rename. Mode default (0o644 — no secrets). Directory created with `mkdirSync(..., { recursive: true })` if absent.

---

## MCP Tools (C&C)

### `show_canvas_capabilities`

**Input:**

```ts
interface ShowCanvasCapabilitiesInput {
  category?: string;
  supportStatus?: 'supported' | 'partial' | 'aspirational';
}
```

**Output:**

```ts
interface ShowCanvasCapabilitiesResult {
  catalogVersion: number;
  updated: string;
  catalog: string;        // formatted markdown
  patternIds: string[];   // flat list of IDs included in the response
}
```

**Behavior:**

1. Call `loadCatalog()` from CDS.
2. Apply filters (`category`, `supportStatus`). When both omitted, return everything.
3. Format markdown grouped by **section** (✅ Currently Supported, 🛠 Aspirational) then by **category** within each section. `partial` rolls up under the Supported section with a `(partial)` annotation per entry.
4. Each entry includes the pattern's name, ID (in monospace), description, `When to use:` line, and a hint that `preview_canvas_pattern` renders it.

### `preview_canvas_pattern`

**Input:**

```ts
interface PreviewCanvasPatternInput {
  patternId: string;
}
```

**Output:**

```ts
type PreviewCanvasPatternResult =
  | {
      ok: true;
      patternId: string;
      previewPath: string;
      openInstruction: string;
      catalogEntry: {
        name: string;
        category: string;
        supportStatus: SupportStatus;
      };
    }
  | {
      ok: false;
      error: 'PATTERN_NOT_FOUND' | 'CATALOG_NOT_FOUND' | 'CATALOG_INVALID' | 'PREVIEW_WRITE_FAILED';
      message: string;
      fix: string[];
    };
```

**Behavior:**

1. `loadCatalog()` — if fails, surface `CATALOG_NOT_FOUND` or `CATALOG_INVALID`.
2. `getPatternById(catalog, patternId)` — if null, return `PATTERN_NOT_FOUND` with fix `['Run show_canvas_capabilities to see valid pattern IDs']`.
3. `renderPreview(catalog, patternId)` — write the file.
4. Build `openInstruction`: `"Open file://<absolute-path> in your browser to view the rendered pattern."`
5. Return ok result.

---

## Error Handling

| Code | Source | Fix |
|---|---|---|
| `CATALOG_NOT_FOUND` | catalog.ts — YAML file absent | `['Reinstall canvas-toolchain or pull the latest']` |
| `CATALOG_INVALID` | catalog.ts — YAML parse fail or schema violation | `['Open canvas-capabilities.yaml and check syntax. Report at the issue tracker.']` |
| `PATTERN_NOT_FOUND` | preview tool — id not in catalog | `['Run show_canvas_capabilities to see valid pattern IDs']` |
| `PREVIEW_WRITE_FAILED` | render_preview.ts — disk write error | `['Check ~/.command-and-control/showcase-previews/ is writable']` |

All errors returned as `{ ok: false, error, message, fix }` — consistent with the project's existing pattern.

---

## Testing

### New unit test files

| File | Coverage |
|---|---|
| `packages/canvas-design-studio/tests/showcase/catalog.test.ts` | Loads valid YAML; rejects missing required fields; rejects unknown category reference; rejects invalid `supportStatus` value; `getPatternById` returns entry / null. |
| `packages/canvas-design-studio/tests/showcase/render_preview.test.ts` | Writes HTML to expected location; HTML contains pattern name, category, supportStatus class, description, exampleHtml; atomic write (no partial file on disk error simulation); re-render overwrites cleanly. |
| `packages/command-and-control/tests/tools/showcase/show_canvas_capabilities.test.ts` | Returns full catalog as markdown with two sections; `category` filter narrows result; `supportStatus` filter narrows result; `patternIds` array matches what's emitted in markdown; result includes catalogVersion + updated. |
| `packages/command-and-control/tests/tools/showcase/preview_canvas_pattern.test.ts` | Happy path returns ok + previewPath; unknown id returns `PATTERN_NOT_FOUND`; result includes catalogEntry summary; openInstruction contains `file://`. |

**Estimate: ~18 new tests** (5 catalog + 4 render + 5 show + 4 preview).

### What's intentionally not tested

- Real YAML parser behavior (we use a vetted library — testing it would be testing the lib).
- End-to-end MCP server invocation (covered by existing C&C integration tests' tool-registration scan).
- Browser rendering of the preview file (visual — not unit-testable; smoke-by-eye).

---

## Out of Scope

| Item | Why |
|---|---|
| **Template creator** | ADR 1 — `brainstorm_interactive` (#45) already handles guided creation |
| **Auto-publishing previews to Canvas** | This is a discovery tool, not a content tool — `generate_page` already exists |
| **Per-course preview locations** | Global cache is simpler; no course coupling needed for discovery |
| **Catalog full-text search** | YAGNI for 8-30 patterns. Revisit if catalog grows past ~50. |
| **Pattern dependencies / "requires"** | YAGNI — each pattern stands alone in v1 |
| **Catalog version history / changelog** | Git is the version history |
| **Theme application to previews** | Previews render with neutral wrapper styling; theme-applied previews can come later |
| **Auto-suggest patterns from course content** | Belongs in `brainstorm_interactive` recommendations, not the showcase tool |
| **Web UI to browse the catalog** | Out per spec #8's analogous decision; MCP-tool driven is enough for v1 |

---

## Acceptance Criteria

1. **Catalog file exists.** `packages/canvas-design-studio/data/canvas-capabilities.yaml` ships with at least 8 patterns spanning 4 categories, 5 supported + 3 aspirational.

2. **`show_canvas_capabilities` returns the catalog.** No-arg call returns all patterns grouped into ✅ Supported and 🛠 Aspirational sections, then by category.

3. **`show_canvas_capabilities` filters correctly.** `{ category: 'information' }` returns only Information patterns. `{ supportStatus: 'aspirational' }` returns only the Aspirational section.

4. **`preview_canvas_pattern` writes a viewable HTML file.** For a valid pattern ID, the tool returns `{ ok: true, previewPath }` and the file at that path opens in a browser to render the pattern correctly.

5. **`preview_canvas_pattern` fails cleanly on unknown ID.** Returns `PATTERN_NOT_FOUND` with the fix line pointing to `show_canvas_capabilities`. No file written.

6. **All new tests pass.** ~18 new tests across catalog, render, show, preview test files.

7. **Existing tests still pass.** No regressions in any package's existing suite.

8. **Documentation.**
   - `packages/canvas-design-studio/CLAUDE.md` (or `command-and-control/CLAUDE.md`) gains a "Canvas Capability Showcase" section listing the two new tools and their invocation pattern.
   - YAML file itself is the documentation for adding patterns — no separate authoring guide needed for v1.
