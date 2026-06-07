# CLO Mapping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship CLO catalog + per-page mapping + render. Catalog lives in `course-config.md` front matter. Render extends the existing #66 TL;DR card to include a "Supports CLOs:" line on assignment + rubric pages.

**Architecture:** New shared types (`Clo`, `CourseClos`, `PageClos`). New CDS modules `course/clos_catalog.ts` (catalog reader) + `tools/extract_clos.ts` (page-id extractor). Modify `templates/tldr_card.ts` to accept optional `clos` prop. Modify `tools/generate-page.ts` to resolve + pass CLO data.

**Tech Stack:** TypeScript ESM, vitest 2.x, `yaml` (already in CDS). No new runtime dependencies.

**Spec:** `packages/command-and-control/docs/superpowers/specs/2026-06-07-clo-mapping-design.md`

**Issue:** [#91](https://github.com/Ryfter/canvas-toolchain/issues/91)

---

## Phase 0 — Baseline

### Task 0.1: Confirm clean tree + tests pass

- [ ] **Step 1:** `git status` → clean.
- [ ] **Step 2:** `npm test --workspaces` → all green. Note baselines.

---

## Phase 1 — Shared Types

### Task 1.1: Add `Clo`, `CourseClos`, `PageClos` types

**Files:**
- Modify: `packages/shared-types/src/index.ts`
- Test: `packages/shared-types/tests/index.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `packages/shared-types/tests/index.test.ts` inside the main describe block:

```ts
  it('exports Clo + CourseClos + PageClos types (#91)', () => {
    const c: import('../src/index.js').Clo = {
      id: '1',
      name: 'Analyzing',
      statement: 'Students will be able to analyze business data.',
      tag: 'core',
    };
    const cc: import('../src/index.js').CourseClos = { clos: [c] };
    const pc: import('../src/index.js').PageClos = { resolved: [c], unknownIds: [] };
    expect(c.id).toBe('1');
    expect(cc.clos).toHaveLength(1);
    expect(pc.resolved).toHaveLength(1);
  });
```

- [ ] **Step 2: Run + fail**

Run: `npm test --workspace @canvas-toolchain/shared-types`
Expected: FAIL — types don't exist.

- [ ] **Step 3: Add the types**

Append to `packages/shared-types/src/index.ts`:

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
  /** IDs the page referenced that weren't found in the catalog. */
  unknownIds: string[];
}
```

- [ ] **Step 4: Run tests + build**

```bash
npm test --workspace @canvas-toolchain/shared-types
npm run build --workspace @canvas-toolchain/shared-types
```
Expected: PASS, tsc exits 0.

- [ ] **Step 5: Commit**

```bash
git add packages/shared-types/src/index.ts packages/shared-types/tests/index.test.ts
git commit -m "feat(shared-types): Clo + CourseClos + PageClos types for #91"
```

---

## Phase 2 — CDS: Catalog Reader

### Task 2.1: `clos_catalog.ts` — read CLO catalog from course-config.md

**Files:**
- Create: `packages/canvas-design-studio/src/course/clos_catalog.ts`
- Test: `packages/canvas-design-studio/tests/course/clos_catalog.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/canvas-design-studio/tests/course/clos_catalog.test.ts`:

```ts
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readClosCatalog } from '../../src/course/clos_catalog.js';

let tmpDir: string;
let configPath: string;
beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'clos-cat-'));
  configPath = join(tmpDir, 'course-config.md');
});
afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

describe('readClosCatalog', () => {
  it('parses a well-formed clos block from front matter', () => {
    writeFileSync(configPath, `---
title: ITM 370
clos:
  - id: '1'
    name: Analyzing
    statement: Students analyze business data.
    tag: core
  - id: '2'
    name: Communicating
    statement: Students communicate insights.
---
`);
    const result = readClosCatalog(configPath);
    expect(result.warnings).toEqual([]);
    expect(result.clos).toHaveLength(2);
    expect(result.clos[0]).toEqual({ id: '1', name: 'Analyzing', statement: 'Students analyze business data.', tag: 'core' });
    expect(result.clos[1]).toEqual({ id: '2', name: 'Communicating', statement: 'Students communicate insights.' });
  });

  it('returns empty clos + no warnings when no clos block present', () => {
    writeFileSync(configPath, `---\ntitle: T\n---\n`);
    const result = readClosCatalog(configPath);
    expect(result.clos).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('skips entries with missing required fields and accumulates warnings', () => {
    writeFileSync(configPath, `---
title: T
clos:
  - id: '1'
    name: Good
    statement: Valid entry.
  - id: '2'
    name: Bad
    # missing statement
  - name: NoId
    statement: Missing id.
---
`);
    const result = readClosCatalog(configPath);
    expect(result.clos).toHaveLength(1);
    expect(result.clos[0].id).toBe('1');
    expect(result.warnings.length).toBeGreaterThanOrEqual(2);
  });

  it('rejects invalid tag values (skips entry + warns)', () => {
    writeFileSync(configPath, `---
title: T
clos:
  - id: '1'
    name: Bad
    statement: Has bad tag.
    tag: peripheral
---
`);
    const result = readClosCatalog(configPath);
    expect(result.clos).toEqual([]);
    expect(result.warnings.length).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run + fail**

Run: `npm test --workspace canvas-design-mcp -- clos_catalog.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `clos_catalog.ts`**

Create `packages/canvas-design-studio/src/course/clos_catalog.ts`:

```ts
import { existsSync, readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import type { Clo, CloTag } from '@canvas-toolchain/shared-types';

const FM_PATTERN = /^---\n([\s\S]*?)\n---/;

function isCloTag(v: unknown): v is CloTag {
  return v === 'core' || v === 'supporting';
}

export interface ReadClosCatalogResult {
  clos: Clo[];
  warnings: string[];
}

export function readClosCatalog(courseConfigPath: string): ReadClosCatalogResult {
  const warnings: string[] = [];
  if (!existsSync(courseConfigPath)) return { clos: [], warnings };

  const raw = readFileSync(courseConfigPath, 'utf-8');
  const m = raw.match(FM_PATTERN);
  if (!m) return { clos: [], warnings };

  let fm: unknown;
  try {
    fm = parseYaml(m[1]);
  } catch {
    return { clos: [], warnings };
  }
  if (!fm || typeof fm !== 'object' || Array.isArray(fm)) return { clos: [], warnings };

  const closRaw = (fm as Record<string, unknown>).clos;
  if (!Array.isArray(closRaw)) return { clos: [], warnings };

  const clos: Clo[] = [];
  for (let i = 0; i < closRaw.length; i++) {
    const entry = closRaw[i];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      warnings.push(`clos[${i}] is not an object — skipped`);
      continue;
    }
    const obj = entry as Record<string, unknown>;
    if (typeof obj.id !== 'string' || obj.id.length === 0) {
      warnings.push(`clos[${i}] missing or empty id — skipped`);
      continue;
    }
    if (typeof obj.name !== 'string' || obj.name.length === 0) {
      warnings.push(`clos[${i}] (id=${obj.id}) missing or empty name — skipped`);
      continue;
    }
    if (typeof obj.statement !== 'string' || obj.statement.length === 0) {
      warnings.push(`clos[${i}] (id=${obj.id}) missing or empty statement — skipped`);
      continue;
    }
    const clo: Clo = { id: obj.id, name: obj.name, statement: obj.statement };
    if (obj.tag !== undefined) {
      if (!isCloTag(obj.tag)) {
        warnings.push(`clos[${i}] (id=${obj.id}) invalid tag "${String(obj.tag)}" — skipped`);
        continue;
      }
      clo.tag = obj.tag;
    }
    clos.push(clo);
  }

  return { clos, warnings };
}
```

- [ ] **Step 4: Run tests**

Run: `npm test --workspace canvas-design-mcp -- clos_catalog.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/canvas-design-studio/src/course/clos_catalog.ts packages/canvas-design-studio/tests/course/clos_catalog.test.ts
git commit -m "feat(cds): readClosCatalog — parse + validate CLOs from course-config front matter (#91)"
```

---

## Phase 3 — CDS: Page Extractor

### Task 3.1: `extract_clos.ts` — pull CLO IDs from page front matter

**Files:**
- Create: `packages/canvas-design-studio/src/tools/extract_clos.ts`
- Test: `packages/canvas-design-studio/tests/tools/extract_clos.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/canvas-design-studio/tests/tools/extract_clos.test.ts`:

```ts
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractClosFromFile } from '../../src/tools/extract_clos.js';

let tmpDir: string;
beforeEach(() => { tmpDir = mkdtempSync(join(tmpdir(), 'extract-clos-')); });
afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

describe('extractClosFromFile', () => {
  it('returns the IDs as strings when clos array present', () => {
    const f = join(tmpDir, 'p.md');
    writeFileSync(f, `---\ntitle: T\nclos: ['1', '2', '3']\n---\n\nbody\n`);
    expect(extractClosFromFile(f)).toEqual(['1', '2', '3']);
  });

  it('coerces numeric IDs to strings', () => {
    const f = join(tmpDir, 'p.md');
    writeFileSync(f, `---\ntitle: T\nclos: [1, 2]\n---\n`);
    expect(extractClosFromFile(f)).toEqual(['1', '2']);
  });

  it('returns [] when no clos field', () => {
    const f = join(tmpDir, 'p.md');
    writeFileSync(f, `---\ntitle: T\n---\n`);
    expect(extractClosFromFile(f)).toEqual([]);
  });

  it('returns [] when front matter absent', () => {
    const f = join(tmpDir, 'p.md');
    writeFileSync(f, `## body\n`);
    expect(extractClosFromFile(f)).toEqual([]);
  });

  it('returns [] when clos value is not an array', () => {
    const f = join(tmpDir, 'p.md');
    writeFileSync(f, `---\ntitle: T\nclos: "1"\n---\n`);
    expect(extractClosFromFile(f)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run + fail**

Run: `npm test --workspace canvas-design-mcp -- extract_clos.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `packages/canvas-design-studio/src/tools/extract_clos.ts`:

```ts
import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';

const FM_PATTERN = /^---\n([\s\S]*?)\n---/;

export function extractClosFromFile(mdPath: string): string[] {
  const raw = readFileSync(mdPath, 'utf-8');
  const m = raw.match(FM_PATTERN);
  if (!m) return [];

  let parsed: unknown;
  try {
    parsed = parseYaml(m[1]);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return [];

  const closRaw = (parsed as Record<string, unknown>).clos;
  if (!Array.isArray(closRaw)) return [];

  return closRaw
    .map((v) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : null))
    .filter((v): v is string => v !== null && v.length > 0);
}
```

- [ ] **Step 4: Run tests**

Run: `npm test --workspace canvas-design-mcp -- extract_clos.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/canvas-design-studio/src/tools/extract_clos.ts packages/canvas-design-studio/tests/tools/extract_clos.test.ts
git commit -m "feat(cds): extractClosFromFile — page front-matter CLO ID extractor (#91)"
```

---

## Phase 4 — CDS: Modify `tldr_card.ts`

### Task 4.1: Extend `renderTldrCard` to accept optional `clos`

**Files:**
- Modify: `packages/canvas-design-studio/src/templates/tldr_card.ts`
- Modify: `packages/canvas-design-studio/tests/templates/tldr_card.test.ts`

**Implementer notes:**
- After #66, the existing signature is `renderTldrCard({ tiers })` where `tiers` is required.
- Change: both `tiers` AND `clos` become OPTIONAL. Card renders empty string if BOTH are absent OR neither produces visible content (no tier-1 sections AND no resolved CLOs).
- When `clos.resolved` is non-empty, append a line at the bottom of the card:
  `<p style="margin:0.5em 0 0 0; font-size:0.9em; color:#555550;"><strong>Supports CLOs:</strong> CLO {id} — {name} · CLO {id} — {name}</p>`
  HTML-escape both `id` and `name`.

- [ ] **Step 1: Add the failing tests**

Append to `packages/canvas-design-studio/tests/templates/tldr_card.test.ts` inside the main describe block:

```ts
  it('renders the Supports CLOs line when clos.resolved is non-empty', () => {
    const html = renderTldrCard({
      clos: {
        resolved: [
          { id: '1', name: 'Analyzing', statement: 's1' },
          { id: '3', name: 'Communicating', statement: 's3' },
        ],
        unknownIds: [],
      },
    });
    expect(html).toContain('Supports CLOs');
    expect(html).toContain('CLO 1');
    expect(html).toContain('Analyzing');
    expect(html).toContain('CLO 3');
    expect(html).toContain('Communicating');
  });

  it('omits the line when clos is absent', () => {
    const html = renderTldrCard({
      tiers: { sections: [{ heading: 'D', tier: 1, summary: 's' }] },
    });
    expect(html).not.toContain('Supports CLOs');
  });

  it('HTML-escapes CLO id and name', () => {
    const html = renderTldrCard({
      clos: { resolved: [{ id: '<x>', name: 'Name <em>', statement: 's' }], unknownIds: [] },
    });
    expect(html).toContain('&lt;x&gt;');
    expect(html).toContain('Name &lt;em&gt;');
  });

  it('renders the card with ONLY the CLOs line when tier-1 sections absent', () => {
    const html = renderTldrCard({
      clos: { resolved: [{ id: '1', name: 'Analyzing', statement: 's' }], unknownIds: [] },
    });
    expect(html).toContain('Quick Reference');
    expect(html).toContain('Supports CLOs');
  });

  it('returns empty string when neither tier-1 sections nor CLOs', () => {
    const html = renderTldrCard({
      tiers: { sections: [{ heading: 'X', tier: 3, summary: 'rubric details' }] },
    });
    expect(html).toBe('');
  });
```

- [ ] **Step 2: Modify `tldr_card.ts`**

Edit `packages/canvas-design-studio/src/templates/tldr_card.ts`. Change the imports + interface:

```ts
import type { PageTiers, PageClos } from '@canvas-toolchain/shared-types';

export interface RenderTldrCardInput {
  tiers?: PageTiers;
  clos?: PageClos;
}
```

Rewrite the function body:

```ts
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderTldrCard(input: RenderTldrCardInput): string {
  const tier1 = input.tiers?.sections.filter((s) => s.tier === 1) ?? [];
  const clos = input.clos?.resolved ?? [];

  if (tier1.length === 0 && clos.length === 0) return '';

  const items = tier1
    .map((s) => `    <li><strong>${escapeHtml(s.heading)}:</strong> ${escapeHtml(s.summary)}</li>`)
    .join('\n');

  const itemsBlock = tier1.length > 0
    ? `  <ul style="margin:0.5em 0; padding-left:1.25em;">
${items}
  </ul>`
    : '';

  const closLine = clos.length > 0
    ? `  <p style="margin:0.5em 0 0 0; font-size:0.9em; color:#555550;"><strong>Supports CLOs:</strong> ${clos.map((c) => `CLO ${escapeHtml(c.id)} — ${escapeHtml(c.name)}`).join(' · ')}</p>`
    : '';

  return `<div style="background:#E6ECF9; border-left:4px solid #0033A0; padding:1em 1.25em; margin-bottom:1.5em; border-radius:0 4px 4px 0;">
  <h3 style="margin-top:0; color:#0033A0;">📌 Quick Reference</h3>
${itemsBlock}
${closLine}
</div>
`;
}
```

The `\n` between `itemsBlock` and `closLine` produces a blank line when both are empty, but we already early-returned in that case. When one is empty, it just produces an extra newline — harmless in HTML.

- [ ] **Step 3: Run tldr_card tests**

Run: `npm test --workspace canvas-design-mcp -- tldr_card.test.ts`
Expected: PASS — all existing #66 tests still pass + 5 new ones.

The existing #66 tests pass `{ tiers: ... }` (positional arg matching the old signature) — since `tiers` is still a valid field name in the new interface, no change needed.

- [ ] **Step 4: Commit**

```bash
git add packages/canvas-design-studio/src/templates/tldr_card.ts packages/canvas-design-studio/tests/templates/tldr_card.test.ts
git commit -m "feat(cds): tldr_card adds Supports CLOs line via optional clos prop (#91)"
```

---

## Phase 5 — CDS: Wire generate-page

### Task 5.1: Resolve + pass CLO data in `generate-page.ts`

**Files:**
- Modify: `packages/canvas-design-studio/src/tools/generate-page.ts`
- Modify: `packages/canvas-design-studio/tests/generate-page.test.ts`

**Implementer notes:**
- Read the file first to understand the current shape. After #66 + #92, there's already an AIAS resolution block and a `withTldr = tldrHtml + renderedHtml` line.
- CLO resolution adds: read catalog from `configPath` (already in scope from #66's resolution block), extract page-level IDs from front matter, build `PageClos`, pass into `renderTldrCard`.
- Only applies on assignment + rubric page types (same gate as AIAS — Q4 + ADR 4).

- [ ] **Step 1: Add the failing tests**

Append to `packages/canvas-design-studio/tests/generate-page.test.ts` inside the main describe (use the same scaffolding style):

```ts
  describe('CLO mapping (#91)', () => {
    function setupCourse(tmpDir: string, courseConfigContent: string): string {
      const courseDir = mkdtempSync(join(tmpdir(), tmpDir));
      writeFileSync(join(courseDir, 'course-config.md'), courseConfigContent);
      mkdirSync(join(courseDir, 'week-05'), { recursive: true });
      return courseDir;
    }

    const CATALOG_FM = `---
title: Test Course
short_name: TC
semester: F26
domain_color: "#0033A0"
clos:
  - id: '1'
    name: Analyzing
    statement: Students analyze.
  - id: '2'
    name: Communicating
    statement: Students communicate.
---
`;

    it('renders the Supports CLOs line on an assignment page with clos: front matter', () => {
      const courseDir = setupCourse('clo-assn-', CATALOG_FM);
      try {
        const mdPath = join(courseDir, 'week-05', 'assignment.md');
        writeFileSync(mdPath, `---\ntitle: W5\nweek: 5\nclos: ['1', '2']\n---\n\n## Body\n\nbody\n`);
        const result = generatePage({ mdPath, courseDir, outputDir: join(courseDir, 'out') });
        expect(result.html).toContain('Supports CLOs');
        expect(result.html).toContain('CLO 1');
        expect(result.html).toContain('Analyzing');
        expect(result.html).toContain('CLO 2');
      } finally { rmSync(courseDir, { recursive: true, force: true }); }
    });

    it('renders on a rubric page too', () => {
      const courseDir = setupCourse('clo-rubric-', CATALOG_FM);
      try {
        const mdPath = join(courseDir, 'week-05', 'rubric.md');
        writeFileSync(mdPath, `---\ntitle: R\nweek: 5\nclos: ['1']\n---\n\n## Criteria\n\nx\n`);
        const result = generatePage({ mdPath, courseDir, outputDir: join(courseDir, 'out') });
        expect(result.html).toContain('Supports CLOs');
      } finally { rmSync(courseDir, { recursive: true, force: true }); }
    });

    it('does NOT render CLO line on a non-eligible page type even when clos: is set', () => {
      const courseDir = setupCourse('clo-res-', CATALOG_FM);
      try {
        const mdPath = join(courseDir, 'week-05', 'resources.md');
        writeFileSync(mdPath, `---\ntitle: Res\nweek: 5\nclos: ['1']\n---\n\n## Links\n\nx\n`);
        const result = generatePage({ mdPath, courseDir, outputDir: join(courseDir, 'out') });
        expect(result.html).not.toContain('Supports CLOs');
      } finally { rmSync(courseDir, { recursive: true, force: true }); }
    });

    it('all-unknown IDs produce no CLO line (graceful degradation)', () => {
      const courseDir = setupCourse('clo-unk-', CATALOG_FM);
      try {
        const mdPath = join(courseDir, 'week-05', 'assignment.md');
        writeFileSync(mdPath, `---\ntitle: A\nweek: 5\nclos: ['99', '100']\n---\n\n## B\n\nx\n`);
        const result = generatePage({ mdPath, courseDir, outputDir: join(courseDir, 'out') });
        expect(result.html).not.toContain('Supports CLOs');
      } finally { rmSync(courseDir, { recursive: true, force: true }); }
    });
  });
```

- [ ] **Step 2: Run + fail**

Run: `npm test --workspace canvas-design-mcp -- generate-page.test.ts`
Expected: 4 new tests fail.

- [ ] **Step 3: Wire into generate-page.ts**

Open `packages/canvas-design-studio/src/tools/generate-page.ts`. Add imports:

```ts
import { extractClosFromFile } from './extract_clos.js';
import { readClosCatalog } from '../course/clos_catalog.js';
import type { Clo, PageClos } from '@canvas-toolchain/shared-types';
```

Find the existing block that produces `tldrHtml` (added by #66). Currently:

```ts
const tiers = extractTiersFromFile(absPath);
const tldrHtml = tiers ? renderTldrCard({ tiers }) : '';
const withTldr = tldrHtml + renderedHtml;
```

Insert CLO resolution before the `tldrHtml` line, and update the call:

```ts
const tiers = extractTiersFromFile(absPath);

// CLO resolution — only on assignment + rubric pages
const isCloEligible = pageType === 'assignment' || pageType === 'rubric';
let pageClos: PageClos | undefined;
if (isCloEligible) {
  const catalog = readClosCatalog(configPath);
  const pageIds = extractClosFromFile(absPath);
  if (pageIds.length > 0 && catalog.clos.length > 0) {
    const resolved = pageIds
      .map((id) => catalog.clos.find((c) => c.id === id))
      .filter((c): c is Clo => c !== undefined);
    const unknownIds = pageIds.filter((id) => !catalog.clos.some((c) => c.id === id));
    if (resolved.length > 0) {
      pageClos = { resolved, unknownIds };
    }
  }
}

const tldrHtml = (tiers || pageClos) ? renderTldrCard({ tiers, clos: pageClos }) : '';
const withTldr = tldrHtml + renderedHtml;
```

- [ ] **Step 4: Run tests**

Run: `npm test --workspace canvas-design-mcp -- generate-page.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/canvas-design-studio/src/tools/generate-page.ts packages/canvas-design-studio/tests/generate-page.test.ts
git commit -m "feat(cds): generate-page resolves CLOs + extends TL;DR card on assignment/rubric (#91)"
```

---

## Phase 6 — Docs

### Task 6.1: CLAUDE.md update for CDS

**Files:** `packages/canvas-design-studio/CLAUDE.md`

- [ ] **Step 1: Add a "CLO Mapping" section**

Append a new section after the existing "TL;DR Card" or "AIAS" sections (read the file first to find the right spot):

```markdown
## Course Learning Outcomes (CLOs, #91)

Each course can declare a CLO catalog in `course-config.md` front matter:

```yaml
clos:
  - id: '1'
    name: Analyzing
    statement: Students will be able to analyze business data.
    tag: core             # optional: 'core' | 'supporting'
  - id: '2'
    name: Communicating
    statement: Students will be able to communicate insights.
```

Each assignment or rubric page references catalog IDs via `clos: ['1', '2']` in its own front matter. At render time, `generate_page` joins the IDs against the catalog and surfaces a "Supports CLOs:" line at the bottom of the existing TL;DR card from #66.

CLOs render only on **assignment** and **rubric** page types — not on other page types. Unknown IDs degrade silently (line shows resolved CLOs only; nothing renders if zero resolve).
```

- [ ] **Step 2: Commit**

```bash
git add packages/canvas-design-studio/CLAUDE.md
git commit -m "docs(cds): CLAUDE.md — CLO mapping (#91)"
```

---

## Phase 7 — Final Regression + Close #91

### Task 7.1: Full regression + close

- [ ] **Step 1:** `npm run build --workspaces` → exit 0.
- [ ] **Step 2:** `npm test --workspaces` → all green. shared-types gains 1, canvas-design-mcp gains ~17.
- [ ] **Step 3:** `npm run smoke:integration --workspace command-and-control-mcp` → passes.
- [ ] **Step 4:** Verify each AC from the spec.
- [ ] **Step 5:** `git push origin main`.
- [ ] **Step 6:** Comment + close #91.

```bash
gh issue comment 91 --repo Ryfter/canvas-toolchain --body "$(cat <<'EOF'
## Shipped

All 8 acceptance criteria met. Summary:

- New shared-types: `Clo`, `CourseClos`, `PageClos`, `CloTag`.
- New CDS modules: `course/clos_catalog.ts` (parses + validates the catalog from course-config.md front matter), `tools/extract_clos.ts` (pulls page-level CLO IDs).
- Modified CDS template `tldr_card.ts`: `tiers` field becomes optional; new optional `clos` field renders a "Supports CLOs:" line at the bottom of the existing card. Card renders if EITHER tier-1 sections OR resolved CLOs exist.
- Modified `generate_page`: on assignment + rubric pages only, resolves catalog + page-IDs into `PageClos`, passes to `renderTldrCard`. Unknown IDs degrade silently; malformed catalog entries are skipped with warnings (best-effort, never throws).
- Faculty edits course-config.md directly (no new MCP tool at v1).

### Out of scope (deferred to v2)
- `brainstorm_interactive` CLO steering (separate v2 issue)
- Assessment-track tagging (Gulya framework specifics)
- MCP tool to manage the catalog
- Program-level outcomes / CLO compliance reports
- Per-rubric-criterion CLO mapping

Spec: \`packages/command-and-control/docs/superpowers/specs/2026-06-07-clo-mapping-design.md\`
Plan: \`packages/command-and-control/docs/superpowers/plans/2026-06-07-clo-mapping.md\`
EOF
)"
gh issue close 91 --repo Ryfter/canvas-toolchain --reason "completed"
```

---

## Summary

| Phase | Tasks | New tests | Files created | Files modified |
|---|---|---|---|---|
| 0 | 1 baseline | 0 | 0 | 0 |
| 1 | 1 shared-types | 1 | 0 | 2 |
| 2 | 1 catalog reader | 4 | 1 | 0 |
| 3 | 1 page extractor | 5 | 1 | 0 |
| 4 | 1 tldr_card extend | 5 | 0 | 2 |
| 5 | 1 generate-page wire | 4 | 0 | 2 |
| 6 | 1 docs | 0 | 0 | 1 |
| 7 | 1 regression + close | 0 | 0 | 0 |
| **Total** | **8 tasks** | **~19 new tests** | **2 new files** | **7 modified files** |
