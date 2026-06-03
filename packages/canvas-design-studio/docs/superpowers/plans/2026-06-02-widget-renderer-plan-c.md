# Widget Renderer — Plan C (Experimental Escape Hatch + Brainstorm Steering + Docs)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the LLM-generated "experimental" renderer path that's gated behind `allowExperimental: true`, update the `brainstorm_interactive` system prompt to steer toward catalog kinds (soft steer per spec), and ship the documentation that lets external faculty discover and use the widget feature.

**Architecture:** `experimental.ts` is a catalog peer that uses `@canvas-toolchain/shared-llm` (extracted in Plan A) to generate self-contained HTML+CSS+JS from an arbitrary `InteractiveSpec.kind`. The LLM is given a strict system prompt (no external requests, inline `<style>` and `<script>` only, honor accessibility hints) plus the full spec as user message. Output is run through a post-validation step that refuses unsafe patterns. `render_widget` already has the dispatch hook from Plan A — Task C1.2 just removes the "not yet implemented" stub.

The brainstorm steering change is C&C-side: update `tools/brainstorm/prompts.ts` to embed (a) the catalog of 6 valid kinds with one-line "when each fits" guidance, and (b) the zod-derived JSON Schema for each kind's `initialContent`. With those in context, the LLM produces conformant specs by default.

**Tech Stack:** Uses existing `zod`, `@canvas-toolchain/shared-llm` (Plan A), and the catalog/schemas helpers from Plan A. No new deps.

**Spec:** `packages/canvas-design-studio/docs/superpowers/specs/2026-06-02-widget-renderer-design.md`

**Tracking issue:** [#88](https://github.com/Ryfter/canvas-toolchain/issues/88)

**Depends on:** Plan A and Plan B shipped. All 6 catalog renderers live, `CATALOG` exports `contentSchema` per renderer, `render_widget` has the experimental dispatch stub.

**Ships when complete:** Widget feature is fully usable. Brainstorm produces catalog-conformant specs by default. Novel kinds reachable via the experimental flag. README + CLAUDE.md docs explain the feature to faculty.

---

## File structure

**New files:**

```
packages/canvas-design-studio/src/tools/widget/catalog/experimental.ts
packages/canvas-design-studio/tests/widget/catalog/experimental.test.ts
docs/widget-renderer.md   ← top-level faculty-facing doc
```

**Modified files:**

```
packages/canvas-design-studio/src/tools/render-widget.ts           ← remove "not yet implemented" stub
packages/command-and-control/src/tools/brainstorm/prompts.ts       ← embed catalog + JSON schemas
packages/command-and-control/tests/brainstorm/prompts.test.ts      ← verify steering bias
packages/canvas-design-studio/CLAUDE.md                            ← document widget tools
packages/command-and-control/CLAUDE.md                             ← document brainstorm steering
README.md                                                          ← link to docs/widget-renderer.md
```

---

## Phase C1 — Experimental renderer

### Task C1.1: Implement `catalog/experimental.ts` with LLM call + post-validation

**Files:**
- Create: `packages/canvas-design-studio/src/tools/widget/catalog/experimental.ts`
- Create: `packages/canvas-design-studio/tests/widget/catalog/experimental.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/canvas-design-studio/tests/widget/catalog/experimental.test.ts
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { experimentalRender, validateExperimentalHtml } from '../../../src/tools/widget/catalog/experimental.js';
import type { LlmClient } from '@canvas-toolchain/shared-llm';
import type { InteractiveSpec } from '../../../src/tools/widget/types.js';

const baseSpec: InteractiveSpec = {
  id: 'exp-1', name: 'Experimental Widget', kind: 'card-stack-zoom', purpose: 'try',
  contentSchema: {}, initialContent: { cards: [{ front: 'F', back: 'B' }] },
  dimensions: { minHeight: 200, maxHeight: 400 },
  accessibility: { keyboardEquivalent: 'Tab', screenReaderSummary: 'test', minTouchTarget: 44 },
};

describe('validateExperimentalHtml', () => {
  it('accepts a clean self-contained document', () => {
    const ok = validateExperimentalHtml('<!DOCTYPE html><html><head><style>.x{}</style></head><body><button>X</button><script>console.log(1);</script></body></html>');
    expect(ok.ok).toBe(true);
  });
  it('rejects external <link>', () => {
    const r = validateExperimentalHtml('<html><head><link href="https://cdn/x.css"></head><body></body></html>');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/link/i);
  });
  it('rejects external <script src=>', () => {
    const r = validateExperimentalHtml('<html><body><script src="https://cdn/x.js"></script></body></html>');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/script/i);
  });
  it('rejects external <iframe src=>', () => {
    const r = validateExperimentalHtml('<html><body><iframe src="https://x"></iframe></body></html>');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/iframe/i);
  });
  it('rejects inline event handlers on body/html', () => {
    const r = validateExperimentalHtml('<html><body onload="x()"></body></html>');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/event handler/i);
  });
});

describe('experimentalRender (with mock LLM)', () => {
  it('returns LLM output verbatim on success', async () => {
    const okHtml = '<!DOCTYPE html><html><head><title>x</title></head><body><div>experimental widget</div></body></html>';
    const llm: LlmClient = { complete: vi.fn().mockResolvedValue({ text: okHtml }) };
    const result = await experimentalRender(baseSpec, llm);
    expect(result.html).toBe(okHtml);
  });

  it('throws LLM_OUTPUT_UNSAFE when the model produces a forbidden pattern', async () => {
    const badHtml = '<html><body><script src="https://evil/x.js"></script></body></html>';
    const llm: LlmClient = { complete: vi.fn().mockResolvedValue({ text: badHtml }) };
    await expect(experimentalRender(baseSpec, llm)).rejects.toThrow(/LLM_OUTPUT_UNSAFE/);
  });

  it('throws LLM_RENDER_FAILED when the LLM call rejects', async () => {
    const llm: LlmClient = { complete: vi.fn().mockRejectedValue(new Error('Anthropic API 503')) };
    await expect(experimentalRender(baseSpec, llm)).rejects.toThrow(/LLM_RENDER_FAILED/);
  });

  it('sends the InteractiveSpec as user message and the constraint system prompt', async () => {
    const okHtml = '<!DOCTYPE html><html><body>x</body></html>';
    const fn = vi.fn().mockResolvedValue({ text: okHtml });
    const llm: LlmClient = { complete: fn };
    await experimentalRender(baseSpec, llm);
    const [systemPrompt, userPrompt] = fn.mock.calls[0]!;
    expect(systemPrompt).toMatch(/self-contained/i);
    expect(systemPrompt).toMatch(/inline.*style.*script/i);
    expect(systemPrompt).toMatch(/no external/i);
    expect(userPrompt).toContain('"id":"exp-1"');
    expect(userPrompt).toContain('"kind":"card-stack-zoom"');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=packages/canvas-design-studio -- widget/catalog/experimental`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Write the implementation**

```ts
// packages/canvas-design-studio/src/tools/widget/catalog/experimental.ts

import type { LlmClient } from '@canvas-toolchain/shared-llm';
import type { InteractiveSpec } from '../types.js';
import { RenderError } from '../types.js';

const SYSTEM_PROMPT = `
You generate self-contained interactive HTML widgets for embedding in Canvas LMS pages
via iframe from Canvas Files. Output ONLY a complete HTML document. Strict rules:

1. Output must start with <!DOCTYPE html> and be a complete, valid HTML5 document.
2. ALL CSS must be inline in <style> blocks in <head>. No external <link> stylesheets.
3. ALL JavaScript must be inline in <script> blocks. No external <script src=> imports.
   No fetch() or import() of external URLs.
4. No <iframe> elements whose src points at an external URL.
5. No inline event-handler attributes (onload, onclick, etc.) on <body> or <html>.
   Use addEventListener inside the inline <script> instead.
6. Honor the spec's accessibility hints:
   - keyboardEquivalent must work — every action reachable via mouse must also be reachable
     via keyboard (Tab, Enter, Space, Arrow keys as appropriate).
   - screenReaderSummary should be reflected in a visually-hidden ARIA live region (aria-live="polite")
     that updates as state changes.
   - Respect @media (prefers-reduced-motion: reduce) — no animations/transitions when set.
   - minTouchTarget pixel size on every interactive element (use min-width / min-height).
7. The widget must be self-contained — no external network requests after iframe load.

Return ONLY the HTML document. No commentary, no fences, no preamble.
`.trim();

export interface ExperimentalRenderResult {
  html: string;
}

const FORBIDDEN_PATTERNS: Array<{ rx: RegExp; reason: string }> = [
  { rx: /<link\b[^>]*\bhref\s*=\s*["']https?:/i, reason: 'external <link> stylesheet not allowed' },
  { rx: /<script\b[^>]*\bsrc\s*=\s*["']https?:/i, reason: 'external <script src> not allowed' },
  { rx: /<iframe\b[^>]*\bsrc\s*=\s*["']https?:/i, reason: 'external <iframe> not allowed' },
  { rx: /<(?:body|html)\b[^>]*\bon[a-z]+\s*=/i, reason: 'inline event handler attribute on body/html not allowed' },
];

export function validateExperimentalHtml(html: string): { ok: true } | { ok: false; reason: string } {
  for (const { rx, reason } of FORBIDDEN_PATTERNS) {
    if (rx.test(html)) return { ok: false, reason };
  }
  return { ok: true };
}

export async function experimentalRender(spec: InteractiveSpec, llm: LlmClient): Promise<ExperimentalRenderResult> {
  let response: { text: string };
  try {
    response = await llm.complete(SYSTEM_PROMPT, JSON.stringify(spec, null, 2), { maxTokens: 8000 });
  } catch (e) {
    throw new RenderError('LLM_RENDER_FAILED', { kind: spec.kind, cause: String(e) });
  }
  const html = response.text.trim();

  const check = validateExperimentalHtml(html);
  if (!check.ok) {
    throw new RenderError('LLM_OUTPUT_UNSAFE', { kind: spec.kind, reason: check.reason });
  }

  return { html };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace=packages/canvas-design-studio -- widget/catalog/experimental`
Expected: 9 tests pass.

- [ ] **Step 5: Build**

Run: `npm run build --workspace=packages/canvas-design-studio`
Expected: clean (note: the workspace dep `@canvas-toolchain/shared-llm` should already be wired from Plan A Task 2.1).

- [ ] **Step 6: Commit**

```bash
git add packages/canvas-design-studio/src/tools/widget/catalog/experimental.ts packages/canvas-design-studio/tests/widget/catalog/experimental.test.ts
git commit -m "feat(cds): experimental renderer with LLM call + post-validation

experimentalRender(spec, llmClient): generates a self-contained HTML widget
from any InteractiveSpec via Anthropic. SYSTEM_PROMPT constrains the model
to inline CSS/JS, no external requests, honor accessibility hints. Output
post-validation rejects external link/script/iframe and inline body/html
event handlers, throwing LLM_OUTPUT_UNSAFE with a clear reason.

validateExperimentalHtml() exported for re-use in tests and future tooling.
LLM client injected (LlmClient interface from @canvas-toolchain/shared-llm)
so the renderer is unit-testable without network access."
```

### Task C1.2: Wire experimental dispatch in `render-widget.ts`

**Files:**
- Modify: `packages/canvas-design-studio/src/tools/render-widget.ts`
- Modify: `packages/canvas-design-studio/tests/widget/render-widget.test.ts` (replace the "not yet implemented" expectation)

- [ ] **Step 1: Update the existing test to expect real experimental behavior**

The current test in `render-widget.test.ts` asserts that the experimental path throws `LLM_RENDER_FAILED` with "Plan C" reason. Replace that test with two new ones that exercise the real path via a mocked LLM. The renderWidget signature needs to accept an optional `llmClient` parameter for test injection (production callers can construct an `AnthropicLlmClient` from config).

Replace the existing test scaffolding for experimental:

```ts
// in render-widget.test.ts — replace any existing experimental stub test
import type { LlmClient } from '@canvas-toolchain/shared-llm';

it('writes <id>.experimental.html when allowExperimental: true and kind unknown', async () => {
  const specPath = writeSpec('exp-1.spec.json', { ...goodSpec, kind: 'card-stack-zoom' });
  const okHtml = '<!DOCTYPE html><html><body>experimental output</body></html>';
  const mockLlm: LlmClient = { complete: vi.fn().mockResolvedValue({ text: okHtml }) };

  const result = await renderWidget({ specPath, allowExperimental: true, llmClient: mockLlm });

  expect(result.kind).toBe('card-stack-zoom');
  expect(result.experimental).toBe(true);
  expect(result.outputPath.endsWith('.experimental.html')).toBe(true);
  expect(existsSync(result.outputPath)).toBe(true);
  const html = readFileSync(result.outputPath, 'utf8');
  expect(html).toContain('experimental output');
  expect(html).toMatch(/<!-- EXPERIMENTAL/);
});

it('throws LLM_OUTPUT_UNSAFE if LLM returns external script', async () => {
  const specPath = writeSpec('exp-2.spec.json', { ...goodSpec, kind: 'card-stack-zoom' });
  const badHtml = '<html><body><script src="https://evil/x.js"></script></body></html>';
  const mockLlm: LlmClient = { complete: vi.fn().mockResolvedValue({ text: badHtml }) };

  await expect(renderWidget({ specPath, allowExperimental: true, llmClient: mockLlm }))
    .rejects.toThrow(/LLM_OUTPUT_UNSAFE/);
});
```

Remove or update the old "experimental not yet implemented" test from Plan A's task 3.3 if it's still present.

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test --workspace=packages/canvas-design-studio -- widget/render-widget`
Expected: 2 new experimental tests fail (renderWidget doesn't accept llmClient yet).

- [ ] **Step 3: Update `render-widget.ts`**

Modify `RenderWidgetInput` in `types.ts` to add an optional `llmClient` field (the implementer adds an import for `LlmClient` type from shared-llm). Update `renderWidget()` to:

1. Accept the optional `llmClient` parameter.
2. When the experimental path is taken, call `experimentalRender(spec, llmClient)` and write the result.
3. Write the output to `<spec-id>.experimental.html` (not `<spec-id>.html`).
4. Prepend `<!-- EXPERIMENTAL: generated by LLM at render time, not validated by tests -->\n` to the HTML before writing.
5. Return `{ outputPath, kind, experimental: true }`.

For production callers without an injected llmClient, construct `AnthropicLlmClient` from `loadAnthropicConfig()` at the top of the experimental branch:

```ts
if (!input.llmClient) {
  const cfg = loadAnthropicConfig();  // imported from C&C — see note below
  input.llmClient = new AnthropicLlmClient({ apiKey: cfg.apiKey, model: cfg.model });
}
```

NOTE: `loadAnthropicConfig` lives in `command-and-control`. CDS can't import from C&C (would invert the dependency). Two options:
- (a) Have the MCP tool registration in `src/index.ts` construct the client and pass it in. The `render-widget.ts` core never reads config; only the MCP layer does.
- (b) Add a tiny config-loader to CDS that reads the same `~/.command-and-control/anthropic-config.json` path directly.

Choose **(a)** — keeps CDS pure. The MCP tool dispatch case in `src/index.ts` reads the config file, constructs the client, passes it as `llmClient`. Then `render-widget.ts` core has no dependency on C&C.

Skeleton for the dispatch case in `src/index.ts`:

```ts
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { AnthropicLlmClient } from '@canvas-toolchain/shared-llm';

case 'render_widget': {
  const args2 = args as { specPath: string; allowExperimental?: boolean };
  let llmClient;
  if (args2.allowExperimental) {
    const cfgPath = join(homedir(), '.command-and-control', 'anthropic-config.json');
    const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
    llmClient = new AnthropicLlmClient({ apiKey: cfg.apiKey, model: cfg.model });
  }
  const result = await renderWidget({ ...args2, llmClient });
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
}
```

- [ ] **Step 4: Run tests + build**

Run: `npm test --workspace=packages/canvas-design-studio -- widget/render-widget`
Expected: previous 6 tests pass + 2 new experimental tests pass.

Run: `npm run build --workspace=packages/canvas-design-studio`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add packages/canvas-design-studio/src/tools/render-widget.ts packages/canvas-design-studio/src/tools/widget/types.ts packages/canvas-design-studio/src/index.ts packages/canvas-design-studio/tests/widget/render-widget.test.ts
git commit -m "feat(cds): wire experimental renderer into render_widget dispatch

renderWidget() now accepts an optional llmClient. When spec.kind is not in
CATALOG AND allowExperimental is true, dispatches to experimentalRender()
(shared-llm). Output written to <id>.experimental.html with a developer-
visible HTML comment marker at the top. The MCP layer in src/index.ts
constructs AnthropicLlmClient from ~/.command-and-control/anthropic-config.json
only when allowExperimental is requested — config not read otherwise.

Closes the v1 escape hatch story: novel kinds reachable, faculty consciously
opts in, students see a polished widget with no banner."
```

---

## Phase C2 — Brainstorm tool steering (C&C-side)

### Task C2.1: Update brainstorm system prompt to embed catalog kinds + JSON schemas

**Files:**
- Modify: `packages/command-and-control/src/tools/brainstorm/prompts.ts`
- The catalog & schemas live in CDS — C&C imports them via the workspace dep already wired in Plan A

- [ ] **Step 1: Read the existing prompt structure**

Read `packages/command-and-control/src/tools/brainstorm/prompts.ts` to see the current `SYSTEM_PROMPT` shape. The change: insert a new "Available widget kinds" section before the existing concept-generation instructions.

- [ ] **Step 2: Write the failing test**

```ts
// packages/command-and-control/tests/brainstorm/prompts.test.ts (modify existing or new)
import { describe, expect, it } from 'vitest';
import { buildSystemPrompt } from '../../src/tools/brainstorm/prompts.js';

describe('brainstorm system prompt — catalog steering', () => {
  it('lists all 6 catalog kinds with short fit guidance', () => {
    const sp = buildSystemPrompt({ catalogSteer: true });
    for (const kind of ['card-flip-reveal', 'sortable-ordering', 'drag-to-categorize', 'branching-scenario', 'multi-step-reveal', 'hotspot-image']) {
      expect(sp).toContain(kind);
    }
    expect(sp).toMatch(/prefer/i); // soft steer language
  });

  it('embeds the JSON Schema for each catalog kind initialContent', () => {
    const sp = buildSystemPrompt({ catalogSteer: true });
    // For card-flip-reveal: { cards: [{ front, back }] }
    expect(sp).toMatch(/"cards"/);
    expect(sp).toMatch(/"front"/);
    expect(sp).toMatch(/"back"/);
    // For sortable-ordering: { items, correctOrder }
    expect(sp).toMatch(/"correctOrder"/);
    // For drag-to-categorize: { items, bins }
    expect(sp).toMatch(/"bins"/);
    // For branching-scenario: { start, nodes }
    expect(sp).toMatch(/"nodes"/);
    // For multi-step-reveal: { steps }
    expect(sp).toMatch(/"steps"/);
    // For hotspot-image: { imageUrl, hotspots }
    expect(sp).toMatch(/"hotspots"/);
  });

  it('instructs the LLM to mark experimental kinds with EXPERIMENTAL: prefix', () => {
    const sp = buildSystemPrompt({ catalogSteer: true });
    expect(sp).toMatch(/EXPERIMENTAL:/);
  });

  it('omits catalog steering when catalogSteer is false (backward compat)', () => {
    const sp = buildSystemPrompt({ catalogSteer: false });
    expect(sp).not.toContain('card-flip-reveal');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test --workspace=packages/command-and-control -- brainstorm`
Expected: new prompt tests fail.

- [ ] **Step 4: Update `prompts.ts`**

Refactor or augment the existing `SYSTEM_PROMPT` export into a `buildSystemPrompt({ catalogSteer? })` function that, when `catalogSteer` is true, prepends the catalog section. The catalog section enumerates the 6 kinds with one-line "when each fits" copy AND embeds JSON Schema for each via the CDS `exportKindSchema()` helper applied to each renderer's `contentSchema`.

Sketch:

```ts
import { CATALOG } from 'canvas-design-mcp/dist/tools/widget/catalog/index.js';  // path may vary; use the actual export
import { exportKindSchema } from 'canvas-design-mcp/dist/tools/widget/schemas.js';
import type { WidgetKind } from 'canvas-design-mcp/dist/tools/widget/types.js';

const FIT_GUIDANCE: Record<WidgetKind, string> = {
  'card-flip-reveal': 'Vocabulary, term → definition, prompt → reveal recall.',
  'sortable-ordering': 'Sequences, process steps, formula composition, ranking.',
  'drag-to-categorize': 'Taxonomy, classification, data types into bins.',
  'branching-scenario': 'Case studies, decision trees, ethical dilemmas with consequences.',
  'multi-step-reveal': 'Walked examples, derivations, lab procedures, step-by-step guides.',
  'hotspot-image': 'Annotated images, UI tours, anatomy/diagram labeling.',
};

function buildCatalogSection(): string {
  const entries = Object.keys(CATALOG).map(kind => {
    const renderer = CATALOG[kind as WidgetKind]!;
    const schema = exportKindSchema(renderer.contentSchema);
    return `### ${kind}
${FIT_GUIDANCE[kind as WidgetKind]}
initialContent JSON Schema:
\`\`\`json
${JSON.stringify(schema, null, 2)}
\`\`\``;
  }).join('\n\n');
  return `## Catalog kinds (PREFER these)

The widget renderer ships strong, tested support for these 6 kinds. Set spec.kind to one of these whenever the topic fits, and set spec.initialContent to match the kind's schema exactly. The renderer rejects malformed initialContent.

${entries}

If a concept truly does not fit any catalog kind, propose a novel kind and prepend "EXPERIMENTAL:" to the concept's rationale field so faculty knows to pass allowExperimental: true at render time.`;
}

export function buildSystemPrompt(opts: { catalogSteer?: boolean } = {}): string {
  const head = `(existing brainstorm system prompt content goes here)`;
  if (opts.catalogSteer) {
    return `${buildCatalogSection()}\n\n${head}`;
  }
  return head;
}
```

The implementer adapts to the actual existing prompt structure. Key acceptance criteria are the test assertions in Step 2.

Also update the call site (where the LLM is invoked) to pass `{ catalogSteer: true }`.

- [ ] **Step 5: Run tests + build**

Run: `npm test --workspace=packages/command-and-control -- brainstorm`
Expected: previous brainstorm tests + 4 new prompt tests pass.

Run: `npm run build`
Expected: all 5 packages clean.

- [ ] **Step 6: Commit**

```bash
git add packages/command-and-control/src/tools/brainstorm/prompts.ts packages/command-and-control/tests/brainstorm/prompts.test.ts
git commit -m "feat(cc): brainstorm_interactive steers toward catalog kinds (soft steer)

buildSystemPrompt({ catalogSteer: true }) now prefixes the system prompt with
the 6 catalog kinds, each with a one-line 'when this fits' guidance line AND
the JSON Schema for its initialContent (derived from the renderer's zod schema
via zod-to-json-schema). The LLM produces conformant specs by default.

For novel kinds the soft steer instructs the LLM to mark its rationale with
'EXPERIMENTAL:' prefix so faculty knows the spec requires allowExperimental
at render time. Closes the spec's soft-steer policy."
```

### Task C2.2: Verify steering bias with a smoke test

**Files:**
- Add: `packages/command-and-control/tests/brainstorm/steering-smoke.test.ts`

- [ ] **Step 1: Write a steering-bias smoke test that uses a mock LLM**

```ts
// packages/command-and-control/tests/brainstorm/steering-smoke.test.ts
import { describe, expect, it, vi } from 'vitest';
import { brainstormInteractive } from '../../src/tools/workflows/brainstorm_interactive.js';
import type { LlmClient } from '@canvas-toolchain/shared-llm';

describe('brainstorm_interactive steering smoke', () => {
  it('passes the catalog-aware system prompt to the LLM (regression guard)', async () => {
    const mockLlm: LlmClient = {
      complete: vi.fn().mockResolvedValue({ text: JSON.stringify({ concepts: [{ id: 'x', name: 'Test', rationale: 'tests', spec: {
        id: 'x', name: 'Test', kind: 'card-flip-reveal', purpose: '',
        contentSchema: {}, initialContent: { cards: [{ front: 'F', back: 'B' }] },
        dimensions: { minHeight: 200, maxHeight: 400 },
        accessibility: { keyboardEquivalent: '', screenReaderSummary: '', minTouchTarget: 44 },
      }, pedagogicalFit: 'high' }] }) }),
    };

    await brainstormInteractive({
      topic: 'IS vocabulary',
      learningGoal: 'recall terms',
      llmClient: mockLlm,
    });

    const systemPrompt = (mockLlm.complete as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(systemPrompt).toContain('card-flip-reveal');
    expect(systemPrompt).toContain('sortable-ordering');
    expect(systemPrompt).toMatch(/prefer/i);
  });
});
```

- [ ] **Step 2: Run test + commit**

Run: `npm test --workspace=packages/command-and-control -- brainstorm/steering-smoke`
Expected: 1 test passes.

```bash
git add packages/command-and-control/tests/brainstorm/steering-smoke.test.ts
git commit -m "test(cc): regression guard that brainstorm passes catalog-aware prompt to LLM

Smoke test that calls brainstormInteractive with a mock LLM and asserts the
catalog kinds appear in the system prompt sent to the model. Guards against
future refactors accidentally dropping the catalog steering."
```

---

## Phase C3 — Documentation

### Task C3.1: Write faculty-facing widget renderer doc

**Files:**
- Create: `docs/widget-renderer.md` (top of repo)
- Modify: `README.md` to link to it
- Modify: `packages/canvas-design-studio/CLAUDE.md` (add widget section)
- Modify: `packages/command-and-control/CLAUDE.md` (note the brainstorm steering)

- [ ] **Step 1: Write `docs/widget-renderer.md`**

```markdown
# Widget Renderer

Turn a `brainstorm_interactive` concept into a real, working, Canvas-embeddable interactive widget that students can click, drag, and explore — with full accessibility, no external infrastructure, no JavaScript in your Canvas page.

## How it works

```
brainstorm_interactive  →  InteractiveSpec (.spec.json)  →  render_widget  →  widgets/<id>.html
                                                                                       ↓
                                                                              publish_course
                                                                                       ↓
                                                                          Canvas Files iframe
```

Widgets live as self-contained HTML files. They're uploaded to your course's Canvas Files area and iframe-embedded in your pages. No external hosting, no third-party origin, no FERPA concerns — same-origin from your students' point of view.

## V1 catalog (6 kinds)

| `kind` | What it does | Example use |
|---|---|---|
| `card-flip-reveal` | Grid of cards; click flips to back. | Vocab, term → definition, prompt → reveal. |
| `sortable-ordering` | Drag list items into correct sequence. | Process steps, formula composition, ranking. |
| `drag-to-categorize` | Drag items into target bins. | Data types, biology classification, parts of speech. |
| `branching-scenario` | Multi-step choose-your-own-adventure with state. | Case studies, ethics, business decisions. |
| `multi-step-reveal` | Click-through guided walkthrough. | Math derivations, lab procedures, walked examples. |
| `hotspot-image` | Click annotated regions of an image. | Anatomy, art history, UI tours, engineering diagrams. |

## Quickstart

### 1. Brainstorm

```
brainstorm_interactive(topic="Excel formulas", learningGoal="recall SUM/AVERAGE/COUNTIF")
```

Output: 2-3 `WidgetConcept`s, each with an `InteractiveSpec`. Pick one and save its spec as `course/<page-slug>/widgets/<concept-id>.spec.json`.

### 2. Render

```
render_widget(specPath="course/wk3-formulas/widgets/sum-vs-sumif.spec.json")
```

Output: `course/wk3-formulas/widgets/sum-vs-sumif.html` — a complete, standalone HTML file.

Open it in your browser to review. Click around. Tab through. Listen via screen reader.

### 3. Reference from a page

In your page markdown:

```markdown
---
title: Week 3 — Formulas
---

## Practice

Click each card to see the formula's behavior:

{{ widget:sum-vs-sumif }}

## Reading
```

### 4. Preview and publish

```
preview_course_publish(courseDir="course/", canvasCourseId=12345)
publish_course(courseDir="course/", canvasCourseId=12345)
```

`publish_course` discovers every `{{ widget:<id> }}` reference, uploads the widget HTML to Canvas Files, swaps the iframe `src` to the Canvas-served URL, and publishes the page.

## Accessibility

Every widget ships with:

- Keyboard navigation matching the kind (Tab + Enter + Space + Arrow keys).
- ARIA live region announcing state changes for screen readers.
- `prefers-reduced-motion` respected — no animations when set.
- 44×44px minimum touch targets.
- Visually-hidden screen-reader summary seeded from the spec.

For drag operations (`sortable-ordering` and `drag-to-categorize`), each item exposes both the WAI-ARIA grab/drop pattern AND explicit "Move up / Move down / Move to bin" buttons — the bulletproof fallback for students whose assistive tech doesn't speak grab/drop fluently.

## Updates

Faculty edits a spec → re-runs `render_widget` → re-runs `publish_course` (or `publish_widget` for one-off). Canvas Files re-uploads the widget under the same display name; the new `file_id` is published into the page's iframe `src` automatically. Old Canvas file is deleted by Canvas itself.

## Rollback

`rollback_course_publish` restores both pages AND widgets to their prior state. Lockstep.

## Experimental kinds (novel)

If `brainstorm_interactive` proposes a kind outside the catalog, its rationale will be prefixed with `EXPERIMENTAL:`. To render anyway:

```
render_widget(specPath="...", allowExperimental=true)
```

The renderer uses Anthropic to generate self-contained HTML from your spec, post-validates that it has no external requests / no inline event handlers, and writes to `<id>.experimental.html`. The widget renders normally for students — no scary banner — but the `.experimental.` infix and an HTML comment marker make the status visible to developers.

Faculty must consciously opt in via the flag. Without `allowExperimental: true`, the renderer refuses with a helpful list of catalog kinds.

## Tracking

- Issue: [#88 Widget Renderer](https://github.com/Ryfter/canvas-toolchain/issues/88)
- Spec: `packages/canvas-design-studio/docs/superpowers/specs/2026-06-02-widget-renderer-design.md`
- Plans: `packages/canvas-design-studio/docs/superpowers/plans/2026-06-02-widget-renderer-plan-{a,b,c}.md`
```

- [ ] **Step 2: Add a link from README.md**

Find an appropriate section in the top-level `README.md` (likely a "Features" or "Tools" list) and add:

```markdown
### Interactive widgets

Turn an interactive concept from `brainstorm_interactive` into a working Canvas-embeddable widget. See [docs/widget-renderer.md](docs/widget-renderer.md).
```

- [ ] **Step 3: Update `packages/canvas-design-studio/CLAUDE.md`**

Add a new "## Widget Renderer" section (positioned alongside the existing tool sections) summarizing:

- The 6 catalog kinds
- `render_widget` MCP tool surface
- `publish_widget` MCP tool surface
- Where the spec/plan docs live

Keep it under 30 lines. Point to `docs/widget-renderer.md` for the faculty-facing detail.

- [ ] **Step 4: Update `packages/command-and-control/CLAUDE.md`**

Add a sentence near the `brainstorm_interactive` description noting that the tool now soft-steers toward the CDS catalog kinds via `buildSystemPrompt({ catalogSteer: true })`. Link to the spec doc for the catalog list.

- [ ] **Step 5: Commit**

```bash
git add docs/widget-renderer.md README.md packages/canvas-design-studio/CLAUDE.md packages/command-and-control/CLAUDE.md
git commit -m "docs(#88): faculty-facing widget renderer guide + project doc updates

docs/widget-renderer.md: end-to-end walkthrough from brainstorm to publish,
catalog overview, accessibility, updates, rollback, experimental escape hatch.

CDS CLAUDE.md: new Widget Renderer section listing the catalog kinds and the
two MCP tools (render_widget, publish_widget).

C&C CLAUDE.md: note that brainstorm_interactive now steers toward catalog kinds.

README.md: link to docs/widget-renderer.md from the features list.

Closes #88 widget renderer scope."
```

---

## Plan C ship checkpoint

After Task C3.1 completes:

- [ ] Run `npm test` (full monorepo): roughly +12 new tests across this plan (9 experimental + 4 brainstorm prompt + 1 steering smoke). Total ~1030+.
- [ ] Run `npm run build`: all 5 packages clean.
- [ ] **End-to-end manual test (with Kevin):**
  - Brainstorm a topic; verify the LLM produces catalog-conformant kinds.
  - Pick a concept, save as spec.json, run render_widget — widget HTML written.
  - Reference in a page, run generate_course → preview_course_publish → publish_course.
  - View on Canvas; widget should be live and interactive.
  - Try a hand-authored spec with kind `card-stack-zoom` (not in catalog) — render_widget should refuse without allowExperimental, then succeed with `allowExperimental: true` and produce `<id>.experimental.html`.
- [ ] Close issue #88 with a comment summarizing all 3 plans shipped.
- [ ] Memory update: append Plan C ship + #88 closure to project-current-state.md.

---

## Self-review checklist

- [ ] **Spec coverage:** experimental escape hatch fully implemented (C1.1 + C1.2). Brainstorm steering fully implemented per spec's soft-steer policy (C2.1 + C2.2). Docs cover faculty discovery (C3.1).
- [ ] **Placeholder scan:** no TBD/TODO. Implementation outlines for C2.1 are intentional because the actual prompt augmentation depends on the existing prompts.ts shape, but acceptance criteria are testable.
- [ ] **Type consistency:** `LlmClient` from `@canvas-toolchain/shared-llm` flows through C1.1, C1.2, and the brainstorm tests. `RenderError` codes (`LLM_RENDER_FAILED`, `LLM_OUTPUT_UNSAFE`) match the spec's listed codes.
- [ ] **Backward compat:** `buildSystemPrompt({ catalogSteer: false })` preserves the original behavior so the spec test still covers the legacy path.

## Execution handoff

Plan complete and saved to `packages/canvas-design-studio/docs/superpowers/plans/2026-06-02-widget-renderer-plan-c.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks.
2. **Inline Execution** — execute in this session with checkpoints.

Which approach?
