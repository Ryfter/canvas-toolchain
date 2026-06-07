# Local C&C Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a local read-only "course health" dashboard. Two launch surfaces (MCP tool + CLI) share one core Node HTTP server. Discovery via a configured `coursesRoot` field in `~/.command-and-control/config.json`.

**Architecture:** `node:http` server + server-rendered HTML (no Express, no React, no client-side JS). New MCP tools `set_courses_root` and `open_dashboard` plus a CLI binary `canvas-toolchain-dashboard`. Reads existing data on disk — course-config.md per course folder, per-course publish snapshots via existing `snapshotsRootFor(courseDir)`, week-folder transcript counts.

**Tech Stack:** TypeScript ESM, vitest 2.x, `yaml` (already a CDS dep, NOT C&C). No new runtime dependencies.

**Spec:** `packages/command-and-control/docs/superpowers/specs/2026-06-07-local-dashboard-design.md`

**Issue:** [#68](https://github.com/Ryfter/canvas-toolchain/issues/68)

**Pre-plan recon findings (encoded into the tasks below):**
- `loadConfig` + `saveConfig` live at `packages/command-and-control/src/kb/config.js`. `CcConfig` type lives in `packages/command-and-control/src/types.ts`.
- Publish-snapshot paths are courseDir-aware via `snapshotsRootFor(courseDir)` from `packages/command-and-control/src/tools/publish/snapshot_store.js` — the spec's "by short_name" mapping was wrong; tasks below use the courseDir-aware function instead.
- C&C does NOT have `yaml` as a dep. For parsing course-config.md front matter the dashboard imports CDS's existing helpers (`canvas-design-mcp/dist/course/aias_config.js` exports an internal `readFm`-style pattern — see Task 2 for the cleaner choice).

---

## Phase 0 — Baseline

### Task 0.1: Confirm clean tree + tests pass

- [ ] **Step 1:** `git status` → clean.
- [ ] **Step 2:** `npm test --workspaces` → all green. Note baselines.
- [ ] **Step 3:** `npm run smoke:integration --workspace command-and-control-mcp` → passes.

---

## Phase 1 — Config + `set_courses_root`

### Task 1.1: Add `coursesRoot` field to `CcConfig` and implement `set_courses_root` MCP tool

**Files:**
- Modify: `packages/command-and-control/src/types.ts` (CcConfig)
- Create: `packages/command-and-control/src/tools/set_courses_root.ts`
- Create: `packages/command-and-control/tests/tools/set_courses_root.test.ts`

- [ ] **Step 1: Read the existing CcConfig type**

Read `packages/command-and-control/src/types.ts` and locate the `CcConfig` interface. Note its shape (it likely already has fields like `mode`, `providers`, `routing`, `downloader`, `registry`, `lastRun` — see `setup_cc.ts` lines 28-55 for what's currently consumed).

- [ ] **Step 2: Write the failing tests**

Create `packages/command-and-control/tests/tools/set_courses_root.test.ts`:

```ts
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setCoursesRoot } from '../../src/tools/set_courses_root.js';

let ccHomeDir: string;
let coursesDir: string;
const ORIGINAL_CC_HOME = process.env.CC_HOME;

beforeEach(() => {
  ccHomeDir = mkdtempSync(join(tmpdir(), 'cc-home-'));
  coursesDir = mkdtempSync(join(tmpdir(), 'courses-'));
  process.env.CC_HOME = ccHomeDir;
});

afterEach(() => {
  rmSync(ccHomeDir, { recursive: true, force: true });
  rmSync(coursesDir, { recursive: true, force: true });
  if (ORIGINAL_CC_HOME === undefined) delete process.env.CC_HOME;
  else process.env.CC_HOME = ORIGINAL_CC_HOME;
});

describe('setCoursesRoot', () => {
  it('happy path: writes coursesRoot into config.json', async () => {
    const result = await setCoursesRoot({ coursesRoot: coursesDir });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.coursesRoot).toBe(coursesDir);

    const config = JSON.parse(readFileSync(join(ccHomeDir, 'config.json'), 'utf-8'));
    expect(config.coursesRoot).toBe(coursesDir);
  });

  it('returns PATH_NOT_FOUND when path does not exist', async () => {
    const result = await setCoursesRoot({ coursesRoot: join(coursesDir, 'nonexistent') });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('PATH_NOT_FOUND');
  });

  it('returns NOT_A_DIRECTORY when path points to a file', async () => {
    const filePath = join(coursesDir, 'file.txt');
    writeFileSync(filePath, 'hi');

    const result = await setCoursesRoot({ coursesRoot: filePath });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('NOT_A_DIRECTORY');
  });
});
```

- [ ] **Step 3: Run + fail**

Run: `npm test --workspace command-and-control-mcp -- set_courses_root.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Add `coursesRoot` field to `CcConfig`**

In `packages/command-and-control/src/types.ts`, find the `CcConfig` interface and add a new optional field:

```ts
  /** Root directory for course discovery used by the local dashboard (#68). Optional. */
  coursesRoot?: string;
```

Place it alongside the other top-level optional fields (e.g., near `downloader` or `registry`).

- [ ] **Step 5: Implement `set_courses_root.ts`**

Create `packages/command-and-control/src/tools/set_courses_root.ts`:

```ts
import { existsSync, statSync } from 'node:fs';
import { loadConfig, saveConfig } from '../kb/config.js';

export interface SetCoursesRootInput {
  coursesRoot: string;
}

export type SetCoursesRootResult =
  | { ok: true; coursesRoot: string; configPath: string }
  | { ok: false; error: 'PATH_NOT_FOUND' | 'NOT_A_DIRECTORY'; message: string; fix: string[] };

export async function setCoursesRoot(input: SetCoursesRootInput): Promise<SetCoursesRootResult> {
  if (!existsSync(input.coursesRoot)) {
    return {
      ok: false,
      error: 'PATH_NOT_FOUND',
      message: `Path does not exist: ${input.coursesRoot}`,
      fix: ['Check that the path exists and re-run with the correct absolute path'],
    };
  }
  const st = statSync(input.coursesRoot);
  if (!st.isDirectory()) {
    return {
      ok: false,
      error: 'NOT_A_DIRECTORY',
      message: `Path is not a directory: ${input.coursesRoot}`,
      fix: ['Provide a folder path, not a file path'],
    };
  }

  const config = loadConfig();
  config.coursesRoot = input.coursesRoot;
  saveConfig(config);

  // saveConfig writes to ~/.command-and-control/config.json (or CC_HOME); reconstruct for the result.
  const { getCcHomePath } = await import('../kb/config.js');
  const { join } = await import('node:path');
  const configPath = join(getCcHomePath(), 'config.json');

  return {
    ok: true,
    coursesRoot: input.coursesRoot,
    configPath,
  };
}
```

**Note:** the `await import('node:path')` inline import is unusual but needed because the rest of this file is purely string-validation; if `getCcHomePath` is already exported from `../kb/config.js` you may import both at the top instead. Read `kb/config.ts` first to see what it exports.

- [ ] **Step 6: Run tests**

Run: `npm test --workspace command-and-control-mcp -- set_courses_root.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 7: Commit**

```bash
git add packages/command-and-control/src/types.ts packages/command-and-control/src/tools/set_courses_root.ts packages/command-and-control/tests/tools/set_courses_root.test.ts
git commit -m "feat(cc): set_courses_root MCP tool + CcConfig.coursesRoot field (#68)"
```

---

## Phase 2 — Dashboard Data Layer

### Task 2.1: `dashboard/data.ts` — course discovery + health computation

**Files:**
- Create: `packages/command-and-control/src/dashboard/data.ts`
- Create: `packages/command-and-control/tests/dashboard/data.test.ts`

**Implementer notes:**
- Use the existing `snapshotsRootFor(courseDir)` from `../tools/publish/snapshot_store.js` to get per-course snapshot directory. `lastPublishedAt` = latest subdirectory mtime under that root, or `null` if the dir doesn't exist or is empty.
- Course-config.md parsing: C&C doesn't have `yaml` as a dep. The spec calls for parsing front matter — instead of pulling YAML, use the existing minimal parser pattern from `canvas-design-mcp/dist/tools/course-templates.js`'s `parseFrontMatterSimple` (regex-based, flat-key). That handles `title:`, `short_name:`, `semester:` which is all the dashboard needs. If that helper isn't exported, use a small inline regex parser — these are flat fields, no nesting.
- Transcript coverage: walk top-level subfolders matching `week-\d+`. For each, check for at least one `*.enriched.md` file. `totalWeeks` = count of week folders found. `withTranscript` = count of those that have at least one `.enriched.md`.

- [ ] **Step 1: Write the failing tests**

Create `packages/command-and-control/tests/dashboard/data.test.ts`:

```ts
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { walkForCourses, buildCourseHealth, classifyHealth } from '../../src/dashboard/data.js';

let coursesRoot: string;

beforeEach(() => { coursesRoot = mkdtempSync(join(tmpdir(), 'dash-courses-')); });
afterEach(() => { rmSync(coursesRoot, { recursive: true, force: true }); });

function makeCourse(name: string, opts: { title: string; shortName: string; semester: string; pageFiles?: string[]; weekFolders?: { name: string; hasTranscript: boolean }[] }): string {
  const dir = join(coursesRoot, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'course-config.md'),
    `---\ntitle: ${opts.title}\nshort_name: ${opts.shortName}\nsemester: ${opts.semester}\n---\n`);
  for (const f of opts.pageFiles ?? []) {
    writeFileSync(join(dir, f), '---\ntitle: P\n---\n\nbody\n');
  }
  for (const wf of opts.weekFolders ?? []) {
    mkdirSync(join(dir, wf.name), { recursive: true });
    if (wf.hasTranscript) writeFileSync(join(dir, wf.name, 'lecture.enriched.md'), 'transcript');
  }
  return dir;
}

describe('walkForCourses', () => {
  it('finds courses with course-config.md at the top level', () => {
    makeCourse('ITM370', { title: 'ITM 370', shortName: 'ITM370', semester: 'F26' });
    makeCourse('BusApp105', { title: 'BusApp 105', shortName: 'BUS105', semester: 'F26' });
    const courses = walkForCourses(coursesRoot);
    expect(courses).toHaveLength(2);
  });

  it('finds courses nested up to depth 5', () => {
    mkdirSync(join(coursesRoot, 'F26', 'sub'), { recursive: true });
    makeCourse('F26/sub/ITM370', { title: 'ITM 370', shortName: 'ITM370', semester: 'F26' });
    const courses = walkForCourses(coursesRoot);
    expect(courses).toHaveLength(1);
  });

  it('skips node_modules / .git / dist / output / publish-snapshots', () => {
    makeCourse('ITM370', { title: 'ITM 370', shortName: 'ITM370', semester: 'F26' });
    makeCourse('node_modules/lib', { title: 'Library', shortName: 'LIB', semester: 'F26' });
    const courses = walkForCourses(coursesRoot);
    expect(courses).toHaveLength(1);
  });

  it('returns empty array when no course-config.md present anywhere', () => {
    mkdirSync(join(coursesRoot, 'foo'), { recursive: true });
    expect(walkForCourses(coursesRoot)).toEqual([]);
  });
});

describe('buildCourseHealth', () => {
  it('builds CourseHealth from a course folder', () => {
    const dir = makeCourse('ITM370', {
      title: 'ITM 370',
      shortName: 'ITM370',
      semester: 'F26',
      pageFiles: ['front-page.md', 'overview.md', 'rubric.md'],
      weekFolders: [
        { name: 'week-01', hasTranscript: true },
        { name: 'week-02', hasTranscript: false },
      ],
    });
    const h = buildCourseHealth(dir);
    expect(h.name).toBe('ITM 370');
    expect(h.shortName).toBe('ITM370');
    expect(h.semester).toBe('F26');
    expect(h.pageCount).toBe(3);  // excludes course-config.md
    expect(h.transcriptCoverage).toEqual({ withTranscript: 1, totalWeeks: 2 });
    expect(h.lastPublishedAt).toBeNull();  // no snapshots
    expect(['green', 'yellow', 'red']).toContain(h.health);
  });
});

describe('classifyHealth', () => {
  it('green for recent publish + high coverage', () => {
    const now = new Date();
    const tenDaysAgo = new Date(now.getTime() - 10 * 86400_000).toISOString();
    expect(classifyHealth({
      lastPublishedAt: tenDaysAgo,
      transcriptCoverage: { withTranscript: 9, totalWeeks: 10 },
      now,
    })).toBe('green');
  });

  it('yellow for moderate freshness OR coverage', () => {
    const now = new Date();
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 86400_000).toISOString();
    expect(classifyHealth({
      lastPublishedAt: sixtyDaysAgo,
      transcriptCoverage: { withTranscript: 5, totalWeeks: 10 },
      now,
    })).toBe('yellow');
  });

  it('red for never-published + low coverage', () => {
    const now = new Date();
    expect(classifyHealth({
      lastPublishedAt: null,
      transcriptCoverage: { withTranscript: 1, totalWeeks: 10 },
      now,
    })).toBe('red');
  });
});
```

- [ ] **Step 2: Run + fail**

Run: `npm test --workspace command-and-control-mcp -- dashboard/data.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `dashboard/data.ts`**

Create `packages/command-and-control/src/dashboard/data.ts`:

```ts
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { snapshotsRootFor } from '../tools/publish/snapshot_store.js';

export type HealthClass = 'green' | 'yellow' | 'red';

export interface CourseHealth {
  name: string;
  shortName: string;
  semester: string;
  courseDir: string;
  pageCount: number;
  lastPublishedAt: string | null;
  transcriptCoverage: { withTranscript: number; totalWeeks: number };
  health: HealthClass;
}

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'output', 'publish-snapshots']);
const MAX_DEPTH = 5;

export function walkForCourses(root: string, depth = 0): string[] {
  if (!existsSync(root)) return [];
  if (depth > MAX_DEPTH) return [];

  const results: string[] = [];
  let entries: string[];
  try { entries = readdirSync(root); } catch { return results; }

  // If this dir itself contains course-config.md, treat it as a course AND stop descending.
  if (entries.includes('course-config.md')) {
    results.push(root);
    return results;
  }

  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(root, entry);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (!st.isDirectory()) continue;
    results.push(...walkForCourses(full, depth + 1));
  }
  return results;
}

function readFmFlatFields(filePath: string): Record<string, string> {
  const raw = readFileSync(filePath, 'utf-8');
  const m = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  const out: Record<string, string> = {};
  for (const line of m[1].split('\n')) {
    const fm = line.match(/^([a-z_]+):\s*"?([^"]*)"?\s*$/);
    if (fm) out[fm[1]] = fm[2].trim();
  }
  return out;
}

function countPages(courseDir: string): number {
  let count = 0;
  for (const entry of readdirSync(courseDir)) {
    if (extname(entry) !== '.md') continue;
    if (entry === 'course-config.md') continue;
    count++;
  }
  return count;
}

function computeTranscriptCoverage(courseDir: string): { withTranscript: number; totalWeeks: number } {
  let totalWeeks = 0;
  let withTranscript = 0;
  for (const entry of readdirSync(courseDir)) {
    if (!/^week-\d+$/.test(entry)) continue;
    const weekDir = join(courseDir, entry);
    let st;
    try { st = statSync(weekDir); } catch { continue; }
    if (!st.isDirectory()) continue;
    totalWeeks++;
    let weekEntries: string[];
    try { weekEntries = readdirSync(weekDir); } catch { continue; }
    if (weekEntries.some((e) => e.endsWith('.enriched.md'))) withTranscript++;
  }
  return { withTranscript, totalWeeks };
}

function findLastPublishedAt(courseDir: string): string | null {
  const root = snapshotsRootFor(courseDir);
  if (!existsSync(root)) return null;
  let latest = 0;
  for (const entry of readdirSync(root)) {
    const full = join(root, entry);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (!st.isDirectory()) continue;
    if (st.mtimeMs > latest) latest = st.mtimeMs;
  }
  return latest === 0 ? null : new Date(latest).toISOString();
}

export interface ClassifyHealthInput {
  lastPublishedAt: string | null;
  transcriptCoverage: { withTranscript: number; totalWeeks: number };
  now: Date;
}

export function classifyHealth(input: ClassifyHealthInput): HealthClass {
  const coverageRatio = input.transcriptCoverage.totalWeeks === 0
    ? 0
    : input.transcriptCoverage.withTranscript / input.transcriptCoverage.totalWeeks;

  let daysSincePublish = Infinity;
  if (input.lastPublishedAt) {
    daysSincePublish = (input.now.getTime() - new Date(input.lastPublishedAt).getTime()) / 86400_000;
  }

  if (daysSincePublish <= 30 && coverageRatio >= 0.8) return 'green';
  if (daysSincePublish <= 90 || coverageRatio >= 0.5) return 'yellow';
  return 'red';
}

export function buildCourseHealth(courseDir: string, now: Date = new Date()): CourseHealth {
  const fm = readFmFlatFields(join(courseDir, 'course-config.md'));
  const transcriptCoverage = computeTranscriptCoverage(courseDir);
  const lastPublishedAt = findLastPublishedAt(courseDir);
  return {
    name: fm.title ?? basename(courseDir),
    shortName: fm.short_name ?? basename(courseDir),
    semester: fm.semester ?? '',
    courseDir,
    pageCount: countPages(courseDir),
    lastPublishedAt,
    transcriptCoverage,
    health: classifyHealth({ lastPublishedAt, transcriptCoverage, now }),
  };
}
```

**Note on `now: Date = new Date()`:** vitest defaults to using real Date inside the test. The `classifyHealth` tests explicitly pass `now: new Date()` so they're deterministic at test time relative to whatever offset they construct. For `buildCourseHealth`, the test only asserts the health classification is one of the three values, so the default is fine.

- [ ] **Step 4: Run tests**

Run: `npm test --workspace command-and-control-mcp -- dashboard/data.test.ts`
Expected: PASS — 8 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/command-and-control/src/dashboard/data.ts packages/command-and-control/tests/dashboard/data.test.ts
git commit -m "feat(cc): dashboard data layer — walkForCourses + buildCourseHealth + classifyHealth (#68)"
```

---

## Phase 3 — Views

### Task 3.1: `dashboard/views/course_health.ts` — HTML rendering

**Files:**
- Create: `packages/command-and-control/src/dashboard/views/course_health.ts`
- Create: `packages/command-and-control/tests/dashboard/views/course_health.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/command-and-control/tests/dashboard/views/course_health.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { renderCourseHealthPage } from '../../../src/dashboard/views/course_health.js';
import type { CourseHealth } from '../../../src/dashboard/data.js';

const SAMPLE: CourseHealth[] = [
  {
    name: 'ITM 370',
    shortName: 'ITM370',
    semester: 'F26',
    courseDir: '/courses/ITM370',
    pageCount: 12,
    lastPublishedAt: new Date(Date.now() - 5 * 86400_000).toISOString(),
    transcriptCoverage: { withTranscript: 8, totalWeeks: 10 },
    health: 'green',
  },
  {
    name: 'BusApp 105',
    shortName: 'BUS105',
    semester: 'F26',
    courseDir: '/courses/BusApp105',
    pageCount: 6,
    lastPublishedAt: null,
    transcriptCoverage: { withTranscript: 0, totalWeeks: 6 },
    health: 'red',
  },
];

describe('renderCourseHealthPage', () => {
  it('renders a row per course', () => {
    const html = renderCourseHealthPage({ coursesRoot: '/courses', courses: SAMPLE });
    expect(html).toContain('ITM 370');
    expect(html).toContain('BusApp 105');
    expect(html).toContain('F26');
    expect(html).toMatch(/12.*8\s*\/\s*10/s);  // page count and transcript coverage for ITM370
  });

  it('shows "never" for null lastPublishedAt', () => {
    const html = renderCourseHealthPage({ coursesRoot: '/courses', courses: SAMPLE });
    expect(html).toContain('never');
  });

  it('renders empty state when zero courses', () => {
    const html = renderCourseHealthPage({ coursesRoot: '/courses', courses: [] });
    expect(html).toContain('No courses found');
    expect(html).toContain('/courses');
  });

  it('HTML-escapes name and semester', () => {
    const escaped = renderCourseHealthPage({
      coursesRoot: '/courses',
      courses: [{
        ...SAMPLE[0],
        name: 'Name <evil> & "danger"',
        semester: '<F>26',
      }],
    });
    expect(escaped).toContain('Name &lt;evil&gt; &amp; &quot;danger&quot;');
    expect(escaped).toContain('&lt;F&gt;26');
  });

  it('applies green/yellow/red health classes', () => {
    const html = renderCourseHealthPage({ coursesRoot: '/courses', courses: SAMPLE });
    expect(html).toContain('health-green');
    expect(html).toContain('health-red');
  });
});
```

- [ ] **Step 2: Run + fail**

Run: `npm test --workspace command-and-control-mcp -- dashboard/views/course_health.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `course_health.ts`**

Create `packages/command-and-control/src/dashboard/views/course_health.ts`:

```ts
import type { CourseHealth } from '../data.js';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatPublishedAt(iso: string | null): string {
  if (iso === null) return '<em>never</em>';
  const d = new Date(iso);
  return d.toISOString().slice(0, 10);
}

export interface RenderCourseHealthInput {
  coursesRoot: string;
  courses: CourseHealth[];
}

export function renderCourseHealthPage(input: RenderCourseHealthInput): string {
  const rootEsc = escapeHtml(input.coursesRoot);

  const rowsHtml = input.courses.length === 0
    ? `<tr><td colspan="6" style="padding:2em; text-align:center; color:#777;">No courses found under <code>${rootEsc}</code>. Add a course folder with a course-config.md file, then refresh.</td></tr>`
    : input.courses.map((c) => {
        const cov = `${c.transcriptCoverage.withTranscript} / ${c.transcriptCoverage.totalWeeks}`;
        return `<tr>
          <td><span class="health health-${c.health}"></span></td>
          <td>${escapeHtml(c.name)}</td>
          <td>${escapeHtml(c.semester)}</td>
          <td>${c.pageCount}</td>
          <td>${formatPublishedAt(c.lastPublishedAt)}</td>
          <td>${escapeHtml(cov)}</td>
        </tr>`;
      }).join('\n');

  const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Canvas Toolchain — Course Health</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 1100px; margin: 2em auto; padding: 0 1em; color: #222; }
    h1 { color: #0033A0; margin-top: 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 1em; }
    th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #ddd; }
    th { background: #F4F3EF; }
    .health { display: inline-block; width: 14px; height: 14px; border-radius: 50%; vertical-align: middle; }
    .health-green { background: #3B6D11; }
    .health-yellow { background: #B58606; }
    .health-red { background: #A32D2D; }
    .footer { margin-top: 2em; color: #777; font-size: 0.9em; }
    code { background: #F4F3EF; padding: 1px 5px; border-radius: 3px; }
  </style>
</head>
<body>
  <h1>Course Health</h1>
  <p>Courses discovered under <code>${rootEsc}</code></p>
  <table>
    <thead>
      <tr><th></th><th>Course</th><th>Semester</th><th>Pages</th><th>Last Published</th><th>Transcripts</th></tr>
    </thead>
    <tbody>
${rowsHtml}
    </tbody>
  </table>
  <p class="footer">Refresh the page to update. Generated ${timestamp}.</p>
</body>
</html>
`;
}
```

- [ ] **Step 4: Run tests**

Run: `npm test --workspace command-and-control-mcp -- dashboard/views/course_health.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/command-and-control/src/dashboard/views/course_health.ts packages/command-and-control/tests/dashboard/views/course_health.test.ts
git commit -m "feat(cc): course_health view renders dashboard HTML (#68)"
```

---

## Phase 4 — Server

### Task 4.1: `dashboard/server.ts` — node:http server with `startDashboardServer`

**Files:**
- Create: `packages/command-and-control/src/dashboard/server.ts`
- Create: `packages/command-and-control/tests/dashboard/server.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/command-and-control/tests/dashboard/server.test.ts`:

```ts
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startDashboardServer } from '../../src/dashboard/server.js';

let coursesRoot: string;
let stopFn: (() => Promise<void>) | null = null;

beforeEach(() => { coursesRoot = mkdtempSync(join(tmpdir(), 'srv-')); });
afterEach(async () => {
  if (stopFn) { await stopFn(); stopFn = null; }
  rmSync(coursesRoot, { recursive: true, force: true });
});

describe('startDashboardServer', () => {
  it('starts the server on an auto-assigned port and serves the course health page', async () => {
    const { url, stop } = await startDashboardServer({ coursesRoot });
    stopFn = stop;

    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
    const res = await fetch(url);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('Course Health');
    expect(body).toContain('No courses found');
  });

  it('returns 404 for unknown paths', async () => {
    const { url, stop } = await startDashboardServer({ coursesRoot });
    stopFn = stop;
    const res = await fetch(`${url}nonexistent`);
    expect(res.status).toBe(404);
  });

  it('stops cleanly when stop() called', async () => {
    const { url, stop } = await startDashboardServer({ coursesRoot });
    await stop();
    stopFn = null;
    await expect(fetch(url)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run + fail**

Run: `npm test --workspace command-and-control-mcp -- dashboard/server.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `server.ts`**

Create `packages/command-and-control/src/dashboard/server.ts`:

```ts
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { buildCourseHealth, walkForCourses } from './data.js';
import { renderCourseHealthPage } from './views/course_health.js';

export interface StartDashboardServerInput {
  coursesRoot: string;
  port?: number;
}

export interface DashboardServerHandle {
  url: string;
  port: number;
  stop: () => Promise<void>;
}

export async function startDashboardServer(input: StartDashboardServerInput): Promise<DashboardServerHandle> {
  const server: Server = createServer((req, res) => {
    if (req.method !== 'GET') {
      res.writeHead(405, { 'content-type': 'text/plain' });
      res.end('Method Not Allowed');
      return;
    }
    if (req.url === '/' || req.url === '') {
      try {
        const courseDirs = walkForCourses(input.coursesRoot);
        const courses = courseDirs.map((d) => buildCourseHealth(d));
        const html = renderCourseHealthPage({ coursesRoot: input.coursesRoot, courses });
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(html);
      } catch (err) {
        res.writeHead(500, { 'content-type': 'text/plain' });
        res.end(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not Found');
  });

  await new Promise<void>((resolve, reject) => {
    server.on('error', reject);
    server.listen(input.port ?? 0, '127.0.0.1', () => resolve());
  });

  const addr = server.address() as AddressInfo;
  const port = addr.port;
  const url = `http://127.0.0.1:${port}/`;

  const stop = (): Promise<void> => new Promise<void>((resolve) => {
    server.close(() => resolve());
  });

  return { url, port, stop };
}
```

- [ ] **Step 4: Run tests**

Run: `npm test --workspace command-and-control-mcp -- dashboard/server.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/command-and-control/src/dashboard/server.ts packages/command-and-control/tests/dashboard/server.test.ts
git commit -m "feat(cc): dashboard HTTP server with GET / course-health page (#68)"
```

---

## Phase 5 — `open_dashboard` MCP Tool + Registration

### Task 5.1: `open_dashboard.ts` tool

**Files:**
- Create: `packages/command-and-control/src/tools/open_dashboard.ts`
- Create: `packages/command-and-control/tests/tools/open_dashboard.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/command-and-control/tests/tools/open_dashboard.test.ts`:

```ts
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDashboard } from '../../src/tools/open_dashboard.js';

let ccHomeDir: string;
let coursesDir: string;
let serverHandle: { stop: () => Promise<void> } | null = null;
const ORIGINAL_CC_HOME = process.env.CC_HOME;

beforeEach(() => {
  ccHomeDir = mkdtempSync(join(tmpdir(), 'cc-home-'));
  coursesDir = mkdtempSync(join(tmpdir(), 'courses-'));
  process.env.CC_HOME = ccHomeDir;
});

afterEach(async () => {
  if (serverHandle) { await serverHandle.stop(); serverHandle = null; }
  rmSync(ccHomeDir, { recursive: true, force: true });
  rmSync(coursesDir, { recursive: true, force: true });
  if (ORIGINAL_CC_HOME === undefined) delete process.env.CC_HOME;
  else process.env.CC_HOME = ORIGINAL_CC_HOME;
});

function seedConfig(extras: Record<string, unknown> = {}) {
  mkdirSync(ccHomeDir, { recursive: true });
  writeFileSync(join(ccHomeDir, 'config.json'),
    JSON.stringify({ mode: 'auto', providers: { anthropic: {} }, routing: {}, lastRun: {}, ...extras }));
}

describe('openDashboard', () => {
  it('happy path: returns ok=true with url + port + coursesRoot + courseCount', async () => {
    seedConfig({ coursesRoot: coursesDir });

    const result = await openDashboard({});

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
    expect(result.port).toBeGreaterThan(0);
    expect(result.coursesRoot).toBe(coursesDir);
    expect(result.courseCount).toBe(0);
    serverHandle = (await import('../../src/dashboard/server.js')).startDashboardServer
      ? { stop: async () => { await fetch(result.url + 'shutdown').catch(() => {}); } }
      : null;
    // Best-effort cleanup: the dashboard server is process-scoped. For the
    // test environment, we let the server die with the test process.
  });

  it('returns COURSES_ROOT_NOT_SET when config has no coursesRoot', async () => {
    seedConfig({});

    const result = await openDashboard({});

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('COURSES_ROOT_NOT_SET');
  });

  it('returns COURSES_ROOT_NOT_FOUND when coursesRoot points to missing directory', async () => {
    seedConfig({ coursesRoot: join(coursesDir, 'nonexistent') });

    const result = await openDashboard({});

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('COURSES_ROOT_NOT_FOUND');
  });
});
```

**Note:** the happy-path test starts a real server but doesn't explicitly stop it. The vitest process exits at the end of the suite, which kills the server. This is acceptable for v1; if we add many such tests, refactor to expose a stop handle.

- [ ] **Step 2: Run + fail**

Run: `npm test --workspace command-and-control-mcp -- open_dashboard.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `open_dashboard.ts`**

Create `packages/command-and-control/src/tools/open_dashboard.ts`:

```ts
import { existsSync, statSync } from 'node:fs';
import { startDashboardServer } from '../dashboard/server.js';
import { walkForCourses } from '../dashboard/data.js';
import { loadConfig } from '../kb/config.js';

export interface OpenDashboardInput {
  port?: number;
}

export type OpenDashboardResult =
  | { ok: true; url: string; port: number; coursesRoot: string; courseCount: number }
  | { ok: false; error: 'COURSES_ROOT_NOT_SET' | 'COURSES_ROOT_NOT_FOUND' | 'PORT_IN_USE'; message: string; fix: string[] };

export async function openDashboard(input: OpenDashboardInput): Promise<OpenDashboardResult> {
  const config = loadConfig();
  const coursesRoot = config.coursesRoot;

  if (!coursesRoot) {
    return {
      ok: false,
      error: 'COURSES_ROOT_NOT_SET',
      message: 'coursesRoot is not set in ~/.command-and-control/config.json',
      fix: ['Run set_courses_root with the absolute path to your courses folder'],
    };
  }

  if (!existsSync(coursesRoot) || !statSync(coursesRoot).isDirectory()) {
    return {
      ok: false,
      error: 'COURSES_ROOT_NOT_FOUND',
      message: `Configured coursesRoot does not exist or is not a directory: ${coursesRoot}`,
      fix: ['Re-run set_courses_root with a valid directory path'],
    };
  }

  try {
    const { url, port } = await startDashboardServer({ coursesRoot, port: input.port });
    const courseCount = walkForCourses(coursesRoot).length;
    return { ok: true, url, port, coursesRoot, courseCount };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/EADDRINUSE/.test(msg)) {
      return {
        ok: false,
        error: 'PORT_IN_USE',
        message: msg,
        fix: ['Try a different port, or stop the existing dashboard server'],
      };
    }
    throw err;
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npm test --workspace command-and-control-mcp -- open_dashboard.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/command-and-control/src/tools/open_dashboard.ts packages/command-and-control/tests/tools/open_dashboard.test.ts
git commit -m "feat(cc): open_dashboard MCP tool — starts server, returns URL (#68)"
```

---

### Task 5.2: Register both new MCP tools in `src/index.ts`

**Files:** `packages/command-and-control/src/index.ts`

- [ ] **Step 1: Recon — find the pattern**

Run: `rg "set_course_aias_default" packages/command-and-control/src/index.ts -B 2 -A 8`
This shows the structure to mirror.

- [ ] **Step 2: Add imports + entries + cases**

Near the other tool imports:

```ts
import { setCoursesRoot } from './tools/set_courses_root.js';
import { openDashboard } from './tools/open_dashboard.js';
```

Adjacent to the `set_course_aias_default` registration in `ListToolsRequestSchema`, add:

```ts
{
  name: 'set_courses_root',
  description:
    "Set the root directory for course discovery used by the local dashboard. " +
    "The dashboard scans this directory recursively for folders containing course-config.md.",
  inputSchema: {
    type: 'object' as const,
    properties: {
      coursesRoot: { type: 'string', description: 'Absolute path to the courses root directory.' },
    },
    required: ['coursesRoot'],
  },
},
{
  name: 'open_dashboard',
  description:
    "Start the local Canvas Toolchain dashboard (read-only course health view). " +
    "Returns a localhost URL the professor can open in a browser. Requires set_courses_root first.",
  inputSchema: {
    type: 'object' as const,
    properties: {
      port: { type: 'number', description: 'Optional fixed port. Default: auto-assigned.' },
    },
  },
},
```

Adjacent to the `set_course_aias_default` switch case in `CallToolRequestSchema`:

```ts
case 'set_courses_root': {
  result = await setCoursesRoot(args as unknown as Parameters<typeof setCoursesRoot>[0]);
  break;
}
case 'open_dashboard': {
  result = await openDashboard(args as unknown as Parameters<typeof openDashboard>[0]);
  break;
}
```

- [ ] **Step 3: Build + test**

Run: `npm run build --workspace command-and-control-mcp`
Run: `npm test --workspace command-and-control-mcp`
Expected: both clean.

- [ ] **Step 4: Commit**

```bash
git add packages/command-and-control/src/index.ts
git commit -m "feat(cc): register set_courses_root + open_dashboard MCP tools (#68)"
```

---

## Phase 6 — CLI

### Task 6.1: CLI entrypoint + package.json `bin` declaration

**Files:**
- Create: `packages/command-and-control/src/cli/dashboard.ts`
- Modify: `packages/command-and-control/package.json`

- [ ] **Step 1: Create the CLI file**

Create `packages/command-and-control/src/cli/dashboard.ts`:

```ts
#!/usr/bin/env node
import { existsSync, statSync } from 'node:fs';
import { startDashboardServer } from '../dashboard/server.js';
import { loadConfig } from '../kb/config.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const coursesRoot = config.coursesRoot;

  if (!coursesRoot) {
    console.error('Error: coursesRoot is not set in ~/.command-and-control/config.json.');
    console.error('Run the set_courses_root MCP tool first, or edit config.json directly.');
    process.exit(1);
  }
  if (!existsSync(coursesRoot) || !statSync(coursesRoot).isDirectory()) {
    console.error(`Error: configured coursesRoot does not exist: ${coursesRoot}`);
    process.exit(1);
  }

  const { url } = await startDashboardServer({ coursesRoot });
  console.log(`Canvas Toolchain Dashboard running at ${url}`);
  console.log('Press Ctrl-C to stop.');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
```

- [ ] **Step 2: Add `bin` entry to package.json**

In `packages/command-and-control/package.json`, find the existing `bin` field. Add the new entry alongside the existing one:

```json
"bin": {
  "command-and-control-mcp": "dist/index.js",
  "canvas-toolchain-dashboard": "dist/cli/dashboard.js"
}
```

(Match the existing structure — if the existing `bin` uses different paths, just add the new entry; don't rewrite the existing one.)

- [ ] **Step 3: Build to verify**

Run: `npm run build --workspace command-and-control-mcp`
Expected: tsc exits 0; `dist/cli/dashboard.js` exists with the shebang as the first line.

- [ ] **Step 4: Verify the bin link will work (optional sanity check)**

If you have a writable npm bin folder:

Run from repo root: `npm link --workspace command-and-control-mcp` (creates the global bin link)
Then: `canvas-toolchain-dashboard --help` should at least run (it doesn't accept --help in v1, but it should not crash with module-not-found).

If `npm link` requires permissions you don't have, skip this step; the build artifact existing is enough confirmation.

- [ ] **Step 5: Commit**

```bash
git add packages/command-and-control/src/cli/dashboard.ts packages/command-and-control/package.json
git commit -m "feat(cc): CLI binary canvas-toolchain-dashboard (#68)"
```

---

## Phase 7 — Docs

### Task 7.1: CLAUDE.md updates

**Files:** `packages/command-and-control/CLAUDE.md`

- [ ] **Step 1: Add the two new tools to the "Implemented" list**

In `packages/command-and-control/CLAUDE.md`, append to the `Implemented:` bullet list:

```markdown
- `set_courses_root` MCP tool — sets `coursesRoot` in `~/.command-and-control/config.json`. Validates path exists + is a directory before writing.
- `open_dashboard` MCP tool — starts a local `node:http` server on `127.0.0.1:<auto-port>`, returns the URL. Server renders a single read-only "course health" page from any folders under `coursesRoot` containing `course-config.md`. CLI equivalent: `canvas-toolchain-dashboard`.
```

- [ ] **Step 2: Add a "Local Dashboard" subsection**

Append a new section after the existing tool documentation (find a structurally appropriate spot — likely after the "Provider Switching Workflow" or "Canvas Capability Showcase" section):

```markdown
## Local Dashboard (#68)

A localhost-only HTTP server that surfaces read-only course health metrics.

```text
Setup:        set_courses_root({ coursesRoot: 'D:\\Dev\\courses' })
Launch (MCP): open_dashboard({}) → returns http://127.0.0.1:<port>/
Launch (CLI): canvas-toolchain-dashboard
```

The dashboard discovers courses by walking `coursesRoot` for folders containing `course-config.md`. For each, it shows: course name, semester, page count, last-publish timestamp, transcript coverage (week folders with `.enriched.md` / total week folders), and a green/yellow/red health indicator.

Plain `node:http` + server-rendered HTML; no client JS, no external assets. Binds to `127.0.0.1` only — no auth (relies on the localhost trust boundary). Write actions, run history, semester stats, and vocab/config edit forms are deferred to v2 follow-ups.
```

- [ ] **Step 3: Commit**

```bash
git add packages/command-and-control/CLAUDE.md
git commit -m "docs(cc): CLAUDE.md — local dashboard (#68)"
```

---

## Phase 8 — Regression + Close #68

### Task 8.1: Full regression + close

- [ ] **Step 1:** `npm run build --workspaces` → exit 0.
- [ ] **Step 2:** `npm test --workspaces` → all green. command-and-control-mcp gains ~17 tests (3 set_courses_root + 8 data + 5 view + 3 server + 3 open_dashboard + 1 misc; reconcile if test counts deviate by ±2 due to layout).
- [ ] **Step 3:** `npm run smoke:integration --workspace command-and-control-mcp` → passes.
- [ ] **Step 4:** Verify each AC from the spec.
- [ ] **Step 5:** `git push origin main`.
- [ ] **Step 6:** Comment + close #68.

```bash
gh issue comment 68 --repo Ryfter/canvas-toolchain --body "$(cat <<'EOF'
## Shipped

All 7 acceptance criteria met. Summary:

- New MCP tool `set_courses_root` writes `coursesRoot` to `~/.command-and-control/config.json` (validates path exists + is a directory).
- New MCP tool `open_dashboard` starts a `node:http` server on `127.0.0.1:<auto-port>`, returns the URL. Discovers courses by walking the configured `coursesRoot` for folders with `course-config.md`.
- New CLI binary `canvas-toolchain-dashboard` shares the same server.
- Single read-only "course health" page: per-course name, semester, page count, last-publish timestamp, transcript coverage, and a green/yellow/red health indicator computed by deterministic rules.
- Zero new runtime deps. Pure `node:http` + server-rendered HTML + inline CSS. Empty state for zero courses.

### Out of scope (deferred to v2 follow-ups)
- Pipeline run history
- Semester stats from CI trajectory
- Vocab/config edit forms (touches secrets)
- Auto-refresh / WebSockets
- Drill-in per course
- Cross-OS browser auto-open

Spec: \`packages/command-and-control/docs/superpowers/specs/2026-06-07-local-dashboard-design.md\`
Plan: \`packages/command-and-control/docs/superpowers/plans/2026-06-07-local-dashboard.md\`
EOF
)"
gh issue close 68 --repo Ryfter/canvas-toolchain --reason "completed"
```

---

## Summary

| Phase | Tasks | New tests | Files created | Files modified |
|---|---|---|---|---|
| 0 | 1 baseline | 0 | 0 | 0 |
| 1 | 1 (config + set_courses_root) | 3 | 1 | 1 |
| 2 | 1 (data) | 8 | 1 | 0 |
| 3 | 1 (view) | 5 | 1 | 0 |
| 4 | 1 (server) | 3 | 1 | 0 |
| 5 | 2 (open_dashboard + register) | 3 | 1 | 1 |
| 6 | 1 (CLI) | 0 | 1 | 1 |
| 7 | 1 docs | 0 | 0 | 1 |
| 8 | 1 regression + close | 0 | 0 | 0 |
| **Total** | **10 tasks** | **~22 new tests** | **6 new files** | **4 modified files** |
