# Widget Renderer Design

**Tracking issue:** [#88](https://github.com/Ryfter/canvas-toolchain/issues/88)
**Status:** Design approved 2026-06-02
**Author:** Claude + the professor (brainstormed 2026-06-02)
**Depends on:** [#45 brainstorm_interactive](https://github.com/Ryfter/canvas-toolchain/issues/45) (shipped v1.2.0)

## Goal

Take an `InteractiveSpec` produced by `brainstorm_interactive` and turn it into a working, Canvas-embeddable interactive widget that students can actually use on a Canvas page — without external hosting, without ongoing maintenance burden on the professor, and without relying on the Canvas RCE's hostile HTML/CSS sanitizer.

## Background

`brainstorm_interactive` (shipped v1.2.0 as part of PR #86) produces `WidgetConcept`s containing structured `InteractiveSpec`s describing what an interactive widget should do — type, content, dimensions, accessibility hints. Those specs currently have nowhere to go: there is no runtime that turns them into real interactive HTML a student can click. Every brainstorm output dies as JSON.

This design adds that runtime, plus the publishing path that lands rendered widgets on Canvas pages.

## Locked constraints (foundational decisions)

These were settled during brainstorming and are not revisited by the implementation plan:

1. **Hosting model: Canvas Files iframe (Option B).** The widget is a self-contained HTML file uploaded to the host course's Canvas Files area, then iframe-embedded from a page in the same course. Same-origin (no CORS, no FERPA exposure, no external infra). Excluded alternatives: inline-CSS-only HTML in the Canvas RCE (Canvas strips `<style>` blocks and every interactive CSS property), and external hosting (defers maintenance burden onto the professor; doesn't generalize across institutions).
2. **Catalog with experimental escape hatch.** Six strongly-typed renderers handle the common case; a `--allow-experimental` flag at render time enables an LLM-generated path for novel kinds. No student-visible "experimental" banner.
3. **Brainstorm steering: soft.** The `brainstorm_interactive` system prompt prefers catalog kinds but may propose experimental kinds when warranted, marked with `EXPERIMENTAL:` in the concept's rationale.
4. **State: ephemeral.** Widget state lives in the iframe lifecycle only. No per-student persistence, no LTI 1.3 backend, no Canvas state API in v1.
5. **Tech stack inside widgets: vanilla HTML/CSS/JS.** Single self-contained `.html` file per widget. No framework, no build step. Canvas Files serves the file raw — the Canvas RCE sanitizer does not apply to iframe-loaded content.
6. **Validation: Zod.** The renderer's content schemas are written in Zod once and reused as JSON Schema (via `zod-to-json-schema`) in the brainstorm tool's system prompt.
7. **Accessibility for drag operations: dual mode.** WAI-ARIA grab/drop pattern as primary, with explicit "Move up / Move down / Move to bin" buttons revealed on focus as a fallback that requires no screen-reader-literacy.

## Architecture overview

```
┌──────────────────────┐    ┌──────────────────────┐    ┌──────────────────────────┐
│ brainstorm_interactive│ ─▶ │  InteractiveSpec     │ ─▶ │ render_widget MCP tool   │
│ (shipped in v1.2.0)  │    │  (.spec.json on disk)│    │ (canvas-design-studio)   │
└──────────────────────┘    └──────────────────────┘    └──────────┬───────────────┘
                                                                   │
                                              dispatch on spec.kind▼
                            ┌──────────────────────────────────────────────────┐
                            │  Renderer catalog (6 typed renderers)            │
                            │  card-flip-reveal / sortable-ordering /          │
                            │  drag-to-categorize / branching-scenario /       │
                            │  multi-step-reveal / hotspot-image               │
                            │  + experimental.ts (LLM, opt-in only)            │
                            └──────────┬───────────────────────────────────────┘
                                       │
                                       ▼
                            ┌──────────────────────────────────────┐
                            │  Self-contained .html written to     │
                            │  course/<page>/widgets/<id>.html     │
                            │  (vanilla HTML+CSS+JS, single file)  │
                            └──────────┬───────────────────────────┘
                                       │
                          faculty opens in browser, reviews
                                       │
                                       ▼
                            ┌──────────────────────────────────────┐
                            │  publish_widget MCP tool             │
                            │  → POSTs to Canvas Files (3-step)    │
                            │  → returns { canvasFileId,           │
                            │              embedSrc }              │
                            │  publish_course extension auto-runs  │
                            │  this for every {{ widget:id }} in   │
                            │  each published page.                │
                            └──────────────────────────────────────┘
```

## V1 catalog (six kinds)

| `kind` | What it does | Example uses |
|---|---|---|
| `card-flip-reveal` | Grid of cards; click flips to back. Front = prompt/term, back = answer/explanation. | Vocab + term-definition recall, formula recall, prompt → reveal in any discipline. |
| `sortable-ordering` | Drag list items into correct sequence; on submit, items in correct slots highlight. | Process steps, historical sequences, scientific method, formula composition, ranking. |
| `drag-to-categorize` | Drag items into target bins; bins show count + correctness on submit. | Categorization / taxonomy (biology, parts of speech, data types, license families). |
| `branching-scenario` | Multi-step choose-your-own-adventure with state machine; each choice surfaces consequence + next prompt. | Case studies (clinical, ethical, legal, business decisions, architecture trade-offs). |
| `multi-step-reveal` | Click-through guided walkthrough; each step shows one piece (formula step, proof step, procedure step). | Walked example in any field — math derivation, lab procedure, code walk-through, recipe. |
| `hotspot-image` | Click regions of an annotated image; each region reveals a tooltip-style info block. | Annotated visuals — anatomy, art history, geography, engineering diagrams, UI tours. |

Each catalog kind is universal across disciplines — the renderer code carries no domain assumptions; all subject-specific content arrives via `InteractiveSpec.initialContent`.

**Deferred to v1.x (not in v1):** `side-by-side-slider` (high pointer-math effort, narrow use case) and `compare-table` (static HTML tables already work in Canvas RCE; marginal interactivity gain).

**Novel kinds** outside the catalog are accessible via the experimental escape hatch (see *Experimental escape hatch* below), not by padding the v1 catalog.

## Renderer implementation shape

### File layout

All code lives in the existing `canvas-design-studio` package — no new package.

```
packages/canvas-design-studio/src/
  tools/
    widget/
      types.ts                    WidgetKind enum, Renderer<TContent> interface, RenderInput/Result
      catalog/
        card-flip-reveal.ts       Renderer<CardFlipContent>
        sortable-ordering.ts      Renderer<SortableContent>
        drag-to-categorize.ts     Renderer<CategorizeContent>
        branching-scenario.ts     Renderer<BranchingContent>
        multi-step-reveal.ts      Renderer<MultiStepContent>
        hotspot-image.ts          Renderer<HotspotContent>
        experimental.ts           LLM-generated, opt-in only
        index.ts                  CATALOG: Record<WidgetKind, Renderer>
      wrapper.ts                  buildWidgetHtml(body, css, js, spec) → full standalone HTML doc
      a11y.ts                     sr-only region, announce() helper, prefers-reduced-motion CSS
      sizing.ts                   spec.dimensions → body CSS + iframe height attr
      schemas.ts                  zod-to-json-schema export for brainstorm prompt consumption
    render-widget.ts              MCP tool entry point
    publish-widget.ts             Canvas Files upload + iframe insertion
  tests/
    widget/
      catalog/                    per-renderer: schema tests, snapshot, contract assertions
      wrapper.test.ts             wrapper output structural invariants
      a11y.test.ts                announce() helper, sr-only contract
      sizing.test.ts              dimension → CSS conversion
```

### Renderer interface

```ts
type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export interface Renderer<TContent = unknown> {
  readonly kind: WidgetKind;
  /** Zod schema for this kind's contentSchema. Exported as JSON Schema for the brainstorm prompt. */
  readonly contentSchema: z.ZodSchema<TContent>;
  /** Validate spec.initialContent against the schema; return parsed TContent on success. */
  validateContent(content: Record<string, unknown>): Result<TContent>;
  /** Produce the renderer-specific body markup, CSS, and JS for the given content. */
  render(content: TContent, spec: InteractiveSpec): {
    body: string;  // goes inside <body>, after the sr-only region
    css: string;   // goes inside <style> in <head>, after wrapper CSS
    js: string;    // goes inside <script> at end of <body>, after wrapper bootstrap
  };
}
```

### `render-widget.ts` dispatch

```ts
const renderer = CATALOG[spec.kind] ?? null;
if (!renderer) {
  if (!input.allowExperimental) {
    throw new RenderError('KIND_NOT_IN_CATALOG', {
      kind: spec.kind,
      allowedKinds: WIDGET_KINDS,
    });
  }
  return await experimentalRender(spec);
}
const validated = renderer.validateContent(spec.initialContent);
if (!validated.ok) {
  throw new RenderError('CONTENT_SCHEMA_INVALID', { kind: spec.kind, zodError: validated.error });
}
const { body, css, js } = renderer.render(validated.value, spec);
const html = buildWidgetHtml({ body, css, js, spec });
await fs.writeFile(outputPath, html, 'utf8');
return { outputPath, kind: spec.kind, experimental: false };
```

### `wrapper.ts` output shape

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{{ spec.name }}</title>
  <style>
    /* Wrapper CSS: Lato typography, box-sizing reset, .sr-only class,
       prefers-reduced-motion override, body min/max-height from spec,
       .touch-target utility class (44px). */
    {{ wrapper-css }}
    /* Renderer-specific CSS */
    {{ renderer.css }}
  </style>
</head>
<body>
  <div class="sr-only" aria-live="polite" id="widget-status">
    {{ spec.accessibility.screenReaderSummary }}
  </div>
  {{ renderer.body }}
  <script>
    /* Wrapper bootstrap: window.__announce(text) writes to #widget-status */
    {{ wrapper-js }}
    /* Renderer-specific JS */
    {{ renderer.js }}
  </script>
</body>
</html>
```

## Authoring + publishing flow

### Spec file location

Widget spec files live in a per-page `widgets/` folder alongside the page that hosts them:

```
course/
  wk3-data-types.md
  wk3-data-types/widgets/
    data-types-categorize.spec.json
    data-types-categorize.html       ← generated by render_widget
  wk5-formulas.md
  wk5-formulas/widgets/
    sum-vs-sumif-flip.spec.json
    sum-vs-sumif-flip.html
```

Per-page beats course-wide because: when a page is moved/renamed/deleted, its widgets travel with it; ID collisions across topics can't happen; cleaning up an old week deletes everything related in one folder.

### Widget placeholder syntax in markdown body

```markdown
---
title: Week 3 — Data Types
---

## Practice

Drag each data type to the correct category:

{{ widget:data-types-categorize }}

## Reading
```

`generate_course` recognizes `{{ widget:<id> }}` and replaces it with an iframe pointing at the local `widgets/<id>.html` file (relative path) so faculty can review the page locally in a browser. When the page is published, the iframe `src` swaps to the Canvas Files URL.

### MCP tools

| Tool | Input | Output |
|---|---|---|
| `render_widget` | `{ specPath: string, allowExperimental?: boolean }` | `{ outputPath: string, kind: WidgetKind, experimental: boolean }` — writes `<id>.html` (or `<id>.experimental.html`) next to the spec |
| `publish_widget` | `{ htmlPath: string, courseId: number, hostPageSlug?: string }` | `{ canvasFileId: number, embedSrc: string, embedHtml: string }` — POSTs HTML to Canvas Files via the standard 3-step upload flow: (1) `POST /api/v1/courses/{id}/files` to request an upload URL + file metadata; (2) `POST` the file bytes to the returned S3 URL; (3) `GET` the confirm URL to finalize and receive the `file_id`. Uses `on_duplicate=overwrite` so re-uploads preserve the same `file_id`. |
| `publish_course` (extended) | (no new input) | Existing output + `widgets: [{ id, status, canvasFileId?, error? }]` per page |

### Iframe embed shape

```html
<iframe
  src="/courses/{courseId}/files/{fileId}/preview"
  width="100%"
  height="{spec.dimensions.maxHeight}"
  style="min-height: {spec.dimensions.minHeight}px; border: 0;"
  title="{spec.name}"
  sandbox="allow-scripts allow-same-origin allow-forms"
  loading="lazy">
  {spec.accessibility.screenReaderSummary}
</iframe>
```

`sandbox` is restrictive: no `allow-top-navigation`, no `allow-popups`. Fallback text inside the iframe = the screen-reader summary, so users with iframes disabled get a meaningful description.

### Update story

**REVISED 2026-06-03 after Phase 0 verification against University sandbox (course 48895).** Canvas Files' `on_duplicate=overwrite` is "delete old + create new file under the same display name" — the `file_id` changes on every overwrite (verified empirically: first upload → 24133390, re-upload → 24133391; the old file is gone). The original design assumed in-place updates with stable `file_id`; that assumption is wrong on Canvas's actual file system.

**Corrected flow:** Faculty edits a spec → re-runs `render_widget` → re-runs `publish_widget`, which uploads the new HTML and returns the NEW `file_id`. The host page's iframe `src` must be rewritten to point at the new `file_id`. This means `publish_course` extension treats every widget update as a page change (the iframe URL diff is part of the page diff).

This is a small but real architectural change vs. the original design. Mitigation cost: `publish_course` already rewrites pages on every publish; widget updates simply add the iframe-URL substitution to the existing page-rewrite step. The reviewed-transaction pattern still holds — each widget upload is its own approval, snapshot bundle captures both old widget HTML and old page HTML for rollback.

Old files are auto-deleted by Canvas when `on_duplicate=overwrite` succeeds, so there's no orphan cleanup burden. If `publish_widget` fails between "upload new" and "rewrite host page", the page still points at the old `file_id` which no longer exists — that's the same failure mode as a normal page-publish failure and is handled by the existing rollback path.

### `publish_course` extension behavior

- Discovers every `{{ widget:<id> }}` reference in pages being published.
- Auto-runs `publish_widget` for any widget HTML that is new or has changed since the last publish (snapshot-bundle comparison).
- Substitutes the Canvas Files URL into page HTML before pushing.
- One widget's upload failure does **not** abort the rest — per-entry result, matching the existing page-by-page reviewed-transaction pattern.
- Snapshot bundle captures all widget HTML files alongside page HTML, so `rollback_course_publish` restores both.

## Experimental escape hatch

### Render-time gate

Single decision point. `render_widget` input has `allowExperimental?: boolean` (default false). If `spec.kind` is not in the catalog:

- `!allowExperimental` → `RenderError('KIND_NOT_IN_CATALOG', { kind, allowedKinds })` with a message instructing the user to pass the flag if intentional.
- `allowExperimental` → dispatch to `experimental.ts`.

No second gate at publish time. No student-visible banner on the widget itself.

### Experimental renderer mechanics

- Uses an Anthropic LLM client. The toolchain currently has two copies of this client (`tools/rubric/llm_client.ts` and `tools/brainstorm/llm_client.ts` in `command-and-control`); this is the third use case, which justifies extraction. **Concrete plan:** create a new package `packages/shared-llm/` that exports the `AnthropicLlmClient` + `LlmClient` interface. Both existing C&C consumers migrate to it; the new CDS experimental renderer imports it directly. The new package is a peer of `shared-types` in the monorepo; `command-and-control` and `canvas-design-studio` both add it as a `workspace:*` dependency. This avoids the circular import problem (CDS does NOT depend on C&C and must not).
- System prompt constrains output to self-contained HTML, inline `<style>` and `<script>` only, no external requests, honour `spec.accessibility.keyboardEquivalent` and `screenReaderSummary`, respect `prefers-reduced-motion`.
- User message: the full `InteractiveSpec` JSON.
- Post-LLM validation: parse the HTML and walk the tree for forbidden patterns (`<link>`/`<script>`/`<iframe>` with external `src`/`href`; `<a>` with `target="_top"`; event handlers on `<body>`). On forbidden pattern found → `RenderError('LLM_OUTPUT_UNSAFE', { pattern, location })` without writing the file.
- Filename: `<id>.experimental.html` — the `.experimental.` infix makes the status visible in the file tree and in `publish_course`'s widget discovery list.
- Comment marker at top of the generated file: `<!-- EXPERIMENTAL: generated by LLM at render time, not validated by tests -->`.

### Brainstorm tool steering (C&C-side change)

Update `packages/command-and-control/src/tools/brainstorm/prompts.ts` system prompt to:

1. List the six catalog kinds and when each fits.
2. Embed the JSON Schema for each kind's `initialContent` shape — exported via `zod-to-json-schema` from the canvas-design-studio package's renderer schemas.
3. Soft steer: "Prefer catalog kinds. If a concept truly needs a kind outside the catalog, mark its `rationale` with `EXPERIMENTAL:` prefix and explain why."

The soft steer keeps the escape hatch's ergonomic path open (faculty doesn't have to hand-author a spec.json) while making catalog kinds the strong default.

## Accessibility floor

### Universal floor (wrapper provides; every widget gets)

- Visually-hidden live region: `<div class="sr-only" aria-live="polite" id="widget-status">` seeded with `spec.accessibility.screenReaderSummary`. Updated by renderer JS via `window.__announce(text)` helper.
- `prefers-reduced-motion` CSS rule disables all animations/transitions inside the widget.
- Body min/max-height from `spec.dimensions`.
- Focus-visible outlines preserved (no `outline: none` without replacement).
- `.touch-target` utility class providing `min-width: 44px; min-height: 44px` per `spec.accessibility.minTouchTarget`.

### Per-kind keyboard + ARIA patterns

| `kind` | Keyboard | ARIA |
|---|---|---|
| `card-flip-reveal` | Tab to card → Enter/Space to flip → arrows to next/prev card in grid | each card `role="button"` + `aria-pressed`; announce "Card 3 of 6 flipped, showing: …" |
| `sortable-ordering` | Tab to item → activate move controls → arrows to reposition → confirm | list `role="list"`; items `<li>` with `aria-label="Item X, currently at position Y of Z"`; announce on every move. **Dual-mode:** WAI-ARIA grab/drop pattern AND explicit "Move up / Move down" buttons revealed on focus. |
| `drag-to-categorize` | Same as sortable but target = bin | items + bins as labeled regions; announce "Dropped 'integer' into 'Numeric' bin". **Dual-mode** same as sortable; bin choice via "Move to bin: [dropdown]" on focus. |
| `branching-scenario` | Tab through choice buttons → Enter | native `<button>` elements; live region announces the new prompt + selected choice |
| `multi-step-reveal` | Tab to next/prev → Enter; arrow keys as shortcut | `role="region"` with `aria-live="polite"`; announce "Step 3 of 7: …" |
| `hotspot-image` | Tab through hotspots in reading order → Enter to reveal | hotspots are `<button>` elements overlaid on image; image has descriptive alt + `aria-describedby` referencing hotspot count |

## Testing strategy

Three layers per renderer, all hand-rolled (no new dependencies):

1. **Schema tests:** zod schema accepts a known-good `initialContent`, rejects each malformed variant (missing field, wrong type, empty array). ~6 tests per renderer.
2. **Snapshot tests:** render against a small fixture spec, snapshot the full HTML output. Catches accidental drift. Snapshots committed to repo and updated via the standard Vitest snapshot flow. ~1-2 per renderer.
3. **Contract assertions:** parse the rendered HTML and assert structural a11y contracts:
   - Live region present and `sr-only`.
   - Every interactive element has either `aria-label` or `aria-labelledby`.
   - Every interactive element appears in tab order (no `tabindex="-1"` on what should be focusable).
   - No forbidden CSS properties (`transition`, `animation`, `transform` — wrapper a11y rules forbid them anywhere).
   - No external requests in the HTML (no `<link href="http">`, `<script src="http">`, `<iframe src="http">`).
   - Document has `lang` attribute, viewport meta, charset.

Total: ~10-15 tests per renderer × 6 renderers ≈ ~60-90 widget tests added to the CDS suite (currently 450 passing).

**Not adding `axe-core`** (~600kb dev dep) in v1. Contract assertions catch the structural failures that matter most. Add `axe-core` in v1.x as a regression net if needed.

## Error handling

### `render_widget` errors

| Code | Cause | Message guidance |
|---|---|---|
| `SPEC_NOT_FOUND` | spec path invalid | "No spec at {path}. Generate with `brainstorm_interactive` or hand-author." |
| `SPEC_PARSE_ERROR` | malformed JSON | "Spec file is not valid JSON at line N." |
| `KIND_NOT_IN_CATALOG` | unknown `kind`, no flag | "kind `X` not in catalog. Allowed: […]. Pass `allowExperimental: true` to render via LLM." |
| `CONTENT_SCHEMA_INVALID` | zod validation fails | Zod's path-to-field error verbatim (e.g., "cards[2].back: expected string, got undefined"). |
| `LLM_RENDER_FAILED` | API error in experimental path | "Anthropic API returned {status}. Check `setup_anthropic`." |
| `LLM_OUTPUT_UNSAFE` | LLM produced forbidden patterns | "Experimental render included external request to `{url}`. Re-run; if persistent, refile spec." |
| `FILE_WRITE_ERROR` | disk full / perms | filesystem error verbatim |

### `publish_widget` errors

| Code | Cause | Message guidance |
|---|---|---|
| `CANVAS_AUTH_ERROR` | bad/expired token | "Run `setup_canvas` to refresh credentials." |
| `CANVAS_COURSE_ERROR` | course id wrong / no access | "Course {id} not accessible. Verify with `list_canvas_courses`." |
| `CANVAS_UPLOAD_INIT_ERROR` | 3-step Canvas Files upload failed at stage 1 | per-stage retry guidance |
| `CANVAS_UPLOAD_DATA_ERROR` | stage 2 (PUT to S3) failed | per-stage retry guidance |
| `CANVAS_UPLOAD_CONFIRM_ERROR` | stage 3 (confirm) failed | triggers a check-and-cleanup of the orphaned file |
| `PAGE_NOT_FOUND` | host page slug wrong | "No page `{slug}` in course {id}." |
| `PAGE_REWRITE_ERROR` | host page HTML malformed | "Page HTML couldn't be parsed; manual edit required. Page left unchanged." |

### `publish_course` extension behavior

- One widget's upload failure does not abort the rest. Per-entry result in the PUBLISH_RESULT JSON's `widgets: [{ id, status, canvasFileId?, error? }]` block per page.
- The PREVIEW_MANIFEST shows widget diffs alongside page diffs (new widget / changed widget / deleted widget / unchanged).
- Snapshot bundle (same per-publish bundle pattern `publish_course` already writes to `~/.command-and-control/publish-snapshots/`) captures all widget HTML files alongside page HTML so `rollback_course_publish` restores both.

## Verification items (RESOLVED 2026-06-03, against University sandbox course 48895)

These were the three architectural assumptions verified before Plan A's renderer code landed. Results captured in commit `3ce94a2` and the scripts at `scripts/verify-88-*.mts`:

1. ✅ **Canvas Files `/preview` URL serves HTML with iframe-friendly headers.** No `X-Frame-Options: DENY`. CSP `frame-ancestors 'self' example.instructure.com ...`. Same-origin iframe embedding works as designed.
2. ❌ **Canvas Files API `on_duplicate=overwrite` is "delete + recreate", NOT in-place update.** `file_id` changes on every overwrite. Architecture is still valid but the **Update story** above has been REVISED — see that section.
3. ✅ **Canvas RCE preserves iframe `sandbox` attributes when pages are saved.** Exact preservation: written `sandbox="allow-scripts allow-same-origin allow-forms"`, read back identically. Canvas auto-adds harmless `data-api-endpoint`/`data-api-returntype` data attributes and expands relative `src` to absolute URL.

## Open follow-ups deferred

| Item | Tier | Why deferred |
|---|---|---|
| Per-student state persistence (progress saved across page loads) | v2 | Requires LTI 1.3 backend or Canvas state API — major infra |
| Widget analytics (engagement, time-on-widget) | v2 | Same — needs a backend |
| Shared widget library across courses (one spec, many embeds) | v2 | Needs course-id-agnostic hosting strategy + permission model |
| Embedded video/audio inside widgets | v1.x | Canvas Files supports both but file size limits + captions need design |
| Widget templates / starter content packs | v1.x | Wait until v1 ships to see what kinds get reused |
| Hot-reload preview server for local widget dev | v1.x | Nice-to-have, not blocking |
| `axe-core` integration as a11y regression net | v1.x | Add once we see what slips past contract assertions |
| `side-by-side-slider` kind (originally proposed for v1) | v1.x | High pointer-math effort, narrow use case |
| `compare-table` kind (originally proposed for v1) | v1.x | Marginal interactivity gain over static HTML tables |

## Decisions log

| Decision | Choice | Rationale |
|---|---|---|
| Hosting model | Canvas Files iframe (Option B) | Same-origin; no FERPA exposure; no external infra; widget travels with course backup |
| Catalog approach | Hybrid with strong lean toward pure | 6 typed renderers cover the common case; `--allow-experimental` escape hatch keeps novel kinds reachable |
| Brainstorm steering | Soft | Hard enforcement would kill the escape hatch's only ergonomic path |
| Validation library | Zod (+ `zod-to-json-schema`) | One source of truth: TS types + runtime + brainstorm-prompt JSON Schema |
| Spec file location | Per-page `widgets/` folder | Widgets travel with their host page on move/rename; no cross-topic ID collisions |
| Placeholder syntax | `{{ widget:<id> }}` | Lowest visual noise; common markdown convention |
| Tech stack inside widget | Vanilla HTML/CSS/JS, no build step | Smallest blast radius; self-contained; no CDN drift |
| Drag a11y | Dual-mode (WAI-ARIA grab/drop + explicit move buttons on focus) | Idiomatic for screen-reader power users; bulletproof for everyone else |
| A11y testing | Hand-rolled contract assertions (no axe-core in v1) | Covers structural failures; axe-core is a v1.x add if needed |
| LLM client | Extract shared `tools/llm/` module from rubric + brainstorm | Third use case justifies the extraction; eliminates duplication noted in v1.2.0 memory |
| Experimental gate | Render-time only | Render-time opt-in is the single decision point; no double-gate at publish |
| Experimental marking | `.experimental.html` filename + HTML comment | Visible to developers; invisible to students per Option C choice |
