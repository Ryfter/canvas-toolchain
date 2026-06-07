# AIAS Labeling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Furze's 5-level AI Assessment Scale as first-class page metadata. New MCP tool sets the course-wide default; per-page front matter overrides it. CDS renders a single inline callout on assignment + rubric pages when an effective level resolves.

**Architecture:** Shared types + canonical text constants → CDS resolver + callout template → C&C MCP tool wrapper. Render is additive only, restricted to assignment/rubric page types.

**Tech Stack:** TypeScript ESM, vitest 2.x, `yaml` package (already in CDS from #65). No new runtime dependencies.

**Spec:** `packages/command-and-control/docs/superpowers/specs/2026-06-06-aias-labeling-design.md`

**Issue:** [#92](https://github.com/Ryfter/canvas-toolchain/issues/92)

---

## Phase 0 — Baseline

### Task 0.1: Confirm clean tree + tests pass

- [ ] **Step 1:** `git status` → clean.
- [ ] **Step 2:** `npm test --workspaces` → all green. Note baselines.
- [ ] **Step 3:** `npm run smoke:integration --workspace command-and-control-mcp` → passes.

---

## Phase 1 — Shared Types + Canonical Text

### Task 1.1: Add `AiasLevel`, `PageAias` to shared-types

**Files:**
- Modify: `packages/shared-types/src/index.ts`
- Test: `packages/shared-types/tests/index.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `packages/shared-types/tests/index.test.ts` inside the main describe block:

```ts
  it('exports AiasLevel and PageAias types (#92)', () => {
    const sample: import('../src/index.js').PageAias = {
      level: 3,
      note: 'AI Collaboration — draft with AI; you must edit and cite.',
    };
    expect(sample.level).toBe(3);
    expect(typeof sample.note).toBe('string');
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test --workspace @canvas-toolchain/shared-types`
Expected: FAIL — types don't exist.

- [ ] **Step 3: Add the types**

Append to `packages/shared-types/src/index.ts`:

```ts
export type AiasLevel = 1 | 2 | 3 | 4 | 5;

export interface PageAias {
  level: AiasLevel;
  note: string;
}
```

- [ ] **Step 4: Run tests + build**

```bash
npm test --workspace @canvas-toolchain/shared-types
npm run build --workspace @canvas-toolchain/shared-types
```
Expected: tests PASS (3 total), tsc exits 0.

- [ ] **Step 5: Commit**

```bash
git add packages/shared-types/src/index.ts packages/shared-types/tests/index.test.ts
git commit -m "feat(shared-types): AiasLevel + PageAias types for #92"
```

---

### Task 1.2: Canonical AIAS text constants in CDS

**Files:**
- Create: `packages/canvas-design-studio/src/course/aias_canonical.ts`
- Test: `packages/canvas-design-studio/tests/course/aias_canonical.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/canvas-design-studio/tests/course/aias_canonical.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { CANONICAL_AIAS_NOTES, CANONICAL_AIAS_NAMES } from '../../src/course/aias_canonical.js';

describe('canonical AIAS constants', () => {
  it('has notes for all 5 levels', () => {
    for (const level of [1, 2, 3, 4, 5] as const) {
      expect(CANONICAL_AIAS_NOTES[level]).toBeTruthy();
      expect(CANONICAL_AIAS_NOTES[level].length).toBeGreaterThan(10);
    }
  });

  it('has names for all 5 levels', () => {
    expect(CANONICAL_AIAS_NAMES[1]).toBe('No AI');
    expect(CANONICAL_AIAS_NAMES[2]).toBe('AI Planning');
    expect(CANONICAL_AIAS_NAMES[3]).toBe('AI Collaboration');
    expect(CANONICAL_AIAS_NAMES[4]).toBe('Full AI');
    expect(CANONICAL_AIAS_NAMES[5]).toBe('AI Exploration');
  });
});
```

- [ ] **Step 2: Run + fail**

Run: `npm test --workspace canvas-design-mcp -- aias_canonical.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the constants file**

Create `packages/canvas-design-studio/src/course/aias_canonical.ts`:

```ts
import type { AiasLevel } from '@canvas-toolchain/shared-types';

// Attribution: Leon Furze, AI Assessment Scale (AIAS).
// Source: https://aiassessmentscale.com/
// Licensed: Creative Commons BY-NC-SA 4.0.
// The canonical text below is summarized for student-facing display; the
// full original framework lives at the URL above.

export const CANONICAL_AIAS_NOTES: Record<AiasLevel, string> = {
  1: 'No AI permitted — demonstrate knowledge without AI assistance.',
  2: 'AI Planning only — brainstorm and outline; develop and refine ideas independently.',
  3: 'AI Collaboration — draft with AI; you must critically edit, cite, and disclose what you used.',
  4: 'Full AI — use AI throughout; demonstrate critical thinking by directing it strategically.',
  5: 'AI Exploration — leverage AI creatively for novel, innovative approaches.',
};

export const CANONICAL_AIAS_NAMES: Record<AiasLevel, string> = {
  1: 'No AI',
  2: 'AI Planning',
  3: 'AI Collaboration',
  4: 'Full AI',
  5: 'AI Exploration',
};
```

- [ ] **Step 4: Run tests**

Run: `npm test --workspace canvas-design-mcp -- aias_canonical.test.ts`
Expected: PASS — 2 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/canvas-design-studio/src/course/aias_canonical.ts packages/canvas-design-studio/tests/course/aias_canonical.test.ts
git commit -m "feat(cds): canonical AIAS text + names for 5 levels (Furze, CC BY-NC-SA 4.0) (#92)"
```

---

## Phase 2 — CDS Config + Resolver

### Task 2.1: `aias_config.ts` — read/write course default

**Files:**
- Create: `packages/canvas-design-studio/src/course/aias_config.ts`
- Test: `packages/canvas-design-studio/tests/course/aias_config.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/canvas-design-studio/tests/course/aias_config.test.ts`:

```ts
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readAiasDefaults, writeAiasDefaults } from '../../src/course/aias_config.js';

let tmpDir: string;
beforeEach(() => { tmpDir = mkdtempSync(join(tmpdir(), 'aias-cfg-')); });
afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

describe('readAiasDefaults', () => {
  it('returns level + note when both present', () => {
    const f = join(tmpDir, 'course-config.md');
    writeFileSync(f, '---\ntitle: ITM 370\ndefaultAiasLevel: 3\ndefaultAiasNote: A custom note.\n---\n');
    const result = readAiasDefaults(f);
    expect(result.level).toBe(3);
    expect(result.note).toBe('A custom note.');
  });

  it('returns level only when note absent', () => {
    const f = join(tmpDir, 'course-config.md');
    writeFileSync(f, '---\ntitle: ITM 370\ndefaultAiasLevel: 2\n---\n');
    const result = readAiasDefaults(f);
    expect(result.level).toBe(2);
    expect(result.note).toBeUndefined();
  });

  it('returns undefined level when not set', () => {
    const f = join(tmpDir, 'course-config.md');
    writeFileSync(f, '---\ntitle: ITM 370\n---\n');
    const result = readAiasDefaults(f);
    expect(result.level).toBeUndefined();
    expect(result.note).toBeUndefined();
  });

  it('ignores invalid level (not 1-5)', () => {
    const f = join(tmpDir, 'course-config.md');
    writeFileSync(f, '---\ntitle: ITM 370\ndefaultAiasLevel: 9\n---\n');
    const result = readAiasDefaults(f);
    expect(result.level).toBeUndefined();
  });
});

describe('writeAiasDefaults', () => {
  it('writes level + note into course-config.md preserving other fields', () => {
    const f = join(tmpDir, 'course-config.md');
    writeFileSync(f, '---\ntitle: ITM 370\nshort_name: ITM370\nsemester: F26\n---\n\n# body\n');
    writeAiasDefaults(f, 3, 'You may draft with AI.');
    const raw = readFileSync(f, 'utf-8');
    expect(raw).toContain('title: ITM 370');
    expect(raw).toContain('short_name: ITM370');
    expect(raw).toContain('defaultAiasLevel: 3');
    expect(raw).toContain('You may draft with AI.');
    expect(raw).toContain('# body');
  });

  it('writes level only when note undefined', () => {
    const f = join(tmpDir, 'course-config.md');
    writeFileSync(f, '---\ntitle: ITM 370\n---\n');
    writeAiasDefaults(f, 1);
    const raw = readFileSync(f, 'utf-8');
    expect(raw).toContain('defaultAiasLevel: 1');
    expect(raw).not.toContain('defaultAiasNote:');
  });

  it('overwrites an existing default', () => {
    const f = join(tmpDir, 'course-config.md');
    writeFileSync(f, '---\ntitle: ITM 370\ndefaultAiasLevel: 2\ndefaultAiasNote: old\n---\n');
    writeAiasDefaults(f, 4, 'new');
    const raw = readFileSync(f, 'utf-8');
    expect(raw).toContain('defaultAiasLevel: 4');
    expect(raw).toContain('new');
    expect(raw).not.toContain('defaultAiasLevel: 2');
    expect(raw).not.toContain('note: old');
  });
});
```

- [ ] **Step 2: Run + fail**

Run: `npm test --workspace canvas-design-mcp -- aias_config.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `aias_config.ts`**

Create `packages/canvas-design-studio/src/course/aias_config.ts`:

```ts
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { AiasLevel } from '@canvas-toolchain/shared-types';

const FM_PATTERN = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;

function isAiasLevel(v: unknown): v is AiasLevel {
  return v === 1 || v === 2 || v === 3 || v === 4 || v === 5;
}

export interface AiasDefaults {
  level?: AiasLevel;
  note?: string;
}

function readFm(filePath: string): { fm: Record<string, unknown>; body: string } {
  const raw = readFileSync(filePath, 'utf-8');
  const m = raw.match(FM_PATTERN);
  if (!m) return { fm: {}, body: raw };
  let fm: Record<string, unknown> = {};
  try {
    const parsed = parseYaml(m[1]);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      fm = parsed as Record<string, unknown>;
    }
  } catch {}
  return { fm, body: m[2] };
}

export function readAiasDefaults(courseConfigPath: string): AiasDefaults {
  const { fm } = readFm(courseConfigPath);
  const level = isAiasLevel(fm.defaultAiasLevel) ? fm.defaultAiasLevel : undefined;
  const note = typeof fm.defaultAiasNote === 'string' && fm.defaultAiasNote.length > 0
    ? fm.defaultAiasNote
    : undefined;
  return { level, note };
}

export function writeAiasDefaults(courseConfigPath: string, level: AiasLevel, note?: string): void {
  const { fm, body } = readFm(courseConfigPath);
  const merged: Record<string, unknown> = { ...fm, defaultAiasLevel: level };
  if (note !== undefined && note.length > 0) {
    merged.defaultAiasNote = note;
  } else {
    delete merged.defaultAiasNote;
  }
  const fmYaml = stringifyYaml(merged).trimEnd();
  const output = `---\n${fmYaml}\n---\n${body.startsWith('\n') ? body : '\n' + body}`;

  const tmp = `${courseConfigPath}.tmp`;
  writeFileSync(tmp, output, 'utf-8');
  renameSync(tmp, courseConfigPath);
}
```

- [ ] **Step 4: Run tests**

Run: `npm test --workspace canvas-design-mcp -- aias_config.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/canvas-design-studio/src/course/aias_config.ts packages/canvas-design-studio/tests/course/aias_config.test.ts
git commit -m "feat(cds): aias_config — read/write defaultAiasLevel + defaultAiasNote (#92)"
```

---

### Task 2.2: `extract_aias.ts` + `aias_resolver.ts`

**Files:**
- Create: `packages/canvas-design-studio/src/tools/extract_aias.ts`
- Create: `packages/canvas-design-studio/src/course/aias_resolver.ts`
- Test: `packages/canvas-design-studio/tests/tools/extract_aias.test.ts`
- Test: `packages/canvas-design-studio/tests/course/aias_resolver.test.ts`

- [ ] **Step 1: Write failing tests for both**

Create `packages/canvas-design-studio/tests/tools/extract_aias.test.ts`:

```ts
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractAiasFromFile } from '../../src/tools/extract_aias.js';

let tmpDir: string;
beforeEach(() => { tmpDir = mkdtempSync(join(tmpdir(), 'extract-aias-')); });
afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

describe('extractAiasFromFile', () => {
  it('returns level + note when both set', () => {
    const f = join(tmpDir, 'p.md');
    writeFileSync(f, '---\ntitle: Exam\naiasLevel: 1\naiasNote: Closed book.\n---\n\nbody\n');
    const a = extractAiasFromFile(f);
    expect(a).toEqual({ level: 1, note: 'Closed book.' });
  });

  it('returns level only when note absent', () => {
    const f = join(tmpDir, 'p.md');
    writeFileSync(f, '---\ntitle: T\naiasLevel: 3\n---\n');
    expect(extractAiasFromFile(f)).toEqual({ level: 3 });
  });

  it('returns undefined when no aias fields', () => {
    const f = join(tmpDir, 'p.md');
    writeFileSync(f, '---\ntitle: T\n---\n');
    expect(extractAiasFromFile(f)).toBeUndefined();
  });

  it('ignores invalid level (not 1-5)', () => {
    const f = join(tmpDir, 'p.md');
    writeFileSync(f, '---\ntitle: T\naiasLevel: 9\n---\n');
    expect(extractAiasFromFile(f)).toBeUndefined();
  });
});
```

Create `packages/canvas-design-studio/tests/course/aias_resolver.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { resolveEffectiveAias } from '../../src/course/aias_resolver.js';
import { CANONICAL_AIAS_NOTES } from '../../src/course/aias_canonical.js';

describe('resolveEffectiveAias', () => {
  it('page override wins over course default', () => {
    const result = resolveEffectiveAias(
      { level: 1, note: 'page note' },
      { level: 3, note: 'course note' },
    );
    expect(result).toEqual({ level: 1, note: 'page note' });
  });

  it('course default applies when page absent', () => {
    const result = resolveEffectiveAias(undefined, { level: 3, note: 'course note' });
    expect(result).toEqual({ level: 3, note: 'course note' });
  });

  it('returns canonical note when no custom note supplied at either layer', () => {
    const result = resolveEffectiveAias({ level: 3 }, undefined);
    expect(result).toEqual({ level: 3, note: CANONICAL_AIAS_NOTES[3] });
  });

  it('returns undefined when neither page nor course has a level', () => {
    const result = resolveEffectiveAias(undefined, undefined);
    expect(result).toBeUndefined();
  });

  it('returns undefined when only a course note is set without a level', () => {
    const result = resolveEffectiveAias(undefined, { note: 'orphan note' } as any);
    expect(result).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run + fail**

Run: `npm test --workspace canvas-design-mcp -- "extract_aias.test.ts|aias_resolver.test.ts"`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `extract_aias.ts`**

Create `packages/canvas-design-studio/src/tools/extract_aias.ts`:

```ts
import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import type { AiasLevel } from '@canvas-toolchain/shared-types';

const FM_PATTERN = /^---\n([\s\S]*?)\n---/;

function isAiasLevel(v: unknown): v is AiasLevel {
  return v === 1 || v === 2 || v === 3 || v === 4 || v === 5;
}

export interface PageAiasOverride {
  level: AiasLevel;
  note?: string;
}

export function extractAiasFromFile(mdPath: string): PageAiasOverride | undefined {
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

  const obj = parsed as Record<string, unknown>;
  if (!isAiasLevel(obj.aiasLevel)) return undefined;

  const result: PageAiasOverride = { level: obj.aiasLevel };
  if (typeof obj.aiasNote === 'string' && obj.aiasNote.length > 0) {
    result.note = obj.aiasNote;
  }
  return result;
}
```

- [ ] **Step 4: Implement `aias_resolver.ts`**

Create `packages/canvas-design-studio/src/course/aias_resolver.ts`:

```ts
import type { AiasLevel, PageAias } from '@canvas-toolchain/shared-types';
import { CANONICAL_AIAS_NOTES } from './aias_canonical.js';

export interface CourseAiasDefaults {
  level?: AiasLevel;
  note?: string;
}

export interface PageAiasOverride {
  level: AiasLevel;
  note?: string;
}

export function resolveEffectiveAias(
  pageOverride: PageAiasOverride | undefined,
  courseDefaults: CourseAiasDefaults | undefined,
): PageAias | undefined {
  const level = pageOverride?.level ?? courseDefaults?.level;
  if (level === undefined) return undefined;

  const note =
    pageOverride?.note ??
    courseDefaults?.note ??
    CANONICAL_AIAS_NOTES[level];

  return { level, note };
}
```

- [ ] **Step 5: Run tests**

Run: `npm test --workspace canvas-design-mcp -- "extract_aias.test.ts|aias_resolver.test.ts"`
Expected: PASS — 9 tests total.

- [ ] **Step 6: Commit**

```bash
git add packages/canvas-design-studio/src/tools/extract_aias.ts packages/canvas-design-studio/src/course/aias_resolver.ts packages/canvas-design-studio/tests/tools/extract_aias.test.ts packages/canvas-design-studio/tests/course/aias_resolver.test.ts
git commit -m "feat(cds): extract_aias + aias_resolver — page override + course default resolution (#92)"
```

---

## Phase 3 — Callout Template + generate-page

### Task 3.1: `aias_callout.ts` template

**Files:**
- Create: `packages/canvas-design-studio/src/templates/aias_callout.ts`
- Test: `packages/canvas-design-studio/tests/templates/aias_callout.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/canvas-design-studio/tests/templates/aias_callout.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { renderAiasCallout } from '../../src/templates/aias_callout.js';

describe('renderAiasCallout', () => {
  it('renders level + name + note', () => {
    const html = renderAiasCallout({ aias: { level: 3, note: 'Custom note here.' } });
    expect(html).toContain('Level 3');
    expect(html).toContain('AI Collaboration');
    expect(html).toContain('Custom note here.');
  });

  it('HTML-escapes name and note', () => {
    const html = renderAiasCallout({ aias: { level: 1, note: 'No <em>AI</em> & no "tools".' } });
    expect(html).toContain('No &lt;em&gt;AI&lt;/em&gt; &amp; no &quot;tools&quot;.');
    expect(html).not.toContain('No <em>AI</em>');
  });

  it('uses warning-tan palette (#FAEEDA / #854F0B)', () => {
    const html = renderAiasCallout({ aias: { level: 2, note: 'x' } });
    expect(html).toContain('#FAEEDA');
    expect(html).toContain('#854F0B');
  });
});
```

- [ ] **Step 2: Run + fail**

Run: `npm test --workspace canvas-design-mcp -- aias_callout.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `packages/canvas-design-studio/src/templates/aias_callout.ts`:

```ts
import type { PageAias } from '@canvas-toolchain/shared-types';
import { CANONICAL_AIAS_NAMES } from '../course/aias_canonical.js';

export interface RenderAiasCalloutInput {
  aias: PageAias;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderAiasCallout(input: RenderAiasCalloutInput): string {
  const { level, note } = input.aias;
  const name = CANONICAL_AIAS_NAMES[level];
  return `<div style="background:#FAEEDA; border-left:4px solid #854F0B; padding:1em 1.25em; margin-bottom:1.25em; border-radius:0 4px 4px 0;">
  <p style="margin:0; color:#854F0B;">
    <strong>AI Use Policy — Level ${level} (${escapeHtml(name)})</strong>
  </p>
  <p style="margin:0.5em 0 0 0;">${escapeHtml(note)}</p>
</div>
`;
}
```

- [ ] **Step 4: Run tests**

Run: `npm test --workspace canvas-design-mcp -- aias_callout.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/canvas-design-studio/src/templates/aias_callout.ts packages/canvas-design-studio/tests/templates/aias_callout.test.ts
git commit -m "feat(cds): aias_callout template — single inline callout with warning-tan palette (#92)"
```

---

### Task 3.2: Wire AIAS into `generate-page`

**Files:**
- Modify: `packages/canvas-design-studio/src/tools/generate-page.ts`
- Modify: `packages/canvas-design-studio/tests/generate-page.test.ts`

**Implementer notes:**
- After #66, generate-page already has a TL;DR-card prepend block (`withTldr = tldrHtml + renderedHtml`).
- AIAS callout sits ABOVE the TL;DR card. So `withCallouts = aiasHtml + withTldr`.
- AIAS callout ONLY renders when `pageType === 'assignment' || pageType === 'rubric'`.
- Read course defaults via `readAiasDefaults(courseConfigPath)`. The `configPath` variable is already in scope in `generatePage` (it's where `parseCourseConfig` reads from).

- [ ] **Step 1: Add the failing tests**

Append to `packages/canvas-design-studio/tests/generate-page.test.ts` inside the main describe (use the same scaffolding style as the #66 tests):

```ts
  describe('AIAS callout (#92)', () => {
    function setupCourse(tmpDir: string, courseConfigContent: string): string {
      const courseDir = mkdtempSync(join(tmpdir(), tmpDir));
      writeFileSync(join(courseDir, 'course-config.md'), courseConfigContent);
      mkdirSync(join(courseDir, 'week-05'), { recursive: true });
      return courseDir;
    }

    it('renders the AIAS callout on assignment pages when a level resolves', () => {
      const courseDir = setupCourse('aias-assn-',
        '---\ntitle: Test Course\nshort_name: TC\nsemester: F26\ndomain_color: "#0033A0"\ndefaultAiasLevel: 3\n---\n');
      try {
        const mdPath = join(courseDir, 'week-05', 'assignment.md');
        writeFileSync(mdPath, '---\ntitle: W5\nweek: 5\n---\n\n## Due Date\n\nOct 17.\n');
        const result = generatePage({ mdPath, courseDir, outputDir: join(courseDir, 'out') });
        expect(result.html).toContain('AI Use Policy');
        expect(result.html).toContain('Level 3');
        expect(result.html).toContain('AI Collaboration');
      } finally { rmSync(courseDir, { recursive: true, force: true }); }
    });

    it('renders the AIAS callout on rubric pages too', () => {
      const courseDir = setupCourse('aias-rubric-',
        '---\ntitle: Test Course\nshort_name: TC\nsemester: F26\ndomain_color: "#0033A0"\ndefaultAiasLevel: 2\n---\n');
      try {
        const mdPath = join(courseDir, 'week-05', 'rubric.md');
        writeFileSync(mdPath, '---\ntitle: Rubric\nweek: 5\n---\n\n## Criteria\n\nA, B, C.\n');
        const result = generatePage({ mdPath, courseDir, outputDir: join(courseDir, 'out') });
        expect(result.html).toContain('AI Use Policy');
        expect(result.html).toContain('Level 2');
      } finally { rmSync(courseDir, { recursive: true, force: true }); }
    });

    it('does NOT render the callout on non-assignment/non-rubric pages', () => {
      const courseDir = setupCourse('aias-other-',
        '---\ntitle: Test Course\nshort_name: TC\nsemester: F26\ndomain_color: "#0033A0"\ndefaultAiasLevel: 3\n---\n');
      try {
        const mdPath = join(courseDir, 'week-05', 'resources.md');
        writeFileSync(mdPath, '---\ntitle: Resources\nweek: 5\n---\n\n## Links\n\nA, B.\n');
        const result = generatePage({ mdPath, courseDir, outputDir: join(courseDir, 'out') });
        expect(result.html).not.toContain('AI Use Policy');
      } finally { rmSync(courseDir, { recursive: true, force: true }); }
    });

    it('per-page aiasLevel override wins over course default', () => {
      const courseDir = setupCourse('aias-override-',
        '---\ntitle: Test Course\nshort_name: TC\nsemester: F26\ndomain_color: "#0033A0"\ndefaultAiasLevel: 3\n---\n');
      try {
        const mdPath = join(courseDir, 'week-05', 'assignment.md');
        writeFileSync(mdPath, '---\ntitle: Exam\nweek: 5\naiasLevel: 1\naiasNote: Closed book.\n---\n\n## Q\n\nA?\n');
        const result = generatePage({ mdPath, courseDir, outputDir: join(courseDir, 'out') });
        expect(result.html).toContain('Level 1');
        expect(result.html).toContain('No AI');
        expect(result.html).toContain('Closed book.');
        expect(result.html).not.toContain('Level 3');
      } finally { rmSync(courseDir, { recursive: true, force: true }); }
    });

    it('renders no callout when neither course default nor page override is set', () => {
      const courseDir = setupCourse('aias-none-',
        '---\ntitle: Test Course\nshort_name: TC\nsemester: F26\ndomain_color: "#0033A0"\n---\n');
      try {
        const mdPath = join(courseDir, 'week-05', 'assignment.md');
        writeFileSync(mdPath, '---\ntitle: W5\nweek: 5\n---\n\n## Q\n\nA.\n');
        const result = generatePage({ mdPath, courseDir, outputDir: join(courseDir, 'out') });
        expect(result.html).not.toContain('AI Use Policy');
      } finally { rmSync(courseDir, { recursive: true, force: true }); }
    });
  });
```

- [ ] **Step 2: Run + fail**

Run: `npm test --workspace canvas-design-mcp -- generate-page.test.ts`
Expected: 5 new tests fail (rest pass).

- [ ] **Step 3: Wire into generate-page.ts**

Edit `packages/canvas-design-studio/src/tools/generate-page.ts`. Add imports:

```ts
import { extractAiasFromFile } from './extract_aias.js';
import { renderAiasCallout } from '../templates/aias_callout.js';
import { readAiasDefaults } from '../course/aias_config.js';
import { resolveEffectiveAias } from '../course/aias_resolver.js';
```

Locate the block (added by #66) that produces `withTldr`. After it (and before `substituteWidgetPlaceholders`), add:

```ts
  const isAiasEligible = pageType === 'assignment' || pageType === 'rubric';
  let aiasHtml = '';
  if (isAiasEligible) {
    const pageOverride = extractAiasFromFile(absPath);
    const courseDefaults = readAiasDefaults(configPath);
    const effective = resolveEffectiveAias(pageOverride, courseDefaults);
    if (effective) aiasHtml = renderAiasCallout({ aias: effective });
  }
  const withCallouts = aiasHtml + withTldr;
```

Then change `const html = substituteWidgetPlaceholders(withTldr, pageType);` to:

```ts
  const html = substituteWidgetPlaceholders(withCallouts, pageType);
```

- [ ] **Step 4: Run tests**

Run: `npm test --workspace canvas-design-mcp -- generate-page.test.ts`
Expected: all tests pass (including 5 new AIAS tests).

- [ ] **Step 5: Commit**

```bash
git add packages/canvas-design-studio/src/tools/generate-page.ts packages/canvas-design-studio/tests/generate-page.test.ts
git commit -m "feat(cds): generate-page prepends AIAS callout on assignment + rubric pages (#92)"
```

---

## Phase 4 — C&C MCP Tool

### Task 4.1: `set_course_aias_default` MCP tool

**Files:**
- Create: `packages/command-and-control/src/tools/set_course_aias_default.ts`
- Test: `packages/command-and-control/tests/tools/set_course_aias_default.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/command-and-control/tests/tools/set_course_aias_default.test.ts`:

```ts
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setCourseAiasDefault } from '../../src/tools/set_course_aias_default.js';

let tmpDir: string;
beforeEach(() => { tmpDir = mkdtempSync(join(tmpdir(), 'set-aias-')); });
afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

describe('setCourseAiasDefault', () => {
  it('happy path: writes defaultAiasLevel + note into course-config.md', async () => {
    writeFileSync(join(tmpDir, 'course-config.md'),
      '---\ntitle: ITM 370\nshort_name: ITM370\nsemester: F26\n---\n\n# body\n');

    const result = await setCourseAiasDefault({ courseDir: tmpDir, level: 3, note: 'Draft with AI.' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.level).toBe(3);
    expect(result.effectiveNote).toBe('Draft with AI.');

    const raw = readFileSync(join(tmpDir, 'course-config.md'), 'utf-8');
    expect(raw).toContain('defaultAiasLevel: 3');
    expect(raw).toContain('Draft with AI.');
    expect(raw).toContain('title: ITM 370');
  });

  it('uses canonical text when note omitted', async () => {
    writeFileSync(join(tmpDir, 'course-config.md'),
      '---\ntitle: T\n---\n');

    const result = await setCourseAiasDefault({ courseDir: tmpDir, level: 1 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.level).toBe(1);
    expect(result.effectiveNote).toContain('No AI permitted');
  });

  it('returns COURSE_CONFIG_NOT_FOUND when course-config.md is absent', async () => {
    const result = await setCourseAiasDefault({ courseDir: tmpDir, level: 3 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('COURSE_CONFIG_NOT_FOUND');
    expect(existsSync(join(tmpDir, 'course-config.md'))).toBe(false);
  });

  it('returns INVALID_LEVEL for out-of-range level', async () => {
    writeFileSync(join(tmpDir, 'course-config.md'), '---\ntitle: T\n---\n');

    const result = await setCourseAiasDefault({ courseDir: tmpDir, level: 7 as any });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('INVALID_LEVEL');
  });
});
```

- [ ] **Step 2: Run + fail**

Run: `npm test --workspace command-and-control-mcp -- set_course_aias_default.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `packages/command-and-control/src/tools/set_course_aias_default.ts`:

```ts
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  CANONICAL_AIAS_NOTES,
} from 'canvas-design-mcp/dist/course/aias_canonical.js';
import { writeAiasDefaults } from 'canvas-design-mcp/dist/course/aias_config.js';
import type { AiasLevel } from '@canvas-toolchain/shared-types';

export interface SetCourseAiasDefaultInput {
  courseDir: string;
  level: AiasLevel;
  note?: string;
}

export type SetCourseAiasDefaultResult =
  | { ok: true; courseDir: string; level: AiasLevel; effectiveNote: string; configPath: string }
  | { ok: false; error: 'COURSE_CONFIG_NOT_FOUND' | 'INVALID_LEVEL'; message: string; fix: string[] };

function isAiasLevel(v: unknown): v is AiasLevel {
  return v === 1 || v === 2 || v === 3 || v === 4 || v === 5;
}

export async function setCourseAiasDefault(input: SetCourseAiasDefaultInput): Promise<SetCourseAiasDefaultResult> {
  if (!isAiasLevel(input.level)) {
    return {
      ok: false,
      error: 'INVALID_LEVEL',
      message: `Level must be 1-5, got ${String(input.level)}`,
      fix: ['level must be 1, 2, 3, 4, or 5'],
    };
  }

  const configPath = join(input.courseDir, 'course-config.md');
  if (!existsSync(configPath)) {
    return {
      ok: false,
      error: 'COURSE_CONFIG_NOT_FOUND',
      message: `course-config.md not found at ${configPath}`,
      fix: ['Check that courseDir is a CDS course folder containing course-config.md'],
    };
  }

  writeAiasDefaults(configPath, input.level, input.note);

  const effectiveNote = input.note ?? CANONICAL_AIAS_NOTES[input.level];

  return {
    ok: true,
    courseDir: input.courseDir,
    level: input.level,
    effectiveNote,
    configPath,
  };
}
```

- [ ] **Step 4: Build CDS so C&C can import**

Run: `npm run build --workspace canvas-design-mcp`
Expected: tsc exits 0.

- [ ] **Step 5: Run tests**

Run: `npm test --workspace command-and-control-mcp -- set_course_aias_default.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/command-and-control/src/tools/set_course_aias_default.ts packages/command-and-control/tests/tools/set_course_aias_default.test.ts
git commit -m "feat(cc): set_course_aias_default MCP tool (#92)"
```

---

### Task 4.2: Register the new MCP tool in `src/index.ts`

**Files:** `packages/command-and-control/src/index.ts`

- [ ] **Step 1: Add import**

Near other tool imports in `packages/command-and-control/src/index.ts`:

```ts
import { setCourseAiasDefault } from './tools/set_course_aias_default.js';
```

- [ ] **Step 2: Add `ListToolsRequestSchema` entry**

Mirror the existing `set_active_llm_provider` registration style. Add:

```ts
{
  name: 'set_course_aias_default',
  description:
    "Set the course-wide AI Assessment Scale default for a CDS course folder. " +
    "Writes defaultAiasLevel (and optional defaultAiasNote) into course-config.md. " +
    "Per-page aiasLevel overrides this default at render time.",
  inputSchema: {
    type: 'object' as const,
    properties: {
      courseDir: { type: 'string', description: 'Path to the CDS course folder.' },
      level: { type: 'number', enum: [1, 2, 3, 4, 5], description: 'AIAS level 1-5.' },
      note: { type: 'string', description: 'Optional override of canonical AIAS text.' },
    },
    required: ['courseDir', 'level'],
  },
},
```

- [ ] **Step 3: Add `CallToolRequestSchema` switch case**

Match the existing pattern (use `result = await ...; break;` style if that's what the file uses):

```ts
case 'set_course_aias_default': {
  result = await setCourseAiasDefault(args as unknown as Parameters<typeof setCourseAiasDefault>[0]);
  break;
}
```

- [ ] **Step 4: Build + test**

Run: `npm run build --workspace command-and-control-mcp`
Run: `npm test --workspace command-and-control-mcp`
Expected: both clean; full test suite still green.

- [ ] **Step 5: Commit**

```bash
git add packages/command-and-control/src/index.ts
git commit -m "feat(cc): register set_course_aias_default MCP tool (#92)"
```

---

## Phase 5 — Docs

### Task 5.1: Update CLAUDE.md for CDS and C&C

**Files:**
- Modify: `packages/canvas-design-studio/CLAUDE.md`
- Modify: `packages/command-and-control/CLAUDE.md`

- [ ] **Step 1: CDS additions**

In `packages/canvas-design-studio/CLAUDE.md`, add a new section (placement: after the TL;DR Card section from #66):

```markdown
## AI Assessment Scale (AIAS, #92)

`generate_page` checks each input markdown file for AIAS metadata. When the
page is an assignment or rubric type AND an effective level resolves (page
override > course default), a single inline callout is prepended ABOVE the
TL;DR card.

- **Course default:** `defaultAiasLevel` (+ optional `defaultAiasNote`) in
  `course-config.md` front matter. Set via the `set_course_aias_default` MCP
  tool.
- **Per-page override:** `aiasLevel` (+ optional `aiasNote`) in page front
  matter.
- **Canonical text fallback:** when no `aiasNote` is supplied at either
  layer, the canonical text for the level applies.

**Attribution:** AIAS by Leon Furze (https://aiassessmentscale.com/),
licensed CC BY-NC-SA 4.0. Canonical text is summarized for display; full
framework is at the source.
```

- [ ] **Step 2: C&C additions**

In `packages/command-and-control/CLAUDE.md`, append to the "Implemented" bullet list:

```markdown
- `set_course_aias_default` MCP tool — sets `defaultAiasLevel` (+ optional `defaultAiasNote`) in a CDS course's `course-config.md`. Per-page overrides via page front matter. CDS's `generate_page` renders an inline callout on assignment + rubric pages when an effective level resolves. AIAS framework: Leon Furze, CC BY-NC-SA 4.0.
```

- [ ] **Step 3: Commit**

```bash
git add packages/canvas-design-studio/CLAUDE.md packages/command-and-control/CLAUDE.md
git commit -m "docs(cds,cc): CLAUDE.md — AIAS labeling system (#92)"
```

---

## Phase 6 — Final Regression + Close #92

### Task 6.1: Full regression + close

- [ ] **Step 1:** `npm run build --workspaces` → exit 0.
- [ ] **Step 2:** `npm test --workspaces` → all green. canvas-design-mcp +~20. command-and-control-mcp +4. shared-types +1.
- [ ] **Step 3:** `npm run smoke:integration --workspace command-and-control-mcp` → passes.
- [ ] **Step 4:** Verify each AC from the spec.
- [ ] **Step 5:** `git push origin main`.
- [ ] **Step 6:** Comment + close #92.

```bash
gh issue comment 92 --repo Ryfter/canvas-toolchain --body "$(cat <<'EOF'
## Shipped

All 8 acceptance criteria met. Summary:

- New shared-types: `AiasLevel`, `PageAias`.
- New CDS modules: `aias_canonical` (Furze + CC BY-NC-SA 4.0), `aias_config` (course default read/write), `aias_resolver` (page override > course default > canonical), `extract_aias` (page front-matter reader), `aias_callout` (inline render).
- New C&C MCP tool: `set_course_aias_default({ courseDir, level, note? })`.
- `generate_page` renders the callout on assignment + rubric pages ABOVE the TL;DR card when an effective level resolves. All other page types unaffected even when level is set. Pages without resolved level: unchanged.
- AIAS framework attribution: code comment in `aias_canonical.ts` + `CLAUDE.md` credit line.

Spec: `packages/command-and-control/docs/superpowers/specs/2026-06-06-aias-labeling-design.md`
Plan: `packages/command-and-control/docs/superpowers/plans/2026-06-06-aias-labeling.md`
EOF
)"
gh issue close 92 --repo Ryfter/canvas-toolchain --reason "completed"
```

---

## Summary

| Phase | Tasks | New tests | Files created | Files modified |
|---|---|---|---|---|
| 0 | 1 baseline | 0 | 0 | 0 |
| 1 | 2 (shared-types + canonical text) | 3 | 1 | 2 |
| 2 | 2 (config + resolver/extractor) | 16 | 4 | 0 |
| 3 | 2 (callout + generate-page) | 8 | 1 | 2 |
| 4 | 2 (MCP tool + register) | 4 | 1 | 1 |
| 5 | 1 docs | 0 | 0 | 2 |
| 6 | 1 regression + close | 0 | 0 | 0 |
| **Total** | **11 tasks** | **~31 new tests** | **7 new files** | **7 modified files** |
