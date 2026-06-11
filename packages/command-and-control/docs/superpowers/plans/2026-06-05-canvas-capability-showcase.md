# Canvas Capability Showcase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a data-driven Canvas-capability catalog with two MCP tools: `show_canvas_capabilities` returns the catalog as readable markdown; `preview_canvas_pattern` renders any specific pattern to a standalone HTML file for browser viewing.

**Architecture:** A YAML catalog at `packages/canvas-design-studio/data/canvas-capabilities.yaml` is the single source of truth. CDS owns parsing (`catalog.ts`) and preview rendering (`render_preview.ts`). C&C owns the two MCP tool wrappers. New patterns are added by content PR — no code change.

**Tech Stack:** TypeScript ESM, vitest 2.x, `yaml` package (eemeli/yaml). No new runtime dependencies beyond `yaml`.

**Spec:** `packages/command-and-control/docs/superpowers/specs/2026-06-05-canvas-capability-showcase-design.md`

**Issue:** [#65](https://github.com/Ryfter/canvas-toolchain/issues/65)

---

## Phase 0 — Baseline Verification

### Task 0.1: Confirm clean working tree and baseline tests pass

**Files:** None modified.

- [ ] **Step 1: Confirm clean tree**

Run: `git status`
Expected: clean on `main`.

- [ ] **Step 2: Run full test suite**

Run: `npm test --workspaces`
Expected: every workspace passes. Note baseline counts for `canvas-design-mcp` (typically ~456) and `command-and-control-mcp` (typically ~482).

- [ ] **Step 3: Note baseline**

Record baseline test counts for canvas-design-mcp and command-and-control-mcp. Phase 5 regression will compare against these.

---

## Phase 1 — CDS Data + Catalog Module

### Task 1.1: Add `yaml` dependency to canvas-design-studio

**Files:**
- Modify: `packages/canvas-design-studio/package.json`

- [ ] **Step 1: Install the dependency**

Run from repo root:

```bash
npm install --workspace canvas-design-mcp yaml@^2.5.0
```

Expected: `package.json` gains `"yaml": "^2.5.0"` in `dependencies`; `package-lock.json` updated.

- [ ] **Step 2: Verify install**

Run: `npm ls --workspace canvas-design-mcp yaml`
Expected: yaml is listed.

- [ ] **Step 3: Commit**

```bash
git add packages/canvas-design-studio/package.json package-lock.json
git commit -m "build(cds): add yaml dependency for capability catalog (#65)"
```

---

### Task 1.2: Author `canvas-capabilities.yaml` with the v1 patterns

**Files:**
- Create: `packages/canvas-design-studio/data/canvas-capabilities.yaml`

- [ ] **Step 1: Create the data directory and file**

Create `packages/canvas-design-studio/data/canvas-capabilities.yaml`:

```yaml
version: 1
updated: "2026-06-05"

categories:
  - id: layout
    name: Layout
    description: How content is arranged on the page
  - id: information
    name: Information
    description: How facts, comparisons, and definitions are presented
  - id: interactive
    name: Interactive (no-JS)
    description: Patterns that feel interactive within Canvas's no-script constraint
  - id: pedagogical
    name: Pedagogical
    description: Patterns specific to learning design
  - id: branded
    name: Branded
    description: Patterns that pull from the active theme

patterns:
  - id: comparison-card
    name: Comparison Card
    category: information
    supportStatus: supported
    description: >
      Side-by-side comparison of two concepts, products, or approaches.
    whenToUse: >
      "X vs Y" content. Pros/cons. Before/after.
    notes: >
      Uses inline CSS only. Table-based layout for Canvas safety.
    exampleHtml: |
      <table style="width:100%; border-collapse:collapse;">
        <thead>
          <tr style="background:#0033A0; color:white;">
            <th style="padding:12px; text-align:left;">Excel</th>
            <th style="padding:12px; text-align:left;">Tableau</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding:12px; border:1px solid #ccc;">Spreadsheet-first; best for one-time calculations and datasets under 1M rows.</td>
            <td style="padding:12px; border:1px solid #ccc;">Visualization-first; best for live dashboards over millions of rows from many sources.</td>
          </tr>
        </tbody>
      </table>

  - id: accordion-details
    name: Accordion (collapsible sections)
    category: interactive
    supportStatus: supported
    description: Click-to-expand sections using native HTML details/summary.
    whenToUse: FAQ content; long answers tucked behind short questions.
    notes: Native HTML — no JavaScript needed.
    exampleHtml: |
      <details style="margin-bottom:1em; padding:0.5em; border:1px solid #ccc; border-radius:4px;">
        <summary style="cursor:pointer; padding:0.5em;"><strong>How is final grading calculated?</strong></summary>
        <div style="padding:0.5em;">
          <p>Weighted average across four categories: Assignments (40%), Quizzes (20%), Project (30%), Participation (10%).</p>
        </div>
      </details>

  - id: callout-box
    name: Callout Box
    category: information
    supportStatus: supported
    description: Highlighted advice, warning, or "did you know" sidebar.
    whenToUse: Procedural reminders, deadlines, or context the student must not miss.
    notes: Uses University info-blue palette from the design tokens.
    exampleHtml: |
      <div style="background:#E6F1FB; border-left:4px solid #185FA5; padding:1em; margin:1em 0; border-radius:0 4px 4px 0;">
        <strong style="color:#185FA5;">Note:</strong> Submissions close at 11:59 PM Mountain Time the night before class.
      </div>

  - id: learning-objectives-list
    name: Learning Objectives List
    category: pedagogical
    supportStatus: supported
    description: A boxed "by the end of this week you will be able to..." list.
    whenToUse: Top of every week or module page; orients the student.
    notes: Uses neutral background; pairs with the brand primary heading color.
    exampleHtml: |
      <div style="background:#F4F3EF; padding:1em 1.5em; border-radius:8px; margin:1em 0;">
        <h3 style="margin-top:0; color:#0033A0;">By the end of this week, you will be able to:</h3>
        <ul>
          <li>Connect Tableau to a live data source.</li>
          <li>Build a basic bar chart and table visualization.</li>
          <li>Apply filters to refine the view to a specific time range.</li>
        </ul>
      </div>

  - id: vocab-table
    name: Vocabulary Table
    category: information
    supportStatus: supported
    description: Term + definition table for a domain glossary.
    whenToUse: Introducing a set of related new terms in a single section.
    notes: Uses Canvas's built-in ic-Table class — no admin styling needed.
    exampleHtml: |
      <table class="ic-Table" style="width:100%;">
        <thead><tr><th>Term</th><th>Definition</th></tr></thead>
        <tbody>
          <tr><td><strong>Dimension</strong></td><td>A categorical field used to slice data (e.g., Region, Product).</td></tr>
          <tr><td><strong>Measure</strong></td><td>A numeric field that gets aggregated (e.g., Sales, Profit).</td></tr>
          <tr><td><strong>Calculated field</strong></td><td>A new field derived from existing ones via a formula.</td></tr>
        </tbody>
      </table>

  - id: tabbed-layout-target
    name: Tabbed Layout (:target hack)
    category: interactive
    supportStatus: aspirational
    description: Clickable tabs that swap content panels via CSS :target.
    whenToUse: 3–5 parallel sections (Week 1 / Week 2 / Week 3 overview).
    notes: >
      Canvas's no-JS constraint means true tabs require CSS :target hacks
      which may collide with the page's natural anchor navigation.
      CDS does not currently produce this pattern; explore at your own risk.
    exampleHtml: |
      <div style="border:1px dashed #888; padding:1em; background:#FAEEDA;">
        <p><em>Aspirational pattern. CDS does not currently generate it.</em></p>
        <p>Intended UX: a row of "tab" buttons that visually highlight the active panel via the URL hash. Implementation would use anchor IDs + sibling-selector CSS rules.</p>
      </div>

  - id: jump-link-nav
    name: Jump-Link Nav Bar
    category: layout
    supportStatus: aspirational
    description: A top-of-page in-page anchor navigation bar.
    whenToUse: Long pages (3+ major sections) where students benefit from a TOC.
    notes: >
      CDS does not currently emit this pattern by default. Trivial to
      add as a content PR — just generate matching id attributes on
      target headings.
    exampleHtml: |
      <nav style="background:#F4F3EF; padding:0.5em 1em; border-radius:4px; margin-bottom:1em;">
        <a href="#section-1" style="margin-right:1em; color:#0033A0;">Overview</a>
        <a href="#section-2" style="margin-right:1em; color:#0033A0;">Concepts</a>
        <a href="#section-3" style="margin-right:1em; color:#0033A0;">Practice</a>
      </nav>
      <h2 id="section-1">Overview</h2>
      <p>Sample content for the first section…</p>

  - id: rubric-help-callout
    name: Rubric Help Callout
    category: pedagogical
    supportStatus: aspirational
    description: A per-criterion student-language explainer attached to a rubric row.
    whenToUse: Anywhere an official Canvas rubric is shown to students.
    notes: >
      Ties into the rubric system (#67) — student-facing rubric language
      that pairs with the existing Canvas rubric.
    exampleHtml: |
      <div style="background:#FAEEDA; border-left:4px solid #854F0B; padding:1em; margin:1em 0; border-radius:0 4px 4px 0;">
        <h4 style="margin-top:0; color:#854F0B;">📋 What this rubric criterion means (in plain English)</h4>
        <p><strong>"Demonstrates analytical rigor"</strong> means: <em>You used evidence from at least two sources, explained <strong>why</strong> the evidence matters (not just that it exists), and acknowledged at least one limitation of your analysis.</em></p>
      </div>
```

- [ ] **Step 2: Commit**

```bash
git add packages/canvas-design-studio/data/canvas-capabilities.yaml
git commit -m "feat(cds): canvas-capabilities.yaml — 8 initial patterns (5 supported + 3 aspirational) (#65)"
```

---

### Task 1.3: `catalog.ts` — loads YAML, validates schema, exposes typed accessors

**Files:**
- Create: `packages/canvas-design-studio/src/tools/showcase/catalog.ts`
- Test: `packages/canvas-design-studio/tests/showcase/catalog.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/canvas-design-studio/tests/showcase/catalog.test.ts`:

```ts
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadCatalog, getPatternById, loadCatalogFromPath } from '../../src/tools/showcase/catalog.js';

let tmpDir: string;
let yamlPath: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'showcase-catalog-'));
  yamlPath = join(tmpDir, 'canvas-capabilities.yaml');
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

const VALID_YAML = `
version: 1
updated: "2026-06-05"
categories:
  - id: information
    name: Information
    description: facts and definitions
patterns:
  - id: comparison-card
    name: Comparison Card
    category: information
    supportStatus: supported
    description: Side-by-side comparison.
    whenToUse: X vs Y content.
    exampleHtml: |
      <table><tr><td>A</td><td>B</td></tr></table>
`;

describe('loadCatalogFromPath', () => {
  it('parses a valid YAML catalog and returns typed structure', () => {
    writeFileSync(yamlPath, VALID_YAML);
    const catalog = loadCatalogFromPath(yamlPath);
    expect(catalog.version).toBe(1);
    expect(catalog.updated).toBe('2026-06-05');
    expect(catalog.categories).toHaveLength(1);
    expect(catalog.categories[0].id).toBe('information');
    expect(catalog.patterns).toHaveLength(1);
    expect(catalog.patterns[0].id).toBe('comparison-card');
    expect(catalog.patterns[0].supportStatus).toBe('supported');
    expect(catalog.patterns[0].exampleHtml).toContain('<table>');
  });

  it('throws CATALOG_NOT_FOUND when file is absent', () => {
    expect(() => loadCatalogFromPath(join(tmpDir, 'missing.yaml')))
      .toThrow(/CATALOG_NOT_FOUND/);
  });

  it('throws CATALOG_INVALID on YAML parse failure', () => {
    writeFileSync(yamlPath, 'this: is: not: valid: yaml: structure');
    expect(() => loadCatalogFromPath(yamlPath)).toThrow(/CATALOG_INVALID/);
  });

  it('throws CATALOG_INVALID when pattern.category references an undefined category', () => {
    writeFileSync(yamlPath, `
version: 1
updated: "2026-06-05"
categories:
  - id: information
    name: Information
    description: facts
patterns:
  - id: orphan
    name: Orphan
    category: nonexistent
    supportStatus: supported
    description: x
    whenToUse: x
    exampleHtml: |
      <p>x</p>
`);
    expect(() => loadCatalogFromPath(yamlPath)).toThrow(/CATALOG_INVALID/);
  });

  it('throws CATALOG_INVALID when pattern.supportStatus is not in the allowed set', () => {
    writeFileSync(yamlPath, `
version: 1
updated: "2026-06-05"
categories:
  - id: information
    name: Information
    description: facts
patterns:
  - id: weird-status
    name: Weird
    category: information
    supportStatus: pondering
    description: x
    whenToUse: x
    exampleHtml: |
      <p>x</p>
`);
    expect(() => loadCatalogFromPath(yamlPath)).toThrow(/CATALOG_INVALID/);
  });

  it('throws CATALOG_INVALID when a required field is missing', () => {
    writeFileSync(yamlPath, `
version: 1
updated: "2026-06-05"
categories:
  - id: information
    name: Information
    description: facts
patterns:
  - id: missing-fields
    name: Missing
    category: information
    supportStatus: supported
`);
    expect(() => loadCatalogFromPath(yamlPath)).toThrow(/CATALOG_INVALID/);
  });
});

describe('getPatternById', () => {
  it('returns the matching pattern', () => {
    writeFileSync(yamlPath, VALID_YAML);
    const catalog = loadCatalogFromPath(yamlPath);
    const p = getPatternById(catalog, 'comparison-card');
    expect(p).not.toBeNull();
    expect(p!.name).toBe('Comparison Card');
  });

  it('returns null when id is not in the catalog', () => {
    writeFileSync(yamlPath, VALID_YAML);
    const catalog = loadCatalogFromPath(yamlPath);
    expect(getPatternById(catalog, 'nonexistent')).toBeNull();
  });
});

describe('loadCatalog', () => {
  it('uses the default packaged path and parses the shipped yaml', () => {
    const catalog = loadCatalog();
    expect(catalog.version).toBeGreaterThanOrEqual(1);
    expect(catalog.patterns.length).toBeGreaterThanOrEqual(8);
    // Sanity-check the canonical IDs ship as expected
    expect(getPatternById(catalog, 'comparison-card')).not.toBeNull();
    expect(getPatternById(catalog, 'rubric-help-callout')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --workspace canvas-design-mcp -- catalog.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `catalog.ts`**

Create `packages/canvas-design-studio/src/tools/showcase/catalog.ts`:

```ts
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

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

const VALID_STATUS: ReadonlySet<SupportStatus> = new Set<SupportStatus>([
  'supported',
  'partial',
  'aspirational',
]);

function getPackagedYamlPath(): string {
  return fileURLToPath(new URL('../../../data/canvas-capabilities.yaml', import.meta.url));
}

export function loadCatalog(): CapabilityCatalog {
  return loadCatalogFromPath(getPackagedYamlPath());
}

export function loadCatalogFromPath(path: string): CapabilityCatalog {
  if (!existsSync(path)) {
    throw new Error(`CATALOG_NOT_FOUND: canvas-capabilities.yaml not present at ${path}`);
  }

  let raw: unknown;
  try {
    raw = parseYaml(readFileSync(path, 'utf-8'));
  } catch (err) {
    throw new Error(`CATALOG_INVALID: YAML parse failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  return validateCatalog(raw);
}

function validateCatalog(raw: unknown): CapabilityCatalog {
  if (!isObject(raw)) throw new Error('CATALOG_INVALID: top-level must be an object');

  const version = raw.version;
  if (typeof version !== 'number') throw new Error('CATALOG_INVALID: version must be a number');

  const updated = raw.updated;
  if (typeof updated !== 'string') throw new Error('CATALOG_INVALID: updated must be a string');

  const categories = raw.categories;
  if (!Array.isArray(categories) || categories.length === 0) {
    throw new Error('CATALOG_INVALID: categories must be a non-empty array');
  }

  const validatedCategories: CatalogCategory[] = categories.map((c, i) => {
    if (!isObject(c)) throw new Error(`CATALOG_INVALID: categories[${i}] must be an object`);
    requireString(c, 'id', `categories[${i}].id`);
    requireString(c, 'name', `categories[${i}].name`);
    requireString(c, 'description', `categories[${i}].description`);
    return { id: c.id as string, name: c.name as string, description: c.description as string };
  });

  const categoryIds = new Set(validatedCategories.map((c) => c.id));

  const patternsRaw = raw.patterns;
  if (!Array.isArray(patternsRaw)) {
    throw new Error('CATALOG_INVALID: patterns must be an array');
  }

  const validatedPatterns: CatalogPattern[] = patternsRaw.map((p, i) => {
    if (!isObject(p)) throw new Error(`CATALOG_INVALID: patterns[${i}] must be an object`);
    requireString(p, 'id', `patterns[${i}].id`);
    requireString(p, 'name', `patterns[${i}].name`);
    requireString(p, 'category', `patterns[${i}].category`);
    requireString(p, 'supportStatus', `patterns[${i}].supportStatus`);
    requireString(p, 'description', `patterns[${i}].description`);
    requireString(p, 'whenToUse', `patterns[${i}].whenToUse`);
    requireString(p, 'exampleHtml', `patterns[${i}].exampleHtml`);

    const category = p.category as string;
    if (!categoryIds.has(category)) {
      throw new Error(`CATALOG_INVALID: patterns[${i}].category="${category}" does not match any defined category`);
    }

    const status = p.supportStatus as string;
    if (!VALID_STATUS.has(status as SupportStatus)) {
      throw new Error(`CATALOG_INVALID: patterns[${i}].supportStatus="${status}" must be one of supported|partial|aspirational`);
    }

    const result: CatalogPattern = {
      id: p.id as string,
      name: p.name as string,
      category,
      supportStatus: status as SupportStatus,
      description: p.description as string,
      whenToUse: p.whenToUse as string,
      exampleHtml: p.exampleHtml as string,
    };
    if (typeof p.notes === 'string') result.notes = p.notes;
    return result;
  });

  return {
    version,
    updated,
    categories: validatedCategories,
    patterns: validatedPatterns,
  };
}

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function requireString(obj: Record<string, unknown>, key: string, label: string): void {
  if (typeof obj[key] !== 'string' || (obj[key] as string).length === 0) {
    throw new Error(`CATALOG_INVALID: ${label} must be a non-empty string`);
  }
}

export function getPatternById(catalog: CapabilityCatalog, id: string): CatalogPattern | null {
  return catalog.patterns.find((p) => p.id === id) ?? null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --workspace canvas-design-mcp -- catalog.test.ts`
Expected: PASS — 9 tests (6 loadCatalogFromPath + 2 getPatternById + 1 loadCatalog).

- [ ] **Step 5: Commit**

```bash
git add packages/canvas-design-studio/src/tools/showcase/catalog.ts packages/canvas-design-studio/tests/showcase/catalog.test.ts
git commit -m "feat(cds): catalog loader for canvas-capabilities.yaml with schema validation (#65)"
```

---

## Phase 2 — CDS Render Module

### Task 2.1: `render_preview.ts` — writes standalone HTML preview

**Files:**
- Create: `packages/canvas-design-studio/src/tools/showcase/render_preview.ts`
- Test: `packages/canvas-design-studio/tests/showcase/render_preview.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/canvas-design-studio/tests/showcase/render_preview.test.ts`:

```ts
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderPreview } from '../../src/tools/showcase/render_preview.js';
import { loadCatalogFromPath } from '../../src/tools/showcase/catalog.js';

let tmpHome: string;
let yamlPath: string;
const ORIGINAL_CC_HOME = process.env.CC_HOME;

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'showcase-render-'));
  process.env.CC_HOME = tmpHome;
  yamlPath = join(tmpHome, 'cat.yaml');
});

afterEach(() => {
  rmSync(tmpHome, { recursive: true, force: true });
  if (ORIGINAL_CC_HOME === undefined) delete process.env.CC_HOME;
  else process.env.CC_HOME = ORIGINAL_CC_HOME;
});

const YAML = `
version: 1
updated: "2026-06-05"
categories:
  - id: information
    name: Information
    description: facts
patterns:
  - id: comparison-card
    name: Comparison Card
    category: information
    supportStatus: supported
    description: Side-by-side comparison.
    whenToUse: X vs Y content.
    notes: Uses inline CSS only.
    exampleHtml: |
      <table style="width:100%;"><tr><td>A</td><td>B</td></tr></table>
  - id: tabbed-layout-target
    name: Tabs
    category: information
    supportStatus: aspirational
    description: Tabs via CSS :target.
    whenToUse: 3-5 parallel sections.
    exampleHtml: |
      <p>tabs go here</p>
`;

describe('renderPreview', () => {
  it('writes preview HTML to ~/.command-and-control/showcase-previews/<id>.html', () => {
    writeFileSync(yamlPath, YAML);
    const catalog = loadCatalogFromPath(yamlPath);

    const result = renderPreview(catalog, 'comparison-card');

    expect(result.patternId).toBe('comparison-card');
    expect(result.previewPath).toBe(join(tmpHome, 'showcase-previews', 'comparison-card.html'));
    expect(existsSync(result.previewPath)).toBe(true);
  });

  it('HTML contains the pattern name, description, whenToUse, and exampleHtml', () => {
    writeFileSync(yamlPath, YAML);
    const catalog = loadCatalogFromPath(yamlPath);

    const result = renderPreview(catalog, 'comparison-card');
    const html = readFileSync(result.previewPath, 'utf-8');

    expect(html).toContain('<title>Comparison Card');
    expect(html).toContain('<h1>Comparison Card</h1>');
    expect(html).toContain('Side-by-side comparison.');
    expect(html).toContain('X vs Y content.');
    expect(html).toContain('Uses inline CSS only.');
    expect(html).toContain('<table style="width:100%;"><tr><td>A</td><td>B</td></tr></table>');
  });

  it('applies the status-supported class for supported patterns', () => {
    writeFileSync(yamlPath, YAML);
    const catalog = loadCatalogFromPath(yamlPath);

    const result = renderPreview(catalog, 'comparison-card');
    const html = readFileSync(result.previewPath, 'utf-8');

    expect(html).toMatch(/class="status status-supported"/);
  });

  it('applies the status-aspirational class for aspirational patterns', () => {
    writeFileSync(yamlPath, YAML);
    const catalog = loadCatalogFromPath(yamlPath);

    const result = renderPreview(catalog, 'tabbed-layout-target');
    const html = readFileSync(result.previewPath, 'utf-8');

    expect(html).toMatch(/class="status status-aspirational"/);
  });

  it('omits the notes block when the pattern has no notes field', () => {
    writeFileSync(yamlPath, YAML);
    const catalog = loadCatalogFromPath(yamlPath);

    const result = renderPreview(catalog, 'tabbed-layout-target');
    const html = readFileSync(result.previewPath, 'utf-8');

    expect(html).not.toMatch(/<strong>Note:<\/strong>/);
  });

  it('overwrites cleanly on repeated render', () => {
    writeFileSync(yamlPath, YAML);
    const catalog = loadCatalogFromPath(yamlPath);

    const first = renderPreview(catalog, 'comparison-card');
    const second = renderPreview(catalog, 'comparison-card');

    expect(first.previewPath).toBe(second.previewPath);
    expect(existsSync(first.previewPath)).toBe(true);
  });

  it('throws PATTERN_NOT_FOUND when patternId is not in the catalog', () => {
    writeFileSync(yamlPath, YAML);
    const catalog = loadCatalogFromPath(yamlPath);

    expect(() => renderPreview(catalog, 'no-such-pattern')).toThrow(/PATTERN_NOT_FOUND/);
  });

  it('escapes HTML special characters in metadata fields (description, whenToUse, name) but passes exampleHtml through raw', () => {
    const yamlWithSpecials = `
version: 1
updated: "2026-06-05"
categories:
  - id: information
    name: Information
    description: facts
patterns:
  - id: xss-test
    name: 'Name <with> "quotes" & ampersand'
    category: information
    supportStatus: supported
    description: 'Description with <em>tags</em> in it'
    whenToUse: 'When you want & cool things'
    exampleHtml: |
      <strong>raw html should pass through</strong>
`;
    writeFileSync(yamlPath, yamlWithSpecials);
    const catalog = loadCatalogFromPath(yamlPath);

    const result = renderPreview(catalog, 'xss-test');
    const html = readFileSync(result.previewPath, 'utf-8');

    // Metadata fields should be HTML-escaped
    expect(html).toContain('Name &lt;with&gt; &quot;quotes&quot; &amp; ampersand');
    expect(html).toContain('Description with &lt;em&gt;tags&lt;/em&gt; in it');
    expect(html).toContain('When you want &amp; cool things');
    // But exampleHtml goes through raw
    expect(html).toContain('<strong>raw html should pass through</strong>');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --workspace canvas-design-mcp -- render_preview.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `render_preview.ts`**

Create `packages/canvas-design-studio/src/tools/showcase/render_preview.ts`:

```ts
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { getPatternById, type CapabilityCatalog, type CatalogPattern } from './catalog.js';

export interface RenderPreviewResult {
  patternId: string;
  previewPath: string;
}

const PAGE_TEMPLATE = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>{{TITLE_ESC}} — Canvas Capability Preview</title>
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
    <h1>{{NAME_ESC}}</h1>
    <p><strong>Category:</strong> {{CATEGORY_ESC}}
       · <strong>Status:</strong> <span class="status status-{{STATUS}}">{{STATUS}}</span></p>
    <p>{{DESCRIPTION_ESC}}</p>
    <p><em>When to use:</em> {{WHEN_TO_USE_ESC}}</p>
{{NOTES_BLOCK}}
  </div>
  <h2>Rendered example</h2>
  <div class="preview-content">
{{EXAMPLE_HTML_RAW}}
  </div>
</body>
</html>
`;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildHtml(pattern: CatalogPattern, categoryName: string): string {
  const notesBlock = pattern.notes
    ? `    <p><strong>Note:</strong> ${escapeHtml(pattern.notes)}</p>`
    : '';

  return PAGE_TEMPLATE
    .replace(/\{\{TITLE_ESC\}\}/g, escapeHtml(pattern.name))
    .replace(/\{\{NAME_ESC\}\}/g, escapeHtml(pattern.name))
    .replace(/\{\{CATEGORY_ESC\}\}/g, escapeHtml(categoryName))
    .replace(/\{\{STATUS\}\}/g, pattern.supportStatus)
    .replace(/\{\{DESCRIPTION_ESC\}\}/g, escapeHtml(pattern.description))
    .replace(/\{\{WHEN_TO_USE_ESC\}\}/g, escapeHtml(pattern.whenToUse))
    .replace(/\{\{NOTES_BLOCK\}\}/g, notesBlock)
    .replace(/\{\{EXAMPLE_HTML_RAW\}\}/g, pattern.exampleHtml);
}

function getCacheDir(): string {
  return join(process.env.CC_HOME ?? join(homedir(), '.command-and-control'), 'showcase-previews');
}

export function renderPreview(catalog: CapabilityCatalog, patternId: string): RenderPreviewResult {
  const pattern = getPatternById(catalog, patternId);
  if (!pattern) {
    throw new Error(`PATTERN_NOT_FOUND: pattern "${patternId}" is not in the catalog`);
  }

  const category = catalog.categories.find((c) => c.id === pattern.category);
  const categoryName = category?.name ?? pattern.category;

  const html = buildHtml(pattern, categoryName);

  const dir = getCacheDir();
  mkdirSync(dir, { recursive: true });
  const previewPath = join(dir, `${patternId}.html`);
  const tmpPath = `${previewPath}.tmp`;
  writeFileSync(tmpPath, html, 'utf-8');
  renameSync(tmpPath, previewPath);

  return { patternId, previewPath };
}
```

**Note on `CC_HOME`:** in production, `CC_HOME` is set by C&C's `getCcHomePath()`. Tests set it directly to a temp dir. The render module doesn't depend on C&C at all — it just respects the env var if present, otherwise falls back to `~/.command-and-control/`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --workspace canvas-design-mcp -- render_preview.test.ts`
Expected: PASS — 8 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/canvas-design-studio/src/tools/showcase/render_preview.ts packages/canvas-design-studio/tests/showcase/render_preview.test.ts
git commit -m "feat(cds): render_preview writes standalone HTML preview to user cache (#65)"
```

---

## Phase 3 — C&C MCP Tools

### Task 3.1: `show_canvas_capabilities` — returns categorized catalog markdown

**Files:**
- Create: `packages/command-and-control/src/tools/showcase/show_canvas_capabilities.ts`
- Test: `packages/command-and-control/tests/tools/showcase/show_canvas_capabilities.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/command-and-control/tests/tools/showcase/show_canvas_capabilities.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { showCanvasCapabilities } from '../../../src/tools/showcase/show_canvas_capabilities.js';

describe('showCanvasCapabilities', () => {
  it('returns the catalog as markdown with two top-level sections', async () => {
    const result = await showCanvasCapabilities({});

    expect(result.catalogVersion).toBeGreaterThanOrEqual(1);
    expect(result.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.catalog).toContain('# Canvas Capabilities');
    expect(result.catalog).toContain('Currently Supported');
    expect(result.catalog).toContain('Aspirational');
    expect(result.patternIds.length).toBeGreaterThanOrEqual(8);
  });

  it('groups patterns by category within each section', async () => {
    const result = await showCanvasCapabilities({});
    expect(result.catalog).toMatch(/### Information/);
    expect(result.catalog).toMatch(/### Interactive/);
    expect(result.catalog).toMatch(/### Pedagogical/);
  });

  it('includes pattern IDs in monospace inside the markdown', async () => {
    const result = await showCanvasCapabilities({});
    expect(result.catalog).toMatch(/`comparison-card`/);
    expect(result.catalog).toMatch(/`accordion-details`/);
  });

  it('mentions preview_canvas_pattern as the next-step instruction', async () => {
    const result = await showCanvasCapabilities({});
    expect(result.catalog).toMatch(/preview_canvas_pattern/);
  });

  it('filters by category', async () => {
    const result = await showCanvasCapabilities({ category: 'information' });
    expect(result.patternIds).toContain('comparison-card');
    expect(result.patternIds).toContain('callout-box');
    expect(result.patternIds).toContain('vocab-table');
    expect(result.patternIds).not.toContain('accordion-details');
  });

  it('filters by supportStatus', async () => {
    const result = await showCanvasCapabilities({ supportStatus: 'aspirational' });
    expect(result.patternIds).toContain('tabbed-layout-target');
    expect(result.patternIds).not.toContain('comparison-card');
    expect(result.catalog).not.toContain('Currently Supported');
  });

  it('returns flat patternIds matching what is shown in markdown', async () => {
    const result = await showCanvasCapabilities({});
    for (const id of result.patternIds) {
      expect(result.catalog).toContain(`\`${id}\``);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --workspace command-and-control-mcp -- show_canvas_capabilities.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `show_canvas_capabilities.ts`**

Create `packages/command-and-control/src/tools/showcase/show_canvas_capabilities.ts`:

```ts
import { loadCatalog, type CapabilityCatalog, type CatalogPattern, type SupportStatus } from 'canvas-design-mcp/dist/tools/showcase/catalog.js';

export interface ShowCanvasCapabilitiesInput {
  category?: string;
  supportStatus?: SupportStatus;
}

export interface ShowCanvasCapabilitiesResult {
  catalogVersion: number;
  updated: string;
  catalog: string;
  patternIds: string[];
}

export async function showCanvasCapabilities(
  input: ShowCanvasCapabilitiesInput,
): Promise<ShowCanvasCapabilitiesResult> {
  const catalog = loadCatalog();
  const filtered = applyFilters(catalog.patterns, input);
  const markdown = formatMarkdown(catalog, filtered, input);
  return {
    catalogVersion: catalog.version,
    updated: catalog.updated,
    catalog: markdown,
    patternIds: filtered.map((p) => p.id),
  };
}

function applyFilters(
  patterns: CatalogPattern[],
  input: ShowCanvasCapabilitiesInput,
): CatalogPattern[] {
  return patterns.filter((p) => {
    if (input.category && p.category !== input.category) return false;
    if (input.supportStatus && p.supportStatus !== input.supportStatus) return false;
    return true;
  });
}

function isSupportedTier(p: CatalogPattern): boolean {
  return p.supportStatus === 'supported' || p.supportStatus === 'partial';
}

function formatMarkdown(
  catalog: CapabilityCatalog,
  patterns: CatalogPattern[],
  input: ShowCanvasCapabilitiesInput,
): string {
  const lines: string[] = [];
  lines.push('# Canvas Capabilities');
  lines.push('');
  lines.push(`Updated ${catalog.updated} (catalog v${catalog.version})`);
  lines.push('');
  lines.push('---');
  lines.push('');

  const supported = patterns.filter(isSupportedTier);
  const aspirational = patterns.filter((p) => p.supportStatus === 'aspirational');

  // When a filter excludes a whole section, skip the section header.
  if (supported.length > 0 && input.supportStatus !== 'aspirational') {
    lines.push('## ✅ Currently Supported');
    lines.push('');
    appendCategoryGrouped(lines, catalog, supported);
  }

  if (aspirational.length > 0 && input.supportStatus !== 'supported' && input.supportStatus !== 'partial') {
    lines.push('## 🛠 Aspirational (not yet generated by CDS)');
    lines.push('');
    lines.push('These patterns are Canvas-safe but CDS does not currently produce them.');
    lines.push('Listed for awareness and as a roadmap signal.');
    lines.push('');
    appendCategoryGrouped(lines, catalog, aspirational);
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}

function appendCategoryGrouped(
  lines: string[],
  catalog: CapabilityCatalog,
  patterns: CatalogPattern[],
): void {
  for (const cat of catalog.categories) {
    const catPatterns = patterns.filter((p) => p.category === cat.id);
    if (catPatterns.length === 0) continue;
    lines.push(`### ${cat.name}`);
    lines.push('');
    for (const p of catPatterns) {
      const partialMark = p.supportStatus === 'partial' ? ' *(partial)*' : '';
      lines.push(`#### ${p.name}  (\`${p.id}\`)${partialMark}`);
      lines.push('');
      lines.push(p.description.trim());
      lines.push('');
      lines.push(`**When to use:** ${p.whenToUse.trim()}`);
      lines.push('');
      lines.push(`To see this pattern rendered, ask for \`preview_canvas_pattern\` with \`patternId: "${p.id}"\`.`);
      lines.push('');
    }
  }
}
```

**Implementation note on the import path:** `canvas-design-mcp/dist/tools/showcase/catalog.js` is the built path of the CDS module. C&C consumes CDS as a workspace dep (`"canvas-design-mcp": "*"` in `dependencies`), so importing from its `dist/` is the established pattern in this repo (see how `enrich_panopto_transcripts.ts` already imports `canvas-design-mcp/dist/tools/panopto-enrich.js`). **Important:** this means the CDS build must run before C&C tests pick up Phase 2's changes. Step 4 below runs the CDS build first.

- [ ] **Step 4: Build CDS so C&C can import the new module**

Run: `npm run build --workspace canvas-design-mcp`
Expected: exit 0.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test --workspace command-and-control-mcp -- show_canvas_capabilities.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/command-and-control/src/tools/showcase/show_canvas_capabilities.ts packages/command-and-control/tests/tools/showcase/show_canvas_capabilities.test.ts
git commit -m "feat(cc): show_canvas_capabilities MCP tool — returns categorized markdown catalog (#65)"
```

---

### Task 3.2: `preview_canvas_pattern` — writes preview, returns path

**Files:**
- Create: `packages/command-and-control/src/tools/showcase/preview_canvas_pattern.ts`
- Test: `packages/command-and-control/tests/tools/showcase/preview_canvas_pattern.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/command-and-control/tests/tools/showcase/preview_canvas_pattern.test.ts`:

```ts
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { previewCanvasPattern } from '../../../src/tools/showcase/preview_canvas_pattern.js';

let tmpHome: string;
const ORIGINAL_CC_HOME = process.env.CC_HOME;

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'cc-preview-'));
  process.env.CC_HOME = tmpHome;
});

afterEach(() => {
  rmSync(tmpHome, { recursive: true, force: true });
  if (ORIGINAL_CC_HOME === undefined) delete process.env.CC_HOME;
  else process.env.CC_HOME = ORIGINAL_CC_HOME;
});

describe('previewCanvasPattern', () => {
  it('happy path: returns ok=true with previewPath, catalogEntry, openInstruction', async () => {
    const result = await previewCanvasPattern({ patternId: 'comparison-card' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.patternId).toBe('comparison-card');
    expect(result.previewPath).toBe(join(tmpHome, 'showcase-previews', 'comparison-card.html'));
    expect(existsSync(result.previewPath)).toBe(true);
    expect(result.openInstruction).toMatch(/file:\/\//);
    expect(result.catalogEntry.name).toBe('Comparison Card');
    expect(result.catalogEntry.category).toBe('information');
    expect(result.catalogEntry.supportStatus).toBe('supported');
  });

  it('returns PATTERN_NOT_FOUND for an unknown id and writes no file', async () => {
    const result = await previewCanvasPattern({ patternId: 'this-pattern-does-not-exist' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('PATTERN_NOT_FOUND');
    expect(result.fix).toEqual(expect.arrayContaining([expect.stringMatching(/show_canvas_capabilities/)]));
    expect(existsSync(join(tmpHome, 'showcase-previews', 'this-pattern-does-not-exist.html'))).toBe(false);
  });

  it('works for aspirational patterns too', async () => {
    const result = await previewCanvasPattern({ patternId: 'tabbed-layout-target' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.catalogEntry.supportStatus).toBe('aspirational');
  });

  it('openInstruction contains the absolute preview path', async () => {
    const result = await previewCanvasPattern({ patternId: 'callout-box' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.openInstruction).toContain(result.previewPath);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --workspace command-and-control-mcp -- preview_canvas_pattern.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `preview_canvas_pattern.ts`**

Create `packages/command-and-control/src/tools/showcase/preview_canvas_pattern.ts`:

```ts
import {
  loadCatalog,
  getPatternById,
  type SupportStatus,
} from 'canvas-design-mcp/dist/tools/showcase/catalog.js';
import { renderPreview } from 'canvas-design-mcp/dist/tools/showcase/render_preview.js';

export interface PreviewCanvasPatternInput {
  patternId: string;
}

export type PreviewCanvasPatternResult =
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

function classifyCatalogError(err: unknown): { error: 'CATALOG_NOT_FOUND' | 'CATALOG_INVALID'; message: string } {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.startsWith('CATALOG_NOT_FOUND')) return { error: 'CATALOG_NOT_FOUND', message: msg };
  return { error: 'CATALOG_INVALID', message: msg };
}

export async function previewCanvasPattern(
  input: PreviewCanvasPatternInput,
): Promise<PreviewCanvasPatternResult> {
  let catalog;
  try {
    catalog = loadCatalog();
  } catch (err) {
    const classified = classifyCatalogError(err);
    return {
      ok: false,
      ...classified,
      fix:
        classified.error === 'CATALOG_NOT_FOUND'
          ? ['Reinstall canvas-toolchain or pull the latest']
          : ['Open packages/canvas-design-studio/data/canvas-capabilities.yaml and check syntax'],
    };
  }

  const pattern = getPatternById(catalog, input.patternId);
  if (!pattern) {
    return {
      ok: false,
      error: 'PATTERN_NOT_FOUND',
      message: `Pattern "${input.patternId}" is not in the catalog`,
      fix: ['Run show_canvas_capabilities to see valid pattern IDs'],
    };
  }

  let rendered;
  try {
    rendered = renderPreview(catalog, input.patternId);
  } catch (err) {
    return {
      ok: false,
      error: 'PREVIEW_WRITE_FAILED',
      message: err instanceof Error ? err.message : String(err),
      fix: ['Check ~/.command-and-control/showcase-previews/ is writable'],
    };
  }

  return {
    ok: true,
    patternId: rendered.patternId,
    previewPath: rendered.previewPath,
    openInstruction: `Open file://${rendered.previewPath} in your browser to view the rendered pattern.`,
    catalogEntry: {
      name: pattern.name,
      category: pattern.category,
      supportStatus: pattern.supportStatus,
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --workspace command-and-control-mcp -- preview_canvas_pattern.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/command-and-control/src/tools/showcase/preview_canvas_pattern.ts packages/command-and-control/tests/tools/showcase/preview_canvas_pattern.test.ts
git commit -m "feat(cc): preview_canvas_pattern MCP tool — writes standalone HTML preview (#65)"
```

---

### Task 3.3: Register both MCP tools in `src/index.ts`

**Files:**
- Modify: `packages/command-and-control/src/index.ts`

- [ ] **Step 1: Locate the existing registration pattern**

Run: `rg "setup_ollama" packages/command-and-control/src/index.ts -n`
Note the line numbers — `setup_ollama` was registered in issue #89. Mirror its structure.

The C&C MCP server uses the `ListToolsRequestSchema` + `CallToolRequestSchema` switch-case pattern (NOT the higher-level `server.tool()` shorthand). Match what's already there.

- [ ] **Step 2: Add imports**

Near the other tool imports in `packages/command-and-control/src/index.ts`, add:

```ts
import { showCanvasCapabilities } from './tools/showcase/show_canvas_capabilities.js';
import { previewCanvasPattern } from './tools/showcase/preview_canvas_pattern.js';
```

- [ ] **Step 3: Add `ListToolsRequestSchema` entries**

Locate the `ListToolsRequestSchema` handler (it returns an array of `{ name, description, inputSchema }`). Add two entries adjacent to the `setup_ollama` entry — or wherever showcase-discovery feels natural. The two entries:

```ts
{
  name: 'show_canvas_capabilities',
  description:
    "Returns the catalog of Canvas-safe design patterns. Optionally filter by category " +
    "(layout, information, interactive, pedagogical, branded) or supportStatus " +
    "(supported, partial, aspirational). Use this to discover what patterns exist; " +
    "then call preview_canvas_pattern to see any specific pattern rendered.",
  inputSchema: {
    type: 'object',
    properties: {
      category: { type: 'string', description: 'Filter to one category id.' },
      supportStatus: {
        type: 'string',
        enum: ['supported', 'partial', 'aspirational'],
        description: 'Filter by supportStatus.',
      },
    },
  },
},
{
  name: 'preview_canvas_pattern',
  description:
    "Renders a specific Canvas capability pattern to a standalone HTML file " +
    "that can be opened in any browser. Use this after show_canvas_capabilities " +
    "to actually see a pattern in action.",
  inputSchema: {
    type: 'object',
    properties: {
      patternId: { type: 'string', description: 'Pattern ID from show_canvas_capabilities.' },
    },
    required: ['patternId'],
  },
},
```

- [ ] **Step 4: Add `CallToolRequestSchema` switch cases**

Locate the `CallToolRequestSchema` switch (it dispatches on `name` to the tool's async function). Add two cases adjacent to the `setup_ollama` case:

```ts
case 'show_canvas_capabilities': {
  const result = await showCanvasCapabilities(args as unknown as Parameters<typeof showCanvasCapabilities>[0]);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
}
case 'preview_canvas_pattern': {
  const result = await previewCanvasPattern(args as unknown as Parameters<typeof previewCanvasPattern>[0]);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
}
```

If the existing pattern uses a slightly different wrapper (e.g., a `wrapResult` helper), match that — `rg "setup_ollama" packages/command-and-control/src/index.ts -B 2 -A 6` will show exactly how setup_ollama's case is shaped.

- [ ] **Step 5: Build to verify TypeScript compiles**

Run: `npm run build --workspace command-and-control-mcp`
Expected: tsc exits 0.

- [ ] **Step 6: Verify all existing tests still pass**

Run: `npm test --workspace command-and-control-mcp`
Expected: PASS — no regressions; +11 tests from Phase 3.

- [ ] **Step 7: Commit**

```bash
git add packages/command-and-control/src/index.ts
git commit -m "feat(cc): register show_canvas_capabilities + preview_canvas_pattern MCP tools (#65)"
```

---

## Phase 4 — Docs

### Task 4.1: Update `CLAUDE.md` with the new tools

**Files:**
- Modify: `packages/command-and-control/CLAUDE.md`

- [ ] **Step 1: Add the new tools to the "Implemented" bullet list**

Read `packages/command-and-control/CLAUDE.md`. Locate the `Implemented:` bullet list under `## Current Integration State`. Append two bullets at the end of that list:

```markdown
- `show_canvas_capabilities` MCP tool — returns the canvas-capabilities.yaml catalog as readable markdown, grouped into ✅ Currently Supported and 🛠 Aspirational sections. Optional `category` and `supportStatus` filters.
- `preview_canvas_pattern` MCP tool — renders a specific pattern to a standalone HTML preview at `~/.command-and-control/showcase-previews/<patternId>.html`. Returns an `openInstruction` like `Open file://… in your browser`.
```

- [ ] **Step 2: Append a "Canvas Capability Showcase" subsection**

After the `## Provider Switching Workflow` section (added by #89), insert:

```markdown
## Canvas Capability Showcase

Two MCP tools surface the Canvas-safe design pattern catalog so professors can discover what's possible without reading the KB:

```text
Browse:  show_canvas_capabilities
Filter:  show_canvas_capabilities({ category: 'information' })
         show_canvas_capabilities({ supportStatus: 'aspirational' })
Render:  preview_canvas_pattern({ patternId: 'comparison-card' })
          → writes ~/.command-and-control/showcase-previews/<id>.html
          → return value includes an "Open file://…" instruction
```

The catalog lives at `packages/canvas-design-studio/data/canvas-capabilities.yaml`. Adding a new pattern is a content PR — no TypeScript change. Each pattern has a `supportStatus` of `supported`, `partial`, or `aspirational`; aspirational entries represent Canvas-safe possibilities CDS does not yet generate, and serve as a roadmap signal for future work.

See `packages/command-and-control/docs/superpowers/specs/2026-06-05-canvas-capability-showcase-design.md` for the full data model and tool contracts.
```

- [ ] **Step 3: Commit**

```bash
git add packages/command-and-control/CLAUDE.md
git commit -m "docs(cc): CLAUDE.md — Canvas capability showcase tools (#65)"
```

---

## Phase 5 — Final Verification + Issue Close

### Task 5.1: Full monorepo regression + close #65

**Files:** none modified.

- [ ] **Step 1: Build every package**

Run: `npm run build --workspaces`
Expected: every package's tsc exits 0.

- [ ] **Step 2: Run every package's tests**

Run: `npm test --workspaces`
Expected: every package's vitest exits 0. canvas-design-mcp gains ~17 tests; command-and-control-mcp gains ~11 tests.

- [ ] **Step 3: Run smoke integration**

Run: `npm run smoke:integration --workspace command-and-control-mcp`
Expected: completes without error. (Smoke does not exercise the showcase tools — that's fine; they're discovery-only and have no end-to-end pipeline implication.)

- [ ] **Step 4: Verify acceptance criteria**

Check each AC from the spec ("Acceptance Criteria" section):

1. `packages/canvas-design-studio/data/canvas-capabilities.yaml` ships with at least 8 patterns spanning 4+ categories, 5 supported + 3 aspirational. — Confirmed in Task 1.2.
2. `show_canvas_capabilities({})` returns all patterns grouped into ✅ Supported and 🛠 Aspirational. — Confirmed by Phase 3 Task 3.1 tests.
3. Filters narrow the result. — Confirmed by Phase 3 Task 3.1 tests.
4. `preview_canvas_pattern({ patternId })` writes a viewable HTML file. — Confirmed by Phase 3 Task 3.2 tests + Phase 2 Task 2.1 tests.
5. Unknown id returns `PATTERN_NOT_FOUND` with the right fix, no file written. — Confirmed by Phase 3 Task 3.2 tests.
6. All new tests pass. — Confirmed by Step 2 above.
7. Existing tests still pass. — Confirmed by Step 2 above.
8. Documentation. — Confirmed by Phase 4 Task 4.1.

If any AC fails, do not proceed to Step 5. Open a follow-up task to fix the gap.

- [ ] **Step 5: Push**

Run: `git push origin main`
Expected: push succeeds.

- [ ] **Step 6: Close #65 with ship documentation**

Run:

```bash
gh issue comment 65 --repo Ryfter/canvas-toolchain --body "$(cat <<'EOF'
## Shipped

All 8 acceptance criteria met. Summary:

- New YAML-driven catalog at `packages/canvas-design-studio/data/canvas-capabilities.yaml` with 8 initial patterns (5 supported + 3 aspirational across 4 categories).
- Two new C&C MCP tools:
  - `show_canvas_capabilities` — returns the catalog as markdown grouped into ✅ Currently Supported and 🛠 Aspirational sections. Optional category and supportStatus filters.
  - `preview_canvas_pattern` — writes a standalone HTML preview to `~/.command-and-control/showcase-previews/<patternId>.html` for any specific pattern. Return value includes an `Open file://…` instruction.
- CDS modules: `src/tools/showcase/catalog.ts` (load + validate YAML) and `src/tools/showcase/render_preview.ts` (write standalone HTML).
- Schema validation rejects malformed catalogs at load time with structured errors (`CATALOG_NOT_FOUND`, `CATALOG_INVALID`).

### Per ADR 1, deferred

A separate form-driven template creator is deferred — `brainstorm_interactive` (#45) already covers guided page creation. If demand surfaces for a more structured creation flow, open a follow-up.

### Per the spec's out-of-scope list, also deferred

- Auto-publishing previews to Canvas
- Theme application to previews
- Catalog full-text search
- Pattern dependencies / "requires"
- Auto-suggest patterns from course content
- Web UI to browse the catalog

Spec: `packages/command-and-control/docs/superpowers/specs/2026-06-05-canvas-capability-showcase-design.md`
Plan: `packages/command-and-control/docs/superpowers/plans/2026-06-05-canvas-capability-showcase.md`
EOF
)"
```

Then close the issue:

```bash
gh issue close 65 --repo Ryfter/canvas-toolchain --reason "completed"
```

---

## Summary

| Phase | Tasks | New tests | Files created | Files modified |
|---|---|---|---|---|
| 0 | 1 baseline check | 0 | 0 | 0 |
| 1 | 3 (yaml dep, yaml file, catalog.ts) | ~9 | 2 + 1 | 1 |
| 2 | 1 (render_preview.ts) | ~8 | 1 | 0 |
| 3 | 3 (show, preview, register) | ~11 | 2 | 1 |
| 4 | 1 docs | 0 | 0 | 1 |
| 5 | 1 (regression + close) | 0 | 0 | 0 |
| **Total** | **10 tasks** | **~28 new tests** | **6 new files** | **3 modified files** |
