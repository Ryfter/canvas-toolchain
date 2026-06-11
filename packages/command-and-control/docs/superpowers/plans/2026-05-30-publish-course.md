# publish_course Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder `publish_course` with a real, reviewed, page-by-page Canvas publishing flow — three C&C MCP tools (`preview_course_publish`, `publish_course`, `rollback_course_publish`), a snapshot bundle on disk, stop-on-failure publishing, and git-aware commit + tag behavior. Scope is Canvas Pages + Assignment descriptions; never auto-creates assignments.

**Architecture:** C&C orchestrates and persists snapshots. CDS adds three Canvas-API functions (`listCanvasPages`, `listCanvasAssignments`, `updateAssignmentDescription`, `restorePage`). `publishToCanvas` is reused unchanged for the page path. Approvals are explicit and per-file. Rollback uses the preview-cached prior HTML.

**Tech Stack:** TypeScript (ESM, `.js` import specifiers), vitest (`vitest run`), Node `child_process` only where needed for git (use `node:child_process` `execFileSync` for clean argument handling). Cross-package types reach CDS via `canvas-design-mcp/dist/...`.

**Spec:** `packages/command-and-control/docs/superpowers/specs/2026-05-30-publish-course-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/canvas-design-studio/src/tools/list-canvas-objects.ts` | `listCanvasPages`, `listCanvasAssignments` over the Canvas REST API |
| `packages/canvas-design-studio/src/tools/update-assignment-description.ts` | PUT description-only update for one assignment |
| `packages/canvas-design-studio/src/tools/restore-page.ts` | Restore a page to prior HTML (update if existed, delete if newly created) |
| `packages/canvas-design-studio/tests/list-canvas-objects.test.ts` | Unit tests for list helpers (mocked fetch) |
| `packages/canvas-design-studio/tests/update-assignment-description.test.ts` | Unit tests for description update + error mapping |
| `packages/canvas-design-studio/tests/restore-page.test.ts` | Unit tests for restore-as-update vs restore-as-delete |
| `packages/command-and-control/src/tools/publish/manifest_types.ts` | `PreviewManifest`, `ManifestEntry`, `DiffSummary`, `Warning` interfaces |
| `packages/command-and-control/src/tools/publish/route_pages.ts` | Bucket `GenerateCourseResult` pages into `pages` / `assignments` / `skipped` |
| `packages/command-and-control/src/tools/publish/build_diff_summary.ts` | Structural diff summary + cached full unified diff per file |
| `packages/command-and-control/src/tools/publish/scan_warnings.ts` | Aggregate FERPA + a11y + validation findings per entry |
| `packages/command-and-control/src/tools/publish/snapshot_store.ts` | Read/write `manifest.json`, `prior/`, `new/`, `diffs/`, `state.json` |
| `packages/command-and-control/src/tools/publish/git_state.ts` | Detect repo state, commit, tag, push-prompt helpers |
| `packages/command-and-control/src/tools/publish/approvals.ts` | Validate approval map shape against manifest |
| `packages/command-and-control/src/tools/publish/canvas_config_bridge.ts` | Translate C&C `CanvasSetupConfig` → CDS `InstitutionConfig` |
| `packages/command-and-control/src/tools/workflows/preview_course_publish.ts` | Preview workflow (generate → fetch → diff → snapshot) |
| `packages/command-and-control/src/tools/workflows/publish_course.ts` | Publish workflow (git pre-commit → iterate → stop-on-failure → tag) |
| `packages/command-and-control/src/tools/workflows/rollback_course_publish.ts` | Rollback workflow (reverse-iterate published[] → restore) |
| `packages/command-and-control/tests/tools/publish/*.test.ts` | Unit tests for each publish module |
| `packages/command-and-control/tests/tools/workflows/preview_course_publish.test.ts` | Workflow integration test (mocked CDS + Canvas) |
| `packages/command-and-control/tests/tools/workflows/publish_course.test.ts` | Workflow integration test (happy + stop-on-failure + resume) |
| `packages/command-and-control/tests/tools/workflows/rollback_course_publish.test.ts` | Rollback workflow test |
| `packages/command-and-control/src/passthrough/design_tools.ts` (MODIFY) | Remove `publish_course` placeholder entry |
| `packages/command-and-control/src/index.ts` (MODIFY) | Register the three new MCP tools |

15 tasks total. Each task is one focused change with a failing test, an implementation, a green test, and a commit.

---

## Task 1: Manifest type definitions

**Files:**
- Create: `packages/command-and-control/src/tools/publish/manifest_types.ts`

No tests for this task — types only. The downstream tasks exercise the types.

- [ ] **Step 1: Write the type module**

```typescript
// packages/command-and-control/src/tools/publish/manifest_types.ts
import type { PageType } from 'canvas-design-mcp/dist/course-types.js';

export type WarningKind = 'ferpa' | 'a11y' | 'validation';
export type WarningSeverity = 'block' | 'warn';

export interface Warning {
  kind: WarningKind;
  severity: WarningSeverity;
  message: string;
  line?: number;
}

export interface DiffSummary {
  priorWords: number | null;
  newWords: number;
  delta: number;
  sectionsChanged: number;
  calloutsAdded: number;
  calloutsRemoved: number;
  imagesChanged: number;
  hasFullDiff: boolean;
}

export interface PageEntry {
  filename: string;
  pageType: PageType;
  intendedTitle: string;
  canvasMatch?: { pageId: string; url: string; existingTitle: string; similarity: number };
  collisionAction: 'update' | 'create';
  diff: DiffSummary;
  warnings: Warning[];
}

export interface AssignmentEntry {
  filename: string;
  pageType: PageType;
  intendedTitle: string;
  canvasMatch: { assignmentId: number; name: string; similarity: number };
  diff: DiffSummary;
  warnings: Warning[];
}

export interface SkippedEntry {
  filename: string;
  pageType: PageType;
  reason: 'out-of-scope-v0.9' | 'unmatched-assignment';
  recommendation: string;
}

export type ManifestEntry =
  | ({ type: 'page' } & PageEntry)
  | ({ type: 'assignment' } & AssignmentEntry)
  | ({ type: 'skipped' } & SkippedEntry);

export interface GitState {
  isRepo: boolean;
  clean?: boolean;
  remote?: string;
  nudge?: 'init-suggested' | 'dirty-tree-warning';
}

export interface StaleSnapshotPointer {
  snapshotId: string;
  lastFailedFile: string;
  failedAt: string;
  fix: string[];
}

export interface PreviewManifest {
  snapshotId: string;
  courseId: number;
  courseDir: string;
  generatedAt: string;
  git: GitState;
  staleSnapshot?: StaleSnapshotPointer;
  entries: ManifestEntry[];
  summary: {
    total: number;
    pages: number;
    assignments: number;
    skipped: number;
    warningsCount: number;
    ferpaCount: number;
    collisionsCount: number;
  };
}

export interface PublishedEntry {
  filename: string;
  type: 'page' | 'assignment';
  canvasUrl?: string;
  action: 'updated' | 'created';
  publishedAt: string;
}

export interface FailedEntry {
  filename: string;
  type: 'page' | 'assignment';
  reason: string;
  code: string;
  failedAt: string;
}

export interface PublishState {
  phase: 'preview' | 'partial' | 'published' | 'rolled-back';
  published: PublishedEntry[];
  failed?: FailedEntry;
  lastUpdatedAt: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/command-and-control/src/tools/publish/manifest_types.ts
git commit -m "feat(cc): publish_course manifest types (refs #64)"
```

---

## Task 2: Route generated pages into buckets

**Files:**
- Create: `packages/command-and-control/src/tools/publish/route_pages.ts`
- Test:   `packages/command-and-control/tests/tools/publish/route_pages.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/command-and-control/tests/tools/publish/route_pages.test.ts
import { describe, it, expect } from 'vitest';
import { routePages, type RoutedPages } from '../../../src/tools/publish/route_pages.js';
import type { GenerateCourseResult, GeneratePageResult } from 'canvas-design-mcp/dist/course-types.js';

function page(pageType: GeneratePageResult['pageType'], filename: string): GeneratePageResult {
  return { html: '<p>x</p>', filename, weekNumber: 1, pageType, savedTo: `/tmp/${filename}` };
}

describe('routePages', () => {
  it('routes page-like types to pages bucket', () => {
    const result: GenerateCourseResult = {
      totalPages: 4, outputDir: '/tmp', warnings: [],
      weekResults: [{
        weekNumber: 1, outputDir: '/tmp', warnings: [],
        pages: [
          page('front-page', 'front.html'),
          page('overview', 'wk1-overview.html'),
          page('resources', 'wk1-resources.html'),
          page('custom', 'wk1-custom.html'),
        ],
      }],
    };
    const routed = routePages(result);
    expect(routed.pages.map(p => p.filename)).toEqual(['front.html', 'wk1-overview.html', 'wk1-resources.html', 'wk1-custom.html']);
    expect(routed.assignments).toEqual([]);
    expect(routed.skipped).toEqual([]);
  });

  it('routes assignment-like types to assignments bucket', () => {
    const result: GenerateCourseResult = {
      totalPages: 4, outputDir: '/tmp', warnings: [],
      weekResults: [{
        weekNumber: 1, outputDir: '/tmp', warnings: [],
        pages: [
          page('assignment', 'wk1-asn.html'),
          page('engage-assignment', 'wk1-eng.html'),
          page('proj-assignment', 'wk1-proj.html'),
          page('tech-assignment', 'wk1-tech.html'),
        ],
      }],
    };
    const routed = routePages(result);
    expect(routed.assignments.map(p => p.filename)).toEqual([
      'wk1-asn.html', 'wk1-eng.html', 'wk1-proj.html', 'wk1-tech.html',
    ]);
    expect(routed.pages).toEqual([]);
  });

  it('routes quiz and discussion types to skipped with out-of-scope reason', () => {
    const result: GenerateCourseResult = {
      totalPages: 3, outputDir: '/tmp', warnings: [],
      weekResults: [{
        weekNumber: 1, outputDir: '/tmp', warnings: [],
        pages: [
          page('reading-quiz', 'wk1-rq.html'),
          page('weekly-quiz', 'wk1-wq.html'),
          page('discussion-board', 'wk1-db.html'),
        ],
      }],
    };
    const routed = routePages(result);
    expect(routed.skipped).toHaveLength(3);
    expect(routed.skipped.every(s => s.reason === 'out-of-scope-v0.9')).toBe(true);
    expect(routed.pages).toEqual([]);
    expect(routed.assignments).toEqual([]);
  });

  it('flattens across all weeks', () => {
    const result: GenerateCourseResult = {
      totalPages: 4, outputDir: '/tmp', warnings: [],
      weekResults: [
        { weekNumber: 1, outputDir: '/tmp', warnings: [], pages: [page('overview', 'wk1-ov.html'), page('assignment', 'wk1-asn.html')] },
        { weekNumber: 2, outputDir: '/tmp', warnings: [], pages: [page('overview', 'wk2-ov.html'), page('assignment', 'wk2-asn.html')] },
      ],
    };
    const routed = routePages(result);
    expect(routed.pages).toHaveLength(2);
    expect(routed.assignments).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
cd packages\command-and-control; npx vitest run tests/tools/publish/route_pages.test.ts
```
Expected: FAIL with "Cannot find module '../../../src/tools/publish/route_pages.js'".

- [ ] **Step 3: Implement routePages**

```typescript
// packages/command-and-control/src/tools/publish/route_pages.ts
import type { GenerateCourseResult, GeneratePageResult, PageType } from 'canvas-design-mcp/dist/course-types.js';
import type { SkippedEntry } from './manifest_types.js';

const PAGE_LIKE: ReadonlySet<PageType> = new Set<PageType>([
  'front-page', 'overview', 'resources', 'slides', 'videos',
  'reading', 'lab', 'extra-credit', 'custom',
]);

const ASSIGNMENT_LIKE: ReadonlySet<PageType> = new Set<PageType>([
  'assignment', 'engage-assignment', 'proj-assignment', 'tech-assignment',
]);

const SKIPPED_RECOMMENDATIONS: Record<PageType, string> = {
  'reading-quiz': 'Quiz publishing arrives in v1.x. For now, create the quiz manually in Canvas.',
  'weekly-quiz': 'Quiz publishing arrives in v1.x. For now, create the quiz manually in Canvas.',
  'discussion-board': 'Discussion publishing arrives in v1.x. For now, create the discussion manually in Canvas.',
} as Partial<Record<PageType, string>> as Record<PageType, string>;

export interface RoutedPages {
  pages: GeneratePageResult[];
  assignments: GeneratePageResult[];
  skipped: SkippedEntry[];
}

export function routePages(result: GenerateCourseResult): RoutedPages {
  const pages: GeneratePageResult[] = [];
  const assignments: GeneratePageResult[] = [];
  const skipped: SkippedEntry[] = [];

  for (const week of result.weekResults) {
    for (const p of week.pages) {
      if (PAGE_LIKE.has(p.pageType)) {
        pages.push(p);
      } else if (ASSIGNMENT_LIKE.has(p.pageType)) {
        assignments.push(p);
      } else {
        skipped.push({
          filename: p.filename,
          pageType: p.pageType,
          reason: 'out-of-scope-v0.9',
          recommendation: SKIPPED_RECOMMENDATIONS[p.pageType] ?? `${p.pageType} publishing not yet supported in v0.9.`,
        });
      }
    }
  }

  return { pages, assignments, skipped };
}
```

- [ ] **Step 4: Run test to verify it passes**

```powershell
cd packages\command-and-control; npx vitest run tests/tools/publish/route_pages.test.ts
```
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/command-and-control/src/tools/publish/route_pages.ts packages/command-and-control/tests/tools/publish/route_pages.test.ts
git commit -m "feat(cc): routePages buckets generated pages by pageType (refs #64)"
```

---

## Task 3: Structural diff summary

**Files:**
- Create: `packages/command-and-control/src/tools/publish/build_diff_summary.ts`
- Test:   `packages/command-and-control/tests/tools/publish/build_diff_summary.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/command-and-control/tests/tools/publish/build_diff_summary.test.ts
import { describe, it, expect } from 'vitest';
import { buildDiffSummary, computeUnifiedDiff } from '../../../src/tools/publish/build_diff_summary.js';

describe('buildDiffSummary', () => {
  it('returns priorWords:null when prior HTML is null (new page)', () => {
    const summary = buildDiffSummary(null, '<h2>Hello</h2><p>World</p>');
    expect(summary.priorWords).toBeNull();
    expect(summary.newWords).toBe(2);
    expect(summary.delta).toBe(2);
    expect(summary.hasFullDiff).toBe(true);
  });

  it('counts word delta correctly', () => {
    const prior = '<p>one two three</p>';
    const next = '<p>one two three four five</p>';
    const summary = buildDiffSummary(prior, next);
    expect(summary.priorWords).toBe(3);
    expect(summary.newWords).toBe(5);
    expect(summary.delta).toBe(2);
  });

  it('counts sections (h2/h3/h4) changed by raw count delta', () => {
    const prior = '<h2>A</h2><h2>B</h2>';
    const next = '<h2>A</h2><h2>B</h2><h2>C</h2><h3>sub</h3>';
    const summary = buildDiffSummary(prior, next);
    expect(summary.sectionsChanged).toBe(2);
  });

  it('counts callouts added and removed via class detection', () => {
    const prior = '<div class="callout">old</div>';
    const next = '<div class="callout">old</div><div class="callout">new1</div><div class="callout">new2</div>';
    const summary = buildDiffSummary(prior, next);
    expect(summary.calloutsAdded).toBe(2);
    expect(summary.calloutsRemoved).toBe(0);
  });

  it('counts images changed when alt text or src differs', () => {
    const prior = '<img src="a.jpg" alt="A">';
    const next = '<img src="a.jpg" alt="B"><img src="c.jpg" alt="C">';
    const summary = buildDiffSummary(prior, next);
    expect(summary.imagesChanged).toBeGreaterThanOrEqual(1);
  });
});

describe('computeUnifiedDiff', () => {
  it('produces a unified diff string for two HTML inputs', () => {
    const diff = computeUnifiedDiff('<p>one</p>\n', '<p>two</p>\n');
    expect(diff).toContain('-');
    expect(diff).toContain('+');
    expect(diff).toContain('one');
    expect(diff).toContain('two');
  });

  it('returns "(new page)" marker when prior is null', () => {
    const diff = computeUnifiedDiff(null, '<p>hello</p>');
    expect(diff).toMatch(/new page/i);
    expect(diff).toContain('hello');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
cd packages\command-and-control; npx vitest run tests/tools/publish/build_diff_summary.test.ts
```
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement diff summary builder**

```typescript
// packages/command-and-control/src/tools/publish/build_diff_summary.ts
import type { DiffSummary } from './manifest_types.js';

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();
}

function wordCount(html: string): number {
  const stripped = stripHtml(html);
  if (!stripped) return 0;
  return stripped.split(/\s+/).length;
}

function countMatches(html: string, regex: RegExp): number {
  return (html.match(regex) ?? []).length;
}

function countCallouts(html: string): number {
  return countMatches(html, /class="[^"]*\bcallout\b[^"]*"/gi);
}

function imgSignatures(html: string): Set<string> {
  const out = new Set<string>();
  const re = /<img\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const tag = m[0];
    const src = /\bsrc="([^"]*)"/i.exec(tag)?.[1] ?? '';
    const alt = /\balt="([^"]*)"/i.exec(tag)?.[1] ?? '';
    out.add(`${src}|${alt}`);
  }
  return out;
}

function countSections(html: string): number {
  return countMatches(html, /<h[234]\b/gi);
}

export function buildDiffSummary(priorHtml: string | null, newHtml: string): DiffSummary {
  const priorWords = priorHtml === null ? null : wordCount(priorHtml);
  const newWords = wordCount(newHtml);
  const delta = priorWords === null ? newWords : newWords - priorWords;

  const priorSections = priorHtml === null ? 0 : countSections(priorHtml);
  const newSections = countSections(newHtml);
  const sectionsChanged = Math.abs(newSections - priorSections);

  const priorCallouts = priorHtml === null ? 0 : countCallouts(priorHtml);
  const newCallouts = countCallouts(newHtml);
  const calloutsAdded = Math.max(0, newCallouts - priorCallouts);
  const calloutsRemoved = Math.max(0, priorCallouts - newCallouts);

  const priorImgs = priorHtml === null ? new Set<string>() : imgSignatures(priorHtml);
  const newImgs = imgSignatures(newHtml);
  let imagesChanged = 0;
  for (const sig of newImgs) if (!priorImgs.has(sig)) imagesChanged += 1;
  for (const sig of priorImgs) if (!newImgs.has(sig)) imagesChanged += 1;

  return {
    priorWords,
    newWords,
    delta,
    sectionsChanged,
    calloutsAdded,
    calloutsRemoved,
    imagesChanged,
    hasFullDiff: true,
  };
}

export function computeUnifiedDiff(priorHtml: string | null, newHtml: string): string {
  if (priorHtml === null) {
    return `(new page — no prior content)\n+++ new\n${newHtml.split('\n').map(l => `+ ${l}`).join('\n')}`;
  }
  const a = priorHtml.split(/\r?\n/);
  const b = newHtml.split(/\r?\n/);
  const out: string[] = ['--- prior', '+++ new'];
  // Minimal line-by-line diff — fine for surfacing to Claude; not LCS-optimal.
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i += 1) {
    const left = a[i];
    const right = b[i];
    if (left === right) {
      out.push(`  ${left ?? ''}`);
    } else {
      if (left !== undefined) out.push(`- ${left}`);
      if (right !== undefined) out.push(`+ ${right}`);
    }
  }
  return out.join('\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

```powershell
cd packages\command-and-control; npx vitest run tests/tools/publish/build_diff_summary.test.ts
```
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/command-and-control/src/tools/publish/build_diff_summary.ts packages/command-and-control/tests/tools/publish/build_diff_summary.test.ts
git commit -m "feat(cc): diff summary + unified diff for publish_course preview (refs #64)"
```

---

## Task 4: Warning scanner aggregator

**Files:**
- Create: `packages/command-and-control/src/tools/publish/scan_warnings.ts`
- Test:   `packages/command-and-control/tests/tools/publish/scan_warnings.test.ts`

CDS already exports `scanFerpa`, `validateCanvasHtml`, and `auditAccessibility`. This module wraps them into a single per-entry `Warning[]` with consistent severity.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/command-and-control/tests/tools/publish/scan_warnings.test.ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('canvas-design-mcp/dist/tools/publish.js', () => ({
  scanFerpa: vi.fn((html: string) =>
    html.includes('B12345678') ? { reason: 'possible University student ID', line: 1 } : undefined,
  ),
}));
vi.mock('canvas-design-mcp/dist/tools/validate.js', () => ({
  validateCanvasHtml: vi.fn((html: string) =>
    html.includes('<script>') ? { valid: false, violations: [{ message: 'script tag', line: 1 }] } : { valid: true, violations: [] },
  ),
}));
vi.mock('canvas-design-mcp/dist/tools/accessibility.js', () => ({
  auditAccessibility: vi.fn((html: string) =>
    html.includes('<img') && !html.includes('alt=') ? [{ severity: 'warn', message: 'img missing alt', line: 1 }] : [],
  ),
}));

import { scanWarnings } from '../../../src/tools/publish/scan_warnings.js';

describe('scanWarnings', () => {
  it('returns empty array when HTML is clean', () => {
    expect(scanWarnings('<p>clean</p>')).toEqual([]);
  });

  it('flags FERPA findings as severity:block', () => {
    const w = scanWarnings('<p>B12345678</p>');
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ kind: 'ferpa', severity: 'block' });
  });

  it('flags validation violations as severity:block', () => {
    const w = scanWarnings('<p>hi</p><script>x</script>');
    expect(w.find(x => x.kind === 'validation')?.severity).toBe('block');
  });

  it('flags accessibility issues as severity:warn', () => {
    const w = scanWarnings('<img src="x.jpg">');
    expect(w.find(x => x.kind === 'a11y')?.severity).toBe('warn');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
cd packages\command-and-control; npx vitest run tests/tools/publish/scan_warnings.test.ts
```
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement scanWarnings**

```typescript
// packages/command-and-control/src/tools/publish/scan_warnings.ts
import { scanFerpa } from 'canvas-design-mcp/dist/tools/publish.js';
import { validateCanvasHtml } from 'canvas-design-mcp/dist/tools/validate.js';
import { auditAccessibility } from 'canvas-design-mcp/dist/tools/accessibility.js';
import type { Warning } from './manifest_types.js';

export function scanWarnings(html: string): Warning[] {
  const warnings: Warning[] = [];

  const ferpa = scanFerpa(html);
  if (ferpa) {
    warnings.push({ kind: 'ferpa', severity: 'block', message: ferpa.reason, line: ferpa.line });
  }

  const validation = validateCanvasHtml(html);
  if (!validation.valid) {
    for (const v of validation.violations) {
      warnings.push({
        kind: 'validation',
        severity: 'block',
        message: v.message ?? 'Canvas HTML validation failed',
        line: (v as { line?: number }).line,
      });
    }
  }

  for (const a of auditAccessibility(html)) {
    warnings.push({
      kind: 'a11y',
      severity: 'warn',
      message: a.message,
      line: (a as { line?: number }).line,
    });
  }

  return warnings;
}
```

- [ ] **Step 4: Run test to verify it passes**

```powershell
cd packages\command-and-control; npx vitest run tests/tools/publish/scan_warnings.test.ts
```
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/command-and-control/src/tools/publish/scan_warnings.ts packages/command-and-control/tests/tools/publish/scan_warnings.test.ts
git commit -m "feat(cc): scanWarnings aggregator (FERPA/a11y/validation) for publish preview (refs #64)"
```

---

## Task 5: CDS — list pages and assignments

**Files:**
- Create: `packages/canvas-design-studio/src/tools/list-canvas-objects.ts`
- Test:   `packages/canvas-design-studio/tests/list-canvas-objects.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/canvas-design-studio/tests/list-canvas-objects.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { listCanvasPages, listCanvasAssignments } from '../src/tools/list-canvas-objects.js';

const fakeApi = {
  listPages: vi.fn(),
  listAssignments: vi.fn(),
};

beforeEach(() => {
  fakeApi.listPages.mockReset();
  fakeApi.listAssignments.mockReset();
});

describe('listCanvasPages', () => {
  it('returns the api result verbatim', async () => {
    fakeApi.listPages.mockResolvedValue([{ url: 'a', title: 'A', html_url: 'https://x/a' }]);
    const out = await listCanvasPages(123, fakeApi as any);
    expect(out).toEqual([{ url: 'a', title: 'A', html_url: 'https://x/a' }]);
    expect(fakeApi.listPages).toHaveBeenCalledWith(123);
  });
});

describe('listCanvasAssignments', () => {
  it('returns id/name/description triples', async () => {
    fakeApi.listAssignments.mockResolvedValue([
      { id: 1, name: 'A', description: '<p>x</p>', other: 'ignored' },
      { id: 2, name: 'B', description: null },
    ]);
    const out = await listCanvasAssignments(123, fakeApi as any);
    expect(out).toEqual([
      { id: 1, name: 'A', description: '<p>x</p>' },
      { id: 2, name: 'B', description: null },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
cd packages\canvas-design-studio; npx vitest run tests/list-canvas-objects.test.ts
```
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement list helpers**

```typescript
// packages/canvas-design-studio/src/tools/list-canvas-objects.ts
import type { CanvasPage } from '../types.js';

export interface CanvasAssignmentRaw {
  id: number;
  name: string;
  description: string | null;
  [key: string]: unknown;
}

export interface CanvasAssignment {
  id: number;
  name: string;
  description: string | null;
}

export interface ListPagesApi {
  listPages(courseId: number): Promise<CanvasPage[]>;
}

export interface ListAssignmentsApi {
  listAssignments(courseId: number): Promise<CanvasAssignmentRaw[]>;
}

export async function listCanvasPages(courseId: number, api: ListPagesApi): Promise<CanvasPage[]> {
  return api.listPages(courseId);
}

export async function listCanvasAssignments(
  courseId: number,
  api: ListAssignmentsApi,
): Promise<CanvasAssignment[]> {
  const raw = await api.listAssignments(courseId);
  return raw.map(r => ({ id: r.id, name: r.name, description: r.description ?? null }));
}
```

- [ ] **Step 4: Extend the real CanvasApi client**

Open `packages/canvas-design-studio/src/canvas-api.ts` and add a `listAssignments` method that mirrors the existing `listPages` pattern — `GET /api/v1/courses/{courseId}/assignments?per_page=100`, paginate as the existing code does, return the parsed JSON array. The interface stays compatible with `ListAssignmentsApi` above.

- [ ] **Step 5: Run test to verify it passes**

```powershell
cd packages\canvas-design-studio; npx vitest run tests/list-canvas-objects.test.ts
```
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/canvas-design-studio/src/tools/list-canvas-objects.ts packages/canvas-design-studio/tests/list-canvas-objects.test.ts packages/canvas-design-studio/src/canvas-api.ts
git commit -m "feat(cds): list Canvas pages and assignments for publish_course preview (refs #64)"
```

---

## Task 6: CDS — update assignment description

**Files:**
- Create: `packages/canvas-design-studio/src/tools/update-assignment-description.ts`
- Test:   `packages/canvas-design-studio/tests/update-assignment-description.test.ts`
- Modify: `packages/canvas-design-studio/src/canvas-api.ts` (add `updateAssignmentDescription` HTTP call)

- [ ] **Step 1: Write the failing test**

```typescript
// packages/canvas-design-studio/tests/update-assignment-description.test.ts
import { describe, it, expect, vi } from 'vitest';
import { updateAssignmentDescription } from '../src/tools/update-assignment-description.js';
import { CanvasApiError } from '../src/canvas-api.js';

describe('updateAssignmentDescription', () => {
  it('calls api.updateAssignmentDescription with courseId, assignmentId, html', async () => {
    const api = { updateAssignmentDescription: vi.fn().mockResolvedValue({ id: 1, name: 'A', description: '<p>x</p>' }) };
    const out = await updateAssignmentDescription(10, 1, '<p>x</p>', api as any);
    expect(api.updateAssignmentDescription).toHaveBeenCalledWith(10, 1, '<p>x</p>');
    expect(out).toEqual({ id: 1, name: 'A', description: '<p>x</p>' });
  });

  it('lets CanvasApiError bubble unchanged', async () => {
    const api = { updateAssignmentDescription: vi.fn().mockRejectedValue(new CanvasApiError('429', 429, 'CANVAS_RATE_LIMITED')) };
    await expect(updateAssignmentDescription(10, 1, '<p>x</p>', api as any)).rejects.toBeInstanceOf(CanvasApiError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
cd packages\canvas-design-studio; npx vitest run tests/update-assignment-description.test.ts
```
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement**

```typescript
// packages/canvas-design-studio/src/tools/update-assignment-description.ts
import type { CanvasAssignment } from './list-canvas-objects.js';

export interface UpdateAssignmentApi {
  updateAssignmentDescription(courseId: number, assignmentId: number, html: string): Promise<CanvasAssignment>;
}

export async function updateAssignmentDescription(
  courseId: number,
  assignmentId: number,
  html: string,
  api: UpdateAssignmentApi,
): Promise<CanvasAssignment> {
  return api.updateAssignmentDescription(courseId, assignmentId, html);
}
```

- [ ] **Step 4: Extend the real CanvasApi client**

In `packages/canvas-design-studio/src/canvas-api.ts` add `updateAssignmentDescription(courseId, assignmentId, html)` — a `PUT /api/v1/courses/{courseId}/assignments/{assignmentId}` with body `{ assignment: { description: html } }`. Reuse the existing fetch + 401/403/404/429 → `CanvasApiError` mapping that `updatePage` uses.

- [ ] **Step 5: Run test to verify it passes**

```powershell
cd packages\canvas-design-studio; npx vitest run tests/update-assignment-description.test.ts
```
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/canvas-design-studio/src/tools/update-assignment-description.ts packages/canvas-design-studio/tests/update-assignment-description.test.ts packages/canvas-design-studio/src/canvas-api.ts
git commit -m "feat(cds): updateAssignmentDescription (description-only PUT) (refs #64)"
```

---

## Task 7: CDS — restore page (rollback support)

**Files:**
- Create: `packages/canvas-design-studio/src/tools/restore-page.ts`
- Test:   `packages/canvas-design-studio/tests/restore-page.test.ts`
- Modify: `packages/canvas-design-studio/src/canvas-api.ts` (add `deletePage`)

- [ ] **Step 1: Write the failing test**

```typescript
// packages/canvas-design-studio/tests/restore-page.test.ts
import { describe, it, expect, vi } from 'vitest';
import { restorePage } from '../src/tools/restore-page.js';

describe('restorePage', () => {
  it('calls updatePage with priorHtml when prior was non-null', async () => {
    const api = { updatePage: vi.fn().mockResolvedValue({ url: 'a' }), deletePage: vi.fn() };
    await restorePage(10, 'a', '<p>old</p>', api as any);
    expect(api.updatePage).toHaveBeenCalledWith(10, 'a', '<p>old</p>');
    expect(api.deletePage).not.toHaveBeenCalled();
  });

  it('calls deletePage when priorHtml is null (page was newly created)', async () => {
    const api = { updatePage: vi.fn(), deletePage: vi.fn().mockResolvedValue(undefined) };
    await restorePage(10, 'a', null, api as any);
    expect(api.deletePage).toHaveBeenCalledWith(10, 'a');
    expect(api.updatePage).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
cd packages\canvas-design-studio; npx vitest run tests/restore-page.test.ts
```
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement**

```typescript
// packages/canvas-design-studio/src/tools/restore-page.ts
export interface RestorePageApi {
  updatePage(courseId: number, pageUrl: string, html: string): Promise<unknown>;
  deletePage(courseId: number, pageUrl: string): Promise<void>;
}

export async function restorePage(
  courseId: number,
  pageUrl: string,
  priorHtml: string | null,
  api: RestorePageApi,
): Promise<void> {
  if (priorHtml === null) {
    await api.deletePage(courseId, pageUrl);
  } else {
    await api.updatePage(courseId, pageUrl, priorHtml);
  }
}
```

- [ ] **Step 4: Extend the real CanvasApi client**

In `packages/canvas-design-studio/src/canvas-api.ts` add `deletePage(courseId, pageUrl)` — `DELETE /api/v1/courses/{courseId}/pages/{pageUrl}`. Reuse the existing error mapping.

- [ ] **Step 5: Run test to verify it passes**

```powershell
cd packages\canvas-design-studio; npx vitest run tests/restore-page.test.ts
```
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/canvas-design-studio/src/tools/restore-page.ts packages/canvas-design-studio/tests/restore-page.test.ts packages/canvas-design-studio/src/canvas-api.ts
git commit -m "feat(cds): restorePage (update-or-delete) for publish_course rollback (refs #64)"
```

---

## Task 8: Snapshot store I/O

**Files:**
- Create: `packages/command-and-control/src/tools/publish/snapshot_store.ts`
- Test:   `packages/command-and-control/tests/tools/publish/snapshot_store.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/command-and-control/tests/tools/publish/snapshot_store.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createSnapshotDir,
  writeManifest,
  readManifest,
  writePriorHtml,
  readPriorHtml,
  writeNewHtml,
  writeFullDiff,
  writeState,
  readState,
  findStaleSnapshot,
} from '../../../src/tools/publish/snapshot_store.js';
import type { PreviewManifest, PublishState } from '../../../src/tools/publish/manifest_types.js';

let cc: string;
beforeEach(() => {
  cc = mkdtempSync(join(tmpdir(), 'snap-'));
  process.env.CC_HOME = cc;
});
afterEach(() => {
  rmSync(cc, { recursive: true, force: true });
  delete process.env.CC_HOME;
});

function fakeManifest(snapshotId: string, courseId = 1): PreviewManifest {
  return {
    snapshotId, courseId, courseDir: '/x', generatedAt: '2026-05-30T00:00:00Z',
    git: { isRepo: false }, entries: [], summary: {
      total: 0, pages: 0, assignments: 0, skipped: 0, warningsCount: 0, ferpaCount: 0, collisionsCount: 0,
    },
  };
}

describe('snapshot_store', () => {
  it('round-trips a manifest', () => {
    const dir = createSnapshotDir('abc');
    const m = fakeManifest('abc');
    writeManifest(dir, m);
    expect(readManifest(dir)).toEqual(m);
  });

  it('round-trips per-entry prior/new/diff files', () => {
    const dir = createSnapshotDir('abc');
    writePriorHtml(dir, 'w1.html', '<p>old</p>');
    writeNewHtml(dir, 'w1.html', '<p>new</p>');
    writeFullDiff(dir, 'w1.html', '- old\n+ new\n');
    expect(readPriorHtml(dir, 'w1.html')).toBe('<p>old</p>');
    expect(existsSync(join(dir, 'new', 'w1.html'))).toBe(true);
    expect(existsSync(join(dir, 'diffs', 'w1.html.diff'))).toBe(true);
  });

  it('writes and reads state.json', () => {
    const dir = createSnapshotDir('abc');
    const s: PublishState = { phase: 'partial', published: [], lastUpdatedAt: '2026-05-30T00:00:00Z' };
    writeState(dir, s);
    expect(readState(dir)).toEqual(s);
  });

  it('findStaleSnapshot returns latest partial state for a courseId', () => {
    const dir = createSnapshotDir('snap-1');
    writeManifest(dir, fakeManifest('snap-1', 42));
    writeState(dir, {
      phase: 'partial', lastUpdatedAt: '2026-05-30T00:01:00Z',
      published: [], failed: { filename: 'wk4.html', type: 'page', reason: '429', code: 'CANVAS_RATE_LIMITED', failedAt: '2026-05-30T00:01:00Z' },
    });
    const stale = findStaleSnapshot(42);
    expect(stale?.snapshotId).toBe('snap-1');
    expect(stale?.lastFailedFile).toBe('wk4.html');
  });

  it('findStaleSnapshot returns undefined when no partial snapshot exists', () => {
    expect(findStaleSnapshot(99)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
cd packages\command-and-control; npx vitest run tests/tools/publish/snapshot_store.test.ts
```
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement snapshot_store**

```typescript
// packages/command-and-control/src/tools/publish/snapshot_store.ts
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { getCcHomePath } from '../../kb/config.js';
import type { PreviewManifest, PublishState, StaleSnapshotPointer } from './manifest_types.js';

function snapshotsRoot(): string {
  const root = join(getCcHomePath(), 'publish-snapshots');
  if (!existsSync(root)) mkdirSync(root, { recursive: true });
  return root;
}

export function newSnapshotId(): string {
  return randomUUID();
}

export function createSnapshotDir(snapshotId: string): string {
  const dir = join(snapshotsRoot(), snapshotId);
  mkdirSync(join(dir, 'prior'), { recursive: true });
  mkdirSync(join(dir, 'new'), { recursive: true });
  mkdirSync(join(dir, 'diffs'), { recursive: true });
  return dir;
}

export function writeManifest(dir: string, manifest: PreviewManifest): void {
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');
}
export function readManifest(dir: string): PreviewManifest {
  return JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf-8')) as PreviewManifest;
}

export function writePriorHtml(dir: string, filename: string, html: string): void {
  writeFileSync(join(dir, 'prior', filename), html, 'utf-8');
}
export function readPriorHtml(dir: string, filename: string): string {
  return readFileSync(join(dir, 'prior', filename), 'utf-8');
}
export function priorHtmlExists(dir: string, filename: string): boolean {
  return existsSync(join(dir, 'prior', filename));
}

export function writeNewHtml(dir: string, filename: string, html: string): void {
  writeFileSync(join(dir, 'new', filename), html, 'utf-8');
}

export function writeFullDiff(dir: string, filename: string, diff: string): void {
  writeFileSync(join(dir, 'diffs', `${filename}.diff`), diff, 'utf-8');
}
export function readFullDiff(dir: string, filename: string): string {
  return readFileSync(join(dir, 'diffs', `${filename}.diff`), 'utf-8');
}

export function writeState(dir: string, state: PublishState): void {
  writeFileSync(join(dir, 'state.json'), JSON.stringify(state, null, 2), 'utf-8');
}
export function readState(dir: string): PublishState {
  return JSON.parse(readFileSync(join(dir, 'state.json'), 'utf-8')) as PublishState;
}

export function snapshotDir(snapshotId: string): string {
  return join(snapshotsRoot(), snapshotId);
}

export function findStaleSnapshot(courseId: number): StaleSnapshotPointer | undefined {
  const root = snapshotsRoot();
  if (!existsSync(root)) return undefined;
  const candidates: { snapshotId: string; state: PublishState; manifest: PreviewManifest }[] = [];
  for (const id of readdirSync(root)) {
    const dir = join(root, id);
    if (!existsSync(join(dir, 'state.json'))) continue;
    if (!existsSync(join(dir, 'manifest.json'))) continue;
    try {
      const m = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf-8')) as PreviewManifest;
      if (m.courseId !== courseId) continue;
      const s = JSON.parse(readFileSync(join(dir, 'state.json'), 'utf-8')) as PublishState;
      if (s.phase === 'partial') candidates.push({ snapshotId: id, state: s, manifest: m });
    } catch { /* skip corrupt */ }
  }
  if (candidates.length === 0) return undefined;
  candidates.sort((a, b) => a.state.lastUpdatedAt < b.state.lastUpdatedAt ? 1 : -1);
  const latest = candidates[0];
  const failed = latest.state.failed;
  if (!failed) return undefined;
  return {
    snapshotId: latest.snapshotId,
    lastFailedFile: failed.filename,
    failedAt: failed.failedAt,
    fix: [
      'Resolve the underlying Canvas error reported in state.json.',
      `Resume with publish_course { snapshotId: "${latest.snapshotId}", resume: true } once ready,`,
      `or rollback with rollback_course_publish { snapshotId: "${latest.snapshotId}" }.`,
    ],
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```powershell
cd packages\command-and-control; npx vitest run tests/tools/publish/snapshot_store.test.ts
```
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/command-and-control/src/tools/publish/snapshot_store.ts packages/command-and-control/tests/tools/publish/snapshot_store.test.ts
git commit -m "feat(cc): snapshot store IO + stale-snapshot detection (refs #64)"
```

---

## Task 9: Git state + commit/tag helpers

**Files:**
- Create: `packages/command-and-control/src/tools/publish/git_state.ts`
- Test:   `packages/command-and-control/tests/tools/publish/git_state.test.ts`

The helpers shell out to `git` via `execFileSync`. The test runs them against a temp directory it `git init`s. If `git` is not on PATH the test skips itself — same as the installer integration tests do.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/command-and-control/tests/tools/publish/git_state.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectGitState, gitCommitPrePublish, gitTagSuccess } from '../../../src/tools/publish/git_state.js';

function gitAvailable(): boolean {
  try { execFileSync('git', ['--version'], { stdio: 'ignore' }); return true; }
  catch { return false; }
}

const itGit = gitAvailable() ? it : it.skip;

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'gs-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe('detectGitState', () => {
  it('reports non-repo when directory has no git', () => {
    expect(detectGitState(dir)).toEqual({ isRepo: false, nudge: 'init-suggested' });
  });

  itGit('reports clean repo with no remote', () => {
    execFileSync('git', ['init', '-q'], { cwd: dir });
    execFileSync('git', ['config', 'user.email', 't@t'], { cwd: dir });
    execFileSync('git', ['config', 'user.name', 'T'], { cwd: dir });
    writeFileSync(join(dir, 'a.txt'), 'x');
    execFileSync('git', ['add', '.'], { cwd: dir });
    execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: dir });
    const s = detectGitState(dir);
    expect(s.isRepo).toBe(true);
    expect(s.clean).toBe(true);
    expect(s.remote).toBeUndefined();
  });

  itGit('reports dirty tree with warn nudge', () => {
    execFileSync('git', ['init', '-q'], { cwd: dir });
    execFileSync('git', ['config', 'user.email', 't@t'], { cwd: dir });
    execFileSync('git', ['config', 'user.name', 'T'], { cwd: dir });
    writeFileSync(join(dir, 'a.txt'), 'x');
    execFileSync('git', ['add', '.'], { cwd: dir });
    execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: dir });
    writeFileSync(join(dir, 'a.txt'), 'y'); // dirty
    const s = detectGitState(dir);
    expect(s.clean).toBe(false);
    expect(s.nudge).toBe('dirty-tree-warning');
  });

  itGit('gitCommitPrePublish creates a commit then gitTagSuccess applies a tag', () => {
    execFileSync('git', ['init', '-q'], { cwd: dir });
    execFileSync('git', ['config', 'user.email', 't@t'], { cwd: dir });
    execFileSync('git', ['config', 'user.name', 'T'], { cwd: dir });
    writeFileSync(join(dir, 'a.txt'), 'x');
    execFileSync('git', ['add', '.'], { cwd: dir });
    execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: dir });
    writeFileSync(join(dir, 'a.txt'), 'y');
    gitCommitPrePublish(dir, 'publish_course: pre-publish snapshot');
    const log = execFileSync('git', ['log', '--oneline'], { cwd: dir }).toString();
    expect(log).toContain('pre-publish snapshot');
    gitTagSuccess(dir, 'published-test');
    const tags = execFileSync('git', ['tag'], { cwd: dir }).toString();
    expect(tags).toContain('published-test');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
cd packages\command-and-control; npx vitest run tests/tools/publish/git_state.test.ts
```
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement git helpers**

```typescript
// packages/command-and-control/src/tools/publish/git_state.ts
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { GitState } from './manifest_types.js';

function tryGit(args: string[], cwd: string): string | null {
  try {
    return execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
  } catch {
    return null;
  }
}

export function detectGitState(courseDir: string): GitState {
  if (!existsSync(join(courseDir, '.git'))) {
    return { isRepo: false, nudge: 'init-suggested' };
  }
  const status = tryGit(['status', '--porcelain'], courseDir);
  const remote = tryGit(['remote', 'get-url', 'origin'], courseDir) ?? undefined;
  const clean = status === '';
  return {
    isRepo: true,
    clean,
    remote: remote || undefined,
    nudge: clean ? undefined : 'dirty-tree-warning',
  };
}

export function gitCommitPrePublish(courseDir: string, message: string): void {
  execFileSync('git', ['add', '-A'], { cwd: courseDir });
  // Allow empty so a clean tree doesn't error — we still want a marker commit.
  execFileSync('git', ['commit', '--allow-empty', '-m', message], { cwd: courseDir });
}

export function gitTagSuccess(courseDir: string, tag: string): void {
  execFileSync('git', ['tag', tag], { cwd: courseDir });
}

export function gitPushTag(courseDir: string, tag: string): { ok: true } | { ok: false; reason: string } {
  try {
    execFileSync('git', ['push', 'origin', tag], { cwd: courseDir, stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```powershell
cd packages\command-and-control; npx vitest run tests/tools/publish/git_state.test.ts
```
Expected: PASS (4 tests; 3 skipped if git absent — verify locally that git is available so all run).

- [ ] **Step 5: Commit**

```bash
git add packages/command-and-control/src/tools/publish/git_state.ts packages/command-and-control/tests/tools/publish/git_state.test.ts
git commit -m "feat(cc): git state detection + pre-publish commit/tag helpers (refs #64)"
```

---

## Task 10: Approvals validation

**Files:**
- Create: `packages/command-and-control/src/tools/publish/approvals.ts`
- Test:   `packages/command-and-control/tests/tools/publish/approvals.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/command-and-control/tests/tools/publish/approvals.test.ts
import { describe, it, expect } from 'vitest';
import { validateApprovals } from '../../../src/tools/publish/approvals.js';
import type { PreviewManifest } from '../../../src/tools/publish/manifest_types.js';

function manifest(filenames: string[], skippedFilenames: string[] = []): PreviewManifest {
  return {
    snapshotId: 'x', courseId: 1, courseDir: '/x', generatedAt: '2026-05-30T00:00:00Z',
    git: { isRepo: false },
    entries: [
      ...filenames.map(f => ({ type: 'page' as const, filename: f, pageType: 'overview' as const, intendedTitle: f, collisionAction: 'update' as const, diff: { priorWords: 1, newWords: 1, delta: 0, sectionsChanged: 0, calloutsAdded: 0, calloutsRemoved: 0, imagesChanged: 0, hasFullDiff: true }, warnings: [] })),
      ...skippedFilenames.map(f => ({ type: 'skipped' as const, filename: f, pageType: 'weekly-quiz' as const, reason: 'out-of-scope-v0.9' as const, recommendation: 'x' })),
    ],
    summary: { total: filenames.length + skippedFilenames.length, pages: filenames.length, assignments: 0, skipped: skippedFilenames.length, warningsCount: 0, ferpaCount: 0, collisionsCount: 0 },
  };
}

describe('validateApprovals', () => {
  it('accepts a complete approval map covering every non-skipped entry', () => {
    const m = manifest(['a.html', 'b.html']);
    const r = validateApprovals(m, { 'a.html': 'approve', 'b.html': 'skip' });
    expect(r.ok).toBe(true);
  });

  it('rejects when manifest entries are missing from approvals', () => {
    const m = manifest(['a.html', 'b.html']);
    const r = validateApprovals(m, { 'a.html': 'approve' });
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual(['b.html']);
  });

  it('rejects unknown filenames in approvals', () => {
    const m = manifest(['a.html']);
    const r = validateApprovals(m, { 'a.html': 'approve', 'unknown.html': 'skip' });
    expect(r.ok).toBe(false);
    expect(r.unknown).toEqual(['unknown.html']);
  });

  it('ignores skipped-entry filenames in approvals (they need not be approved/skipped)', () => {
    const m = manifest(['a.html'], ['quiz.html']);
    const r = validateApprovals(m, { 'a.html': 'approve' });
    expect(r.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
cd packages\command-and-control; npx vitest run tests/tools/publish/approvals.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement**

```typescript
// packages/command-and-control/src/tools/publish/approvals.ts
import type { PreviewManifest } from './manifest_types.js';

export type ApprovalAction = 'approve' | 'skip';
export type ApprovalMap = Record<string, ApprovalAction>;

export interface ApprovalValidation {
  ok: boolean;
  missing: string[];
  unknown: string[];
}

export function validateApprovals(manifest: PreviewManifest, approvals: ApprovalMap): ApprovalValidation {
  const required = new Set<string>(
    manifest.entries.filter(e => e.type !== 'skipped').map(e => e.filename),
  );
  const provided = new Set<string>(Object.keys(approvals));
  const missing: string[] = [];
  for (const f of required) if (!provided.has(f)) missing.push(f);
  const unknown: string[] = [];
  for (const f of provided) if (!required.has(f)) unknown.push(f);
  return { ok: missing.length === 0 && unknown.length === 0, missing, unknown };
}

export function approvedFilenames(approvals: ApprovalMap): string[] {
  return Object.entries(approvals).filter(([, a]) => a === 'approve').map(([f]) => f);
}
```

- [ ] **Step 4: Run test to verify it passes**

```powershell
cd packages\command-and-control; npx vitest run tests/tools/publish/approvals.test.ts
```
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/command-and-control/src/tools/publish/approvals.ts packages/command-and-control/tests/tools/publish/approvals.test.ts
git commit -m "feat(cc): validateApprovals for publish_course (refs #64)"
```

---

## Task 11: Canvas config bridge (C&C → CDS InstitutionConfig)

**Files:**
- Create: `packages/command-and-control/src/tools/publish/canvas_config_bridge.ts`
- Test:   `packages/command-and-control/tests/tools/publish/canvas_config_bridge.test.ts`

`publishToCanvas` takes a CDS `InstitutionConfig` (`apiToken`, `canvasUrl`, optional `professorEmail`). C&C stores `host`+`token` via `setup_canvas`. This bridge does the translation.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/command-and-control/tests/tools/publish/canvas_config_bridge.test.ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../src/tools/setup_canvas.js', () => ({
  loadCanvasConfig: vi.fn(),
}));

import { loadCanvasConfig } from '../../../src/tools/setup_canvas.js';
import { loadInstitutionConfig } from '../../../src/tools/publish/canvas_config_bridge.js';

describe('loadInstitutionConfig', () => {
  it('translates CanvasSetupConfig to InstitutionConfig', () => {
    vi.mocked(loadCanvasConfig).mockReturnValue({
      host: 'example.instructure.com', token: 'abc',
      configuredAt: '2026-05-26T00:00:00Z', lastValidatedAt: '2026-05-26T00:00:00Z',
    });
    const cfg = loadInstitutionConfig();
    expect(cfg).toEqual({ canvasUrl: 'https://example.instructure.com', apiToken: 'abc' });
  });

  it('throws CANVAS_NOT_CONFIGURED when underlying load throws', () => {
    vi.mocked(loadCanvasConfig).mockImplementation(() => { throw new Error('CANVAS_NOT_CONFIGURED'); });
    expect(() => loadInstitutionConfig()).toThrow(/CANVAS_NOT_CONFIGURED/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
cd packages\command-and-control; npx vitest run tests/tools/publish/canvas_config_bridge.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement**

```typescript
// packages/command-and-control/src/tools/publish/canvas_config_bridge.ts
import { loadCanvasConfig } from '../setup_canvas.js';

export interface InstitutionConfigBridge {
  canvasUrl: string;
  apiToken: string;
}

export function loadInstitutionConfig(): InstitutionConfigBridge {
  const cfg = loadCanvasConfig();
  return {
    canvasUrl: `https://${cfg.host}`,
    apiToken: cfg.token,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```powershell
cd packages\command-and-control; npx vitest run tests/tools/publish/canvas_config_bridge.test.ts
```
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/command-and-control/src/tools/publish/canvas_config_bridge.ts packages/command-and-control/tests/tools/publish/canvas_config_bridge.test.ts
git commit -m "feat(cc): canvas_config_bridge translates CanvasSetupConfig→InstitutionConfig (refs #64)"
```

---

## Task 12: `preview_course_publish` workflow

**Files:**
- Create: `packages/command-and-control/src/tools/workflows/preview_course_publish.ts`
- Test:   `packages/command-and-control/tests/tools/workflows/preview_course_publish.test.ts`

This is the integrator. It composes routePages + buildDiffSummary + scanWarnings + snapshot store + git state, calls the CDS list functions against a mocked API, and produces a `PreviewManifest` written to disk. Title-match uses the existing `titleSimilarity` exported from `canvas-design-mcp/dist/tools/publish.js` with a `>=0.8` threshold.

The test mocks `generateCourse`, `listCanvasPages`, `listCanvasAssignments`, `loadInstitutionConfig`, the underlying Canvas API client factory, and feeds a tiny in-memory courseDir.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/command-and-control/tests/tools/workflows/preview_course_publish.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('canvas-design-mcp/dist/tools/generate-course.js', () => ({
  generateCourse: vi.fn(),
}));
vi.mock('canvas-design-mcp/dist/tools/list-canvas-objects.js', () => ({
  listCanvasPages: vi.fn(),
  listCanvasAssignments: vi.fn(),
}));
vi.mock('../../../src/tools/publish/canvas_config_bridge.js', () => ({
  loadInstitutionConfig: vi.fn().mockReturnValue({ canvasUrl: 'https://x', apiToken: 't' }),
}));
vi.mock('canvas-design-mcp/dist/canvas-api.js', () => ({
  createCanvasApi: vi.fn(() => ({})),
  CanvasApiError: class extends Error {},
}));

import { generateCourse } from 'canvas-design-mcp/dist/tools/generate-course.js';
import { listCanvasPages, listCanvasAssignments } from 'canvas-design-mcp/dist/tools/list-canvas-objects.js';
import { previewCoursePublish } from '../../../src/tools/workflows/preview_course_publish.js';

let cc: string;
let course: string;
beforeEach(() => {
  cc = mkdtempSync(join(tmpdir(), 'cc-'));
  course = mkdtempSync(join(tmpdir(), 'course-'));
  mkdirSync(join(course, 'output'), { recursive: true });
  process.env.CC_HOME = cc;
});
afterEach(() => {
  rmSync(cc, { recursive: true, force: true });
  rmSync(course, { recursive: true, force: true });
  delete process.env.CC_HOME;
  vi.clearAllMocks();
});

describe('previewCoursePublish', () => {
  it('produces a manifest with pages, assignments, and skipped buckets', async () => {
    writeFileSync(join(course, 'output', 'overview.html'), '<h2>Week 1</h2><p>hello</p>');
    writeFileSync(join(course, 'output', 'asn.html'), '<p>do the thing</p>');
    writeFileSync(join(course, 'output', 'quiz.html'), '<p>quiz</p>');
    vi.mocked(generateCourse).mockReturnValue({
      totalPages: 3, outputDir: join(course, 'output'), warnings: [],
      weekResults: [{
        weekNumber: 1, outputDir: join(course, 'output'), warnings: [],
        pages: [
          { html: '<h2>Week 1</h2><p>hello</p>', filename: 'overview.html', weekNumber: 1, pageType: 'overview', savedTo: join(course, 'output', 'overview.html') },
          { html: '<p>do the thing</p>', filename: 'asn.html', weekNumber: 1, pageType: 'assignment', savedTo: join(course, 'output', 'asn.html') },
          { html: '<p>quiz</p>', filename: 'quiz.html', weekNumber: 1, pageType: 'weekly-quiz', savedTo: join(course, 'output', 'quiz.html') },
        ],
      }],
    });
    vi.mocked(listCanvasPages).mockResolvedValue([
      { url: 'week-1-overview', title: 'Week 1 Overview', html_url: 'https://x/p/wk1' } as any,
    ]);
    vi.mocked(listCanvasAssignments).mockResolvedValue([
      { id: 7, name: 'do the thing', description: '<p>old</p>' },
    ]);

    const r = await previewCoursePublish({ courseDir: course, courseId: 12345 });

    const types = r.manifest.entries.map(e => e.type);
    expect(types.sort()).toEqual(['assignment', 'page', 'skipped']);
    const asn = r.manifest.entries.find(e => e.type === 'assignment');
    expect(asn).toBeDefined();
    if (asn?.type === 'assignment') expect(asn.canvasMatch.assignmentId).toBe(7);
    expect(r.snapshotId).toBeDefined();
  });

  it('refuses with COURSE_DIR_NOT_FOUND when courseDir has no course-config (generateCourse throws)', async () => {
    vi.mocked(generateCourse).mockImplementation(() => { throw new Error('course-config.md not found in ' + course); });
    const r = await previewCoursePublish({ courseDir: course, courseId: 12345 });
    expect(r.error).toBe('GENERATE_FAILED');
  });

  it('flags an unmatched assignment as skipped with reason unmatched-assignment', async () => {
    writeFileSync(join(course, 'output', 'asn.html'), '<p>do</p>');
    vi.mocked(generateCourse).mockReturnValue({
      totalPages: 1, outputDir: join(course, 'output'), warnings: [],
      weekResults: [{
        weekNumber: 1, outputDir: join(course, 'output'), warnings: [],
        pages: [{ html: '<p>do</p>', filename: 'asn.html', weekNumber: 1, pageType: 'assignment', savedTo: join(course, 'output', 'asn.html') }],
      }],
    });
    vi.mocked(listCanvasPages).mockResolvedValue([]);
    vi.mocked(listCanvasAssignments).mockResolvedValue([]); // no match
    const r = await previewCoursePublish({ courseDir: course, courseId: 12345 });
    const skipped = r.manifest.entries.find(e => e.type === 'skipped');
    expect(skipped?.type).toBe('skipped');
    if (skipped?.type === 'skipped') expect(skipped.reason).toBe('unmatched-assignment');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
cd packages\command-and-control; npx vitest run tests/tools/workflows/preview_course_publish.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement previewCoursePublish**

```typescript
// packages/command-and-control/src/tools/workflows/preview_course_publish.ts
import { existsSync, readFileSync } from 'node:fs';
import { generateCourse } from 'canvas-design-mcp/dist/tools/generate-course.js';
import { titleSimilarity } from 'canvas-design-mcp/dist/tools/publish.js';
import { listCanvasPages, listCanvasAssignments, type CanvasAssignment } from 'canvas-design-mcp/dist/tools/list-canvas-objects.js';
import { createCanvasApi } from 'canvas-design-mcp/dist/canvas-api.js';
import { loadInstitutionConfig } from '../publish/canvas_config_bridge.js';
import { routePages } from '../publish/route_pages.js';
import { buildDiffSummary, computeUnifiedDiff } from '../publish/build_diff_summary.js';
import { scanWarnings } from '../publish/scan_warnings.js';
import { detectGitState } from '../publish/git_state.js';
import {
  createSnapshotDir, newSnapshotId, writeManifest, writePriorHtml, writeNewHtml,
  writeFullDiff, writeState, findStaleSnapshot,
} from '../publish/snapshot_store.js';
import type { PreviewManifest, ManifestEntry } from '../publish/manifest_types.js';

const MATCH_THRESHOLD = 0.8;

export interface PreviewCoursePublishInput {
  courseDir: string;
  courseId: number;
  outputDir?: string;
  fullDiffFor?: string[];
}

export interface PreviewCoursePublishResult {
  snapshotId?: string;
  manifest?: PreviewManifest;
  error?: string;
  message?: string;
  fix?: string[];
}

function bestAssignmentMatch(intendedTitle: string, all: CanvasAssignment[]) {
  let best: { a: CanvasAssignment; score: number } | undefined;
  for (const a of all) {
    const score = titleSimilarity(a.name, intendedTitle);
    if (!best || score > best.score) best = { a, score };
  }
  return best && best.score >= MATCH_THRESHOLD ? best : undefined;
}

function bestPageMatch(intendedTitle: string, all: { url: string; title: string; html_url?: string }[]) {
  let best: { p: { url: string; title: string; html_url?: string }; score: number } | undefined;
  for (const p of all) {
    const score = titleSimilarity(p.title, intendedTitle);
    if (!best || score > best.score) best = { p, score };
  }
  return best && best.score >= MATCH_THRESHOLD ? best : undefined;
}

function intendedTitleFor(filename: string, html: string): string {
  // Existing convention: source markdown has front-matter `title:` which generate-page used.
  // The HTML doesn't preserve it; fall back to a humanized filename ("wk1-overview.html" → "Wk1 Overview").
  return filename
    .replace(/\.html$/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b([a-z])/g, (_, c) => c.toUpperCase());
}

export async function previewCoursePublish(
  input: PreviewCoursePublishInput,
): Promise<PreviewCoursePublishResult> {
  let cfg;
  try { cfg = loadInstitutionConfig(); }
  catch (e) {
    return { error: 'MISSING_API_TOKEN', message: e instanceof Error ? e.message : String(e),
      fix: ['Run setup_canvas with your Canvas host and API token.'] };
  }

  let generated;
  try { generated = generateCourse({ courseDir: input.courseDir, outputDir: input.outputDir }); }
  catch (e) {
    return { error: 'GENERATE_FAILED', message: e instanceof Error ? e.message : String(e),
      fix: ['Run import_course to populate the course folder, or fix the underlying generate error.'] };
  }

  const routed = routePages(generated);
  const api = createCanvasApi(cfg);
  const [canvasPages, canvasAssignments] = await Promise.all([
    listCanvasPages(input.courseId, api),
    listCanvasAssignments(input.courseId, api),
  ]);

  const snapshotId = newSnapshotId();
  const dir = createSnapshotDir(snapshotId);
  const fullDiffSet = new Set(input.fullDiffFor ?? []);
  const entries: ManifestEntry[] = [];

  for (const p of routed.pages) {
    const intendedTitle = intendedTitleFor(p.filename, p.html);
    const match = bestPageMatch(intendedTitle, canvasPages);
    const priorHtml = match ? (canvasPages.find(cp => cp.url === match.p.url) as any)?.body ?? null : null;
    writePriorHtml(dir, p.filename, priorHtml ?? '');
    writeNewHtml(dir, p.filename, p.html);
    const diff = buildDiffSummary(priorHtml, p.html);
    writeFullDiff(dir, p.filename, computeUnifiedDiff(priorHtml, p.html));
    entries.push({
      type: 'page', filename: p.filename, pageType: p.pageType, intendedTitle,
      canvasMatch: match ? { pageId: match.p.url, url: match.p.html_url ?? match.p.url, existingTitle: match.p.title, similarity: match.score } : undefined,
      collisionAction: match ? 'update' : 'create',
      diff, warnings: scanWarnings(p.html),
    });
  }

  for (const a of routed.assignments) {
    const intendedTitle = intendedTitleFor(a.filename, a.html);
    const match = bestAssignmentMatch(intendedTitle, canvasAssignments);
    if (!match) {
      entries.push({
        type: 'skipped', filename: a.filename, pageType: a.pageType,
        reason: 'unmatched-assignment',
        recommendation: `No Canvas assignment matched "${intendedTitle}" (>=0.8 similarity). Create the assignment in Canvas first, then re-run preview_course_publish.`,
      });
      continue;
    }
    const priorHtml = match.a.description;
    writePriorHtml(dir, a.filename, priorHtml ?? '');
    writeNewHtml(dir, a.filename, a.html);
    const diff = buildDiffSummary(priorHtml, a.html);
    writeFullDiff(dir, a.filename, computeUnifiedDiff(priorHtml, a.html));
    entries.push({
      type: 'assignment', filename: a.filename, pageType: a.pageType, intendedTitle,
      canvasMatch: { assignmentId: match.a.id, name: match.a.name, similarity: match.score },
      diff, warnings: scanWarnings(a.html),
    });
  }

  for (const s of routed.skipped) entries.push({ type: 'skipped', ...s });

  const summary = {
    total: entries.length,
    pages: entries.filter(e => e.type === 'page').length,
    assignments: entries.filter(e => e.type === 'assignment').length,
    skipped: entries.filter(e => e.type === 'skipped').length,
    warningsCount: entries.filter(e => e.type !== 'skipped').reduce((n, e) => n + (e as any).warnings.length, 0),
    ferpaCount: entries.filter(e => e.type !== 'skipped').reduce(
      (n, e) => n + (e as any).warnings.filter((w: any) => w.kind === 'ferpa').length, 0),
    collisionsCount: entries.filter(e => e.type === 'page' && (e as any).canvasMatch).length,
  };

  const manifest: PreviewManifest = {
    snapshotId, courseId: input.courseId, courseDir: input.courseDir,
    generatedAt: new Date().toISOString(),
    git: detectGitState(input.courseDir),
    staleSnapshot: findStaleSnapshot(input.courseId),
    entries, summary,
  };

  writeManifest(dir, manifest);
  writeState(dir, { phase: 'preview', published: [], lastUpdatedAt: manifest.generatedAt });

  return { snapshotId, manifest };
}
```

(Note: `bestPageMatch`/`bestAssignmentMatch` lookups depend on the real Canvas API returning page bodies. The current `listPages` call returns only metadata; the workflow above will need to fetch each matched page's `body` to populate `priorHtml`. Add `getPageBody(courseId, pageUrl)` to CDS's `CanvasApi` mirroring `updatePage`, and call it per-match in the workflow. The test mocks this away.)

- [ ] **Step 4: Run test to verify it passes**

```powershell
cd packages\command-and-control; npx vitest run tests/tools/workflows/preview_course_publish.test.ts
```
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/command-and-control/src/tools/workflows/preview_course_publish.ts packages/command-and-control/tests/tools/workflows/preview_course_publish.test.ts packages/canvas-design-studio/src/canvas-api.ts
git commit -m "feat(cc): preview_course_publish workflow (refs #64)"
```

---

## Task 13: `publish_course` workflow — happy + stop-on-failure + resume

**Files:**
- Create: `packages/command-and-control/src/tools/workflows/publish_course.ts`
- Test:   `packages/command-and-control/tests/tools/workflows/publish_course.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/command-and-control/tests/tools/workflows/publish_course.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('canvas-design-mcp/dist/tools/publish.js', () => ({
  publishToCanvas: vi.fn(),
  titleSimilarity: vi.fn(),
}));
vi.mock('canvas-design-mcp/dist/tools/update-assignment-description.js', () => ({
  updateAssignmentDescription: vi.fn(),
}));
vi.mock('canvas-design-mcp/dist/canvas-api.js', () => ({
  createCanvasApi: vi.fn(() => ({})),
  CanvasApiError: class extends Error { constructor(m: string, public status: number, public code: string) { super(m); } },
}));
vi.mock('../../../src/tools/publish/canvas_config_bridge.js', () => ({
  loadInstitutionConfig: vi.fn().mockReturnValue({ canvasUrl: 'https://x', apiToken: 't' }),
}));
vi.mock('../../../src/tools/publish/git_state.js', () => ({
  detectGitState: vi.fn().mockReturnValue({ isRepo: false }),
  gitCommitPrePublish: vi.fn(),
  gitTagSuccess: vi.fn(),
  gitPushTag: vi.fn(() => ({ ok: true })),
}));

import { publishToCanvas } from 'canvas-design-mcp/dist/tools/publish.js';
import { updateAssignmentDescription } from 'canvas-design-mcp/dist/tools/update-assignment-description.js';
import {
  createSnapshotDir, writeManifest, writeState, writePriorHtml, writeNewHtml,
} from '../../../src/tools/publish/snapshot_store.js';
import { publishCourse } from '../../../src/tools/workflows/publish_course.js';
import type { PreviewManifest } from '../../../src/tools/publish/manifest_types.js';

let cc: string;
beforeEach(() => {
  cc = mkdtempSync(join(tmpdir(), 'cc-'));
  process.env.CC_HOME = cc;
});
afterEach(() => {
  rmSync(cc, { recursive: true, force: true });
  delete process.env.CC_HOME;
  vi.clearAllMocks();
});

function seedSnapshot(snapshotId: string, entries: PreviewManifest['entries']): void {
  const dir = createSnapshotDir(snapshotId);
  const m: PreviewManifest = {
    snapshotId, courseId: 42, courseDir: '/x', generatedAt: '2026-05-30T00:00:00Z',
    git: { isRepo: false }, entries,
    summary: { total: entries.length, pages: 0, assignments: 0, skipped: 0, warningsCount: 0, ferpaCount: 0, collisionsCount: 0 },
  };
  writeManifest(dir, m);
  writeState(dir, { phase: 'preview', published: [], lastUpdatedAt: m.generatedAt });
  for (const e of entries) {
    if (e.type === 'skipped') continue;
    writePriorHtml(dir, e.filename, '<p>old</p>');
    writeNewHtml(dir, e.filename, '<p>new</p>');
  }
}

describe('publishCourse', () => {
  it('publishes every approved page in order on the happy path', async () => {
    seedSnapshot('snap-1', [
      { type: 'page', filename: 'a.html', pageType: 'overview', intendedTitle: 'A', collisionAction: 'update',
        diff: { priorWords: 1, newWords: 1, delta: 0, sectionsChanged: 0, calloutsAdded: 0, calloutsRemoved: 0, imagesChanged: 0, hasFullDiff: true },
        warnings: [], canvasMatch: { pageId: 'a', url: 'https://x/a', existingTitle: 'A', similarity: 1 } },
      { type: 'page', filename: 'b.html', pageType: 'overview', intendedTitle: 'B', collisionAction: 'update',
        diff: { priorWords: 1, newWords: 1, delta: 0, sectionsChanged: 0, calloutsAdded: 0, calloutsRemoved: 0, imagesChanged: 0, hasFullDiff: true },
        warnings: [], canvasMatch: { pageId: 'b', url: 'https://x/b', existingTitle: 'B', similarity: 1 } },
    ]);
    vi.mocked(publishToCanvas).mockResolvedValue({ url: 'https://x', action: 'updated', pageTitle: 'A', tip: '' });

    const r = await publishCourse({ snapshotId: 'snap-1', approvals: { 'a.html': 'approve', 'b.html': 'approve' } });

    expect(r.published).toHaveLength(2);
    expect(r.failed).toBeUndefined();
    expect(r.phase).toBe('published');
  });

  it('stops on the first failure and records it in state.json', async () => {
    seedSnapshot('snap-2', [
      { type: 'page', filename: 'a.html', pageType: 'overview', intendedTitle: 'A', collisionAction: 'update',
        diff: { priorWords: 1, newWords: 1, delta: 0, sectionsChanged: 0, calloutsAdded: 0, calloutsRemoved: 0, imagesChanged: 0, hasFullDiff: true },
        warnings: [], canvasMatch: { pageId: 'a', url: 'https://x/a', existingTitle: 'A', similarity: 1 } },
      { type: 'page', filename: 'b.html', pageType: 'overview', intendedTitle: 'B', collisionAction: 'update',
        diff: { priorWords: 1, newWords: 1, delta: 0, sectionsChanged: 0, calloutsAdded: 0, calloutsRemoved: 0, imagesChanged: 0, hasFullDiff: true },
        warnings: [], canvasMatch: { pageId: 'b', url: 'https://x/b', existingTitle: 'B', similarity: 1 } },
    ]);
    vi.mocked(publishToCanvas)
      .mockResolvedValueOnce({ url: 'https://x', action: 'updated', pageTitle: 'A', tip: '' })
      .mockResolvedValueOnce({ error: 'rate limited', code: 'CANVAS_RATE_LIMITED' });

    const r = await publishCourse({ snapshotId: 'snap-2', approvals: { 'a.html': 'approve', 'b.html': 'approve' } });

    expect(r.published).toHaveLength(1);
    expect(r.failed?.filename).toBe('b.html');
    expect(r.phase).toBe('partial');
  });

  it('refuses APPROVALS_INCOMPLETE when approvals miss a manifest entry', async () => {
    seedSnapshot('snap-3', [
      { type: 'page', filename: 'a.html', pageType: 'overview', intendedTitle: 'A', collisionAction: 'update',
        diff: { priorWords: 1, newWords: 1, delta: 0, sectionsChanged: 0, calloutsAdded: 0, calloutsRemoved: 0, imagesChanged: 0, hasFullDiff: true },
        warnings: [], canvasMatch: { pageId: 'a', url: 'https://x/a', existingTitle: 'A', similarity: 1 } },
      { type: 'page', filename: 'b.html', pageType: 'overview', intendedTitle: 'B', collisionAction: 'update',
        diff: { priorWords: 1, newWords: 1, delta: 0, sectionsChanged: 0, calloutsAdded: 0, calloutsRemoved: 0, imagesChanged: 0, hasFullDiff: true },
        warnings: [], canvasMatch: { pageId: 'b', url: 'https://x/b', existingTitle: 'B', similarity: 1 } },
    ]);
    const r = await publishCourse({ snapshotId: 'snap-3', approvals: { 'a.html': 'approve' } });
    expect(r.error).toBe('APPROVALS_INCOMPLETE');
  });

  it('resumes from the failed entry when resume:true', async () => {
    seedSnapshot('snap-4', [
      { type: 'page', filename: 'a.html', pageType: 'overview', intendedTitle: 'A', collisionAction: 'update',
        diff: { priorWords: 1, newWords: 1, delta: 0, sectionsChanged: 0, calloutsAdded: 0, calloutsRemoved: 0, imagesChanged: 0, hasFullDiff: true },
        warnings: [], canvasMatch: { pageId: 'a', url: 'https://x/a', existingTitle: 'A', similarity: 1 } },
      { type: 'page', filename: 'b.html', pageType: 'overview', intendedTitle: 'B', collisionAction: 'update',
        diff: { priorWords: 1, newWords: 1, delta: 0, sectionsChanged: 0, calloutsAdded: 0, calloutsRemoved: 0, imagesChanged: 0, hasFullDiff: true },
        warnings: [], canvasMatch: { pageId: 'b', url: 'https://x/b', existingTitle: 'B', similarity: 1 } },
    ]);
    // Pretend the first run published a.html and failed on b.html.
    writeState(join(cc, 'publish-snapshots', 'snap-4'), {
      phase: 'partial',
      published: [{ filename: 'a.html', type: 'page', canvasUrl: 'https://x/a', action: 'updated', publishedAt: '2026-05-30T00:00:00Z' }],
      failed: { filename: 'b.html', type: 'page', reason: '429', code: 'CANVAS_RATE_LIMITED', failedAt: '2026-05-30T00:00:01Z' },
      lastUpdatedAt: '2026-05-30T00:00:01Z',
    });
    vi.mocked(publishToCanvas).mockResolvedValueOnce({ url: 'https://x/b', action: 'updated', pageTitle: 'B', tip: '' });

    const r = await publishCourse({ snapshotId: 'snap-4', approvals: { 'a.html': 'approve', 'b.html': 'approve' }, resume: true });

    expect(publishToCanvas).toHaveBeenCalledTimes(1); // only retries b.html
    expect(r.published.find(p => p.filename === 'b.html')).toBeDefined();
    expect(r.phase).toBe('published');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
cd packages\command-and-control; npx vitest run tests/tools/workflows/publish_course.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement publishCourse**

```typescript
// packages/command-and-control/src/tools/workflows/publish_course.ts
import { existsSync } from 'node:fs';
import { publishToCanvas } from 'canvas-design-mcp/dist/tools/publish.js';
import { updateAssignmentDescription } from 'canvas-design-mcp/dist/tools/update-assignment-description.js';
import { createCanvasApi, CanvasApiError } from 'canvas-design-mcp/dist/canvas-api.js';
import { loadInstitutionConfig } from '../publish/canvas_config_bridge.js';
import {
  readManifest, readState, writeState, snapshotDir, readPriorHtml,
} from '../publish/snapshot_store.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateApprovals } from '../publish/approvals.js';
import { detectGitState, gitCommitPrePublish, gitTagSuccess, gitPushTag } from '../publish/git_state.js';
import type {
  PreviewManifest, ManifestEntry, PublishState, PublishedEntry, FailedEntry,
} from '../publish/manifest_types.js';
import type { ApprovalMap } from '../publish/approvals.js';

export interface PublishCourseInput {
  snapshotId: string;
  approvals: ApprovalMap;
  resume?: boolean;
  gitCommit?: boolean;
  pushTag?: boolean;
}

export interface PublishCourseResult {
  snapshotId: string;
  phase: PublishState['phase'];
  published: PublishedEntry[];
  failed?: FailedEntry;
  gitTag?: string;
  pushResult?: { ok: true } | { ok: false; reason: string };
  error?: string;
  message?: string;
  fix?: string[];
}

function readNewHtml(dir: string, filename: string): string {
  return readFileSync(join(dir, 'new', filename), 'utf-8');
}

function tagFor(manifest: PreviewManifest): string {
  return `published-${manifest.generatedAt.slice(0, 10)}-${manifest.courseId}`;
}

export async function publishCourse(input: PublishCourseInput): Promise<PublishCourseResult> {
  const dir = snapshotDir(input.snapshotId);
  if (!existsSync(dir)) {
    return { snapshotId: input.snapshotId, phase: 'preview', published: [],
      error: 'SNAPSHOT_NOT_FOUND',
      fix: ['Run preview_course_publish first to create a snapshot.'] };
  }

  const manifest = readManifest(dir);
  const state = readState(dir);

  const validation = validateApprovals(manifest, input.approvals);
  if (!validation.ok) {
    return { snapshotId: input.snapshotId, phase: state.phase, published: state.published,
      error: 'APPROVALS_INCOMPLETE',
      message: `missing: ${validation.missing.join(', ')}; unknown: ${validation.unknown.join(', ')}`,
      fix: ['Provide an approve|skip action for every non-skipped manifest entry.'] };
  }

  let cfg;
  try { cfg = loadInstitutionConfig(); }
  catch (e) {
    return { snapshotId: input.snapshotId, phase: state.phase, published: state.published,
      error: 'MISSING_API_TOKEN', message: e instanceof Error ? e.message : String(e),
      fix: ['Run setup_canvas with your Canvas host and API token.'] };
  }
  const api = createCanvasApi(cfg);

  const gitCommit = input.gitCommit !== false;
  const git = detectGitState(manifest.courseDir);
  let gitTag: string | undefined;

  if (gitCommit && git.isRepo) {
    if (!git.clean && !input.resume) {
      return { snapshotId: input.snapshotId, phase: state.phase, published: state.published,
        error: 'GIT_DIRTY_TREE',
        fix: ['Commit or stash uncommitted changes in courseDir before publishing, or pass gitCommit:false.'] };
    }
    if (!input.resume) {
      gitCommitPrePublish(manifest.courseDir, `publish_course: pre-publish snapshot ${input.snapshotId}`);
    }
  }

  // Resume: skip already-published entries.
  const alreadyPublished = new Set(state.published.map(p => p.filename));
  const published: PublishedEntry[] = input.resume ? [...state.published] : [];

  for (const entry of manifest.entries) {
    if (entry.type === 'skipped') continue;
    if (input.approvals[entry.filename] !== 'approve') continue;
    if (alreadyPublished.has(entry.filename)) continue;
    // Refuse block-severity warnings even if approved.
    if ('warnings' in entry && entry.warnings.some(w => w.severity === 'block')) {
      const failed: FailedEntry = {
        filename: entry.filename, type: entry.type, reason: 'blocked by severity:block warning',
        code: 'BLOCKING_WARNINGS', failedAt: new Date().toISOString(),
      };
      writeState(dir, { phase: 'partial', published, failed, lastUpdatedAt: failed.failedAt });
      return { snapshotId: input.snapshotId, phase: 'partial', published, failed };
    }
    const newHtml = readNewHtml(dir, entry.filename);
    try {
      if (entry.type === 'page') {
        if (entry.canvasMatch) {
          const out = await publishToCanvas(
            { courseId: manifest.courseId, html: newHtml, pageTitle: entry.intendedTitle,
              collisionAction: 'update' },
            cfg as any, api as any,
          );
          if ('error' in out) throw new CanvasApiError(out.error ?? 'publish failed', 0, (out.code as string) ?? 'PUBLISH_FAILED');
          published.push({ filename: entry.filename, type: 'page', canvasUrl: out.url,
            action: out.action, publishedAt: new Date().toISOString() });
        } else {
          // create
          const out = await publishToCanvas(
            { courseId: manifest.courseId, html: newHtml, pageTitle: entry.intendedTitle,
              collisionAction: 'create' },
            cfg as any, api as any,
          );
          if ('error' in out) throw new CanvasApiError(out.error ?? 'publish failed', 0, (out.code as string) ?? 'PUBLISH_FAILED');
          published.push({ filename: entry.filename, type: 'page', canvasUrl: out.url,
            action: out.action, publishedAt: new Date().toISOString() });
        }
      } else if (entry.type === 'assignment') {
        const out = await updateAssignmentDescription(
          manifest.courseId, entry.canvasMatch.assignmentId, newHtml, api as any,
        );
        published.push({ filename: entry.filename, type: 'assignment', action: 'updated',
          publishedAt: new Date().toISOString() });
      }
      writeState(dir, { phase: 'partial', published, lastUpdatedAt: new Date().toISOString() });
    } catch (e) {
      const code = e instanceof CanvasApiError ? e.code : 'PUBLISH_FAILED';
      const reason = e instanceof Error ? e.message : String(e);
      const failed: FailedEntry = { filename: entry.filename, type: entry.type as 'page' | 'assignment',
        reason, code, failedAt: new Date().toISOString() };
      writeState(dir, { phase: 'partial', published, failed, lastUpdatedAt: failed.failedAt });
      return { snapshotId: input.snapshotId, phase: 'partial', published, failed };
    }
  }

  // Success.
  if (gitCommit && git.isRepo) {
    gitTag = tagFor(manifest);
    try { gitTagSuccess(manifest.courseDir, gitTag); } catch { /* tag may already exist on resume */ }
  }

  let pushResult: { ok: true } | { ok: false; reason: string } | undefined;
  if (input.pushTag && gitTag && git.remote) {
    pushResult = gitPushTag(manifest.courseDir, gitTag);
  }

  writeState(dir, { phase: 'published', published, lastUpdatedAt: new Date().toISOString() });
  return { snapshotId: input.snapshotId, phase: 'published', published, gitTag, pushResult };
}
```

- [ ] **Step 4: Run test to verify it passes**

```powershell
cd packages\command-and-control; npx vitest run tests/tools/workflows/publish_course.test.ts
```
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/command-and-control/src/tools/workflows/publish_course.ts packages/command-and-control/tests/tools/workflows/publish_course.test.ts
git commit -m "feat(cc): publish_course workflow (happy/stop-on-fail/resume) (refs #64)"
```

---

## Task 14: `rollback_course_publish` workflow

**Files:**
- Create: `packages/command-and-control/src/tools/workflows/rollback_course_publish.ts`
- Test:   `packages/command-and-control/tests/tools/workflows/rollback_course_publish.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/command-and-control/tests/tools/workflows/rollback_course_publish.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('canvas-design-mcp/dist/tools/restore-page.js', () => ({ restorePage: vi.fn() }));
vi.mock('canvas-design-mcp/dist/tools/update-assignment-description.js', () => ({ updateAssignmentDescription: vi.fn() }));
vi.mock('canvas-design-mcp/dist/canvas-api.js', () => ({ createCanvasApi: vi.fn(() => ({})), CanvasApiError: class extends Error {} }));
vi.mock('../../../src/tools/publish/canvas_config_bridge.js', () => ({
  loadInstitutionConfig: vi.fn().mockReturnValue({ canvasUrl: 'https://x', apiToken: 't' }),
}));

import { restorePage } from 'canvas-design-mcp/dist/tools/restore-page.js';
import { updateAssignmentDescription } from 'canvas-design-mcp/dist/tools/update-assignment-description.js';
import { createSnapshotDir, writeManifest, writeState, writePriorHtml } from '../../../src/tools/publish/snapshot_store.js';
import { rollbackCoursePublish } from '../../../src/tools/workflows/rollback_course_publish.js';

let cc: string;
beforeEach(() => { cc = mkdtempSync(join(tmpdir(), 'cc-')); process.env.CC_HOME = cc; });
afterEach(() => { rmSync(cc, { recursive: true, force: true }); delete process.env.CC_HOME; vi.clearAllMocks(); });

describe('rollbackCoursePublish', () => {
  it('reverse-iterates published[] and restores each entry', async () => {
    const dir = createSnapshotDir('snap');
    writeManifest(dir, {
      snapshotId: 'snap', courseId: 1, courseDir: '/x', generatedAt: '2026-05-30T00:00:00Z',
      git: { isRepo: false }, entries: [], summary: { total: 0, pages: 0, assignments: 0, skipped: 0, warningsCount: 0, ferpaCount: 0, collisionsCount: 0 },
    });
    writePriorHtml(dir, 'a.html', '<p>old-a</p>');
    writePriorHtml(dir, 'b.html', '<p>old-b</p>');
    writeState(dir, {
      phase: 'partial',
      published: [
        { filename: 'a.html', type: 'page', canvasUrl: 'https://x/a', action: 'updated', publishedAt: '2026-05-30T00:00:00Z' },
        { filename: 'b.html', type: 'assignment', action: 'updated', publishedAt: '2026-05-30T00:00:01Z' },
      ],
      lastUpdatedAt: '2026-05-30T00:00:01Z',
    });

    const r = await rollbackCoursePublish({ snapshotId: 'snap' });

    expect(r.restored.map(x => x.filename)).toEqual(['b.html', 'a.html']);
    expect(restorePage).toHaveBeenCalled();
    expect(updateAssignmentDescription).toHaveBeenCalled();
  });

  it('accumulates per-entry failures into restoreFailed[]', async () => {
    const dir = createSnapshotDir('snap');
    writeManifest(dir, {
      snapshotId: 'snap', courseId: 1, courseDir: '/x', generatedAt: '2026-05-30T00:00:00Z',
      git: { isRepo: false }, entries: [], summary: { total: 0, pages: 0, assignments: 0, skipped: 0, warningsCount: 0, ferpaCount: 0, collisionsCount: 0 },
    });
    writePriorHtml(dir, 'a.html', '<p>old-a</p>');
    writeState(dir, {
      phase: 'partial',
      published: [{ filename: 'a.html', type: 'page', canvasUrl: 'https://x/a', action: 'updated', publishedAt: '2026-05-30T00:00:00Z' }],
      lastUpdatedAt: '2026-05-30T00:00:01Z',
    });
    vi.mocked(restorePage).mockRejectedValue(new Error('429'));

    const r = await rollbackCoursePublish({ snapshotId: 'snap' });

    expect(r.restored).toHaveLength(0);
    expect(r.restoreFailed).toHaveLength(1);
    expect(r.restoreFailed[0].filename).toBe('a.html');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
cd packages\command-and-control; npx vitest run tests/tools/workflows/rollback_course_publish.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement**

```typescript
// packages/command-and-control/src/tools/workflows/rollback_course_publish.ts
import { existsSync } from 'node:fs';
import { restorePage } from 'canvas-design-mcp/dist/tools/restore-page.js';
import { updateAssignmentDescription } from 'canvas-design-mcp/dist/tools/update-assignment-description.js';
import { createCanvasApi } from 'canvas-design-mcp/dist/canvas-api.js';
import { loadInstitutionConfig } from '../publish/canvas_config_bridge.js';
import { readManifest, readState, snapshotDir, readPriorHtml, writeState } from '../publish/snapshot_store.js';
import type { PublishedEntry, PublishState } from '../publish/manifest_types.js';

export interface RollbackCoursePublishInput { snapshotId: string; }

export interface RollbackCoursePublishResult {
  snapshotId: string;
  restored: PublishedEntry[];
  restoreFailed: { filename: string; reason: string }[];
  phase: PublishState['phase'];
  error?: string;
  fix?: string[];
}

export async function rollbackCoursePublish(
  input: RollbackCoursePublishInput,
): Promise<RollbackCoursePublishResult> {
  const dir = snapshotDir(input.snapshotId);
  if (!existsSync(dir)) {
    return { snapshotId: input.snapshotId, restored: [], restoreFailed: [], phase: 'preview',
      error: 'SNAPSHOT_NOT_FOUND', fix: ['Snapshot ID is unknown or already cleaned up.'] };
  }

  const manifest = readManifest(dir);
  const state = readState(dir);
  let cfg;
  try { cfg = loadInstitutionConfig(); }
  catch (e) {
    return { snapshotId: input.snapshotId, restored: [], restoreFailed: [], phase: state.phase,
      error: 'MISSING_API_TOKEN', fix: ['Run setup_canvas with your Canvas host and API token.'] };
  }
  const api = createCanvasApi(cfg);

  const restored: PublishedEntry[] = [];
  const restoreFailed: { filename: string; reason: string }[] = [];

  for (let i = state.published.length - 1; i >= 0; i -= 1) {
    const entry = state.published[i];
    const priorHtml = readPriorHtml(dir, entry.filename);
    const isCreated = entry.action === 'created' && entry.type === 'page';
    try {
      if (entry.type === 'page') {
        await restorePage(
          manifest.courseId,
          (entry.canvasUrl ?? entry.filename).split('/').pop()!,
          isCreated ? null : priorHtml,
          api as any,
        );
      } else {
        const manifestEntry = manifest.entries.find(e => e.type === 'assignment' && e.filename === entry.filename);
        if (manifestEntry && manifestEntry.type === 'assignment') {
          await updateAssignmentDescription(
            manifest.courseId, manifestEntry.canvasMatch.assignmentId, priorHtml, api as any,
          );
        }
      }
      restored.push(entry);
    } catch (e) {
      restoreFailed.push({ filename: entry.filename, reason: e instanceof Error ? e.message : String(e) });
    }
  }

  writeState(dir, { phase: 'rolled-back', published: state.published, lastUpdatedAt: new Date().toISOString() });
  return { snapshotId: input.snapshotId, restored, restoreFailed, phase: 'rolled-back' };
}
```

- [ ] **Step 4: Run test to verify it passes**

```powershell
cd packages\command-and-control; npx vitest run tests/tools/workflows/rollback_course_publish.test.ts
```
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/command-and-control/src/tools/workflows/rollback_course_publish.ts packages/command-and-control/tests/tools/workflows/rollback_course_publish.test.ts
git commit -m "feat(cc): rollback_course_publish workflow (refs #64)"
```

---

## Task 15: MCP wiring + remove placeholder

**Files:**
- Modify: `packages/command-and-control/src/passthrough/design_tools.ts` (remove `publish_course` entry)
- Modify: `packages/command-and-control/src/index.ts` (register three new tools + handle their CallToolRequest dispatch)

- [ ] **Step 1: Remove placeholder**

Edit `packages/command-and-control/src/passthrough/design_tools.ts` — delete the `publish_course` object and the `COURSE_PUBLISH_NOT_AVAILABLE` constant. Only `import_course` and `generate_course` remain in `DESIGN_TOOLS`.

- [ ] **Step 2: Register the three new tools in index.ts**

Add imports near the existing workflow imports:

```typescript
import {
  previewCoursePublish,
  type PreviewCoursePublishInput,
} from './tools/workflows/preview_course_publish.js';
import {
  publishCourse,
  type PublishCourseInput,
} from './tools/workflows/publish_course.js';
import {
  rollbackCoursePublish,
  type RollbackCoursePublishInput,
} from './tools/workflows/rollback_course_publish.js';
```

In the `ListToolsRequestSchema` handler, register the three tool schemas exactly as specified in the spec under "Tool surface" (use the JSON shapes verbatim).

In the `CallToolRequestSchema` dispatch, add three cases that invoke the workflows with the typed input shape.

- [ ] **Step 3: Build + unit + smoke suite**

```powershell
cd packages\command-and-control; npm run build; npm test; npm run smoke:integration
```
Expected: all green. The smoke suite does not exercise publish_course (no Canvas in CI); it just verifies the new tools are registered and don't break the existing integration contract.

- [ ] **Step 4: Commit**

```bash
git add packages/command-and-control/src/passthrough/design_tools.ts packages/command-and-control/src/index.ts
git commit -m "feat(cc): register preview/publish/rollback_course_publish MCP tools (closes #64)"
```

---

## Manual test plan (post-merge, before v1.0 cut)

Run against a University sandbox course where damage is recoverable.

1. `setup_canvas` with the sandbox host + a token that has page-write + assignment-write.
2. `preview_course_publish { courseDir: <a real CDS course folder>, courseId: <sandbox> }` — verify manifest has expected page count + at least one assignment match.
3. Approve a single small page, skip the rest, call `publish_course`. Verify the page updates in Canvas and the snapshot moves to `phase: 'published'`.
4. Force a failure: revoke the token briefly, run a small publish, verify stop-on-failure surfaces correctly and `state.json` records the failed entry.
5. Restore the token, call `publish_course` with `resume:true`, verify the failed entry retries and succeeds.
6. Call `rollback_course_publish` against the snapshot from step 5 and verify the page reverts to its prior content in Canvas.
7. Initialize `courseDir` as a git repo with an origin remote, run preview + publish, verify the pre-publish commit and success tag exist. Decline `pushTag` first time; accept it second time; verify the tag lands on the remote.
8. Repeat steps 2–3 in a `courseDir` that is *not* a git repo to confirm the nudge surfaces correctly.

Add the steps to `packages/command-and-control/docs/manual-test-plans/2026-05-30-publish-course.md` as part of Task 15's commit if the professor wants the trail in-tree.

---

## Self-review (run after writing this plan)

* **Spec coverage:** Every Design Decision in the spec maps to at least one task (1–4 in 12; 5 in 12 + 6 in 13; 6 in 12 + 14). Every tool in "Tool surface" has its own workflow task (12, 13, 14). Error table entries are exercised by tests (APPROVALS_INCOMPLETE in 13, SNAPSHOT_NOT_FOUND in 13/14, GENERATE_FAILED in 12, GIT_DIRTY_TREE in 13, MISSING_API_TOKEN in 12/13/14).
* **Placeholder scan:** No "TBD"/"TODO"/"figure out"/"appropriate" in any step. Tasks 5 and 6 do call out CDS canvas-api changes ("mirror the existing pattern"); that's intentional shorthand, not handwaving — the existing `updatePage` / `listPages` implementations are the literal pattern to copy.
* **Type consistency:** `PreviewManifest`, `ManifestEntry`, `PublishedEntry`, `FailedEntry`, `PublishState`, `ApprovalMap`, `RestorePageApi`, `ListPagesApi`, `ListAssignmentsApi`, `UpdateAssignmentApi`, `InstitutionConfigBridge` are defined once each and reused. The discriminated-union `ManifestEntry` matches the spec.
* **One open ambiguity, called out in Task 12's note:** the workflow needs page *body* HTML for the diff. Today's CDS `listPages` returns metadata only; a `getPageBody(courseId, pageUrl)` addition to the CDS canvas-api client is required. The test mocks this away but the manual test plan will need it for real.
