# Content Priority Tier System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a per-section tier system (1=at-a-glance, 2=working-detail, 3=deep-support) tagged by CI and rendered as a TL;DR card at the top of CDS pages. Additive only — pages without tier data render exactly as today.

**Architecture:** CI's `analyze_course` gains an optional `courseDir` input that triggers a per-page tier-assignment phase using an LLM. Tier data is written to each page's front matter (`tiers:` block). CDS's `generate-page` reads that block and, when tier-1 sections exist, prepends a TL;DR card to the rendered body.

**Tech Stack:** TypeScript ESM, vitest 2.x, `yaml` package (already in CDS; new dep for CI). LLM access via #89's `resolveActiveLlmClient`.

**Spec:** `packages/command-and-control/docs/superpowers/specs/2026-06-06-content-priority-tiers-design.md`

**Issue:** [#66](https://github.com/Ryfter/canvas-toolchain/issues/66)

---

## Phase 0 — Baseline Verification

### Task 0.1: Confirm clean tree and baseline tests pass

**Files:** none.

- [ ] **Step 1: Confirm clean tree**

Run: `git status`
Expected: clean on `main`.

- [ ] **Step 2: Baseline test counts**

Run: `npm test --workspaces`
Expected: all green. Note baseline counts for canvas-design-mcp (typically ~612), curriculum-intelligence-mcp (typically ~222), command-and-control-mcp (typically ~493), shared-llm (29), shared-types (1).

- [ ] **Step 3: Run smoke**

Run: `npm run smoke:integration --workspace command-and-control-mcp`
Expected: passes.

---

## Phase 1 — Shared Types

### Task 1.1: Add `Tier`, `SectionTier`, `PageTiers` to shared-types

**Files:**
- Modify: `packages/shared-types/src/index.ts`
- Test: `packages/shared-types/tests/index.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `packages/shared-types/tests/index.test.ts` inside the main describe block:

```ts
  it('exports the tier system types from #66', () => {
    const sample: import('../src/index.js').PageTiers = {
      locked: false,
      sections: [
        { heading: 'Due Date', tier: 1, summary: 'Friday Oct 17 at 11:59 PM' },
        { heading: 'Submission Instructions', tier: 2, summary: 'Single PDF max 3 pages' },
      ],
    };
    expect(sample.sections).toHaveLength(2);
    expect(sample.sections[0].tier).toBe(1);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @canvas-toolchain/shared-types`
Expected: FAIL — type `PageTiers` doesn't exist.

- [ ] **Step 3: Add the exports**

Append to `packages/shared-types/src/index.ts`:

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

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --workspace @canvas-toolchain/shared-types`
Expected: PASS — 2 tests.

- [ ] **Step 5: Build the package**

Run: `npm run build --workspace @canvas-toolchain/shared-types`
Expected: tsc exits 0.

- [ ] **Step 6: Commit**

```bash
git add packages/shared-types/src/index.ts packages/shared-types/tests/index.test.ts
git commit -m "feat(shared-types): Tier, SectionTier, PageTiers types for #66"
```

---

## Phase 2 — CI: `assign_tiers` Module

### Task 2.1: Add `yaml` dependency to curriculum-intelligence

**Files:** `packages/curriculum-intelligence/package.json`

- [ ] **Step 1: Install**

```bash
npm install --workspace curriculum-intelligence-mcp yaml@^2.5.0
```

- [ ] **Step 2: Verify**

Run: `npm ls --workspace curriculum-intelligence-mcp yaml`
Expected: yaml listed.

- [ ] **Step 3: Commit**

```bash
git add packages/curriculum-intelligence/package.json package-lock.json
git commit -m "build(ci): add yaml dependency for #66 front-matter parsing"
```

---

### Task 2.2: Implement `assign_tiers.ts` with LLM-driven tier assignment

**Files:**
- Create: `packages/curriculum-intelligence/src/analyze/assign_tiers.ts`
- Test: `packages/curriculum-intelligence/tests/analyze/assign_tiers.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/curriculum-intelligence/tests/analyze/assign_tiers.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { assignTiers } from '../../src/analyze/assign_tiers.js';
import type { LlmClient } from '@canvas-toolchain/shared-llm';

function makeFakeLlm(response: string): LlmClient {
  return {
    async complete() {
      return { text: response, usage: { inputTokens: 1, outputTokens: 1 } };
    },
  };
}

const SECTIONS = [
  { heading: 'Due Date', body: 'October 17 at 11:59 PM' },
  { heading: 'Submission Instructions', body: 'Upload a single PDF.' },
  { heading: 'Rubric Breakdown', body: 'Analytical rigor + writing quality.' },
];

describe('assignTiers', () => {
  it('happy path: returns validated PageTiers from a well-formed LLM response', async () => {
    const llm = makeFakeLlm(JSON.stringify({
      sections: [
        { heading: 'Due Date', tier: 1, summary: 'Oct 17 by 11:59 PM' },
        { heading: 'Submission Instructions', tier: 2, summary: 'Single PDF' },
        { heading: 'Rubric Breakdown', tier: 3, summary: 'Rigor + writing' },
      ],
    }));

    const result = await assignTiers({ pageTitle: 'Week 5', sections: SECTIONS, llm });

    expect(result.warnings).toEqual([]);
    expect(result.tiers.sections).toHaveLength(3);
    expect(result.tiers.sections[0]).toEqual({ heading: 'Due Date', tier: 1, summary: 'Oct 17 by 11:59 PM' });
  });

  it('drops sections with out-of-range tier values and accumulates warnings', async () => {
    const llm = makeFakeLlm(JSON.stringify({
      sections: [
        { heading: 'Due Date', tier: 1, summary: 'Oct 17' },
        { heading: 'Submission Instructions', tier: 7, summary: 'PDF' },  // invalid
        { heading: 'Rubric Breakdown', tier: 3, summary: 'Rigor' },
      ],
    }));

    const result = await assignTiers({ pageTitle: 'Week 5', sections: SECTIONS, llm });

    expect(result.tiers.sections).toHaveLength(2);
    expect(result.tiers.sections.find((s) => s.heading === 'Submission Instructions')).toBeUndefined();
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/Submission Instructions/);
  });

  it('drops sections with empty summary and accumulates warnings', async () => {
    const llm = makeFakeLlm(JSON.stringify({
      sections: [
        { heading: 'Due Date', tier: 1, summary: 'Oct 17' },
        { heading: 'Submission Instructions', tier: 2, summary: '' },
        { heading: 'Rubric Breakdown', tier: 3, summary: 'Rigor' },
      ],
    }));

    const result = await assignTiers({ pageTitle: 'Week 5', sections: SECTIONS, llm });

    expect(result.tiers.sections).toHaveLength(2);
    expect(result.warnings).toHaveLength(1);
  });

  it('throws TIER_ASSIGN_FAILED when LLM call throws', async () => {
    const llm: LlmClient = {
      async complete() { throw new Error('LLM exploded'); },
    };

    await expect(assignTiers({ pageTitle: 'Week 5', sections: SECTIONS, llm }))
      .rejects.toThrow(/TIER_ASSIGN_FAILED/);
  });

  it('throws TIER_ASSIGN_FAILED when response is malformed JSON', async () => {
    const llm = makeFakeLlm('not json at all');

    await expect(assignTiers({ pageTitle: 'Week 5', sections: SECTIONS, llm }))
      .rejects.toThrow(/TIER_ASSIGN_FAILED/);
  });

  it('throws TIER_ASSIGN_FAILED when all sections are dropped during validation', async () => {
    const llm = makeFakeLlm(JSON.stringify({
      sections: [
        { heading: 'Due Date', tier: 99, summary: 'x' },
        { heading: 'Submission Instructions', tier: 0, summary: 'y' },
        { heading: 'Rubric Breakdown', tier: -1, summary: 'z' },
      ],
    }));

    await expect(assignTiers({ pageTitle: 'Week 5', sections: SECTIONS, llm }))
      .rejects.toThrow(/TIER_ASSIGN_FAILED/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --workspace curriculum-intelligence-mcp -- assign_tiers.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `assign_tiers.ts`**

Create `packages/curriculum-intelligence/src/analyze/assign_tiers.ts`:

```ts
import type { LlmClient } from '@canvas-toolchain/shared-llm';
import type { PageTiers, SectionTier, Tier } from '@canvas-toolchain/shared-types';

export interface AssignTiersSection {
  heading: string;
  body: string;
}

export interface AssignTiersInput {
  pageTitle: string;
  sections: AssignTiersSection[];
  llm: LlmClient;
}

export interface AssignTiersResult {
  tiers: PageTiers;
  warnings: string[];
}

const SYSTEM_PROMPT = `You are tagging course-page sections by importance for a student reading the page.

Tier 1 (At a glance):    What a student must know in 5 seconds — due date,
                         deliverable, one-sentence context.
Tier 2 (Working detail): What a student needs to actually complete the work —
                         submission steps, required tools, key resources.
Tier 3 (Deep support):   Rubric breakdowns, examples, reference docs.

For each section provided, return:
  - heading (verbatim from input)
  - tier (1, 2, or 3)
  - summary: ONE LINE, max 12 words, suitable for a "Quick Reference" card.

Return strict JSON: { "sections": [{ "heading": "...", "tier": N, "summary": "..." }] }`;

function buildUserPrompt(pageTitle: string, sections: AssignTiersSection[]): string {
  const sectionBlocks = sections
    .map((s, i) => `Section ${i + 1}: ${s.heading}\n${s.body}`)
    .join('\n\n---\n\n');
  return `Page: ${pageTitle}\n\n${sectionBlocks}`;
}

function isTier(v: unknown): v is Tier {
  return v === 1 || v === 2 || v === 3;
}

export async function assignTiers(input: AssignTiersInput): Promise<AssignTiersResult> {
  const { pageTitle, sections, llm } = input;

  let response;
  try {
    response = await llm.complete(SYSTEM_PROMPT, buildUserPrompt(pageTitle, sections), {
      maxTokens: 1024,
    });
  } catch (err) {
    throw new Error(`TIER_ASSIGN_FAILED: LLM call threw: ${err instanceof Error ? err.message : String(err)}`);
  }

  let parsed: { sections?: unknown };
  try {
    parsed = JSON.parse(response.text);
  } catch {
    throw new Error(`TIER_ASSIGN_FAILED: LLM response was not valid JSON: ${response.text.slice(0, 200)}`);
  }

  const rawSections = parsed.sections;
  if (!Array.isArray(rawSections)) {
    throw new Error('TIER_ASSIGN_FAILED: LLM response missing sections array');
  }

  const warnings: string[] = [];
  const validatedSections: SectionTier[] = [];

  for (const s of rawSections) {
    if (typeof s !== 'object' || s === null) {
      warnings.push('Dropping non-object section entry');
      continue;
    }
    const obj = s as Record<string, unknown>;
    const heading = obj.heading;
    if (typeof heading !== 'string' || heading.length === 0) {
      warnings.push('Dropping section with missing/empty heading');
      continue;
    }
    if (!isTier(obj.tier)) {
      warnings.push(`Dropping section "${heading}" — tier value ${String(obj.tier)} not in {1,2,3}`);
      continue;
    }
    if (typeof obj.summary !== 'string' || obj.summary.length === 0) {
      warnings.push(`Dropping section "${heading}" — summary empty`);
      continue;
    }
    validatedSections.push({ heading, tier: obj.tier, summary: obj.summary });
  }

  if (validatedSections.length === 0) {
    throw new Error('TIER_ASSIGN_FAILED: all sections dropped during validation');
  }

  return {
    tiers: { sections: validatedSections },
    warnings,
  };
}
```

- [ ] **Step 4: Run tests**

Run: `npm test --workspace curriculum-intelligence-mcp -- assign_tiers.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/curriculum-intelligence/src/analyze/assign_tiers.ts packages/curriculum-intelligence/tests/analyze/assign_tiers.test.ts
git commit -m "feat(ci): assign_tiers — LLM-driven section tier+summary assignment (#66)"
```

---

## Phase 3 — CI: Integrate into `analyze_course`

### Task 3.1: Build CI front-matter read/write helper

**Files:**
- Create: `packages/curriculum-intelligence/src/analyze/page_front_matter.ts`
- Test: `packages/curriculum-intelligence/tests/analyze/page_front_matter.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/curriculum-intelligence/tests/analyze/page_front_matter.test.ts`:

```ts
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readPageFrontMatter, writePageTiers, splitSections } from '../../src/analyze/page_front_matter.js';

let tmpDir: string;

beforeEach(() => { tmpDir = mkdtempSync(join(tmpdir(), 'pagefm-')); });
afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

describe('readPageFrontMatter', () => {
  it('parses YAML front matter and returns the body separately', () => {
    const filePath = join(tmpDir, 'p.md');
    writeFileSync(filePath, '---\ntitle: Week 5\nweek: 5\n---\n\n## Due Date\n\nOct 17\n');
    const { fm, body } = readPageFrontMatter(filePath);
    expect(fm.title).toBe('Week 5');
    expect(fm.week).toBe(5);
    expect(body.startsWith('\n## Due Date')).toBe(true);
  });

  it('returns empty fm and full content as body when no front matter present', () => {
    const filePath = join(tmpDir, 'p.md');
    writeFileSync(filePath, '## Heading\n\nbody only\n');
    const { fm, body } = readPageFrontMatter(filePath);
    expect(fm).toEqual({});
    expect(body).toContain('## Heading');
  });

  it('preserves nested fm fields (e.g., existing tiers block) on read', () => {
    const filePath = join(tmpDir, 'p.md');
    writeFileSync(filePath, '---\ntitle: Week 5\ntiers:\n  locked: true\n  sections:\n    - heading: Due Date\n      tier: 1\n      summary: Oct 17\n---\n\nbody\n');
    const { fm } = readPageFrontMatter(filePath);
    expect((fm as any).tiers.locked).toBe(true);
    expect((fm as any).tiers.sections[0].heading).toBe('Due Date');
  });
});

describe('writePageTiers', () => {
  it('atomically writes a merged front matter preserving existing fields', () => {
    const filePath = join(tmpDir, 'p.md');
    writeFileSync(filePath, '---\ntitle: Week 5\nweek: 5\n---\n\n## Due Date\n\nOct 17\n');
    writePageTiers(filePath, {
      sections: [{ heading: 'Due Date', tier: 1, summary: 'Oct 17 by 11:59 PM' }],
    });
    const raw = readFileSync(filePath, 'utf-8');
    expect(raw).toContain('title: Week 5');
    expect(raw).toContain('week: 5');
    expect(raw).toContain('tiers:');
    expect(raw).toContain('Due Date');
    expect(raw).toContain('Oct 17 by 11:59 PM');
    expect(raw).toContain('## Due Date');
  });

  it('overwrites an existing tiers block on rewrite', () => {
    const filePath = join(tmpDir, 'p.md');
    writeFileSync(filePath,
      '---\ntitle: T\ntiers:\n  sections:\n    - heading: Old\n      tier: 2\n      summary: stale\n---\n\nbody\n');
    writePageTiers(filePath, {
      sections: [{ heading: 'Due Date', tier: 1, summary: 'fresh' }],
    });
    const raw = readFileSync(filePath, 'utf-8');
    expect(raw).not.toContain('Old');
    expect(raw).not.toContain('stale');
    expect(raw).toContain('Due Date');
    expect(raw).toContain('fresh');
  });

  it('inserts a fresh front matter block when none exists', () => {
    const filePath = join(tmpDir, 'p.md');
    writeFileSync(filePath, '## Due Date\n\nOct 17\n');
    writePageTiers(filePath, {
      sections: [{ heading: 'Due Date', tier: 1, summary: 'Oct 17' }],
    });
    const raw = readFileSync(filePath, 'utf-8');
    expect(raw.startsWith('---\n')).toBe(true);
    expect(raw).toContain('## Due Date');
  });
});

describe('splitSections', () => {
  it('splits markdown body into { heading, body } pairs at H2 boundaries', () => {
    const body = '## Due Date\n\nOct 17\n\n## Submission\n\nUpload PDF.\n';
    const sections = splitSections(body);
    expect(sections).toHaveLength(2);
    expect(sections[0].heading).toBe('Due Date');
    expect(sections[0].body.trim()).toBe('Oct 17');
    expect(sections[1].heading).toBe('Submission');
  });

  it('also splits at H3 boundaries within an H2 chunk', () => {
    const body = '## Header\n\nintro\n\n### Sub A\n\ncontent A\n\n### Sub B\n\ncontent B\n';
    const sections = splitSections(body);
    expect(sections.map((s) => s.heading)).toEqual(['Header', 'Sub A', 'Sub B']);
  });

  it('returns empty array when there are no H2/H3 headings', () => {
    const body = 'just some text with no headings\n';
    expect(splitSections(body)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --workspace curriculum-intelligence-mcp -- page_front_matter.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `page_front_matter.ts`**

Create `packages/curriculum-intelligence/src/analyze/page_front_matter.ts`:

```ts
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { PageTiers } from '@canvas-toolchain/shared-types';

export interface AssignTiersSection {
  heading: string;
  body: string;
}

const FM_PATTERN = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;

export function readPageFrontMatter(filePath: string): {
  fm: Record<string, unknown>;
  body: string;
} {
  const raw = readFileSync(filePath, 'utf-8');
  const m = raw.match(FM_PATTERN);
  if (!m) {
    return { fm: {}, body: raw };
  }
  let fm: Record<string, unknown> = {};
  try {
    const parsed = parseYaml(m[1]);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      fm = parsed as Record<string, unknown>;
    }
  } catch {
    // leave fm empty on parse failure; caller can detect via fm == {}
  }
  return { fm, body: m[2] };
}

export function writePageTiers(filePath: string, tiers: PageTiers): void {
  const { fm, body } = readPageFrontMatter(filePath);
  const mergedFm: Record<string, unknown> = { ...fm, tiers };

  const fmYaml = stringifyYaml(mergedFm).trimEnd();
  const output = `---\n${fmYaml}\n---\n${body.startsWith('\n') ? body : '\n' + body}`;

  const tmp = `${filePath}.tmp`;
  writeFileSync(tmp, output, 'utf-8');
  renameSync(tmp, filePath);
}

export function splitSections(body: string): AssignTiersSection[] {
  const lines = body.split('\n');
  const sections: AssignTiersSection[] = [];
  let current: AssignTiersSection | null = null;

  for (const line of lines) {
    const h2 = line.match(/^##\s+(.+?)\s*$/);
    const h3 = line.match(/^###\s+(.+?)\s*$/);
    if (h2 || h3) {
      if (current) sections.push(current);
      current = { heading: (h2 ?? h3)![1], body: '' };
    } else if (current) {
      current.body += (current.body ? '\n' : '') + line;
    }
  }
  if (current) sections.push(current);

  return sections.map((s) => ({ heading: s.heading, body: s.body.trim() }));
}
```

- [ ] **Step 4: Run tests**

Run: `npm test --workspace curriculum-intelligence-mcp -- page_front_matter.test.ts`
Expected: PASS — 9 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/curriculum-intelligence/src/analyze/page_front_matter.ts packages/curriculum-intelligence/tests/analyze/page_front_matter.test.ts
git commit -m "feat(ci): page front-matter read/write helper for tier persistence (#66)"
```

---

### Task 3.2: Add tier-assignment phase to `analyze_course`

**Files:**
- Modify: `packages/curriculum-intelligence/src/tools/analyze_course.ts`
- Modify: `packages/curriculum-intelligence/tests/tools/analyze_course.test.ts`

**Important context for the implementer:**
- `analyze_course.ts` currently takes `{ courseId, semesterId, archivePath, ... }`. You're adding an OPTIONAL `courseDir?: string`. When present, run the tier-assignment phase AFTER the existing logic; when absent, behavior is unchanged.
- The tier phase iterates `*.md` files under `courseDir`, EXCLUDING `course-config.md` and any file with `tiers.locked === true` already in its front matter.
- The phase calls `assignTiers` per page; on per-page failure, accumulate a warning and continue to the next page.
- Add `tierAssignments?: Array<{ relPath: string; tiers: PageTiers }>` and `tierWarnings?: string[]` to `AnalyzeCourseReport`. Both optional so existing callers see no shape change.

- [ ] **Step 1: Read the existing `analyze_course.ts` and existing test**

Run: `wc -l packages/curriculum-intelligence/src/tools/analyze_course.ts packages/curriculum-intelligence/tests/tools/analyze_course.test.ts`
Note line counts. Read both files fully before editing.

- [ ] **Step 2: Add failing tests at the END of the existing describe block in `analyze_course.test.ts`**

Append before the closing `});` of the outermost describe:

```ts
  describe('tier-assignment phase (courseDir provided)', () => {
    it('iterates pages in courseDir and writes tiers block to each', async () => {
      const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } = await import('node:fs');
      const { tmpdir } = await import('node:os');
      const { join } = await import('node:path');
      const courseDir = mkdtempSync(join(tmpdir(), 'ac-tier-'));
      try {
        mkdirSync(join(courseDir, 'week-05'), { recursive: true });
        writeFileSync(join(courseDir, 'week-05', 'assignment.md'),
          '---\ntitle: W5\n---\n\n## Due Date\n\nOct 17\n\n## Rubric\n\nQuality stuff.\n');
        writeFileSync(join(courseDir, 'course-config.md'), '---\ntitle: ITM 370\n---\n');

        const fakeLlm = {
          async complete(_sys: string, _user: string) {
            return {
              text: JSON.stringify({
                sections: [
                  { heading: 'Due Date', tier: 1, summary: 'Oct 17' },
                  { heading: 'Rubric', tier: 3, summary: 'Quality' },
                ],
              }),
              usage: { inputTokens: 1, outputTokens: 1 },
            };
          },
        };

        // analyzeCourse needs its existing setup (archive ingest etc.) to succeed.
        // For this test we focus only on the new tier phase by providing a courseDir
        // alongside the existing inputs; the existing inputs come from the surrounding
        // test scaffolding (reuse whatever the existing tests use).
        const result = await runAnalyzeCourseWithTierPhase({
          courseDir,
          llm: fakeLlm,
        });

        const updated = readFileSync(join(courseDir, 'week-05', 'assignment.md'), 'utf-8');
        expect(updated).toContain('tiers:');
        expect(updated).toContain('Due Date');
        expect(updated).toContain('Oct 17');
        expect(result.tierAssignments).toBeDefined();
        expect(result.tierAssignments!.length).toBeGreaterThanOrEqual(1);
      } finally {
        rmSync(courseDir, { recursive: true, force: true });
      }
    });

    it('skips pages with tiers.locked: true', async () => {
      const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } = await import('node:fs');
      const { tmpdir } = await import('node:os');
      const { join } = await import('node:path');
      const courseDir = mkdtempSync(join(tmpdir(), 'ac-locked-'));
      try {
        mkdirSync(join(courseDir, 'week-05'), { recursive: true });
        writeFileSync(join(courseDir, 'week-05', 'locked.md'),
          '---\ntitle: T\ntiers:\n  locked: true\n  sections:\n    - heading: Manual\n      tier: 1\n      summary: do not touch\n---\n\n## Due Date\n\nOct 17\n');

        const fakeLlm = {
          async complete(_sys: string, _user: string) {
            return { text: JSON.stringify({ sections: [{ heading: 'Due Date', tier: 1, summary: 'NEW' }] }), usage: { inputTokens: 1, outputTokens: 1 } };
          },
        };

        await runAnalyzeCourseWithTierPhase({ courseDir, llm: fakeLlm });

        const updated = readFileSync(join(courseDir, 'week-05', 'locked.md'), 'utf-8');
        expect(updated).toContain('do not touch');
        expect(updated).not.toContain('NEW');
      } finally {
        rmSync(courseDir, { recursive: true, force: true });
      }
    });

    it('skips course-config.md', async () => {
      const { mkdtempSync, writeFileSync, readFileSync, rmSync } = await import('node:fs');
      const { tmpdir } = await import('node:os');
      const { join } = await import('node:path');
      const courseDir = mkdtempSync(join(tmpdir(), 'ac-cfg-'));
      try {
        writeFileSync(join(courseDir, 'course-config.md'),
          '---\ntitle: ITM 370\n---\n\n## Heading\n\nbody\n');

        const fakeLlm = {
          async complete(_sys: string, _user: string) {
            return { text: JSON.stringify({ sections: [{ heading: 'Heading', tier: 1, summary: 'SHOULD NOT APPEAR' }] }), usage: { inputTokens: 1, outputTokens: 1 } };
          },
        };

        await runAnalyzeCourseWithTierPhase({ courseDir, llm: fakeLlm });

        const updated = readFileSync(join(courseDir, 'course-config.md'), 'utf-8');
        expect(updated).not.toContain('tiers:');
      } finally {
        rmSync(courseDir, { recursive: true, force: true });
      }
    });
  });

  // Helper: invoke analyzeCourse with the new tier-phase inputs.
  // Implementation note: until you wire courseDir through analyzeCourse,
  // this calls the new tierPhase exported helper directly. After wiring,
  // it should call analyzeCourse with courseDir + llm.
  async function runAnalyzeCourseWithTierPhase(input: { courseDir: string; llm: any }): Promise<{ tierAssignments?: Array<{ relPath: string; tiers: any }>; tierWarnings?: string[] }> {
    const { runTierPhase } = await import('../../src/tools/analyze_course.js');
    return await runTierPhase({ courseDir: input.courseDir, llm: input.llm });
  }
```

The helper sidesteps the need to reproduce all of `analyzeCourse`'s existing scaffolding (archive ingest, history pointers) — it tests the new tier phase in isolation by calling a named exported helper. Implementation Step 3 will export `runTierPhase` and make `analyzeCourse` use it internally.

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test --workspace curriculum-intelligence-mcp -- analyze_course.test.ts`
Expected: FAIL — `runTierPhase` not exported.

- [ ] **Step 4: Implement the tier-assignment phase**

Edit `packages/curriculum-intelligence/src/tools/analyze_course.ts`. Add at the top (alongside existing imports):

```ts
import { readdirSync, statSync } from 'node:fs';
import { join, relative, extname, basename } from 'node:path';
import type { PageTiers } from '@canvas-toolchain/shared-types';
import { assignTiers } from '../analyze/assign_tiers.js';
import { readPageFrontMatter, writePageTiers, splitSections } from '../analyze/page_front_matter.js';
```

Extend `AnalyzeCourseInput` and `AnalyzeCourseReport`:

```ts
export interface AnalyzeCourseInput {
  courseId: CourseId;
  semesterId: SemesterId;
  archivePath: string;
  extractConcepts?: boolean;
  llmClient?: LlmClient;
  /** CDS course folder — when provided, the tier-assignment phase runs over its pages. */
  courseDir?: string;
}

export interface AnalyzeCourseReport {
  courseId: CourseId;
  semesterId: SemesterId;
  historyPath: string;
  perAssignment: PerTopicTrajectory[];
  perConcept?: PerTopicTrajectory[];
  trajectoryEntry: TrajectoryEntry;
  /** Present when input.courseDir was supplied. */
  tierAssignments?: Array<{ relPath: string; tiers: PageTiers }>;
  /** Present when input.courseDir was supplied. */
  tierWarnings?: string[];
}
```

Add this new exported helper at the end of the file (before any default export, if there is one):

```ts
function walkMarkdown(root: string, out: string[]): void {
  for (const entry of readdirSync(root)) {
    const full = join(root, entry);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist' || entry === '.git') continue;
      walkMarkdown(full, out);
    } else if (extname(entry) === '.md' && basename(entry) !== 'course-config.md') {
      out.push(full);
    }
  }
}

export interface RunTierPhaseInput {
  courseDir: string;
  llm: LlmClient;
}

export async function runTierPhase(input: RunTierPhaseInput): Promise<{
  tierAssignments: Array<{ relPath: string; tiers: PageTiers }>;
  tierWarnings: string[];
}> {
  const { courseDir, llm } = input;
  const pages: string[] = [];
  walkMarkdown(courseDir, pages);

  const tierAssignments: Array<{ relPath: string; tiers: PageTiers }> = [];
  const tierWarnings: string[] = [];

  for (const filePath of pages) {
    const relPath = relative(courseDir, filePath);
    let fm, body;
    try {
      ({ fm, body } = readPageFrontMatter(filePath));
    } catch (err) {
      tierWarnings.push(`PAGE_FM_PARSE_FAILED: ${relPath}: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }

    const existing = (fm as any).tiers as PageTiers | undefined;
    if (existing && existing.locked === true) continue;

    const pageTitle = typeof (fm as any).title === 'string' ? (fm as any).title : relPath;
    const sections = splitSections(body);
    if (sections.length === 0) continue;

    let result;
    try {
      result = await assignTiers({ pageTitle, sections, llm });
    } catch (err) {
      tierWarnings.push(`${relPath}: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }

    if (result.warnings.length > 0) {
      for (const w of result.warnings) tierWarnings.push(`${relPath}: ${w}`);
    }

    try {
      writePageTiers(filePath, result.tiers);
      tierAssignments.push({ relPath, tiers: result.tiers });
    } catch (err) {
      tierWarnings.push(`PAGE_BODY_WRITE_FAILED: ${relPath}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { tierAssignments, tierWarnings };
}
```

Inside the existing `analyzeCourse` function, AFTER the existing report assembly and BEFORE the return statement, add:

```ts
  if (input.courseDir && input.llmClient) {
    const tierPhase = await runTierPhase({ courseDir: input.courseDir, llm: input.llmClient });
    return {
      ...existingReport,                     // rename to whatever the existing variable is called
      tierAssignments: tierPhase.tierAssignments,
      tierWarnings: tierPhase.tierWarnings,
    };
  }
```

The exact variable name for the existing return value depends on what's already there — replace `existingReport` with the actual variable. If `analyzeCourse` currently constructs the report inline in the return statement, refactor to a local variable first, then conditionally extend it.

- [ ] **Step 5: Run tests**

Run: `npm test --workspace curriculum-intelligence-mcp -- analyze_course.test.ts`
Expected: PASS — all existing tests PLUS 3 new tier-phase tests.

- [ ] **Step 6: Commit**

```bash
git add packages/curriculum-intelligence/src/tools/analyze_course.ts packages/curriculum-intelligence/tests/tools/analyze_course.test.ts
git commit -m "feat(ci): analyze_course gains optional courseDir + tier-assignment phase (#66)"
```

---

## Phase 4 — CDS: TL;DR Card + `generate-page` Integration

### Task 4.1: Create `tldr_card.ts` template

**Files:**
- Create: `packages/canvas-design-studio/src/templates/tldr_card.ts`
- Test: `packages/canvas-design-studio/tests/templates/tldr_card.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/canvas-design-studio/tests/templates/tldr_card.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { renderTldrCard } from '../../src/templates/tldr_card.js';

describe('renderTldrCard', () => {
  it('renders a bullet list from tier-1 sections', () => {
    const html = renderTldrCard({
      tiers: {
        sections: [
          { heading: 'Due Date', tier: 1, summary: 'Friday Oct 17 at 11:59 PM' },
          { heading: 'Submission', tier: 2, summary: 'Single PDF' },
          { heading: 'Deliverable', tier: 1, summary: 'Three-page analysis' },
        ],
      },
    });
    expect(html).toContain('Quick Reference');
    expect(html).toContain('<strong>Due Date:</strong> Friday Oct 17 at 11:59 PM');
    expect(html).toContain('<strong>Deliverable:</strong> Three-page analysis');
    expect(html).not.toContain('Submission');
  });

  it('returns empty string when there are no tier-1 sections', () => {
    const html = renderTldrCard({
      tiers: {
        sections: [
          { heading: 'Submission', tier: 2, summary: 'PDF' },
          { heading: 'Rubric', tier: 3, summary: 'see below' },
        ],
      },
    });
    expect(html).toBe('');
  });

  it('respects section order from input', () => {
    const html = renderTldrCard({
      tiers: {
        sections: [
          { heading: 'Second', tier: 1, summary: 'b' },
          { heading: 'First', tier: 1, summary: 'a' },
        ],
      },
    });
    const idxSecond = html.indexOf('Second');
    const idxFirst = html.indexOf('First');
    expect(idxSecond).toBeGreaterThanOrEqual(0);
    expect(idxFirst).toBeGreaterThan(idxSecond);
  });

  it('HTML-escapes heading and summary content', () => {
    const html = renderTldrCard({
      tiers: {
        sections: [
          { heading: 'Name <with> "quotes" &', tier: 1, summary: '<em>raw</em>' },
        ],
      },
    });
    expect(html).toContain('Name &lt;with&gt; &quot;quotes&quot; &amp;');
    expect(html).toContain('&lt;em&gt;raw&lt;/em&gt;');
    expect(html).not.toContain('<em>raw</em>');
  });

  it('uses BSU primary blue (#0033A0) palette', () => {
    const html = renderTldrCard({
      tiers: { sections: [{ heading: 'X', tier: 1, summary: 'y' }] },
    });
    expect(html).toContain('#0033A0');
    expect(html).toContain('#E6ECF9');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --workspace canvas-design-mcp -- tldr_card.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `tldr_card.ts`**

Create `packages/canvas-design-studio/src/templates/tldr_card.ts`:

```ts
import type { PageTiers } from '@canvas-toolchain/shared-types';

export interface RenderTldrCardInput {
  tiers: PageTiers;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderTldrCard(input: RenderTldrCardInput): string {
  const tier1 = input.tiers.sections.filter((s) => s.tier === 1);
  if (tier1.length === 0) return '';

  const items = tier1
    .map((s) => `    <li><strong>${escapeHtml(s.heading)}:</strong> ${escapeHtml(s.summary)}</li>`)
    .join('\n');

  return `<div style="background:#E6ECF9; border-left:4px solid #0033A0; padding:1em 1.25em; margin-bottom:1.5em; border-radius:0 4px 4px 0;">
  <h3 style="margin-top:0; color:#0033A0;">📌 Quick Reference</h3>
  <ul style="margin:0.5em 0; padding-left:1.25em;">
${items}
  </ul>
</div>
`;
}
```

- [ ] **Step 4: Run tests**

Run: `npm test --workspace canvas-design-mcp -- tldr_card.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/canvas-design-studio/src/templates/tldr_card.ts packages/canvas-design-studio/tests/templates/tldr_card.test.ts
git commit -m "feat(cds): tldr_card template renders Quick Reference from tier-1 sections (#66)"
```

---

### Task 4.2: Wire TL;DR card into `generate-page`

**Files:**
- Modify: `packages/canvas-design-studio/src/tools/generate-page.ts`
- Modify: `packages/canvas-design-studio/tests/generate-page.test.ts`

**Implementer notes:**
- CDS's existing `parseFrontMatterSimple` is regex-based and CANNOT parse the nested `tiers:` block. You need to do a separate YAML-based pass to extract `tiers` from the source page's raw front matter.
- A new helper `extractTiersFromFile(mdPath): PageTiers | undefined` is the cleanest fit. Put it in a new file `packages/canvas-design-studio/src/tools/extract_tiers.ts` so it's testable in isolation.
- Card is prepended to `renderedHtml` AFTER `renderPage` and BEFORE `substituteWidgetPlaceholders` is fine — the card contains no widget placeholders so it passes through unchanged.

- [ ] **Step 1: Create + test the extract helper**

Create `packages/canvas-design-studio/tests/tools/extract_tiers.test.ts`:

```ts
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractTiersFromFile } from '../../src/tools/extract_tiers.js';

let tmpDir: string;
beforeEach(() => { tmpDir = mkdtempSync(join(tmpdir(), 'extract-tiers-')); });
afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

describe('extractTiersFromFile', () => {
  it('returns the tiers block when present', () => {
    const f = join(tmpDir, 'p.md');
    writeFileSync(f, '---\ntitle: T\ntiers:\n  sections:\n    - heading: Due\n      tier: 1\n      summary: Oct 17\n---\n\nbody\n');
    const t = extractTiersFromFile(f);
    expect(t).toBeDefined();
    expect(t!.sections).toHaveLength(1);
    expect(t!.sections[0].tier).toBe(1);
  });

  it('returns undefined when there is no tiers block', () => {
    const f = join(tmpDir, 'p.md');
    writeFileSync(f, '---\ntitle: T\n---\n\nbody\n');
    expect(extractTiersFromFile(f)).toBeUndefined();
  });

  it('returns undefined when there is no front matter at all', () => {
    const f = join(tmpDir, 'p.md');
    writeFileSync(f, '## Heading\n\nbody\n');
    expect(extractTiersFromFile(f)).toBeUndefined();
  });

  it('returns undefined and does not throw on malformed tiers block', () => {
    const f = join(tmpDir, 'p.md');
    writeFileSync(f, '---\ntitle: T\ntiers:\n  sections:\n    - tier: not-a-number\n---\n\nbody\n');
    expect(extractTiersFromFile(f)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --workspace canvas-design-mcp -- extract_tiers.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `extract_tiers.ts`**

Create `packages/canvas-design-studio/src/tools/extract_tiers.ts`:

```ts
import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import type { PageTiers, SectionTier, Tier } from '@canvas-toolchain/shared-types';

const FM_PATTERN = /^---\n([\s\S]*?)\n---/;

function isTier(v: unknown): v is Tier {
  return v === 1 || v === 2 || v === 3;
}

export function extractTiersFromFile(mdPath: string): PageTiers | undefined {
  const raw = readFileSync(mdPath, 'utf-8');
  const m = raw.match(FM_PATTERN);
  if (!m) return undefined;

  let parsed: unknown;
  try {
    parsed = parseYaml(m[1]);
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;

  const tiersRaw = (parsed as Record<string, unknown>).tiers;
  if (!tiersRaw || typeof tiersRaw !== 'object' || Array.isArray(tiersRaw)) return undefined;

  const tiersObj = tiersRaw as Record<string, unknown>;
  const sectionsRaw = tiersObj.sections;
  if (!Array.isArray(sectionsRaw)) return undefined;

  const sections: SectionTier[] = [];
  for (const s of sectionsRaw) {
    if (!s || typeof s !== 'object' || Array.isArray(s)) return undefined;
    const obj = s as Record<string, unknown>;
    if (typeof obj.heading !== 'string' || !isTier(obj.tier) || typeof obj.summary !== 'string') {
      return undefined;
    }
    sections.push({ heading: obj.heading, tier: obj.tier, summary: obj.summary });
  }

  const locked = tiersObj.locked === true;
  return locked ? { locked, sections } : { sections };
}
```

- [ ] **Step 4: Run tests**

Run: `npm test --workspace canvas-design-mcp -- extract_tiers.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Wire the card into `generate-page.ts`**

Open `packages/canvas-design-studio/src/tools/generate-page.ts`. Add imports near the top:

```ts
import { extractTiersFromFile } from './extract_tiers.js';
import { renderTldrCard } from '../templates/tldr_card.js';
```

In `generatePage`, after `const renderedHtml = renderPage(...)` and before `const html = substituteWidgetPlaceholders(...)`, insert:

```ts
  const tiers = extractTiersFromFile(absPath);
  const tldrHtml = tiers ? renderTldrCard({ tiers }) : '';
  const withTldr = tldrHtml + renderedHtml;
```

Then change the next line from `const html = substituteWidgetPlaceholders(renderedHtml, pageType);` to:

```ts
  const html = substituteWidgetPlaceholders(withTldr, pageType);
```

- [ ] **Step 6: Add tests for the generate-page integration**

Append to `packages/canvas-design-studio/tests/generate-page.test.ts` inside the main describe block:

```ts
  it('prepends the TL;DR card when the page has tier-1 sections in front matter', async () => {
    const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const courseDir = mkdtempSync(join(tmpdir(), 'gp-tldr-'));
    try {
      writeFileSync(join(courseDir, 'course-config.md'),
        '---\ntitle: Test Course\nshort_name: TC\nsemester: F26\ndomain_color: "#0033A0"\n---\n');
      mkdirSync(join(courseDir, 'week-05'), { recursive: true });
      const mdPath = join(courseDir, 'week-05', 'assignment.md');
      writeFileSync(mdPath, '---\ntitle: W5 Assignment\nweek: 5\ntiers:\n  sections:\n    - heading: Due Date\n      tier: 1\n      summary: Oct 17 at 11:59 PM\n---\n\n## Due Date\n\nOct 17.\n');

      const result = generatePage({ mdPath, courseDir, outputDir: join(courseDir, 'out') });

      expect(result.html).toContain('Quick Reference');
      expect(result.html).toContain('Due Date');
      expect(result.html.indexOf('Quick Reference')).toBeLessThan(result.html.indexOf('## Due Date'));
    } finally {
      rmSync(courseDir, { recursive: true, force: true });
    }
  });

  it('renders unchanged (no card) when page has no tiers block', async () => {
    const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const courseDir = mkdtempSync(join(tmpdir(), 'gp-notldr-'));
    try {
      writeFileSync(join(courseDir, 'course-config.md'),
        '---\ntitle: Test Course\nshort_name: TC\nsemester: F26\ndomain_color: "#0033A0"\n---\n');
      mkdirSync(join(courseDir, 'week-05'), { recursive: true });
      const mdPath = join(courseDir, 'week-05', 'assignment.md');
      writeFileSync(mdPath, '---\ntitle: W5 Assignment\nweek: 5\n---\n\n## Due Date\n\nOct 17.\n');

      const result = generatePage({ mdPath, courseDir, outputDir: join(courseDir, 'out') });

      expect(result.html).not.toContain('Quick Reference');
    } finally {
      rmSync(courseDir, { recursive: true, force: true });
    }
  });

  it('does not add the card when tiers exist but contain no tier-1 entries', async () => {
    const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const courseDir = mkdtempSync(join(tmpdir(), 'gp-onlyt2-'));
    try {
      writeFileSync(join(courseDir, 'course-config.md'),
        '---\ntitle: Test Course\nshort_name: TC\nsemester: F26\ndomain_color: "#0033A0"\n---\n');
      mkdirSync(join(courseDir, 'week-05'), { recursive: true });
      const mdPath = join(courseDir, 'week-05', 'assignment.md');
      writeFileSync(mdPath, '---\ntitle: W5\nweek: 5\ntiers:\n  sections:\n    - heading: Rubric\n      tier: 3\n      summary: see below\n---\n\n## Rubric\n\nbody\n');

      const result = generatePage({ mdPath, courseDir, outputDir: join(courseDir, 'out') });

      expect(result.html).not.toContain('Quick Reference');
    } finally {
      rmSync(courseDir, { recursive: true, force: true });
    }
  });
```

If the existing test file imports `generatePage` synchronously rather than via dynamic import, prefer that style. Read the existing file first.

- [ ] **Step 7: Run tests**

Run: `npm test --workspace canvas-design-mcp -- generate-page.test.ts`
Expected: PASS — all existing tests PLUS 3 new ones.

- [ ] **Step 8: Commit**

```bash
git add packages/canvas-design-studio/src/tools/extract_tiers.ts packages/canvas-design-studio/src/tools/generate-page.ts packages/canvas-design-studio/tests/tools/extract_tiers.test.ts packages/canvas-design-studio/tests/generate-page.test.ts
git commit -m "feat(cds): generate-page prepends TL;DR card when tier-1 sections present (#66)"
```

---

## Phase 5 — Docs

### Task 5.1: Update `CLAUDE.md` files for CI and CDS

**Files:**
- Modify: `packages/curriculum-intelligence/CLAUDE.md`
- Modify: `packages/canvas-design-studio/CLAUDE.md`

- [ ] **Step 1: CI CLAUDE.md additions**

In `packages/curriculum-intelligence/CLAUDE.md`, in the most appropriate "Implemented" section (or a new "Content Priority Tiers" section if no such list exists), add:

```markdown
## Content Priority Tiers (#66)

`analyze_course` accepts an optional `courseDir` input. When provided, after the
existing trajectory analysis, the tier-assignment phase iterates the CDS course
folder's `*.md` pages (excluding `course-config.md`), splits each into H2/H3
sections, and calls the configured LLM to assign:

- `tier`: 1 (at-a-glance), 2 (working-detail), or 3 (deep-support)
- `summary`: one-line, max 12 words

Results write to each page's front matter as a `tiers:` block. Set
`tiers.locked: true` to preserve manual edits — re-analysis skips locked pages.

Failures degrade gracefully: per-section validation drops the section + warns,
per-page failures skip the page + warn. Atomic writes throughout.
```

- [ ] **Step 2: CDS CLAUDE.md additions**

In `packages/canvas-design-studio/CLAUDE.md`, add a new section after the "Hard Rules" section (or wherever feels structurally appropriate based on the existing layout):

```markdown
## TL;DR Card (Content Priority Tiers, #66)

`generate_page` checks each input markdown file's front matter for a `tiers:`
block. When present AND it contains tier-1 sections, a "Quick Reference" card
is prepended to the rendered page body. Card uses inline CSS only and the BSU
primary blue palette.

Pages without a `tiers` block (or with only tier-2/3 entries) render exactly
as before — zero regression risk.

Tier data is populated by CI's `analyze_course` (with `courseDir` supplied) —
see `packages/curriculum-intelligence/CLAUDE.md`. Professors can edit any
field of the `tiers:` block manually; set `tiers.locked: true` to keep the
edit from being overwritten on the next analyze run.
```

- [ ] **Step 3: Commit**

```bash
git add packages/curriculum-intelligence/CLAUDE.md packages/canvas-design-studio/CLAUDE.md
git commit -m "docs(ci,cds): CLAUDE.md — content priority tier system (#66)"
```

---

## Phase 6 — Final Regression + Close #66

### Task 6.1: Full regression + close

**Files:** none.

- [ ] **Step 1: Build all packages**

Run: `npm run build --workspaces`
Expected: every tsc exits 0.

- [ ] **Step 2: Run all tests**

Run: `npm test --workspaces`
Expected: all green. canvas-design-mcp gains ~12 (5 card + 4 extract + 3 generate-page). curriculum-intelligence-mcp gains ~18 (6 assign_tiers + 9 page_front_matter + 3 analyze_course). shared-types +1.

- [ ] **Step 3: Run smoke**

Run: `npm run smoke:integration --workspace command-and-control-mcp`
Expected: passes.

- [ ] **Step 4: Verify acceptance criteria**

For each AC in the spec ("Acceptance Criteria" section), check it holds:

1. CI tier-assignment phase runs in `analyze_course` when `courseDir` supplied — Phase 3 Task 3.2 tests.
2. `tiers.locked: true` is respected — Phase 3 Task 3.2 test.
3. TL;DR card renders only when tier-1 sections exist — Phase 4 Task 4.2 tests.
4. Card content matches stored summaries — Phase 4 Task 4.1 tests.
5. Partial LLM failures degrade gracefully — Phase 2 Task 2.2 tests + Phase 3 Task 3.2 tests.
6. All ~28 new tests pass; no existing tests regress — Step 2 above.
7. Documentation — Phase 5.

If any fail, do not push. Open follow-up to fix.

- [ ] **Step 5: Push**

Run: `git push origin main`
Expected: push succeeds.

- [ ] **Step 6: Comment + close #66**

Run:

```bash
gh issue comment 66 --repo Ryfter/canvas-toolchain --body "$(cat <<'EOF'
## Shipped

All 7 acceptance criteria met. Summary:

- CI's `analyze_course` now accepts an optional `courseDir`. When supplied, a new tier-assignment phase runs after trajectory analysis: iterates CDS pages, LLM-assigns tier (1/2/3) + one-line summary per section, writes back to page front matter as a `tiers:` block.
- New CI module `assign_tiers.ts` handles the LLM call + per-section validation. Per-section failures drop that section + warn; per-page failures skip + warn; atomic writes throughout.
- `tiers.locked: true` is sacred — re-analysis skips locked pages.
- New CDS template `tldr_card.ts` renders a "Quick Reference" card from tier-1 section summaries. BSU primary blue palette, Canvas-safe inline CSS only.
- CDS's `generate_page` prepends the card when tier-1 sections exist. Pages without tier data render exactly as before — zero regression.
- AIAS labeling and CLO mapping (raised during brainstorming) split into separate issues #92 and #91.

### Test deltas
- shared-types: 1 → 2 (+1)
- curriculum-intelligence-mcp: +18
- canvas-design-mcp: +12
- Total: +31 new tests.

### Out of scope (deferred to v2 follow-ups)
- Tier 2/3 rendering (data captured; visual treatment future)
- Page reordering by tier
- Card customization
- Tier suggestions during `brainstorm_interactive`

Spec: \`packages/command-and-control/docs/superpowers/specs/2026-06-06-content-priority-tiers-design.md\`
Plan: \`packages/command-and-control/docs/superpowers/plans/2026-06-06-content-priority-tiers.md\`
EOF
)"
gh issue close 66 --repo Ryfter/canvas-toolchain --reason "completed"
```

---

## Summary

| Phase | Tasks | New tests | Files created | Files modified |
|---|---|---|---|---|
| 0 | 1 baseline | 0 | 0 | 0 |
| 1 | 1 shared-types | 1 | 0 | 2 |
| 2 | 2 (yaml dep + assign_tiers) | 6 | 1 | 1 |
| 3 | 2 (page_fm + analyze_course) | 12 | 2 | 2 |
| 4 | 2 (tldr_card + generate-page) | 12 | 3 | 2 |
| 5 | 1 docs | 0 | 0 | 2 |
| 6 | 1 regression + close | 0 | 0 | 0 |
| **Total** | **10 tasks** | **~31 new tests** | **6 new files** | **9 modified files** |
