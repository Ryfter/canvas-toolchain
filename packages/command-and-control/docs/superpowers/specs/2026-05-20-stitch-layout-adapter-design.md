# Stitch LayoutAdapter — Design

**Status:** Draft (2026-05-20) — needs review
**Repo:** `D:\Dev\Command-and-Control-MCP` (adapter) + `D:\Dev\canvas-design-studio` (canvas-safe transform)
**Size:** Small
**Depends on:** Template/theme library (spec #2), Registry mechanism (spec #8), CDS's Canvas-safe transformation

---

## 1. Problem

The template library covers known page structures. When a professor wants something the catalog doesn't have ("a vertical timeline of AI safety incidents with collapsible details"), the options are:
1. Hand-author a new template (skilled work, slow)
2. Have the LLM generate HTML from scratch (frequently produces output that breaks Canvas RCE)
3. Use a dedicated UI-generation service like Google Stitch (designed for this, but its raw output isn't Canvas-safe)

Stitch is the right tool for "give me a polished layout for X." But Stitch produces modern HTML with custom fonts, external CSS, JavaScript, and complex selectors — none of which Canvas accepts. We need an adapter that:
1. Asks Stitch for a layout
2. Pipes the result through Canvas-safe transformation
3. Adapts the output into our template structure (so it works with theme + prompt-set)
4. Optionally saves the result as a new template in the local registry (learn from successful generations)

## 2. Goals

1. A `LayoutAdapter` interface that any layout-generation service can implement.
2. A `StitchAdapter` implementation (when Stitch API access is available).
3. The adapter's output is **always** routed through CDS's `canvasSafeTransform()` before reaching any workflow.
4. Successful generations can be saved as new templates in the local registry (and shared via the registry mechanism).
5. The adapter is optional. Without Stitch, the system falls back to the catalog.

## 3. Non-goals

- Hosting Stitch / proxying its output. We call its API (or simulate via paste) and transform locally.
- Replacing CDS's Canvas-safe transform. The transform is the constraint that protects Canvas; we use it as a hard gate.
- Auto-publishing Stitch output. Generated layouts always go through review (accessibility audit + manual confirmation).

## 4. Architecture

```
                ┌───────────────────────────────────┐
                │ LayoutAdapter interface           │
                │   generateLayout(input) →         │
                │     RawLayoutOutput               │
                │       ├── StitchAdapter           │
                │       ├── (future) other layout   │
                │       │     generation services   │
                │       └── PasteAdapter            │
                └───────────┬───────────────────────┘
                            │
                            ▼
                ┌───────────────────────────────────┐
                │ CDS canvasSafeTransform()         │
                │   Strips JS                       │
                │   Removes external fonts          │
                │   Inlines styles where required   │
                │   Removes non-whitelisted elements│
                │   Returns: { html, removed[],    │
                │              violations[] }      │
                └───────────┬───────────────────────┘
                            │
                            ▼
                ┌───────────────────────────────────┐
                │ Slot extraction                   │
                │   Identify which structural slots │
                │   the layout fills (hero, body,   │
                │   comparison, etc.)               │
                └───────────┬───────────────────────┘
                            │
                            ▼
              ┌──────────────────────────────────────┐
              │ Result: Canvas-safe HTML + slot map  │
              │                                      │
              │ Optionally: install as a template    │
              │ in local registry for reuse          │
              └──────────────────────────────────────┘
```

## 5. Interface

```typescript
// src/layout/layout_adapter.ts
export interface LayoutAdapterInput {
  /** What the layout should accomplish. */
  intent: string;
  /** Slots the result should include. Adapter tries to honor these. */
  desiredSlots: string[];
  /** Brand context to bias visual style. */
  brandContext?: {
    colors: { primary: string; accent: string; background: string; text: string };
    typography: { headingFontStack: string; bodyFontStack: string };
    moodWords: string[];
  };
  /** Sample content to render (so the layout isn't empty). */
  sampleContent?: Record<string, unknown>;
  /** Output format preference. */
  outputFormat?: 'html-css';
}

export interface RawLayoutOutput {
  html: string;
  css: string;             // separate; will be inlined by transform
  source: { adapter: string; rawInput: LayoutAdapterInput; fetchedAt: string };
}

export interface LayoutAdapter {
  generateLayout(input: LayoutAdapterInput): Promise<RawLayoutOutput>;
}

// Post-transform result:
export interface AdaptedLayout {
  /** Canvas-safe HTML, fully inlined, validated. */
  canvasSafeHtml: string;
  /** Map from slot name to the HTML fragment that fills it. */
  slotMap: Record<string, string>;
  /** Anything the transform removed. */
  removed: { tag: string; reason: string }[];
  /** Violations the transform couldn't fix. */
  violations: { issue: string; suggestion: string }[];
  /** Accessibility audit findings. */
  accessibility: { warnings: string[]; errors: string[] };
}
```

## 6. StitchAdapter

```typescript
// src/layout/stitch_adapter.ts
export class StitchAdapter implements LayoutAdapter {
  constructor(private readonly apiKey: string) {}

  async generateLayout(input: LayoutAdapterInput): Promise<RawLayoutOutput> {
    // Compose Stitch prompt from input.intent + slots + brand
    // Call Stitch API
    // Parse Stitch response → { html, css }
    // Return RawLayoutOutput
  }
}
```

**Today's reality:** Stitch (Google Labs) doesn't have a publicly documented API as of this writing. The adapter is designed against the eventual public contract; until then, `PasteAdapter` covers the use case (professor generates in Stitch UI, pastes the result back).

## 7. PasteAdapter

```typescript
// src/layout/paste_adapter.ts
export class PasteAdapter implements LayoutAdapter {
  async generateLayout(input: LayoutAdapterInput): Promise<RawLayoutOutput> {
    throw new Error(
      'PasteAdapter is fulfilled via the paste_layout MCP tool: ' +
      'the professor generates in Stitch/Figma/etc. and pastes the HTML + CSS ' +
      'back via paste_layout({ html, css, sourceTool: "stitch" }).'
    );
  }
}

// And the corresponding tool:
// paste_layout({ html, css, sourceTool, intent, desiredSlots }) → AdaptedLayout
```

This makes the workflow useful today without API access.

## 8. Canvas-safe transformation contract

The transform (existing in CDS, formalised here as a named seam) MUST:
1. Strip all `<script>` tags and event handlers.
2. Remove or replace non-whitelisted elements (`<iframe>` only if whitelisted source).
3. Remove external stylesheet links and inline non-essential CSS into element `style` attributes.
4. Remove `<link>` font imports; rely on CSS-stack fonts only.
5. Validate that the result fits in Canvas RCE (no nested forms, etc.).
6. Return a clear list of removals and unfixable violations.

The transform is a hard gate. If `violations.length > 0`, the workflow does NOT publish; it surfaces for review.

## 9. Slot extraction

After the transform, we need to map the layout's parts onto the controlled slot vocabulary (hero, body, callout, etc.). Approach:

1. **Adapter-hint mode:** If the adapter labels regions (Stitch output may include semantic class names like `class="hero"`), use those.
2. **Heuristic mode:** Otherwise, use heading levels and content density. The first `<h1>` block becomes `hero`; subsequent `<h2>` sections become `body` chunks; small bordered boxes become `callout`.
3. **LLM mode:** As a fallback, ask the LLM to annotate the HTML with `data-slot="..."` attributes based on the controlled vocabulary.

Result: `slotMap` matching slots → HTML fragments. This feeds into the template/theme/prompt rendering pipeline.

## 10. Saving as a template

When a generated layout passes the audit and the professor wants to reuse it:

```typescript
saveLayoutAsTemplate({
  layout: AdaptedLayout,
  templateId: string,
  templateVersion: string,
}): { installedPath: string }
```

This:
1. Replaces concrete content in each slot with `{{slot:<name>}}` placeholders.
2. Writes a `template/<id>@<version>/` directory with `structure.html` + `slots.json` (derived from `slotMap`).
3. Adds to local registry index.

Now the layout is reusable across pages without re-calling Stitch.

## 11. C&C tool surface

```typescript
// New tools:
// - generate_layout({ intent, desiredSlots, brandContext?, sampleContent? }) → AdaptedLayout
// - paste_layout({ html, css, sourceTool, intent, desiredSlots }) → AdaptedLayout
// - save_layout_as_template({ layout, templateId, templateVersion }) → installation result
```

## 12. Test plan

- Unit: `StitchAdapter` with mocked fetch.
- Unit: `PasteAdapter` rejects direct call; `paste_layout` tool accepts pasted content.
- Unit: Canvas-safe transform contract — given input with `<script>`, output has none.
- Unit: slot extraction (heuristic mode) — given HTML with `<h1>`, `<h2>` sections, returns correct `slotMap`.
- Unit: `save_layout_as_template` — placeholder substitution + directory creation.
- Integration: full pipeline (paste → transform → extract → save) produces a valid template in the local registry.

## 13. Open decisions for review

1. **Stitch access path.** Same situation as Pomelli — no public API yet. Paste-based workflow works today; adapter API design lets us swap in a programmatic implementation later. Should we also add an `AnthropicLayoutAdapter` that uses Claude with image-of-intent input to generate HTML+CSS? Less specialised than Stitch but always-available.

2. **Slot extraction default mode.** Heuristic is fast and offline; LLM is more accurate. I'd default to heuristic with an opt-in `slotExtraction: 'llm'` for tricky layouts.

3. **Canvas-safe transform formalisation.** The transform exists in CDS but isn't currently exposed as a clean named API. Should this spec also propose tightening that interface (`canvasSafeTransform(html, css) → { html, removed, violations }`)? I think yes — it's the gate that protects everything else, so it deserves a named contract.

4. **What if the transform removes essential elements?** A Stitch layout might rely on a JS-driven accordion. The transform removes the JS; the accordion no longer works. We could:
   - (a) Fail hard with a "this layout requires JS Canvas doesn't allow" error
   - (b) Replace JS interactivity with the closest static equivalent (always-expanded version)
   - (c) Offer to convert into a CDS-hosted iframe widget (touches the brainstorm/interactive-controls spec #7)
   
   I'd start with (a)+(b): hard fail OR static fallback. (c) is a bridge to the interactives work but requires that spec to mature first.

## 14. Out of scope

- Real-time collaborative layout editing
- Visual diff between original layout and Canvas-safe version
- Multi-page layout generation
- Auto-template-saving (saving every successful generation; opt-in feels right)
