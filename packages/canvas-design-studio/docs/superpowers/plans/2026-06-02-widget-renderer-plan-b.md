# Widget Renderer — Plan B (Catalog Completion + Canvas Publishing)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the remaining 5 catalog renderers, build the Canvas Files API client, ship `publish_widget` as an MCP tool, and extend `generate_course` + `publish_course` to recognize, embed, and publish widgets alongside pages.

**Architecture:** Each catalog renderer follows the same `Renderer<TContent>` interface from Plan A — zod schema, validate, render returning `{body, css, js}`. Canvas Files upload is the standard 3-step flow (init → S3 PUT → confirm). `publish_widget` calls that client, returns `{ canvasFileId, embedSrc, embedHtml }`. `publish_course` extension discovers `{{ widget:<id> }}` placeholders in pages being published, uploads each widget, and substitutes the iframe URL into page HTML before pushing — **with the Phase 0 finding baked in:** every widget update gets a new `file_id`, so every widget upload triggers a page-HTML rewrite (no in-place updates).

**Tech Stack:** TypeScript 5, ESM, Vitest. No new deps — uses existing zod, the wrapper/a11y infra from Plan A, and native `fetch` for Canvas API.

**Spec:** `packages/canvas-design-studio/docs/superpowers/specs/2026-06-02-widget-renderer-design.md` (amended 2026-06-03 with Phase 0 findings)

**Tracking issue:** [#88](https://github.com/Ryfter/canvas-toolchain/issues/88)

**Depends on:** Plan A shipped (commits through `57d1c69`). `CATALOG` registry exists in `packages/canvas-design-studio/src/tools/widget/catalog/index.ts` with `card-flip-reveal` only.

**Ships when complete:** Faculty can write a course folder containing `.md` pages with `{{ widget:<id> }}` placeholders, run `preview_course_publish` → `publish_course`, and have all widgets uploaded to Canvas Files with their iframes embedded in the right pages — including reliable updates and rollback.

---

## File structure

**New files in this plan:**

```
packages/canvas-design-studio/src/tools/widget/catalog/
  sortable-ordering.ts
  drag-to-categorize.ts
  branching-scenario.ts
  multi-step-reveal.ts
  hotspot-image.ts

packages/canvas-design-studio/src/tools/widget/canvas-files.ts    ← 3-step upload client
packages/canvas-design-studio/src/tools/publish-widget.ts         ← MCP tool entry

packages/canvas-design-studio/tests/widget/catalog/
  sortable-ordering.test.ts
  drag-to-categorize.test.ts
  branching-scenario.test.ts
  multi-step-reveal.test.ts
  hotspot-image.test.ts

packages/canvas-design-studio/tests/widget/canvas-files.test.ts
packages/canvas-design-studio/tests/widget/publish-widget.test.ts
```

**Modified files in this plan:**

```
packages/canvas-design-studio/src/tools/widget/catalog/index.ts   ← register 5 new renderers in CATALOG
packages/canvas-design-studio/tests/widget/catalog/contract-assertions.test.ts ← populate FIXTURE_CONTENT for new kinds
packages/canvas-design-studio/src/tools/generate-course.ts        ← recognize {{ widget:<id> }} placeholder
packages/canvas-design-studio/src/index.ts                        ← register publish_widget MCP tool
packages/command-and-control/src/tools/workflows/publish_course.ts ← discover widgets, upload, substitute iframe src
packages/command-and-control/src/tools/workflows/preview_course_publish.ts ← include widget diff in manifest
packages/command-and-control/src/tools/workflows/rollback_course_publish.ts ← restore widget files
```

---

## Phase B1 — Remaining 5 catalog renderers

Each task follows the same shape: write zod schema, render function, schema-validation tests, render-output tests. After each renderer, update `CATALOG` (in `catalog/index.ts`) and `FIXTURE_CONTENT` (in `contract-assertions.test.ts`) so the shared contract harness automatically exercises the new renderer.

### Task B1.1: `sortable-ordering` renderer (dual-mode a11y)

**Files:**
- Create: `packages/canvas-design-studio/src/tools/widget/catalog/sortable-ordering.ts`
- Create: `packages/canvas-design-studio/tests/widget/catalog/sortable-ordering.test.ts`
- Modify: `packages/canvas-design-studio/src/tools/widget/catalog/index.ts` (register renderer)
- Modify: `packages/canvas-design-studio/tests/widget/catalog/contract-assertions.test.ts` (FIXTURE_CONTENT)

- [ ] **Step 1: Write the failing test**

```ts
// packages/canvas-design-studio/tests/widget/catalog/sortable-ordering.test.ts
import { describe, expect, it } from 'vitest';
import { sortableOrderingRenderer } from '../../../src/tools/widget/catalog/sortable-ordering.js';
import type { InteractiveSpec } from '../../../src/tools/widget/types.js';

const baseSpec: InteractiveSpec = {
  id: 'sdlc-order', name: 'SDLC Phases', kind: 'sortable-ordering', purpose: 'order steps',
  contentSchema: {}, initialContent: {},
  dimensions: { minHeight: 400, maxHeight: 700 },
  accessibility: { keyboardEquivalent: 'Tab to item; Enter to pick up; arrows to move; Enter to drop. Or use the explicit Move Up/Move Down buttons.', screenReaderSummary: 'Five items to sort.', minTouchTarget: 44 },
};

const goodContent = {
  items: [
    { id: 'plan', label: 'Plan' },
    { id: 'design', label: 'Design' },
    { id: 'implement', label: 'Implement' },
    { id: 'test', label: 'Test' },
    { id: 'deploy', label: 'Deploy' },
  ],
  correctOrder: ['plan', 'design', 'implement', 'test', 'deploy'],
};

describe('sortableOrderingRenderer schema', () => {
  it('accepts a well-formed items + correctOrder', () => {
    expect(sortableOrderingRenderer.validateContent(goodContent).ok).toBe(true);
  });
  it('rejects empty items array', () => {
    expect(sortableOrderingRenderer.validateContent({ items: [], correctOrder: [] }).ok).toBe(false);
  });
  it('rejects items missing id', () => {
    expect(sortableOrderingRenderer.validateContent({ items: [{ label: 'x' }], correctOrder: ['x'] }).ok).toBe(false);
  });
  it('rejects items missing label', () => {
    expect(sortableOrderingRenderer.validateContent({ items: [{ id: 'x' }], correctOrder: ['x'] }).ok).toBe(false);
  });
  it('rejects correctOrder length mismatch', () => {
    expect(sortableOrderingRenderer.validateContent({ items: goodContent.items, correctOrder: ['plan'] }).ok).toBe(false);
  });
  it('rejects correctOrder containing unknown id', () => {
    expect(sortableOrderingRenderer.validateContent({ items: goodContent.items, correctOrder: ['plan','design','implement','test','BOGUS'] }).ok).toBe(false);
  });
});

describe('sortableOrderingRenderer render output', () => {
  const validated = sortableOrderingRenderer.validateContent(goodContent);
  if (!validated.ok) throw new Error('fixture invalid');
  const { body, css, js } = sortableOrderingRenderer.render(validated.value, baseSpec);

  it('emits one list item per content item', () => {
    expect((body.match(/<li[\s>]/g) ?? []).length).toBe(5);
  });
  it('every item has an explicit Move Up and Move Down button (dual-mode)', () => {
    expect((body.match(/aria-label="Move .*up/gi) ?? []).length).toBe(5);
    expect((body.match(/aria-label="Move .*down/gi) ?? []).length).toBe(5);
  });
  it('each item label is HTML-escaped', () => {
    const evilContent = { items: [{ id: 'x', label: '<script>' }], correctOrder: ['x'] };
    const v = sortableOrderingRenderer.validateContent(evilContent);
    if (!v.ok) throw new Error('escape fixture invalid');
    const out = sortableOrderingRenderer.render(v.value, baseSpec);
    expect(out.body).not.toContain('<script>');
    expect(out.body).toContain('&lt;script&gt;');
  });
  it('includes a Submit button', () => {
    expect(body).toMatch(/<button[^>]*data-action="submit"/);
  });
  it('uses no CSS transition / animation / transform', () => {
    expect(css).not.toMatch(/\b(?:transition|animation|transform)\s*:/);
  });
  it('emits JS handling move-up, move-down, submit, and announce calls', () => {
    expect(js).toContain('addEventListener');
    expect(js).toContain('__announce');
    expect(js).toMatch(/data-action="(?:up|down|submit)"/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=packages/canvas-design-studio -- widget/catalog/sortable-ordering`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Write the implementation**

```ts
// packages/canvas-design-studio/src/tools/widget/catalog/sortable-ordering.ts

import { z } from 'zod';
import type { Renderer, Result, InteractiveSpec } from '../types.js';

const Item = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
});

const SortableContent = z.object({
  items: z.array(Item).min(2),
  correctOrder: z.array(z.string().min(1)).min(2),
}).refine(
  (v) => v.correctOrder.length === v.items.length,
  { message: 'correctOrder.length must equal items.length' },
).refine(
  (v) => v.correctOrder.every((id) => v.items.some((it) => it.id === id)),
  { message: 'correctOrder contains an id not present in items' },
);

type SortableContent = z.infer<typeof SortableContent>;

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export const sortableOrderingRenderer: Renderer<SortableContent> = {
  kind: 'sortable-ordering',
  contentSchema: SortableContent,

  validateContent(content): Result<SortableContent> {
    const parsed = SortableContent.safeParse(content);
    if (parsed.success) return { ok: true, value: parsed.data };
    return { ok: false, error: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') };
  },

  render(content, _spec: InteractiveSpec) {
    const total = content.items.length;
    const itemsHtml = content.items.map((it, i) => `
  <li
    class="sortable-item"
    data-id="${escapeHtml(it.id)}"
    aria-label="Item ${i + 1} of ${total}: ${escapeHtml(it.label)}, currently at position ${i + 1}"
    tabindex="0"
  >
    <span class="item-label">${escapeHtml(it.label)}</span>
    <span class="item-controls">
      <button type="button" class="touch-target move-btn" data-action="up" aria-label="Move ${escapeHtml(it.label)} up">&#9650;</button>
      <button type="button" class="touch-target move-btn" data-action="down" aria-label="Move ${escapeHtml(it.label)} down">&#9660;</button>
    </span>
  </li>`).join('');

    const body = `<div class="sortable-wrapper">
  <ol class="sortable-list" role="list">${itemsHtml}
  </ol>
  <button type="button" class="touch-target submit-btn" data-action="submit" aria-label="Submit your ordering">Submit</button>
  <div class="result" role="status"></div>
</div>`;

    const css = `
.sortable-wrapper { padding: 16px; }
.sortable-list { list-style: decimal inside; padding: 0; margin: 0 0 16px; }
.sortable-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #ffffff;
  border: 2px solid #0033A0;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 8px;
}
.sortable-item:focus-within { background: #E6ECF9; }
.item-controls { display: flex; }
.item-controls > * { margin-left: 4px; }
.move-btn, .submit-btn {
  background: #ffffff;
  border: 1px solid #0033A0;
  border-radius: 4px;
  cursor: pointer;
  font-size: 16px;
  padding: 4px 12px;
}
.submit-btn { background: #0033A0; color: #ffffff; padding: 10px 20px; font-weight: bold; }
.sortable-item.correct { border-color: #3B6D11; background: #EAF3DE; }
.sortable-item.wrong { border-color: #A32D2D; background: #FCEBEB; }
.result { margin-top: 12px; font-weight: bold; }
`.trim();

    const correctOrderJson = JSON.stringify(content.correctOrder);
    const js = `
(function() {
  var list = document.querySelector('.sortable-list');
  var items = function() { return Array.prototype.slice.call(list.querySelectorAll('.sortable-item')); };
  var correctOrder = ${correctOrderJson};
  function relabel() {
    var arr = items();
    var total = arr.length;
    for (var i = 0; i < arr.length; i++) {
      var label = arr[i].querySelector('.item-label').textContent;
      arr[i].setAttribute('aria-label', 'Item ' + (i + 1) + ' of ' + total + ': ' + label + ', currently at position ' + (i + 1));
    }
  }
  function move(item, direction) {
    var arr = items();
    var idx = arr.indexOf(item);
    if (direction === 'up' && idx > 0) {
      list.insertBefore(item, arr[idx - 1]);
      relabel();
      window.__announce(item.querySelector('.item-label').textContent + ' moved up to position ' + idx + ' of ' + arr.length);
    } else if (direction === 'down' && idx < arr.length - 1) {
      list.insertBefore(arr[idx + 1], item);
      relabel();
      window.__announce(item.querySelector('.item-label').textContent + ' moved down to position ' + (idx + 2) + ' of ' + arr.length);
    }
  }
  list.addEventListener('click', function(e) {
    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    var item = btn.closest('.sortable-item');
    if (item && (btn.getAttribute('data-action') === 'up' || btn.getAttribute('data-action') === 'down')) {
      move(item, btn.getAttribute('data-action'));
    }
  });
  document.querySelector('.submit-btn').addEventListener('click', function() {
    var arr = items();
    var correctCount = 0;
    for (var i = 0; i < arr.length; i++) {
      var ok = arr[i].getAttribute('data-id') === correctOrder[i];
      arr[i].classList.remove('correct', 'wrong');
      arr[i].classList.add(ok ? 'correct' : 'wrong');
      if (ok) correctCount++;
    }
    var msg = correctCount + ' of ' + arr.length + ' items are in the correct position.';
    document.querySelector('.result').textContent = msg;
    window.__announce(msg);
  });
})();
`.trim();

    return { body, css, js };
  },
};
```

- [ ] **Step 4: Register renderer in CATALOG and add FIXTURE_CONTENT**

Edit `packages/canvas-design-studio/src/tools/widget/catalog/index.ts` to add:

```ts
import { sortableOrderingRenderer } from './sortable-ordering.js';

export const CATALOG: Partial<Record<WidgetKind, Renderer>> = {
  'card-flip-reveal': cardFlipRevealRenderer,
  'sortable-ordering': sortableOrderingRenderer,
};
```

Edit `packages/canvas-design-studio/tests/widget/catalog/contract-assertions.test.ts`:

Replace `'sortable-ordering': {} as Record<string, unknown>,` with:

```ts
'sortable-ordering': {
  items: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }],
  correctOrder: ['a', 'b', 'c'],
},
```

- [ ] **Step 5: Run tests and verify they pass**

Run: `npm test --workspace=packages/canvas-design-studio -- widget/catalog/sortable-ordering`
Expected: ~13 tests pass.

Run: `npm test --workspace=packages/canvas-design-studio -- widget/catalog/contract-assertions`
Expected: 12 contract assertions pass (6 for card-flip-reveal + 6 for sortable-ordering).

- [ ] **Step 6: Build**

Run: `npm run build --workspace=packages/canvas-design-studio`
Expected: builds clean.

- [ ] **Step 7: Commit**

```bash
git add packages/canvas-design-studio/src/tools/widget/catalog/sortable-ordering.ts packages/canvas-design-studio/src/tools/widget/catalog/index.ts packages/canvas-design-studio/tests/widget/catalog/sortable-ordering.test.ts packages/canvas-design-studio/tests/widget/catalog/contract-assertions.test.ts
git commit -m "feat(cds): sortable-ordering renderer with dual-mode a11y

Zod schema: { items: [{id,label}], correctOrder: [id,...] } with cross-field
checks (length match, id membership). Render emits ordered list with each item
exposing explicit Move Up / Move Down buttons next to the label (the dual-mode
a11y fallback for screen-reader users not fluent in WAI-ARIA grab/drop).
Submit highlights correctly-placed items in green and wrong ones in red,
announces aggregate score via __announce.

CATALOG and FIXTURE_CONTENT updated so the shared contract harness picks up
the new renderer automatically."
```

### Task B1.2: `drag-to-categorize` renderer (dual-mode a11y)

**Files:**
- Create: `packages/canvas-design-studio/src/tools/widget/catalog/drag-to-categorize.ts`
- Create: `packages/canvas-design-studio/tests/widget/catalog/drag-to-categorize.test.ts`
- Modify: `packages/canvas-design-studio/src/tools/widget/catalog/index.ts`
- Modify: `packages/canvas-design-studio/tests/widget/catalog/contract-assertions.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/canvas-design-studio/tests/widget/catalog/drag-to-categorize.test.ts
import { describe, expect, it } from 'vitest';
import { dragToCategorizeRenderer } from '../../../src/tools/widget/catalog/drag-to-categorize.js';
import type { InteractiveSpec } from '../../../src/tools/widget/types.js';

const baseSpec: InteractiveSpec = {
  id: 'data-types', name: 'Data Types', kind: 'drag-to-categorize', purpose: 'categorize',
  contentSchema: {}, initialContent: {},
  dimensions: { minHeight: 400, maxHeight: 700 },
  accessibility: { keyboardEquivalent: 'Tab to item; choose a bin from the dropdown.', screenReaderSummary: 'Three items, two bins.', minTouchTarget: 44 },
};

const goodContent = {
  items: [
    { id: 'int', label: 'Integer', correctBin: 'numeric' },
    { id: 'str', label: 'String', correctBin: 'text' },
    { id: 'flt', label: 'Float', correctBin: 'numeric' },
  ],
  bins: [
    { id: 'numeric', label: 'Numeric' },
    { id: 'text', label: 'Text' },
  ],
};

describe('dragToCategorizeRenderer schema', () => {
  it('accepts a well-formed content', () => {
    expect(dragToCategorizeRenderer.validateContent(goodContent).ok).toBe(true);
  });
  it('rejects empty items', () => {
    expect(dragToCategorizeRenderer.validateContent({ items: [], bins: goodContent.bins }).ok).toBe(false);
  });
  it('rejects empty bins', () => {
    expect(dragToCategorizeRenderer.validateContent({ items: goodContent.items, bins: [] }).ok).toBe(false);
  });
  it('rejects item.correctBin not in bins', () => {
    expect(dragToCategorizeRenderer.validateContent({
      items: [{ id: 'x', label: 'X', correctBin: 'BOGUS' }],
      bins: goodContent.bins,
    }).ok).toBe(false);
  });
  it('rejects items missing fields', () => {
    expect(dragToCategorizeRenderer.validateContent({ items: [{ id: 'x', label: 'X' }], bins: goodContent.bins }).ok).toBe(false);
  });
});

describe('dragToCategorizeRenderer render output', () => {
  const validated = dragToCategorizeRenderer.validateContent(goodContent);
  if (!validated.ok) throw new Error('fixture invalid');
  const { body, css, js } = dragToCategorizeRenderer.render(validated.value, baseSpec);

  it('renders one draggable item per items entry', () => {
    expect((body.match(/data-item-id="/g) ?? []).length).toBe(3);
  });
  it('renders one bin per bins entry', () => {
    expect((body.match(/data-bin-id="/g) ?? []).length).toBe(2);
  });
  it('each item has an explicit "Move to bin" select (dual-mode fallback)', () => {
    expect((body.match(/<select[^>]*data-action="move-to-bin"/g) ?? []).length).toBe(3);
  });
  it('escapes labels', () => {
    const evil = dragToCategorizeRenderer.validateContent({
      items: [{ id: 'x', label: '<x>', correctBin: 'numeric' }],
      bins: goodContent.bins,
    });
    if (!evil.ok) throw new Error('escape fixture invalid');
    const out = dragToCategorizeRenderer.render(evil.value, baseSpec);
    expect(out.body).not.toContain('<x>');
    expect(out.body).toContain('&lt;x&gt;');
  });
  it('no transition/animation/transform CSS', () => {
    expect(css).not.toMatch(/\b(?:transition|animation|transform)\s*:/);
  });
  it('JS handles select change + submit + announce', () => {
    expect(js).toContain('addEventListener');
    expect(js).toContain('__announce');
    expect(js).toMatch(/change|submit/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=packages/canvas-design-studio -- widget/catalog/drag-to-categorize`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Write the implementation**

```ts
// packages/canvas-design-studio/src/tools/widget/catalog/drag-to-categorize.ts

import { z } from 'zod';
import type { Renderer, Result, InteractiveSpec } from '../types.js';

const Item = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  correctBin: z.string().min(1),
});

const Bin = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
});

const CategorizeContent = z.object({
  items: z.array(Item).min(1),
  bins: z.array(Bin).min(2),
}).refine(
  (v) => v.items.every((it) => v.bins.some((b) => b.id === it.correctBin)),
  { message: 'item.correctBin must reference a bin id' },
);

type CategorizeContent = z.infer<typeof CategorizeContent>;

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export const dragToCategorizeRenderer: Renderer<CategorizeContent> = {
  kind: 'drag-to-categorize',
  contentSchema: CategorizeContent,

  validateContent(content): Result<CategorizeContent> {
    const parsed = CategorizeContent.safeParse(content);
    if (parsed.success) return { ok: true, value: parsed.data };
    return { ok: false, error: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') };
  },

  render(content, _spec: InteractiveSpec) {
    const binOptions = content.bins.map(b => `<option value="${escapeHtml(b.id)}">${escapeHtml(b.label)}</option>`).join('');
    const itemsHtml = content.items.map((it) => `
  <li class="cat-item" data-item-id="${escapeHtml(it.id)}" data-correct-bin="${escapeHtml(it.correctBin)}">
    <span class="item-label">${escapeHtml(it.label)}</span>
    <label class="item-bin-label" for="bin-for-${escapeHtml(it.id)}">Move to bin: </label>
    <select id="bin-for-${escapeHtml(it.id)}" class="touch-target" data-action="move-to-bin" aria-label="Move ${escapeHtml(it.label)} to bin">
      <option value="">(unassigned)</option>
      ${binOptions}
    </select>
  </li>`).join('');

    const binsHtml = content.bins.map(b => `
  <div class="cat-bin" data-bin-id="${escapeHtml(b.id)}" aria-label="Bin: ${escapeHtml(b.label)}">
    <h3 class="bin-label">${escapeHtml(b.label)}</h3>
    <ul class="bin-contents" role="list" aria-label="${escapeHtml(b.label)} bin contents"></ul>
  </div>`).join('');

    const body = `<div class="cat-wrapper">
  <h2 class="cat-heading">Items</h2>
  <ul class="cat-items" role="list">${itemsHtml}
  </ul>
  <h2 class="cat-heading">Bins</h2>
  <div class="cat-bins">${binsHtml}
  </div>
  <button type="button" class="touch-target submit-btn" data-action="submit" aria-label="Submit your categorization">Submit</button>
  <div class="result" role="status"></div>
</div>`;

    const css = `
.cat-wrapper { padding: 16px; }
.cat-heading { font-size: 18px; margin: 12px 0 8px; }
.cat-items { list-style: none; padding: 0; }
.cat-item {
  background: #ffffff;
  border: 2px solid #0033A0;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 8px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
}
.item-label { font-weight: bold; margin-right: 12px; }
.item-bin-label { margin-right: 4px; }
.cat-bins { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); }
.cat-bins > * { margin: 8px; }
.cat-bin {
  background: #F4F3EF;
  border: 2px solid #e0e0d8;
  border-radius: 8px;
  padding: 12px;
  min-height: 100px;
}
.bin-label { margin: 0 0 8px; font-size: 16px; }
.bin-contents { list-style: none; padding: 0; margin: 0; min-height: 60px; }
.bin-contents li { background: #ffffff; padding: 8px; margin: 4px 0; border-radius: 4px; border: 1px solid #0033A0; }
.submit-btn { background: #0033A0; color: #ffffff; border: none; border-radius: 4px; padding: 10px 20px; font-weight: bold; cursor: pointer; margin-top: 12px; }
.cat-item.correct { border-color: #3B6D11; background: #EAF3DE; }
.cat-item.wrong { border-color: #A32D2D; background: #FCEBEB; }
.result { margin-top: 12px; font-weight: bold; }
`.trim();

    const js = `
(function() {
  var assignments = {}; // itemId -> binId
  var items = document.querySelectorAll('.cat-item');
  items.forEach(function(item) {
    var sel = item.querySelector('[data-action="move-to-bin"]');
    sel.addEventListener('change', function() {
      var itemId = item.getAttribute('data-item-id');
      var binId = sel.value;
      assignments[itemId] = binId;
      var label = item.querySelector('.item-label').textContent;
      var binLabel = binId
        ? (document.querySelector('.cat-bin[data-bin-id="' + binId + '"] .bin-label').textContent)
        : 'unassigned';
      // Move the visible chip into the bin
      document.querySelectorAll('.bin-contents li[data-from-item="' + itemId + '"]').forEach(function(li){ li.remove(); });
      if (binId) {
        var chip = document.createElement('li');
        chip.setAttribute('data-from-item', itemId);
        chip.textContent = label;
        document.querySelector('.cat-bin[data-bin-id="' + binId + '"] .bin-contents').appendChild(chip);
      }
      window.__announce(label + ' moved to ' + binLabel + '.');
    });
  });
  document.querySelector('.submit-btn').addEventListener('click', function() {
    var correct = 0;
    items.forEach(function(item) {
      var itemId = item.getAttribute('data-item-id');
      var correctBin = item.getAttribute('data-correct-bin');
      var assigned = assignments[itemId];
      item.classList.remove('correct', 'wrong');
      if (assigned === correctBin) { item.classList.add('correct'); correct++; }
      else { item.classList.add('wrong'); }
    });
    var msg = correct + ' of ' + items.length + ' items in the correct bin.';
    document.querySelector('.result').textContent = msg;
    window.__announce(msg);
  });
})();
`.trim();

    return { body, css, js };
  },
};
```

- [ ] **Step 4: Register in CATALOG and FIXTURE_CONTENT**

Edit `packages/canvas-design-studio/src/tools/widget/catalog/index.ts`:

```ts
import { dragToCategorizeRenderer } from './drag-to-categorize.js';

export const CATALOG: Partial<Record<WidgetKind, Renderer>> = {
  'card-flip-reveal': cardFlipRevealRenderer,
  'sortable-ordering': sortableOrderingRenderer,
  'drag-to-categorize': dragToCategorizeRenderer,
};
```

Edit `contract-assertions.test.ts`, replace `'drag-to-categorize': {} as ...`:

```ts
'drag-to-categorize': {
  items: [{ id: 'a', label: 'A', correctBin: 'b1' }],
  bins: [{ id: 'b1', label: 'B1' }, { id: 'b2', label: 'B2' }],
},
```

- [ ] **Step 5: Run tests + build**

Run: `npm test --workspace=packages/canvas-design-studio -- widget/catalog/drag-to-categorize`
Expected: ~12 tests pass.

Run: `npm test --workspace=packages/canvas-design-studio -- widget/catalog/contract-assertions`
Expected: 18 contract assertions pass (6 for each of 3 renderers).

Run: `npm run build --workspace=packages/canvas-design-studio`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add packages/canvas-design-studio/src/tools/widget/catalog/drag-to-categorize.ts packages/canvas-design-studio/src/tools/widget/catalog/index.ts packages/canvas-design-studio/tests/widget/catalog/drag-to-categorize.test.ts packages/canvas-design-studio/tests/widget/catalog/contract-assertions.test.ts
git commit -m "feat(cds): drag-to-categorize renderer with explicit bin-select fallback

Schema: { items: [{id,label,correctBin}], bins: [{id,label}] } with cross-field
check (item.correctBin must reference a bin id). Render shows items list with
each item exposing an explicit 'Move to bin' <select> (dual-mode fallback).
Visible chips show in the chosen bin. Submit highlights correct vs wrong with
green/red borders and announces aggregate score."
```

### Task B1.3: `branching-scenario` renderer

**Files:**
- Create: `packages/canvas-design-studio/src/tools/widget/catalog/branching-scenario.ts`
- Create: `packages/canvas-design-studio/tests/widget/catalog/branching-scenario.test.ts`
- Modify: catalog/index.ts and contract-assertions.test.ts

- [ ] **Step 1: Write the failing test**

```ts
// packages/canvas-design-studio/tests/widget/catalog/branching-scenario.test.ts
import { describe, expect, it } from 'vitest';
import { branchingScenarioRenderer } from '../../../src/tools/widget/catalog/branching-scenario.js';
import type { InteractiveSpec } from '../../../src/tools/widget/types.js';

const baseSpec: InteractiveSpec = {
  id: 'arch-choices', name: 'Architecture Choices', kind: 'branching-scenario', purpose: 'decisions',
  contentSchema: {}, initialContent: {},
  dimensions: { minHeight: 400, maxHeight: 800 },
  accessibility: { keyboardEquivalent: 'Tab to choice; Enter to select.', screenReaderSummary: 'Branching scenario.', minTouchTarget: 44 },
};

const goodContent = {
  start: 'start',
  nodes: {
    start: { prompt: 'You inherit a slow query. What do you do?', choices: [
      { label: 'Add an index', nextNodeId: 'index', consequence: 'Indexes speed up reads.' },
      { label: 'Rewrite as a join', nextNodeId: 'join', consequence: 'Joins can be costly.' },
    ]},
    index: { prompt: 'The query is fast now. The team asks what other indexes to add.', choices: [
      { label: 'Profile first', nextNodeId: 'done', consequence: 'Wise choice.' },
    ]},
    join: { prompt: 'The join hits a memory limit on prod.', choices: [
      { label: 'Roll back', nextNodeId: 'done', consequence: 'Stability first.' },
    ]},
    done: { prompt: 'Scenario complete.', choices: [], isEnd: true },
  },
};

describe('branchingScenarioRenderer schema', () => {
  it('accepts well-formed scenario', () => {
    expect(branchingScenarioRenderer.validateContent(goodContent).ok).toBe(true);
  });
  it('rejects start pointing to a missing node', () => {
    const bad = { ...goodContent, start: 'nope' };
    expect(branchingScenarioRenderer.validateContent(bad).ok).toBe(false);
  });
  it('rejects choice nextNodeId pointing to a missing node', () => {
    const bad = {
      start: 'a',
      nodes: { a: { prompt: 'p', choices: [{ label: 'go', nextNodeId: 'BOGUS' }] } },
    };
    expect(branchingScenarioRenderer.validateContent(bad).ok).toBe(false);
  });
  it('rejects empty nodes object', () => {
    expect(branchingScenarioRenderer.validateContent({ start: 'a', nodes: {} }).ok).toBe(false);
  });
});

describe('branchingScenarioRenderer render output', () => {
  const validated = branchingScenarioRenderer.validateContent(goodContent);
  if (!validated.ok) throw new Error('fixture invalid');
  const { body, css, js } = branchingScenarioRenderer.render(validated.value, baseSpec);

  it('renders the start node prompt initially', () => {
    expect(body).toContain('slow query');
  });
  it('renders one button per starting choice', () => {
    expect((body.match(/data-next-node-id="/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
  it('escapes prompts and labels', () => {
    const evil = branchingScenarioRenderer.validateContent({
      start: 'a',
      nodes: { a: { prompt: '<x>', choices: [{ label: '<y>', nextNodeId: 'a' }] } },
    });
    if (!evil.ok) throw new Error('escape fixture invalid');
    const out = branchingScenarioRenderer.render(evil.value, baseSpec);
    expect(out.body).not.toContain('<x>');
    expect(out.body).not.toContain('<y>');
  });
  it('serializes the scenario data as inline JSON for JS lookup', () => {
    expect(js).toContain('start');
    expect(js).toContain('nodes');
  });
  it('JS handles click and announces', () => {
    expect(js).toContain('addEventListener');
    expect(js).toContain('__announce');
  });
  it('no transition/animation/transform CSS', () => {
    expect(css).not.toMatch(/\b(?:transition|animation|transform)\s*:/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=packages/canvas-design-studio -- widget/catalog/branching-scenario`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Write the implementation**

```ts
// packages/canvas-design-studio/src/tools/widget/catalog/branching-scenario.ts

import { z } from 'zod';
import type { Renderer, Result, InteractiveSpec } from '../types.js';

const Choice = z.object({
  label: z.string().min(1),
  nextNodeId: z.string().min(1),
  consequence: z.string().optional(),
});

const Node = z.object({
  prompt: z.string().min(1),
  choices: z.array(Choice),
  isEnd: z.boolean().optional(),
});

const BranchingContent = z.object({
  start: z.string().min(1),
  nodes: z.record(z.string().min(1), Node),
}).refine(
  (v) => Object.keys(v.nodes).length >= 1,
  { message: 'nodes must be non-empty' },
).refine(
  (v) => v.start in v.nodes,
  { message: 'start must reference an existing node id' },
).refine(
  (v) => Object.values(v.nodes).every(n => n.choices.every(c => c.nextNodeId in v.nodes)),
  { message: 'every choice.nextNodeId must reference an existing node id' },
);

type BranchingContent = z.infer<typeof BranchingContent>;

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export const branchingScenarioRenderer: Renderer<BranchingContent> = {
  kind: 'branching-scenario',
  contentSchema: BranchingContent,

  validateContent(content): Result<BranchingContent> {
    const parsed = BranchingContent.safeParse(content);
    if (parsed.success) return { ok: true, value: parsed.data };
    return { ok: false, error: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') };
  },

  render(content, _spec: InteractiveSpec) {
    const startNode = content.nodes[content.start]!;
    const choicesHtml = startNode.choices.map((c, i) => `
    <button type="button" class="choice-btn touch-target" data-next-node-id="${escapeHtml(c.nextNodeId)}" aria-label="Choice ${i + 1}: ${escapeHtml(c.label)}">${escapeHtml(c.label)}</button>`).join('');

    const body = `<div class="scenario-wrapper">
  <div class="consequence" role="status"></div>
  <div class="scenario-prompt" id="scenario-prompt">${escapeHtml(startNode.prompt)}</div>
  <div class="scenario-choices">${choicesHtml}
  </div>
  <button type="button" class="restart-btn touch-target" style="display:none;" aria-label="Restart scenario">Restart</button>
</div>`;

    const css = `
.scenario-wrapper { padding: 16px; max-width: 720px; }
.scenario-prompt {
  background: #ffffff;
  border: 2px solid #0033A0;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
  font-size: 18px;
}
.scenario-choices { display: flex; flex-wrap: wrap; }
.scenario-choices > * { margin: 4px; }
.choice-btn, .restart-btn {
  background: #ffffff;
  border: 1px solid #0033A0;
  border-radius: 4px;
  cursor: pointer;
  font-size: 16px;
  padding: 10px 16px;
  font-family: inherit;
}
.choice-btn:hover { background: #E6ECF9; }
.restart-btn { background: #0033A0; color: #ffffff; border: none; }
.consequence {
  background: #E6F1FB;
  color: #185FA5;
  border: 1px solid #185FA5;
  border-radius: 4px;
  padding: 12px;
  margin-bottom: 12px;
  font-style: italic;
  min-height: 0;
}
.consequence:empty { display: none; }
`.trim();

    const dataJson = JSON.stringify({ start: content.start, nodes: content.nodes });
    const js = `
(function() {
  var data = ${dataJson};
  var promptEl = document.getElementById('scenario-prompt');
  var choicesEl = document.querySelector('.scenario-choices');
  var consequenceEl = document.querySelector('.consequence');
  var restartBtn = document.querySelector('.restart-btn');

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function renderNode(nodeId, consequence) {
    var node = data.nodes[nodeId];
    consequenceEl.textContent = consequence || '';
    promptEl.textContent = node.prompt;
    choicesEl.innerHTML = '';
    if (node.isEnd || !node.choices.length) {
      restartBtn.style.display = '';
      window.__announce((consequence ? consequence + ' ' : '') + node.prompt + ' (scenario complete)');
    } else {
      restartBtn.style.display = 'none';
      node.choices.forEach(function(c, i) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'choice-btn touch-target';
        btn.setAttribute('data-next-node-id', c.nextNodeId);
        btn.setAttribute('data-consequence', c.consequence || '');
        btn.setAttribute('aria-label', 'Choice ' + (i + 1) + ': ' + c.label);
        btn.textContent = c.label;
        choicesEl.appendChild(btn);
      });
      window.__announce((consequence ? consequence + ' ' : '') + node.prompt);
    }
  }

  choicesEl.addEventListener('click', function(e) {
    var btn = e.target.closest('.choice-btn');
    if (!btn) return;
    renderNode(btn.getAttribute('data-next-node-id'), btn.getAttribute('data-consequence'));
  });
  restartBtn.addEventListener('click', function() {
    renderNode(data.start, '');
  });
})();
`.trim();

    return { body, css, js };
  },
};
```

- [ ] **Step 4: Register in CATALOG and FIXTURE_CONTENT**

Edit catalog/index.ts to add `'branching-scenario': branchingScenarioRenderer,`.

Edit contract-assertions.test.ts:

```ts
'branching-scenario': {
  start: 'a',
  nodes: {
    a: { prompt: 'p', choices: [{ label: 'go', nextNodeId: 'b' }] },
    b: { prompt: 'end', choices: [], isEnd: true },
  },
},
```

- [ ] **Step 5: Run tests + build**

Run: `npm test --workspace=packages/canvas-design-studio -- widget/catalog/branching-scenario`
Expected: ~10 tests pass.

Run: `npm run build --workspace=packages/canvas-design-studio`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add packages/canvas-design-studio/src/tools/widget/catalog/branching-scenario.ts packages/canvas-design-studio/src/tools/widget/catalog/index.ts packages/canvas-design-studio/tests/widget/catalog/branching-scenario.test.ts packages/canvas-design-studio/tests/widget/catalog/contract-assertions.test.ts
git commit -m "feat(cds): branching-scenario renderer

State machine over a {start, nodes} graph. Each node has prompt + choices;
choices fire transitions and may carry a consequence string surfaced above
the next prompt. End nodes show a Restart button. Schema enforces referential
integrity (start exists; every choice.nextNodeId exists)."
```

### Task B1.4: `multi-step-reveal` renderer

**Files:**
- Create: `packages/canvas-design-studio/src/tools/widget/catalog/multi-step-reveal.ts`
- Create: `packages/canvas-design-studio/tests/widget/catalog/multi-step-reveal.test.ts`
- Modify: catalog/index.ts and contract-assertions.test.ts

- [ ] **Step 1: Write the failing test**

```ts
// packages/canvas-design-studio/tests/widget/catalog/multi-step-reveal.test.ts
import { describe, expect, it } from 'vitest';
import { multiStepRevealRenderer } from '../../../src/tools/widget/catalog/multi-step-reveal.js';
import type { InteractiveSpec } from '../../../src/tools/widget/types.js';

const baseSpec: InteractiveSpec = {
  id: 'formula-walk', name: 'Formula Walkthrough', kind: 'multi-step-reveal', purpose: 'walk',
  contentSchema: {}, initialContent: {},
  dimensions: { minHeight: 300, maxHeight: 600 },
  accessibility: { keyboardEquivalent: 'Arrow keys or Prev/Next buttons.', screenReaderSummary: 'Five-step walkthrough.', minTouchTarget: 44 },
};

const goodContent = {
  steps: [
    { title: 'Step 1', body: 'Start.' },
    { title: 'Step 2', body: 'Middle.' },
    { title: 'Step 3', body: 'End.' },
  ],
};

describe('multiStepRevealRenderer schema', () => {
  it('accepts well-formed steps', () => {
    expect(multiStepRevealRenderer.validateContent(goodContent).ok).toBe(true);
  });
  it('rejects empty steps', () => {
    expect(multiStepRevealRenderer.validateContent({ steps: [] }).ok).toBe(false);
  });
  it('rejects step missing title', () => {
    expect(multiStepRevealRenderer.validateContent({ steps: [{ body: 'x' }] }).ok).toBe(false);
  });
  it('rejects step missing body', () => {
    expect(multiStepRevealRenderer.validateContent({ steps: [{ title: 'x' }] }).ok).toBe(false);
  });
});

describe('multiStepRevealRenderer render output', () => {
  const validated = multiStepRevealRenderer.validateContent(goodContent);
  if (!validated.ok) throw new Error('fixture invalid');
  const { body, css, js } = multiStepRevealRenderer.render(validated.value, baseSpec);

  it('renders the first step initially visible', () => {
    expect(body).toContain('Start.');
  });
  it('has Previous and Next buttons', () => {
    expect(body).toMatch(/data-action="prev"/);
    expect(body).toMatch(/data-action="next"/);
  });
  it('shows step counter', () => {
    expect(body).toMatch(/Step 1 of 3|1 of 3/);
  });
  it('escapes content', () => {
    const evil = multiStepRevealRenderer.validateContent({ steps: [{ title: '<t>', body: '<b>' }] });
    if (!evil.ok) throw new Error('escape fixture invalid');
    const out = multiStepRevealRenderer.render(evil.value, baseSpec);
    expect(out.body).not.toContain('<t>');
    expect(out.body).not.toContain('<b>');
  });
  it('JS handles next/prev clicks + Arrow keys + announces', () => {
    expect(js).toContain('addEventListener');
    expect(js).toContain('__announce');
    expect(js).toMatch(/ArrowRight|ArrowLeft|key/);
  });
  it('no transition/animation/transform CSS', () => {
    expect(css).not.toMatch(/\b(?:transition|animation|transform)\s*:/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=packages/canvas-design-studio -- widget/catalog/multi-step-reveal`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Write the implementation**

```ts
// packages/canvas-design-studio/src/tools/widget/catalog/multi-step-reveal.ts

import { z } from 'zod';
import type { Renderer, Result, InteractiveSpec } from '../types.js';

const Step = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
});

const MultiStepContent = z.object({
  steps: z.array(Step).min(1),
});

type MultiStepContent = z.infer<typeof MultiStepContent>;

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export const multiStepRevealRenderer: Renderer<MultiStepContent> = {
  kind: 'multi-step-reveal',
  contentSchema: MultiStepContent,

  validateContent(content): Result<MultiStepContent> {
    const parsed = MultiStepContent.safeParse(content);
    if (parsed.success) return { ok: true, value: parsed.data };
    return { ok: false, error: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') };
  },

  render(content, _spec: InteractiveSpec) {
    const total = content.steps.length;
    const first = content.steps[0]!;

    const body = `<div class="walk-wrapper" role="region" aria-label="Step-by-step walkthrough">
  <div class="walk-counter" aria-live="polite">Step 1 of ${total}</div>
  <h2 class="walk-title" id="walk-title">${escapeHtml(first.title)}</h2>
  <div class="walk-body" id="walk-body">${escapeHtml(first.body)}</div>
  <div class="walk-controls">
    <button type="button" class="touch-target walk-btn" data-action="prev" aria-label="Previous step" disabled>&#9664; Previous</button>
    <button type="button" class="touch-target walk-btn" data-action="next" aria-label="Next step">Next &#9654;</button>
  </div>
</div>`;

    const css = `
.walk-wrapper { padding: 16px; max-width: 720px; }
.walk-counter { font-size: 14px; color: #555550; margin-bottom: 8px; }
.walk-title { font-size: 20px; margin: 0 0 8px; color: #0033A0; }
.walk-body {
  background: #ffffff;
  border: 2px solid #0033A0;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
  min-height: 80px;
}
.walk-controls { display: flex; }
.walk-controls > * { margin-right: 8px; }
.walk-btn {
  background: #0033A0;
  color: #ffffff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 16px;
  padding: 10px 16px;
  font-family: inherit;
}
.walk-btn[disabled] { background: #cccccc; cursor: not-allowed; }
`.trim();

    const stepsJson = JSON.stringify(content.steps);
    const js = `
(function() {
  var steps = ${stepsJson};
  var idx = 0;
  var titleEl = document.getElementById('walk-title');
  var bodyEl = document.getElementById('walk-body');
  var counterEl = document.querySelector('.walk-counter');
  var prevBtn = document.querySelector('[data-action="prev"]');
  var nextBtn = document.querySelector('[data-action="next"]');
  function render() {
    titleEl.textContent = steps[idx].title;
    bodyEl.textContent = steps[idx].body;
    counterEl.textContent = 'Step ' + (idx + 1) + ' of ' + steps.length;
    prevBtn.disabled = idx === 0;
    nextBtn.disabled = idx === steps.length - 1;
    window.__announce('Step ' + (idx + 1) + ' of ' + steps.length + ': ' + steps[idx].title + '. ' + steps[idx].body);
  }
  prevBtn.addEventListener('click', function() { if (idx > 0) { idx--; render(); } });
  nextBtn.addEventListener('click', function() { if (idx < steps.length - 1) { idx++; render(); } });
  document.addEventListener('keydown', function(e) {
    if (e.key === 'ArrowRight' && idx < steps.length - 1) { e.preventDefault(); idx++; render(); }
    if (e.key === 'ArrowLeft' && idx > 0) { e.preventDefault(); idx--; render(); }
  });
})();
`.trim();

    return { body, css, js };
  },
};
```

- [ ] **Step 4: Register in CATALOG and FIXTURE_CONTENT**

Edit catalog/index.ts to add `'multi-step-reveal': multiStepRevealRenderer,`.

Edit contract-assertions.test.ts:

```ts
'multi-step-reveal': {
  steps: [{ title: 'T1', body: 'B1' }, { title: 'T2', body: 'B2' }],
},
```

- [ ] **Step 5: Run tests + build**

Run: `npm test --workspace=packages/canvas-design-studio -- widget/catalog/multi-step-reveal`
Expected: ~10 tests pass.

Run: `npm run build --workspace=packages/canvas-design-studio`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add packages/canvas-design-studio/src/tools/widget/catalog/multi-step-reveal.ts packages/canvas-design-studio/src/tools/widget/catalog/index.ts packages/canvas-design-studio/tests/widget/catalog/multi-step-reveal.test.ts packages/canvas-design-studio/tests/widget/catalog/contract-assertions.test.ts
git commit -m "feat(cds): multi-step-reveal renderer

Guided walkthrough over an array of {title, body} steps. Prev/Next buttons
+ ArrowLeft/ArrowRight keyboard navigation. Step counter shown above the
content. Disabled state on Prev at start, Next at end. Announces every
step change via __announce."
```

### Task B1.5: `hotspot-image` renderer

**Files:**
- Create: `packages/canvas-design-studio/src/tools/widget/catalog/hotspot-image.ts`
- Create: `packages/canvas-design-studio/tests/widget/catalog/hotspot-image.test.ts`
- Modify: catalog/index.ts and contract-assertions.test.ts

NOTE: `hotspot-image` is the only renderer that legitimately uses an external `<img src=>`. The contract-assertion harness only forbids external `<link>` / `<script>` / `<iframe>` — images are allowed. The brainstorm tool's spec for this kind should specify `imageUrl` as a Canvas Files URL or data URL.

- [ ] **Step 1: Write the failing test**

```ts
// packages/canvas-design-studio/tests/widget/catalog/hotspot-image.test.ts
import { describe, expect, it } from 'vitest';
import { hotspotImageRenderer } from '../../../src/tools/widget/catalog/hotspot-image.js';
import type { InteractiveSpec } from '../../../src/tools/widget/types.js';

const baseSpec: InteractiveSpec = {
  id: 'excel-ribbon', name: 'Excel Ribbon Tour', kind: 'hotspot-image', purpose: 'tour',
  contentSchema: {}, initialContent: {},
  dimensions: { minHeight: 400, maxHeight: 800 },
  accessibility: { keyboardEquivalent: 'Tab through hotspots; Enter reveals info.', screenReaderSummary: 'Annotated image with 3 hotspots.', minTouchTarget: 44 },
};

const goodContent = {
  imageUrl: 'https://example.canvas/excel-ribbon.png',
  imageAlt: 'Excel ribbon with the Home tab active',
  hotspots: [
    { x: 10, y: 20, width: 80, height: 30, label: 'Paste', info: 'Insert clipboard content.' },
    { x: 110, y: 20, width: 80, height: 30, label: 'Font', info: 'Choose typeface and size.' },
  ],
};

describe('hotspotImageRenderer schema', () => {
  it('accepts well-formed content', () => {
    expect(hotspotImageRenderer.validateContent(goodContent).ok).toBe(true);
  });
  it('rejects empty hotspots', () => {
    expect(hotspotImageRenderer.validateContent({ ...goodContent, hotspots: [] }).ok).toBe(false);
  });
  it('rejects negative coordinates', () => {
    expect(hotspotImageRenderer.validateContent({
      ...goodContent,
      hotspots: [{ x: -1, y: 0, width: 10, height: 10, label: 'x', info: 'y' }],
    }).ok).toBe(false);
  });
  it('rejects missing imageUrl', () => {
    const bad: any = { ...goodContent };
    delete bad.imageUrl;
    expect(hotspotImageRenderer.validateContent(bad).ok).toBe(false);
  });
  it('rejects missing imageAlt', () => {
    const bad: any = { ...goodContent };
    delete bad.imageAlt;
    expect(hotspotImageRenderer.validateContent(bad).ok).toBe(false);
  });
});

describe('hotspotImageRenderer render output', () => {
  const validated = hotspotImageRenderer.validateContent(goodContent);
  if (!validated.ok) throw new Error('fixture invalid');
  const { body, css, js } = hotspotImageRenderer.render(validated.value, baseSpec);

  it('renders the image with alt text', () => {
    expect(body).toContain('<img');
    expect(body).toContain('alt="Excel ribbon with the Home tab active"');
  });
  it('renders one button per hotspot', () => {
    expect((body.match(/class="hotspot[^"]*"/g) ?? []).length).toBe(2);
  });
  it('hotspots positioned via inline style with percent/pixel coordinates', () => {
    expect(body).toMatch(/left:\s*10px/);
    expect(body).toMatch(/top:\s*20px/);
  });
  it('escapes hotspot labels and info', () => {
    const evil = hotspotImageRenderer.validateContent({
      ...goodContent,
      hotspots: [{ x: 0, y: 0, width: 10, height: 10, label: '<x>', info: '<y>' }],
    });
    if (!evil.ok) throw new Error('escape fixture invalid');
    const out = hotspotImageRenderer.render(evil.value, baseSpec);
    expect(out.body).not.toContain('<x>');
    expect(out.body).not.toContain('<y>');
  });
  it('JS handles click and announces', () => {
    expect(js).toContain('addEventListener');
    expect(js).toContain('__announce');
  });
  it('no transition/animation/transform CSS', () => {
    expect(css).not.toMatch(/\b(?:transition|animation|transform)\s*:/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=packages/canvas-design-studio -- widget/catalog/hotspot-image`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Write the implementation**

```ts
// packages/canvas-design-studio/src/tools/widget/catalog/hotspot-image.ts

import { z } from 'zod';
import type { Renderer, Result, InteractiveSpec } from '../types.js';

const Hotspot = z.object({
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  label: z.string().min(1),
  info: z.string().min(1),
});

const HotspotContent = z.object({
  imageUrl: z.string().min(1),
  imageAlt: z.string().min(1),
  hotspots: z.array(Hotspot).min(1),
});

type HotspotContent = z.infer<typeof HotspotContent>;

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export const hotspotImageRenderer: Renderer<HotspotContent> = {
  kind: 'hotspot-image',
  contentSchema: HotspotContent,

  validateContent(content): Result<HotspotContent> {
    const parsed = HotspotContent.safeParse(content);
    if (parsed.success) return { ok: true, value: parsed.data };
    return { ok: false, error: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') };
  },

  render(content, _spec: InteractiveSpec) {
    const total = content.hotspots.length;
    const hotspotsHtml = content.hotspots.map((h, i) => `
    <button
      type="button"
      class="hotspot touch-target"
      data-hotspot-id="${i}"
      data-info="${escapeHtml(h.info)}"
      style="left: ${h.x}px; top: ${h.y}px; width: ${h.width}px; height: ${h.height}px;"
      aria-label="Hotspot ${i + 1} of ${total}: ${escapeHtml(h.label)}"
    >${escapeHtml(h.label)}</button>`).join('');

    const body = `<div class="hotspot-wrapper">
  <div class="image-container">
    <img src="${escapeHtml(content.imageUrl)}" alt="${escapeHtml(content.imageAlt)}" aria-describedby="hotspot-help">
    <div class="hotspot-layer">${hotspotsHtml}
    </div>
  </div>
  <div id="hotspot-help" class="sr-only">This image has ${total} clickable hotspots. Tab through them and press Enter to reveal information.</div>
  <div class="hotspot-info" role="status" aria-live="polite">Select a hotspot to see details.</div>
</div>`;

    const css = `
.hotspot-wrapper { padding: 16px; }
.image-container { position: relative; display: inline-block; }
.image-container img { display: block; max-width: 100%; height: auto; }
.hotspot-layer { position: absolute; inset: 0; }
.hotspot {
  position: absolute;
  background: rgba(0, 51, 160, 0.4);
  border: 2px solid #0033A0;
  border-radius: 4px;
  color: #ffffff;
  font-weight: bold;
  cursor: pointer;
  font-family: inherit;
  font-size: 14px;
}
.hotspot:hover, .hotspot:focus { background: rgba(0, 51, 160, 0.7); }
.hotspot.active { background: rgba(0, 51, 160, 0.9); }
.hotspot-info {
  background: #E6F1FB;
  color: #185FA5;
  border: 1px solid #185FA5;
  border-radius: 4px;
  padding: 12px;
  margin-top: 12px;
  min-height: 40px;
}
`.trim();

    const js = `
(function() {
  var infoEl = document.querySelector('.hotspot-info');
  var hotspots = document.querySelectorAll('.hotspot');
  hotspots.forEach(function(h) {
    h.addEventListener('click', function() {
      hotspots.forEach(function(other) { other.classList.remove('active'); });
      h.classList.add('active');
      var info = h.getAttribute('data-info');
      var label = h.getAttribute('aria-label');
      infoEl.textContent = info;
      window.__announce(label + ': ' + info);
    });
  });
})();
`.trim();

    return { body, css, js };
  },
};
```

- [ ] **Step 4: Register in CATALOG and FIXTURE_CONTENT**

Edit catalog/index.ts to add `'hotspot-image': hotspotImageRenderer,`.

Edit contract-assertions.test.ts:

```ts
'hotspot-image': {
  imageUrl: 'data:image/png;base64,iVBORw0KGgo=',
  imageAlt: 'tiny test image',
  hotspots: [{ x: 0, y: 0, width: 10, height: 10, label: 'H', info: 'I' }],
},
```

NOTE: the contract assertion `has no external requests` checks for `<link>`, `<script>`, `<iframe>` http(s) — not `<img>`. Use a data: URL in the fixture to keep tests fully offline.

- [ ] **Step 5: Run tests + build**

Run: `npm test --workspace=packages/canvas-design-studio -- widget/catalog/hotspot-image`
Expected: ~12 tests pass.

Run: `npm test --workspace=packages/canvas-design-studio -- widget/catalog/contract-assertions`
Expected: 36 contract assertions pass (6 for each of 6 renderers).

Run: `npm run build --workspace=packages/canvas-design-studio`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add packages/canvas-design-studio/src/tools/widget/catalog/hotspot-image.ts packages/canvas-design-studio/src/tools/widget/catalog/index.ts packages/canvas-design-studio/tests/widget/catalog/hotspot-image.test.ts packages/canvas-design-studio/tests/widget/catalog/contract-assertions.test.ts
git commit -m "feat(cds): hotspot-image renderer — completes v1 catalog (6/6)

Image with absolutely-positioned <button> hotspots that reveal info on click
or Enter. The only catalog renderer that legitimately uses an external <img>
src (allowed by contract); brainstorm tool should generate Canvas Files URLs
or data: URLs. Schema validates non-negative integer coordinates + positive
dimensions. Info text shown in a live region announced on every selection.

All 6 V1 catalog renderers are now in CATALOG and exercised by the shared
contract-assertion harness (36 assertions total)."
```

---

## Phase B2 — Canvas Files API client

### Task B2.1: Implement Canvas Files 3-step upload client

**Files:**
- Create: `packages/canvas-design-studio/src/tools/widget/canvas-files.ts`
- Create: `packages/canvas-design-studio/tests/widget/canvas-files.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/canvas-design-studio/tests/widget/canvas-files.test.ts
import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest';
import { uploadCanvasFile, type CanvasConfig } from '../../src/tools/widget/canvas-files.js';

const cfg: CanvasConfig = { host: 'canvas.example.com', token: 'tk' };

describe('uploadCanvasFile', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  function mockInit(uploadUrl = 'https://s3.example/upload', fileParam = 'file') {
    return new Response(JSON.stringify({ upload_url: uploadUrl, upload_params: { key: 'k1', token: 't1' }, file_param: fileParam }), { status: 200 });
  }
  function mockPut(location = 'https://canvas.example.com/api/v1/files/confirm/42') {
    return new Response('', { status: 302, headers: { location } });
  }
  function mockConfirm(fileId = 42) {
    return new Response(JSON.stringify({ id: fileId, display_name: 'widget.html', url: 'https://canvas.example.com/files/42/preview' }), { status: 200 });
  }

  it('completes the 3-step upload and returns file_id + display_name', async () => {
    const f = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    f.mockResolvedValueOnce(mockInit());
    f.mockResolvedValueOnce(mockPut());
    f.mockResolvedValueOnce(mockConfirm(123));

    const result = await uploadCanvasFile(cfg, {
      courseId: 48895,
      filename: 'widget.html',
      contentType: 'text/html',
      body: '<!DOCTYPE html>...',
    });

    expect(result.fileId).toBe(123);
    expect(result.displayName).toBe('widget.html');
  });

  it('sends Authorization Bearer on the init call', async () => {
    const f = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    f.mockResolvedValueOnce(mockInit());
    f.mockResolvedValueOnce(mockPut());
    f.mockResolvedValueOnce(mockConfirm());

    await uploadCanvasFile(cfg, { courseId: 1, filename: 'x.html', contentType: 'text/html', body: 'x' });

    expect(f.mock.calls[0][1].headers.Authorization).toBe('Bearer tk');
  });

  it('passes on_duplicate=overwrite + parent_folder_path by default', async () => {
    const f = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    f.mockResolvedValueOnce(mockInit());
    f.mockResolvedValueOnce(mockPut());
    f.mockResolvedValueOnce(mockConfirm());

    await uploadCanvasFile(cfg, { courseId: 1, filename: 'x.html', contentType: 'text/html', body: 'x' });

    const initBody = JSON.parse(f.mock.calls[0][1].body);
    expect(initBody.on_duplicate).toBe('overwrite');
    expect(initBody.parent_folder_path).toBeTruthy();
  });

  it('throws CANVAS_UPLOAD_INIT_ERROR on init failure', async () => {
    const f = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    f.mockResolvedValueOnce(new Response('forbidden', { status: 403 }));

    await expect(uploadCanvasFile(cfg, { courseId: 1, filename: 'x.html', contentType: 'text/html', body: 'x' }))
      .rejects.toThrow(/CANVAS_UPLOAD_INIT_ERROR.*403/);
  });

  it('throws CANVAS_UPLOAD_DATA_ERROR on S3 PUT failure', async () => {
    const f = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    f.mockResolvedValueOnce(mockInit());
    f.mockResolvedValueOnce(new Response('', { status: 500 }));

    await expect(uploadCanvasFile(cfg, { courseId: 1, filename: 'x.html', contentType: 'text/html', body: 'x' }))
      .rejects.toThrow(/CANVAS_UPLOAD_DATA_ERROR/);
  });

  it('throws CANVAS_UPLOAD_CONFIRM_ERROR when confirm 4xx', async () => {
    const f = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    f.mockResolvedValueOnce(mockInit());
    f.mockResolvedValueOnce(mockPut());
    f.mockResolvedValueOnce(new Response('not found', { status: 404 }));

    await expect(uploadCanvasFile(cfg, { courseId: 1, filename: 'x.html', contentType: 'text/html', body: 'x' }))
      .rejects.toThrow(/CANVAS_UPLOAD_CONFIRM_ERROR/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=packages/canvas-design-studio -- widget/canvas-files`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Write the implementation**

```ts
// packages/canvas-design-studio/src/tools/widget/canvas-files.ts

export interface CanvasConfig {
  host: string;
  token: string;
}

export interface UploadInput {
  courseId: number;
  filename: string;
  contentType: string;
  body: string;
  parentFolderPath?: string;
}

export interface UploadResult {
  fileId: number;
  displayName: string;
  previewUrl: string;
}

export type CanvasFilesErrorCode =
  | 'CANVAS_UPLOAD_INIT_ERROR'
  | 'CANVAS_UPLOAD_DATA_ERROR'
  | 'CANVAS_UPLOAD_CONFIRM_ERROR';

export class CanvasFilesError extends Error {
  constructor(public code: CanvasFilesErrorCode, public detail: Record<string, unknown>) {
    super(`${code}: ${JSON.stringify(detail)}`);
    this.name = 'CanvasFilesError';
  }
}

interface InitResponse {
  upload_url: string;
  upload_params: Record<string, string>;
  file_param: string;
}

interface ConfirmResponse {
  id: number;
  display_name: string;
  url?: string;
}

/** Three-step Canvas Files upload:
 *  1. POST /api/v1/courses/:id/files — returns presigned S3 upload URL + form params
 *  2. POST the multipart form to the S3 URL — returns 302 with confirm URL in Location
 *  3. GET the confirm URL — returns the finalized file metadata (id, display_name, url)
 *
 *  Always uses on_duplicate=overwrite, which on Canvas's actual file system is
 *  "delete + recreate under same display_name" (file_id changes each time —
 *  verified against BSU sandbox 2026-06-03 per spec amendment).
 */
export async function uploadCanvasFile(cfg: CanvasConfig, input: UploadInput): Promise<UploadResult> {
  const { courseId, filename, contentType, body, parentFolderPath = '/widgets' } = input;
  const baseUrl = `https://${cfg.host}/api/v1`;
  const auth = { Authorization: `Bearer ${cfg.token}` };

  // Step 1
  const initRes = await fetch(`${baseUrl}/courses/${courseId}/files`, {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({
      name: filename,
      size: body.length,
      content_type: contentType,
      on_duplicate: 'overwrite',
      parent_folder_path: parentFolderPath,
    }),
  });
  if (!initRes.ok) {
    throw new CanvasFilesError('CANVAS_UPLOAD_INIT_ERROR', { status: initRes.status, body: (await initRes.text()).slice(0, 200) });
  }
  const init = (await initRes.json()) as InitResponse;

  // Step 2
  const form = new FormData();
  for (const [k, v] of Object.entries(init.upload_params)) form.append(k, v);
  form.append(init.file_param, new Blob([body], { type: contentType }), filename);
  const putRes = await fetch(init.upload_url, { method: 'POST', body: form, redirect: 'manual' });
  if (putRes.status !== 301 && putRes.status !== 302 && !putRes.ok) {
    throw new CanvasFilesError('CANVAS_UPLOAD_DATA_ERROR', { status: putRes.status });
  }

  // Step 3
  const confirmUrl = putRes.headers.get('location');
  if (!confirmUrl) {
    throw new CanvasFilesError('CANVAS_UPLOAD_DATA_ERROR', { reason: 'no Location header in S3 response' });
  }
  const confirmRes = await fetch(confirmUrl, { method: 'GET', headers: auth });
  if (!confirmRes.ok) {
    throw new CanvasFilesError('CANVAS_UPLOAD_CONFIRM_ERROR', { status: confirmRes.status, body: (await confirmRes.text()).slice(0, 200) });
  }
  const confirm = (await confirmRes.json()) as ConfirmResponse;

  return {
    fileId: confirm.id,
    displayName: confirm.display_name,
    previewUrl: `https://${cfg.host}/courses/${courseId}/files/${confirm.id}/preview`,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace=packages/canvas-design-studio -- widget/canvas-files`
Expected: 6 tests pass.

- [ ] **Step 5: Build**

Run: `npm run build --workspace=packages/canvas-design-studio`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add packages/canvas-design-studio/src/tools/widget/canvas-files.ts packages/canvas-design-studio/tests/widget/canvas-files.test.ts
git commit -m "feat(cds): Canvas Files 3-step upload client

uploadCanvasFile(cfg, input) implements the standard Canvas multipart upload:
init → S3 PUT → confirm. Returns { fileId, displayName, previewUrl }. Uses
on_duplicate=overwrite (verified semantic: delete + recreate, file_id changes
each time). Typed errors CANVAS_UPLOAD_INIT_ERROR / _DATA_ERROR / _CONFIRM_ERROR
let callers handle each stage's failure modes."
```

---

## Phase B3 — `publish_widget` MCP tool

### Task B3.1: Implement `publishWidget()` core

**Files:**
- Create: `packages/canvas-design-studio/src/tools/publish-widget.ts`
- Create: `packages/canvas-design-studio/tests/widget/publish-widget.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/canvas-design-studio/tests/widget/publish-widget.test.ts
import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { publishWidget } from '../../src/tools/publish-widget.js';

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'publish-widget-'));
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

function mockUploadOk(fileId = 99) {
  const f = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
  f.mockResolvedValueOnce(new Response(JSON.stringify({ upload_url: 'https://s3', upload_params: {}, file_param: 'file' }), { status: 200 }));
  f.mockResolvedValueOnce(new Response('', { status: 302, headers: { location: 'https://canvas/confirm' } }));
  f.mockResolvedValueOnce(new Response(JSON.stringify({ id: fileId, display_name: 'widget.html', url: '' }), { status: 200 }));
}

describe('publishWidget', () => {
  it('uploads the local widget HTML file and returns canvasFileId + embedSrc + embedHtml', async () => {
    const htmlPath = join(tmp, 'flip.html');
    writeFileSync(htmlPath, '<!DOCTYPE html><html><body>flip</body></html>');
    mockUploadOk(777);

    const result = await publishWidget({
      htmlPath,
      courseId: 48895,
      canvasConfig: { host: 'canvas.example', token: 'tk' },
      widgetSpec: {
        id: 'flip', name: 'Flip', kind: 'card-flip-reveal', purpose: '',
        contentSchema: {}, initialContent: {},
        dimensions: { minHeight: 200, maxHeight: 400 },
        accessibility: { keyboardEquivalent: '', screenReaderSummary: 'flip', minTouchTarget: 44 },
      },
    });

    expect(result.canvasFileId).toBe(777);
    expect(result.embedSrc).toBe('https://canvas.example/courses/48895/files/777/preview');
    expect(result.embedHtml).toContain('<iframe');
    expect(result.embedHtml).toContain('src="https://canvas.example/courses/48895/files/777/preview"');
    expect(result.embedHtml).toContain('sandbox="allow-scripts allow-same-origin allow-forms"');
    expect(result.embedHtml).toContain('title="Flip"');
    expect(result.embedHtml).toContain('height="400"');
  });

  it('throws if htmlPath does not exist', async () => {
    await expect(publishWidget({
      htmlPath: join(tmp, 'nope.html'),
      courseId: 1,
      canvasConfig: { host: 'h', token: 't' },
      widgetSpec: {
        id: 'x', name: 'X', kind: 'card-flip-reveal', purpose: '',
        contentSchema: {}, initialContent: {},
        dimensions: { minHeight: 100, maxHeight: 200 },
        accessibility: { keyboardEquivalent: '', screenReaderSummary: '', minTouchTarget: 44 },
      },
    })).rejects.toThrow(/htmlPath/);
  });

  it('propagates CanvasFilesError on upload failure', async () => {
    const htmlPath = join(tmp, 'x.html');
    writeFileSync(htmlPath, 'x');
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(new Response('forbidden', { status: 403 }));

    await expect(publishWidget({
      htmlPath,
      courseId: 1,
      canvasConfig: { host: 'h', token: 't' },
      widgetSpec: {
        id: 'x', name: 'X', kind: 'card-flip-reveal', purpose: '',
        contentSchema: {}, initialContent: {},
        dimensions: { minHeight: 100, maxHeight: 200 },
        accessibility: { keyboardEquivalent: '', screenReaderSummary: '', minTouchTarget: 44 },
      },
    })).rejects.toThrow(/CANVAS_UPLOAD_INIT_ERROR/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=packages/canvas-design-studio -- widget/publish-widget`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Write the implementation**

```ts
// packages/canvas-design-studio/src/tools/publish-widget.ts

import { readFileSync, existsSync } from 'node:fs';
import { uploadCanvasFile, type CanvasConfig } from './widget/canvas-files.js';
import { dimensionsToIframeAttrs } from './widget/sizing.js';
import type { InteractiveSpec } from './widget/types.js';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export interface PublishWidgetInput {
  htmlPath: string;
  courseId: number;
  canvasConfig: CanvasConfig;
  widgetSpec: InteractiveSpec;
}

export interface PublishWidgetResult {
  canvasFileId: number;
  embedSrc: string;
  embedHtml: string;
}

export async function publishWidget(input: PublishWidgetInput): Promise<PublishWidgetResult> {
  const { htmlPath, courseId, canvasConfig, widgetSpec } = input;

  if (!existsSync(htmlPath)) {
    throw new Error(`htmlPath does not exist: ${htmlPath}`);
  }
  const html = readFileSync(htmlPath, 'utf8');

  // The Canvas Files filename uses the spec id (so re-renders overwrite predictably by display_name).
  const filename = `${widgetSpec.id}.html`;

  const upload = await uploadCanvasFile(canvasConfig, {
    courseId,
    filename,
    contentType: 'text/html',
    body: html,
  });

  const { height, style } = dimensionsToIframeAttrs(widgetSpec.dimensions);
  const embedSrc = upload.previewUrl;
  const embedHtml = `<iframe src="${embedSrc}" width="100%" height="${height}" style="${style}" title="${escapeHtml(widgetSpec.name)}" sandbox="allow-scripts allow-same-origin allow-forms" loading="lazy">${escapeHtml(widgetSpec.accessibility.screenReaderSummary)}</iframe>`;

  return {
    canvasFileId: upload.fileId,
    embedSrc,
    embedHtml,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace=packages/canvas-design-studio -- widget/publish-widget`
Expected: 3 tests pass.

- [ ] **Step 5: Build**

Run: `npm run build --workspace=packages/canvas-design-studio`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add packages/canvas-design-studio/src/tools/publish-widget.ts packages/canvas-design-studio/tests/widget/publish-widget.test.ts
git commit -m "feat(cds): publish_widget core — upload local HTML, return iframe embed

publishWidget(input): reads the local widget HTML file, uploads to Canvas Files
under display_name <widgetSpec.id>.html via uploadCanvasFile, returns
{ canvasFileId, embedSrc, embedHtml } where embedHtml is a ready-to-paste
iframe pointing at /files/<id>/preview with sandbox=allow-scripts allow-same-origin
allow-forms and the spec's screen-reader summary as fallback text."
```

### Task B3.2: Register `publish_widget` as MCP tool

**Files:**
- Modify: `packages/canvas-design-studio/src/index.ts`

- [ ] **Step 1: Add import + tool registration + dispatch case**

Mirror the existing pattern from how `render_widget` was registered in Plan A's Task 3.4. Add:

```ts
import { publishWidget } from './tools/publish-widget.js';
```

Tool entry:

```ts
{
  name: 'publish_widget',
  description: 'Upload a rendered widget HTML file to Canvas Files and return the iframe embed code. Faculty typically does not call this directly; publish_course invokes it for every widget reference in a published course folder.',
  inputSchema: {
    type: 'object',
    properties: {
      htmlPath: { type: 'string', description: 'Absolute path to the rendered <id>.html file.' },
      courseId: { type: 'number', description: 'Canvas course id where the widget should be uploaded.' },
      canvasConfig: {
        type: 'object',
        properties: { host: { type: 'string' }, token: { type: 'string' } },
        required: ['host', 'token'],
      },
      widgetSpec: { type: 'object', description: 'The InteractiveSpec the HTML was rendered from. Used for the iframe title, dimensions, and SR fallback.' },
    },
    required: ['htmlPath', 'courseId', 'canvasConfig', 'widgetSpec'],
  },
}
```

Dispatch case:

```ts
case 'publish_widget': {
  const result = await publishWidget(args as Parameters<typeof publishWidget>[0]);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
}
```

- [ ] **Step 2: Build**

Run: `npm run build --workspace=packages/canvas-design-studio`
Expected: clean.

- [ ] **Step 3: Run full CDS test suite**

Run: `npm test --workspace=packages/canvas-design-studio`
Expected: previous total + 3 publish-widget tests + 6 canvas-files tests + renderer/contract growth. Roughly 530+ passing.

- [ ] **Step 4: Commit**

```bash
git add packages/canvas-design-studio/src/index.ts
git commit -m "feat(cds): register publish_widget as MCP tool

Exposes publish_widget to the canvas-toolchain MCP server. Faculty typically
invokes it via publish_course (Task B4); direct invocation supported for
one-off widget pushes."
```

---

## Phase B4 — `generate_course` + `publish_course` widget extensions

### Task B4.1: `generate_course` recognizes `{{ widget:<id> }}` placeholder

**Files:**
- Modify: `packages/canvas-design-studio/src/tools/generate-course.ts` (and supporting page-rendering helpers)
- Add test in the existing generate-course test file

- [ ] **Step 1: Find the existing page-body rendering pipeline**

Read `packages/canvas-design-studio/src/tools/generate-course.ts` to find where each page's markdown body is converted to HTML. There will be a function like `renderPage(page)` or `processBody(body)`. The widget placeholder substitution hooks in there.

- [ ] **Step 2: Write the failing test**

Add to the existing `tests/generate-course.test.ts` (or create `tests/generate-course-widgets.test.ts`):

```ts
import { describe, expect, it } from 'vitest';
import { generateCourse } from '../src/tools/generate-course.js';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('generateCourse widget placeholder substitution', () => {
  it('replaces {{ widget:<id> }} with a local iframe pointing at widgets/<id>.html', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'gc-widget-'));
    const pageMd = `---
title: Week 3 Data Types
---

## Practice

Drag each data type to the correct category:

{{ widget:data-types-categorize }}

## Reading

Done.
`;
    writeFileSync(join(tmp, 'wk3-data-types.md'), pageMd);
    mkdirSync(join(tmp, 'wk3-data-types', 'widgets'), { recursive: true });
    writeFileSync(join(tmp, 'wk3-data-types', 'widgets', 'data-types-categorize.html'), '<!DOCTYPE html>...');

    await generateCourse({ courseDir: tmp });

    const outputHtml = readFileSync(join(tmp, 'wk3-data-types.html'), 'utf8');
    expect(outputHtml).toContain('<iframe');
    expect(outputHtml).toMatch(/src="wk3-data-types\/widgets\/data-types-categorize\.html"/);
    expect(outputHtml).not.toContain('{{ widget:');
  });

  it('leaves pages without widget placeholders untouched', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'gc-no-widget-'));
    writeFileSync(join(tmp, 'simple.md'), '---\ntitle: Simple\n---\n\nNo widgets here.\n');

    await generateCourse({ courseDir: tmp });

    const outputHtml = readFileSync(join(tmp, 'simple.html'), 'utf8');
    expect(outputHtml).not.toContain('<iframe');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test --workspace=packages/canvas-design-studio -- generate-course-widgets`
Expected: FAIL — placeholder is not yet recognized.

- [ ] **Step 4: Implement the substitution**

In the page-body rendering pipeline (whichever function takes the markdown body and produces page HTML), add a post-processing step that finds `{{ widget:<id> }}` and replaces each with a local iframe pointing at the relative path. Implementation outline:

```ts
function substituteWidgetPlaceholders(body: string, pageSlug: string): string {
  return body.replace(/\{\{\s*widget:([a-z0-9-]+)\s*\}\}/g, (_, widgetId) => {
    return `<iframe src="${pageSlug}/widgets/${widgetId}.html" width="100%" height="400" style="min-height:200px;border:0;" title="${widgetId} widget" sandbox="allow-scripts allow-same-origin allow-forms" loading="lazy">Widget preview unavailable; open ${pageSlug}/widgets/${widgetId}.html directly.</iframe>`;
  });
}
```

Wire this into the existing render flow so it runs after markdown→HTML conversion but before the page is written to disk. Use the page's slug (filename without `.md` extension) to compute the iframe `src`.

- [ ] **Step 5: Run tests + build**

Run: `npm test --workspace=packages/canvas-design-studio -- generate-course`
Expected: previous generate-course tests still pass + 2 new widget-placeholder tests pass.

Run: `npm run build --workspace=packages/canvas-design-studio`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add packages/canvas-design-studio/src/tools/generate-course.ts packages/canvas-design-studio/tests/generate-course-widgets.test.ts
git commit -m "feat(cds): generate_course recognizes {{ widget:<id> }} placeholders

Markdown bodies containing {{ widget:<id> }} now have the placeholder
replaced with a local <iframe> pointing at <page-slug>/widgets/<id>.html
(relative path) so faculty can open the generated HTML locally and see
the widget render in context. Published flow swaps the src to a Canvas
Files URL via publish_course (Task B4.2)."
```

### Task B4.2: `publish_course` discovers widgets and uploads them

**Files:**
- Modify: `packages/command-and-control/src/tools/workflows/publish_course.ts`
- Add a new helper module or extend the existing publish workflow inline

- [ ] **Step 1: Read the existing publish_course shape**

Read `packages/command-and-control/src/tools/workflows/publish_course.ts` to understand:
- How pages are discovered (probably by scanning the course folder for `.md` files)
- How each page's HTML is uploaded (probably via the Canvas Pages API)
- Where the snapshot bundle is written for rollback
- How PUBLISH_RESULT is composed

The widget extension hooks into the page-publish loop: before uploading each page's HTML, find every `<iframe src="<slug>/widgets/<id>.html"...>` in the rendered HTML, locate the corresponding local HTML file, publish_widget it, and substitute the iframe src to the returned `embedSrc`.

- [ ] **Step 2: Write the failing test**

Create `packages/command-and-control/tests/workflows/publish_course-widgets.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { publishCourse } from '../../src/tools/workflows/publish_course.js';

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'pc-widget-'));
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

describe('publish_course widget integration', () => {
  it('discovers {{ widget:<id> }} placeholders, uploads widgets, swaps iframe src', async () => {
    // ... arrange a tmp course folder with a page that references one widget,
    // a local widget html file, a mocked fetch that returns:
    //   - upload init response
    //   - S3 PUT redirect
    //   - upload confirm with file_id 42
    //   - canvas page update success
    //   ... and assert that:
    //   - The Canvas page PUT body contains <iframe src="https://<host>/courses/<id>/files/42/preview"
    //   - PUBLISH_RESULT.widgets contains { id: 'foo', status: 'published', canvasFileId: 42 }

    // Fill in the actual fetch sequence based on how publish_course calls it today.
    // The test should be self-contained and verify the substitution + result shape.
  });

  it('a widget upload failure does NOT abort the rest of the publish', async () => {
    // Arrange a course with TWO widgets across one page. Make the first widget's
    // upload init return 403. Verify the second widget still uploads, the page
    // is still published (with the failed widget's src left at the local path
    // or marked broken), and PUBLISH_RESULT.widgets contains both entries with
    // appropriate status (one failed, one published).
  });
});
```

NOTE: this test scaffolding is intentionally outline-level because the actual fetch sequence depends on how publish_course is structured today. The implementer reads the existing code, writes the precise mock sequence, then verifies. The acceptance criteria are explicit: substitution happens, PUBLISH_RESULT.widgets exists with per-entry statuses, partial failures don't abort.

- [ ] **Step 3: Implement the widget-discovery + upload step**

Outline (the implementer fills in based on actual publish_course shape):

1. Before pushing each page's HTML to Canvas, run a regex over the rendered HTML to find every `<iframe src="<slug>/widgets/<id>.html" ...>`.
2. For each match, load the local `course/<slug>/widgets/<id>.html` file and read its corresponding `.spec.json` (for the iframe metadata).
3. Call the canvas-design-studio `publish_widget` function (imported via the canvas-design-mcp package dependency) with the local html path, courseId, canvasConfig, and widgetSpec.
4. Receive `{ canvasFileId, embedSrc, embedHtml }`. Replace the local iframe's `src` attribute with `embedSrc` in the page HTML.
5. Track results per widget in a `widgets: [{ id, status, canvasFileId?, error? }]` array.
6. If publish_widget throws, log the error to the widgets array as `status: 'failed'`, leave the iframe src pointing at the local path, and continue to the next widget (DO NOT abort).
7. After all widgets are processed, push the (now-rewritten) page HTML to Canvas.
8. Include `widgets` in the per-page result so the aggregate PUBLISH_RESULT exposes them.
9. Snapshot bundle: alongside the existing page-HTML snapshots, capture the local widget HTML files for any widget that was uploaded. Rollback restores both.

- [ ] **Step 4: Run tests + build**

Run: `npm test --workspace=packages/command-and-control -- publish_course`
Expected: existing publish_course tests still pass + 2 new widget tests pass.

Run: `npm run build`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add packages/command-and-control/src/tools/workflows/publish_course.ts packages/command-and-control/tests/workflows/publish_course-widgets.test.ts
git commit -m "feat(cc): publish_course discovers widget placeholders, uploads, substitutes iframe src

publish_course now scans each rendered page for {{ widget:<id> }}-derived
local iframes, calls publish_widget for each, and rewrites the iframe src
to the Canvas Files preview URL before pushing the page. Per-widget result
captured in PUBLISH_RESULT.widgets[]. A single widget upload failure does
NOT abort the rest of the publish — fail-soft per-entry, matching the
existing per-page pattern."
```

### Task B4.3: `preview_course_publish` includes widget diffs in manifest

**Files:**
- Modify: `packages/command-and-control/src/tools/workflows/preview_course_publish.ts`

- [ ] **Step 1: Read the existing preview shape**

Read `preview_course_publish.ts` to understand the manifest structure. Widget-related additions:
- For every page that contains widget placeholders, list each widget id, its local html path, and whether the html is new/changed/unchanged vs the prior snapshot.

- [ ] **Step 2: Add widget discovery to the preview**

For each page being previewed, scan for `{{ widget:<id> }}` placeholders (or, after generate_course runs, the rendered local iframes). Compute the per-widget status:
- **new**: no prior snapshot of `<id>.html`
- **changed**: prior snapshot exists; current contents differ (byte-level or hash comparison)
- **unchanged**: contents match

Add a `widgets: [{ id, status, htmlPath }]` array to the manifest's per-page entry.

- [ ] **Step 3: Test + commit**

Add a test that verifies a page with a new widget shows `widgets: [{ id: 'foo', status: 'new', htmlPath: '...' }]` in the manifest.

```bash
git add packages/command-and-control/src/tools/workflows/preview_course_publish.ts packages/command-and-control/tests/workflows/preview_course_publish-widgets.test.ts
git commit -m "feat(cc): preview_course_publish surfaces widget diffs in manifest

Per-page manifest entry now includes widgets: [{ id, status, htmlPath }]
with status = new | changed | unchanged. Faculty sees widget changes
alongside page changes in the same reviewed-transaction manifest."
```

### Task B4.4: `rollback_course_publish` restores widget files

**Files:**
- Modify: `packages/command-and-control/src/tools/workflows/rollback_course_publish.ts`

- [ ] **Step 1: Extend rollback to handle widgets**

Read the existing rollback workflow. For every widget that was uploaded during the publish being rolled back:
- If the snapshot bundle has a prior version of the widget HTML: re-upload that prior version via publish_widget (will get a NEW file_id per the Phase 0 finding; that's fine — the rollback also restores the page HTML which had the previous iframe src).
- If there's no prior version (widget was newly published): delete the widget from Canvas Files via `DELETE /api/v1/courses/:id/files/:file_id`.
- Restore the page HTML alongside (existing rollback behavior).

- [ ] **Step 2: Test + commit**

Test cases:
- Rollback restores prior widget HTML AND prior page HTML in lockstep.
- Rollback deletes newly-published widgets that had no prior version.
- A single widget rollback failure does not abort the rest.

```bash
git add packages/command-and-control/src/tools/workflows/rollback_course_publish.ts packages/command-and-control/tests/workflows/rollback_course_publish-widgets.test.ts
git commit -m "feat(cc): rollback_course_publish restores widget files alongside pages

For each widget uploaded during the publish being rolled back: restore prior
HTML via re-upload (new file_id; page HTML restored from snapshot points at
the correct src) OR delete the widget from Canvas Files (if newly published
with no prior snapshot). Lockstep with page rollback. Closes the v1 widget
lifecycle: render → preview → publish → rollback."
```

---

## Plan B ship checkpoint

After Task B4.4 completes:

- [ ] Run `npm test` (full monorepo): roughly CDS 560+ (already had 496; +5 renderers ≈ +50 tests, +canvas-files 6, +publish-widget 3), C&C 280+ (was 273, +4 widget integration tests). Total ~1010+.
- [ ] Run `npm run build`: all 5 packages clean.
- [ ] Verify end-to-end with a 2-widget course folder against BSU sandbox course 48895 (manual, with Kevin):
  - Write a course folder with one page containing `{{ widget:sort-sdlc }}` and one containing `{{ widget:vocab-flip }}`.
  - Run `generate_course` → check that local HTML files have iframes pointing at relative paths.
  - Run `preview_course_publish` → check that the manifest shows widget diffs.
  - Run `publish_course` → check that Canvas pages render the widgets via Canvas Files iframes.
  - Run `rollback_course_publish` → check that pages and widgets are both reverted.
- [ ] Memory update: append Plan B ship event to project-current-state.md.

---

## Self-review checklist

- [ ] **Spec coverage:** all 6 v1 catalog renderers ✓ (Plan A 1 + Plan B 5). publish_widget ✓. publish_course extension ✓. generate_course placeholder substitution ✓. Update story correctly accounts for file_id changes per Phase 0 amendment ✓. Snapshot/rollback per spec ✓.
- [ ] **Placeholder scan:** no TBD/TODO/fill-in patterns. Every renderer has complete code; every modification has explicit edit instructions.
- [ ] **Type consistency:** `Renderer<TContent>`, `Result<T>`, `WidgetKind`, `InteractiveSpec` reused across all 5 new renderers. `CanvasConfig` shape consistent with existing canvas-config.json (`{ host, token }`). `PublishWidgetInput` uses `widgetSpec: InteractiveSpec` matching the type from Plan A.
- [ ] **B4 task outlines:** Tasks B4.2-B4.4 are intentionally outlined rather than fully specified because they hinge on the current shape of the C&C `publish_course` / `preview_course_publish` / `rollback_course_publish` workflows, which the implementer must inspect before writing precise code. The acceptance criteria are explicit and testable.

## Execution handoff

Plan complete and saved to `packages/canvas-design-studio/docs/superpowers/plans/2026-06-02-widget-renderer-plan-b.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration. Same pattern as Plan A.
2. **Inline Execution** — execute tasks in this session using executing-plans, batch with checkpoints.

Which approach?
