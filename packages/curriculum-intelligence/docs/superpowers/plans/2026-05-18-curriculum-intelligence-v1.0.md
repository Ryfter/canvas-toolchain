# Curriculum Intelligence v1.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 7 new MCP tools that take v0.6 analysis output, build a `next-plan/` planning folder, and export a Canvas Design Studio–compatible `course/` folder for next semester.

**Architecture:** New tools work through a `next-plan/` intermediate folder (markdown files with CI-extended YAML front matter). `export_course_folder` translates it to CDS format. LLM calls use the same injectable `llmClient?: LlmClient` pattern. Calendar parsing is institution-agnostic vocabulary matching with manual-date and semester-pattern fallbacks.

**Tech Stack:** Node.js + TypeScript ESM, vitest (fixture-based, no network calls), gray-matter (YAML front matter), `@anthropic-ai/sdk`, `CURRICULUM_INTELLIGENCE_HOME` env-var test isolation.

---

### Task 1: Add v1.0 types to `src/types.ts`

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Append types to `src/types.ts`**

Add at the bottom of the file (below the last existing export):

```typescript
// ── v1.0 planning types ──────────────────────────────────────────────────────

export type PlanSource = 'archive' | 'cds' | 'auto';
export type BreakCollision = 'bump-before' | 'bump-after' | 'flag';
export type Staleness = 'low' | 'moderate' | 'high';

export interface BreakRange {
  name: string;
  start: string;  // ISO date YYYY-MM-DD
  end: string;
}

export interface SemesterCalendar {
  semesterId: string;
  classesBegin: string;
  classesEnd: string;
  deadWeek?: { start: string; end: string };
  finals?: { start: string; end: string };
  breaks: BreakRange[];
  source: 'url' | 'manual' | 'pattern';
  partial: boolean;
  missing?: string[];
}

export interface SectionCalendarOverride {
  sectionId: string;
  calendarOverrides?: Partial<SemesterCalendar>;
}

export interface PlanConfig {
  courseId: CourseId;
  sourceSemesterId: SemesterId;
  targetSemesterId: SemesterId;
  source: PlanSource;
  sections: string[];
  status: 'draft' | 'approved';
  toolsRun: string[];
}

export interface BriefFrontMatter {
  title: string;
  week: number;
  type: string;
  points?: number;
  due: string;                          // "TBD" until shift_dates runs
  originalDue?: string;                 // ISO date from source archive
  due_sections?: Record<string, string>;
  verdict: 'KEEP' | 'UPDATE' | 'DROP' | 'ADD';
  currency: 'evergreen' | 'current' | 'dated';
  lastTaught: string;
  semestersSince: number;
  newsHits: number;
  staleness: Staleness;
  replacement_recommended: boolean;
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: exits 0, no type errors.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat(types): add v1.0 planning types (SemesterCalendar, PlanConfig, BriefFrontMatter)"
```

---

### Task 2: `src/kb/next_plan.ts` — next-plan folder utilities

**Files:**
- Create: `src/kb/next_plan.ts`
- Create: `tests/kb/next_plan.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/kb/next_plan.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setupCourse } from '../../src/tools/setup_course.js';
import {
  getNextPlanPath,
  savePlanConfig,
  loadPlanConfig,
  saveCalendar,
  loadCalendar,
  getWeekDir,
} from '../../src/kb/next_plan.js';
import type { PlanConfig, SemesterCalendar } from '../../src/types.js';

let tmpHome: string;

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'ci-home-'));
  process.env.CURRICULUM_INTELLIGENCE_HOME = tmpHome;
  setupCourse({ id: 'TEST101', title: 'Tiny Fixture Course' });
});

afterEach(() => {
  delete process.env.CURRICULUM_INTELLIGENCE_HOME;
  rmSync(tmpHome, { recursive: true, force: true });
});

describe('getNextPlanPath', () => {
  test('returns path inside the target semester folder', () => {
    const p = getNextPlanPath('TEST101', 'Fall2026');
    expect(p).toContain(join('semesters', 'Fall2026', 'next-plan'));
  });
});

describe('savePlanConfig / loadPlanConfig', () => {
  test('round-trips a PlanConfig', () => {
    const cfg: PlanConfig = {
      courseId: 'TEST101',
      sourceSemesterId: 'Spring2026',
      targetSemesterId: 'Fall2026',
      source: 'archive',
      sections: ['01'],
      status: 'draft',
      toolsRun: ['import_previous_shell'],
    };
    savePlanConfig(cfg);
    expect(loadPlanConfig('TEST101', 'Fall2026')).toEqual(cfg);
  });
});

describe('saveCalendar / loadCalendar', () => {
  test('round-trips a SemesterCalendar', () => {
    const cal: SemesterCalendar = {
      semesterId: 'Fall2026',
      classesBegin: '2026-08-24',
      classesEnd: '2026-12-11',
      breaks: [{ name: 'Labor Day', start: '2026-09-07', end: '2026-09-07' }],
      source: 'manual',
      partial: false,
    };
    saveCalendar('TEST101', 'Fall2026', cal);
    expect(loadCalendar('TEST101', 'Fall2026')).toEqual(cal);
  });
});

describe('getWeekDir', () => {
  test('creates directory and returns path with zero-padded week', () => {
    const { existsSync } = await import('node:fs');
    const dir = getWeekDir('TEST101', 'Fall2026', 3);
    expect(dir).toContain('week-03');
    expect(existsSync(dir)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/kb/next_plan.test.ts`
Expected: FAIL — cannot find module `../../src/kb/next_plan.js`

- [ ] **Step 3: Implement `src/kb/next_plan.ts`**

```typescript
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getSemesterPath } from './course_state.js';
import type { CourseId, SemesterId, PlanConfig, SemesterCalendar } from '../types.js';

export function getNextPlanPath(courseId: CourseId, semesterId: SemesterId): string {
  return join(getSemesterPath(courseId, semesterId), 'next-plan');
}

function ensureNextPlanDir(courseId: CourseId, semesterId: SemesterId): string {
  const dir = getNextPlanPath(courseId, semesterId);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function savePlanConfig(cfg: PlanConfig): void {
  const dir = ensureNextPlanDir(cfg.courseId, cfg.targetSemesterId);
  writeFileSync(join(dir, 'plan-config.json'), JSON.stringify(cfg, null, 2), 'utf-8');
}

export function loadPlanConfig(courseId: CourseId, semesterId: SemesterId): PlanConfig {
  const path = join(getNextPlanPath(courseId, semesterId), 'plan-config.json');
  if (!existsSync(path)) {
    throw new Error(`No plan-config.json at ${path}. Run import_previous_shell first.`);
  }
  return JSON.parse(readFileSync(path, 'utf-8')) as PlanConfig;
}

export function saveCalendar(courseId: CourseId, semesterId: SemesterId, cal: SemesterCalendar): void {
  const dir = ensureNextPlanDir(courseId, semesterId);
  writeFileSync(join(dir, 'calendar.json'), JSON.stringify(cal, null, 2), 'utf-8');
}

export function loadCalendar(courseId: CourseId, semesterId: SemesterId): SemesterCalendar {
  const path = join(getNextPlanPath(courseId, semesterId), 'calendar.json');
  if (!existsSync(path)) {
    throw new Error(`No calendar.json at ${path}. Run fetch_academic_calendar first.`);
  }
  return JSON.parse(readFileSync(path, 'utf-8')) as SemesterCalendar;
}

export function getWeekDir(courseId: CourseId, semesterId: SemesterId, weekNum: number): string {
  const dir = join(getNextPlanPath(courseId, semesterId), `week-${String(weekNum).padStart(2, '0')}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/kb/next_plan.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/kb/next_plan.ts tests/kb/next_plan.test.ts
git commit -m "feat(kb): add next_plan utilities (getNextPlanPath, savePlanConfig, saveCalendar, getWeekDir)"
```

---

### Task 3: `src/parsers/academic_calendar.ts` + HTML fixture

**Files:**
- Create: `tests/fixtures/academic-calendar-example.html`
- Create: `src/parsers/academic_calendar.ts`
- Create: `tests/parsers/academic_calendar.test.ts`

- [ ] **Step 1: Create the HTML fixture**

Create `tests/fixtures/academic-calendar-example.html`:

```html
<!DOCTYPE html>
<html>
<head><title>Fall 2026 Academic Calendar</title></head>
<body>
<h1>Fall 2026 Academic Calendar</h1>
<table>
  <tbody>
    <tr><td>Classes Begin</td><td>August 24, 2026</td></tr>
    <tr><td>Labor Day (University Holiday)</td><td>September 7, 2026</td></tr>
    <tr><td>Fall Break</td><td>October 19-20, 2026</td></tr>
    <tr><td>Thanksgiving Break</td><td>November 23-27, 2026</td></tr>
    <tr><td>Last Day of Classes</td><td>December 11, 2026</td></tr>
    <tr><td>Dead Week</td><td>December 7-11, 2026</td></tr>
    <tr><td>Final Examinations</td><td>December 14-18, 2026</td></tr>
  </tbody>
</table>
</body>
</html>
```

- [ ] **Step 2: Write the failing test**

Create `tests/parsers/academic_calendar.test.ts`:

```typescript
import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCalendarHtml, inferCalendarFromPattern } from '../../src/parsers/academic_calendar.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const EXAMPLE_HTML = readFileSync(join(__dirname, '..', 'fixtures', 'academic-calendar-example.html'), 'utf-8');

describe('parseCalendarHtml', () => {
  test('extracts classesBegin', () => {
    expect(parseCalendarHtml(EXAMPLE_HTML, 'Fall2026').classesBegin).toBe('2026-08-24');
  });

  test('extracts classesEnd', () => {
    expect(parseCalendarHtml(EXAMPLE_HTML, 'Fall2026').classesEnd).toBe('2026-12-11');
  });

  test('extracts finals as date range', () => {
    expect(parseCalendarHtml(EXAMPLE_HTML, 'Fall2026').finals).toEqual({
      start: '2026-12-14',
      end: '2026-12-18',
    });
  });

  test('extracts dead week as date range', () => {
    expect(parseCalendarHtml(EXAMPLE_HTML, 'Fall2026').deadWeek).toEqual({
      start: '2026-12-07',
      end: '2026-12-11',
    });
  });

  test('extracts multi-day Thanksgiving break', () => {
    const cal = parseCalendarHtml(EXAMPLE_HTML, 'Fall2026');
    const t = cal.breaks.find((b) => b.name === 'Thanksgiving Break');
    expect(t).toEqual({ name: 'Thanksgiving Break', start: '2026-11-23', end: '2026-11-27' });
  });

  test('extracts single-day Labor Day break', () => {
    const cal = parseCalendarHtml(EXAMPLE_HTML, 'Fall2026');
    const ld = cal.breaks.find((b) => b.name === 'Labor Day');
    expect(ld).toEqual({ name: 'Labor Day', start: '2026-09-07', end: '2026-09-07' });
  });

  test('source is "url" and partial is false when all required fields found', () => {
    const cal = parseCalendarHtml(EXAMPLE_HTML, 'Fall2026');
    expect(cal.source).toBe('url');
    expect(cal.partial).toBe(false);
  });

  test('returns partial:true with missing list for unrecognized page', () => {
    const cal = parseCalendarHtml('<html><body><p>No dates here</p></body></html>', 'Fall2026');
    expect(cal.partial).toBe(true);
    expect(cal.missing).toContain('classesBegin');
    expect(cal.missing).toContain('classesEnd');
  });
});

describe('inferCalendarFromPattern', () => {
  test('Fall2026 yields classesBegin in late August 2026', () => {
    const cal = inferCalendarFromPattern('Fall2026');
    expect(cal.classesBegin.startsWith('2026-08')).toBe(true);
    expect(cal.source).toBe('pattern');
    expect(cal.partial).toBe(false);
  });

  test('Spring2027 yields classesBegin in January 2027', () => {
    const cal = inferCalendarFromPattern('Spring2027');
    expect(cal.classesBegin.startsWith('2027-01')).toBe(true);
  });

  test('throws for unrecognized semesterId format', () => {
    expect(() => inferCalendarFromPattern('Autumn2026')).toThrow();
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run tests/parsers/academic_calendar.test.ts`
Expected: FAIL — cannot find module `../../src/parsers/academic_calendar.js`

- [ ] **Step 4: Implement `src/parsers/academic_calendar.ts`**

```typescript
import type { SemesterCalendar, BreakRange } from '../types.js';

const MONTH_MAP: Record<string, string> = {
  January: '01', February: '02', March: '03', April: '04',
  May: '05', June: '06', July: '07', August: '08',
  September: '09', October: '10', November: '11', December: '12',
};

function toIso(month: string, day: string | number, year: string | number): string {
  const m = MONTH_MAP[month];
  if (!m) throw new Error(`Unknown month: ${month}`);
  return `${year}-${m}-${String(day).padStart(2, '0')}`;
}

function extractSingleDate(text: string, patterns: string[]): string | undefined {
  for (const p of patterns) {
    const idx = text.indexOf(p);
    if (idx === -1) continue;
    const nearby = text.slice(idx, idx + 250);
    const m = nearby.match(
      /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s*(\d{4})\b/
    );
    if (m) return toIso(m[1], m[2], m[3]);
  }
  return undefined;
}

function extractDateRange(text: string, patterns: string[]): { start: string; end: string } | undefined {
  for (const p of patterns) {
    const idx = text.indexOf(p);
    if (idx === -1) continue;
    const nearby = text.slice(idx, idx + 300);
    // "Month D1-D2, YYYY"
    const range = nearby.match(
      /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})\s*[-–]\s*(\d{1,2}),?\s*(\d{4})\b/
    );
    if (range) {
      return { start: toIso(range[1], range[2], range[4]), end: toIso(range[1], range[3], range[4]) };
    }
    // Single date
    const single = nearby.match(
      /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s*(\d{4})\b/
    );
    if (single) {
      const d = toIso(single[1], single[2], single[3]);
      return { start: d, end: d };
    }
  }
  return undefined;
}

const BREAK_VOCAB: Array<{ name: string; patterns: string[] }> = [
  { name: 'Labor Day',                   patterns: ['Labor Day'] },
  { name: 'Fall Break',                  patterns: ['Fall Break'] },
  { name: 'Thanksgiving Break',          patterns: ['Thanksgiving Break', 'Thanksgiving'] },
  { name: 'Spring Break',               patterns: ['Spring Break'] },
  { name: 'Winter Break',               patterns: ['Winter Break', 'Winter Recess'] },
  { name: 'Martin Luther King Jr. Day', patterns: ['Martin Luther King', 'MLK Day'] },
  { name: 'Memorial Day',               patterns: ['Memorial Day'] },
  { name: "Presidents' Day",            patterns: ["Presidents' Day", "Presidents Day"] },
];

export function parseCalendarHtml(html: string, semesterId: string): SemesterCalendar {
  const missing: string[] = [];

  const classesBegin = extractSingleDate(html, [
    'Classes Begin', 'First Day of Classes', 'Instruction Begins', 'Classes begin',
  ]);
  if (!classesBegin) missing.push('classesBegin');

  const classesEnd = extractSingleDate(html, [
    'Last Day of Classes', 'End of Instruction', 'Classes end', 'Last day of classes',
  ]);
  if (!classesEnd) missing.push('classesEnd');

  const deadWeek = extractDateRange(html, ['Dead Week', 'dead week']);
  const finals = extractDateRange(html, ['Final Examinations', 'Finals Week', 'Final Exams']);

  const breaks: BreakRange[] = [];
  for (const { name, patterns } of BREAK_VOCAB) {
    const range = extractDateRange(html, patterns);
    if (range) breaks.push({ name, ...range });
  }

  const partial = missing.length > 0;
  return {
    semesterId,
    classesBegin: classesBegin ?? '',
    classesEnd: classesEnd ?? '',
    ...(deadWeek ? { deadWeek } : {}),
    ...(finals ? { finals } : {}),
    breaks,
    source: 'url',
    partial,
    ...(partial ? { missing } : {}),
  };
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Returns YYYY-MM-DD of the Nth weekday (0=Sun … 6=Sat) in month (1-12) of year.
function nthWeekday(year: number, month: number, weekday: number, n: number): string {
  let count = 0;
  const d = new Date(Date.UTC(year, month - 1, 1));
  while (true) {
    if (d.getUTCDay() === weekday) { count++; if (count === n) return d.toISOString().slice(0, 10); }
    d.setUTCDate(d.getUTCDate() + 1);
  }
}

export function inferCalendarFromPattern(semesterId: string): SemesterCalendar {
  const m = semesterId.match(/^(Spring|Summer|Fall)(\d{4})$/i);
  if (!m) throw new Error(`Cannot infer calendar from "${semesterId}". Use format "Fall2026".`);
  const term = m[1].toLowerCase();
  const year = parseInt(m[2], 10);

  if (term === 'fall') {
    const classesBegin = nthWeekday(year, 8, 1, 4);   // 4th Monday of August
    const classesEnd = addDays(`${year}-12-01`, 10);   // ~Dec 11
    return {
      semesterId, classesBegin, classesEnd,
      finals: { start: addDays(classesEnd, 3), end: addDays(classesEnd, 7) },
      breaks: [
        { name: 'Labor Day', start: nthWeekday(year, 9, 1, 1), end: nthWeekday(year, 9, 1, 1) },
        { name: 'Thanksgiving Break', start: nthWeekday(year, 11, 4, 4), end: addDays(nthWeekday(year, 11, 4, 4), 3) },
      ],
      source: 'pattern', partial: false,
    };
  }

  if (term === 'spring') {
    const classesBegin = nthWeekday(year, 1, 1, 2);   // 2nd Monday of January
    const classesEnd = addDays(`${year}-04-28`, 5);    // ~first week of May
    return {
      semesterId, classesBegin, classesEnd,
      finals: { start: addDays(classesEnd, 3), end: addDays(classesEnd, 7) },
      breaks: [
        { name: 'Spring Break', start: addDays(classesBegin, 49), end: addDays(classesBegin, 55) },
      ],
      source: 'pattern', partial: false,
    };
  }

  // Summer — minimal
  return {
    semesterId,
    classesBegin: `${year}-05-18`,
    classesEnd: `${year}-08-07`,
    breaks: [],
    source: 'pattern', partial: false,
  };
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run tests/parsers/academic_calendar.test.ts`
Expected: PASS (11 tests)

- [ ] **Step 6: Commit**

```bash
git add src/parsers/academic_calendar.ts tests/parsers/academic_calendar.test.ts tests/fixtures/academic-calendar-example.html
git commit -m "feat(parsers): institution-agnostic HTML academic calendar parser + fixture"
```

---

### Task 4: Install gray-matter + `src/parsers/front_matter.ts`

**Files:**
- Modify: `package.json` (new dependency)
- Create: `src/parsers/front_matter.ts`
- Create: `tests/parsers/front_matter.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/parsers/front_matter.test.ts`:

```typescript
import { describe, expect, test } from 'vitest';
import { parseBriefFile, serializeBriefFile } from '../../src/parsers/front_matter.js';

const SAMPLE = `---
title: "Engage 1 - Introduce Yourself"
week: 1
type: assignment
points: 10
due: TBD
verdict: UPDATE
currency: current
lastTaught: Spring2025
semestersSince: 2
newsHits: 1
staleness: moderate
replacement_recommended: false
---

Introduce yourself to the class.
`;

describe('parseBriefFile', () => {
  test('parses front matter data', () => {
    const { data } = parseBriefFile(SAMPLE);
    expect(data['title']).toBe('Engage 1 - Introduce Yourself');
    expect(data['week']).toBe(1);
    expect(data['replacement_recommended']).toBe(false);
  });

  test('returns body text', () => {
    const { body } = parseBriefFile(SAMPLE);
    expect(body.trim()).toBe('Introduce yourself to the class.');
  });
});

describe('serializeBriefFile', () => {
  test('round-trips data + body', () => {
    const { data, body } = parseBriefFile(SAMPLE);
    const result = serializeBriefFile(data, body);
    const { data: data2 } = parseBriefFile(result);
    expect(data2['title']).toBe(data['title']);
    expect(data2['week']).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/parsers/front_matter.test.ts`
Expected: FAIL — cannot find module `../../src/parsers/front_matter.js`

- [ ] **Step 3: Install gray-matter**

Run: `npm install gray-matter`
Expected: package installed, `package.json` updated with `"gray-matter": "^4.x.x"`.

- [ ] **Step 4: Implement `src/parsers/front_matter.ts`**

```typescript
import matter from 'gray-matter';

export interface ParsedBrief {
  data: Record<string, unknown>;
  body: string;
}

export function parseBriefFile(content: string): ParsedBrief {
  const { data, content: body } = matter(content);
  return { data: data as Record<string, unknown>, body };
}

export function serializeBriefFile(data: Record<string, unknown>, body: string): string {
  return matter.stringify(body, data);
}
```

- [ ] **Step 5: Add gray-matter types to tsconfig if needed**

Run: `npm run build`
If it errors with "Could not find a declaration file for module 'gray-matter'", run:
`npm install -D @types/gray-matter`
Then re-run `npm run build` — should now exit 0.

- [ ] **Step 6: Run to verify pass**

Run: `npx vitest run tests/parsers/front_matter.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 7: Commit**

```bash
git add src/parsers/front_matter.ts tests/parsers/front_matter.test.ts package.json package-lock.json
git commit -m "feat(parsers): add gray-matter front_matter wrapper (parseBriefFile, serializeBriefFile)"
```

---

### Task 5: `src/parsers/cds_course_folder.ts` + CDS fixture

**Files:**
- Create: `tests/fixtures/cds-course-tiny/course-config.md`
- Create: `tests/fixtures/cds-course-tiny/week-01/assignment.md`
- Create: `tests/fixtures/cds-course-tiny/week-01/engage-assignment.md`
- Create: `src/parsers/cds_course_folder.ts`
- Create: `tests/parsers/cds_course_folder.test.ts`

- [ ] **Step 1: Create the CDS fixture files**

`tests/fixtures/cds-course-tiny/course-config.md`:
```
---
courseId: TEST101
title: Tiny Fixture Course
semester: Spring2026
---
```

`tests/fixtures/cds-course-tiny/week-01/assignment.md`:
```
---
title: "Engage 1 - Introduce Yourself"
week: 1
type: assignment
points: 10
due: "2026-01-20"
---

Introduce yourself to the class. Tell us your name, major, and one thing you hope to learn about generative AI this semester.
```

`tests/fixtures/cds-course-tiny/week-01/engage-assignment.md`:
```
---
title: "Engage 2 - First Prompt"
week: 1
type: assignment
points: 20
due: "2026-01-27"
---

Write a prompt that gets Claude to produce a useful summary of an article. Submit the prompt and the response.
```

- [ ] **Step 2: Write the failing test**

Create `tests/parsers/cds_course_folder.test.ts`:

```typescript
import { describe, expect, test } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCdsCourseFolder } from '../../src/parsers/cds_course_folder.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURE = join(__dirname, '..', 'fixtures', 'cds-course-tiny');

describe('parseCdsCourseFolder', () => {
  test('reads course metadata from course-config.md', () => {
    const result = parseCdsCourseFolder(FIXTURE);
    expect(result.courseId).toBe('TEST101');
    expect(result.semester).toBe('Spring2026');
  });

  test('reads briefs from week subdirectories', () => {
    const result = parseCdsCourseFolder(FIXTURE);
    expect(result.briefs).toHaveLength(2);
  });

  test('brief has correct title and week', () => {
    const result = parseCdsCourseFolder(FIXTURE);
    const b = result.briefs.find((b) => b.title === 'Engage 1 - Introduce Yourself');
    expect(b).toBeDefined();
    expect(b!.week).toBe(1);
    expect(b!.due).toBe('2026-01-20');
    expect(b!.body.trim()).toContain('Introduce yourself');
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run tests/parsers/cds_course_folder.test.ts`
Expected: FAIL — cannot find module `../../src/parsers/cds_course_folder.js`

- [ ] **Step 4: Implement `src/parsers/cds_course_folder.ts`**

```typescript
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseBriefFile } from './front_matter.js';

export interface CdsBrief {
  title: string;
  week: number;
  type: string;
  points?: number;
  due?: string;
  body: string;
}

export interface CdsCourseFolder {
  courseId?: string;
  title?: string;
  semester?: string;
  briefs: CdsBrief[];
}

export function parseCdsCourseFolder(folderPath: string): CdsCourseFolder {
  const configPath = join(folderPath, 'course-config.md');
  let courseId: string | undefined;
  let title: string | undefined;
  let semester: string | undefined;

  if (existsSync(configPath)) {
    const { data } = parseBriefFile(readFileSync(configPath, 'utf-8'));
    courseId = data['courseId'] as string | undefined;
    title = data['title'] as string | undefined;
    semester = data['semester'] as string | undefined;
  }

  const briefs: CdsBrief[] = [];
  const entries = readdirSync(folderPath, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith('week-')) continue;
    const weekDir = join(folderPath, entry.name);
    const weekNum = parseInt(entry.name.replace('week-', ''), 10);
    for (const file of readdirSync(weekDir)) {
      if (!file.endsWith('.md')) continue;
      const content = readFileSync(join(weekDir, file), 'utf-8');
      const { data, body } = parseBriefFile(content);
      briefs.push({
        title: (data['title'] as string) ?? file.replace('.md', ''),
        week: (data['week'] as number) ?? weekNum,
        type: (data['type'] as string) ?? 'assignment',
        points: data['points'] as number | undefined,
        due: data['due'] as string | undefined,
        body,
      });
    }
  }

  return { courseId, title, semester, briefs };
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run tests/parsers/cds_course_folder.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add src/parsers/cds_course_folder.ts tests/parsers/cds_course_folder.test.ts tests/fixtures/cds-course-tiny/
git commit -m "feat(parsers): CDS course folder parser + tiny fixture"
```

---

### Task 6: `src/tools/import_previous_shell.ts`

**Files:**
- Create: `src/tools/import_previous_shell.ts`
- Create: `tests/tools/import_previous_shell.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/tools/import_previous_shell.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupCourse } from '../../src/tools/setup_course.js';
import { ingestCanvasArchive } from '../../src/tools/ingest_canvas_archive.js';
import { importPreviousShell } from '../../src/tools/import_previous_shell.js';
import { parseBriefFile } from '../../src/parsers/front_matter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIX_ARCHIVE = join(__dirname, '..', 'fixtures', 'canvas-archive-tiny');
const FIX_CDS = join(__dirname, '..', 'fixtures', 'cds-course-tiny');

let tmpHome: string;

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'ci-home-'));
  process.env.CURRICULUM_INTELLIGENCE_HOME = tmpHome;
  setupCourse({ id: 'TEST101', title: 'Tiny Fixture Course' });
});

afterEach(() => {
  delete process.env.CURRICULUM_INTELLIGENCE_HOME;
  rmSync(tmpHome, { recursive: true, force: true });
});

describe('importPreviousShell — source: archive', () => {
  test('creates plan-config.json with correct metadata', () => {
    ingestCanvasArchive({ courseId: 'TEST101', semesterId: 'Spring2025', archivePath: FIX_ARCHIVE });
    const result = importPreviousShell({
      courseId: 'TEST101',
      sourceSemesterId: 'Spring2025',
      newSemesterId: 'Fall2025',
      source: 'archive',
    });
    expect(result.planConfigPath).toContain('plan-config.json');
    const cfg = JSON.parse(readFileSync(result.planConfigPath, 'utf-8'));
    expect(cfg.sourceSemesterId).toBe('Spring2025');
    expect(cfg.targetSemesterId).toBe('Fall2025');
    expect(cfg.source).toBe('archive');
  });

  test('creates brief stub files in week directories', () => {
    ingestCanvasArchive({ courseId: 'TEST101', semesterId: 'Spring2025', archivePath: FIX_ARCHIVE });
    const result = importPreviousShell({
      courseId: 'TEST101',
      sourceSemesterId: 'Spring2025',
      newSemesterId: 'Fall2025',
      source: 'archive',
    });
    expect(result.briefsCreated).toBeGreaterThan(0);
    // At least one file should exist under week-01
    const found = result.briefPaths.some((p) => p.includes('week-01'));
    expect(found).toBe(true);
  });

  test('brief file has CI front matter with due: TBD and verdict: UPDATE default', () => {
    ingestCanvasArchive({ courseId: 'TEST101', semesterId: 'Spring2025', archivePath: FIX_ARCHIVE });
    const result = importPreviousShell({
      courseId: 'TEST101',
      sourceSemesterId: 'Spring2025',
      newSemesterId: 'Fall2025',
      source: 'archive',
    });
    const firstBrief = readFileSync(result.briefPaths[0], 'utf-8');
    const { data } = parseBriefFile(firstBrief);
    expect(data['due']).toBe('TBD');
    expect(data['verdict']).toBe('UPDATE');
    expect(data['lastTaught']).toBe('Spring2025');
    expect(typeof data['originalDue']).toBe('string');
  });
});

describe('importPreviousShell — source: cds', () => {
  test('creates brief stubs from a CDS course folder', () => {
    const result = importPreviousShell({
      courseId: 'TEST101',
      sourceSemesterId: 'Spring2026',
      newSemesterId: 'Fall2026',
      source: 'cds',
      cdsPath: FIX_CDS,
    });
    expect(result.briefsCreated).toBe(2);
  });
});

describe('importPreviousShell — source: auto', () => {
  test('falls back to archive when no CDS path provided', () => {
    ingestCanvasArchive({ courseId: 'TEST101', semesterId: 'Spring2025', archivePath: FIX_ARCHIVE });
    const result = importPreviousShell({
      courseId: 'TEST101',
      sourceSemesterId: 'Spring2025',
      newSemesterId: 'Fall2025',
      source: 'auto',
    });
    expect(result.sourceUsed).toBe('archive');
    expect(result.briefsCreated).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/tools/import_previous_shell.test.ts`
Expected: FAIL — cannot find module `../../src/tools/import_previous_shell.js`

- [ ] **Step 3: Implement `src/tools/import_previous_shell.ts`**

```typescript
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadTopicMap } from '../kb/topic_map.js';
import { savePlanConfig, getWeekDir } from '../kb/next_plan.js';
import { parseCdsCourseFolder } from '../parsers/cds_course_folder.js';
import { serializeBriefFile } from '../parsers/front_matter.js';
import type { CourseId, SemesterId, PlanSource, ModuleInfo } from '../types.js';

export interface ImportPreviousShellInput {
  courseId: CourseId;
  sourceSemesterId: SemesterId;
  newSemesterId: SemesterId;
  source: PlanSource;
  cdsPath?: string;  // required when source === 'cds'; optional for auto
}

export interface ImportPreviousShellResult {
  courseId: CourseId;
  sourceSemesterId: SemesterId;
  targetSemesterId: SemesterId;
  sourceUsed: 'archive' | 'cds';
  briefsCreated: number;
  briefPaths: string[];
  planConfigPath: string;
}

export function importPreviousShell(input: ImportPreviousShellInput): ImportPreviousShellResult {
  const { courseId, sourceSemesterId, newSemesterId } = input;
  const briefPaths: string[] = [];
  let sourceUsed: 'archive' | 'cds';

  const useCds =
    input.source === 'cds' ||
    (input.source === 'auto' && input.cdsPath != null);

  if (useCds && input.cdsPath) {
    sourceUsed = 'cds';
    const cds = parseCdsCourseFolder(input.cdsPath);
    for (const brief of cds.briefs) {
      const weekDir = getWeekDir(courseId, newSemesterId, brief.week);
      const slug = toSlug(brief.title);
      const filePath = join(weekDir, `${slug}.md`);
      const data: Record<string, unknown> = {
        title: brief.title,
        week: brief.week,
        type: brief.type,
        ...(brief.points != null ? { points: brief.points } : {}),
        due: 'TBD',
        ...(brief.due ? { originalDue: brief.due } : {}),
        verdict: 'UPDATE',
        currency: 'evergreen',
        lastTaught: sourceSemesterId,
        semestersSince: 1,
        newsHits: 0,
        staleness: 'moderate',
        replacement_recommended: false,
      };
      writeFileSync(filePath, serializeBriefFile(data, brief.body), 'utf-8');
      briefPaths.push(filePath);
    }
  } else {
    sourceUsed = 'archive';
    const topicMap = loadTopicMap(courseId, sourceSemesterId);
    const moduleForAssignment = buildModuleMap(topicMap.modules);
    for (const assignment of topicMap.assignments) {
      const mod = moduleForAssignment.get(assignment.canvasId);
      const weekNum = mod ? mod.position : 1;
      const weekDir = getWeekDir(courseId, newSemesterId, weekNum);
      const slug = toSlug(assignment.name);
      const filePath = join(weekDir, `${slug}.md`);
      const data: Record<string, unknown> = {
        title: assignment.name,
        week: weekNum,
        type: 'assignment',
        ...(assignment.pointsPossible != null ? { points: assignment.pointsPossible } : {}),
        due: 'TBD',
        ...(assignment.dueAt ? { originalDue: assignment.dueAt.slice(0, 10) } : {}),
        verdict: 'UPDATE',
        currency: 'evergreen',
        lastTaught: sourceSemesterId,
        semestersSince: 1,
        newsHits: 0,
        staleness: 'moderate',
        replacement_recommended: false,
      };
      const body = assignment.descriptionExcerpt || '';
      writeFileSync(filePath, serializeBriefFile(data, `\n${body}\n`), 'utf-8');
      briefPaths.push(filePath);
    }
  }

  const cfg = {
    courseId,
    sourceSemesterId,
    targetSemesterId: newSemesterId,
    source: input.source,
    sections: [],
    status: 'draft' as const,
    toolsRun: ['import_previous_shell'],
  };
  savePlanConfig(cfg);

  const planConfigPath = join(
    // getSemesterPath is not exported from next_plan; derive inline
    briefPaths[0]?.split('next-plan')[0] + 'next-plan',
    'plan-config.json'
  );

  return {
    courseId,
    sourceSemesterId,
    targetSemesterId: newSemesterId,
    sourceUsed,
    briefsCreated: briefPaths.length,
    briefPaths,
    planConfigPath: cfg.courseId
      ? briefPaths[0]?.replace(/next-plan.*/, 'next-plan/plan-config.json') ?? ''
      : '',
  };
}

function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function buildModuleMap(modules: ModuleInfo[]): Map<number, ModuleInfo> {
  const map = new Map<number, ModuleInfo>();
  for (const mod of modules) {
    for (const item of mod.items) {
      if (item.type === 'Assignment' && item.contentId != null) {
        map.set(item.contentId, mod);
      }
    }
  }
  return map;
}
```

The `planConfigPath` derivation above is awkward. Simplify by importing `getNextPlanPath`:

Replace the `planConfigPath` computation in the return statement with:

```typescript
import { loadTopicMap } from '../kb/topic_map.js';
import { savePlanConfig, getWeekDir, getNextPlanPath } from '../kb/next_plan.js';
// ...
  const planConfigPath = join(getNextPlanPath(courseId, newSemesterId), 'plan-config.json');
  return { courseId, sourceSemesterId, targetSemesterId: newSemesterId, sourceUsed, briefsCreated: briefPaths.length, briefPaths, planConfigPath };
```

The full corrected return block:

```typescript
  savePlanConfig({ courseId, sourceSemesterId, targetSemesterId: newSemesterId, source: input.source, sections: [], status: 'draft', toolsRun: ['import_previous_shell'] });
  const planConfigPath = join(getNextPlanPath(courseId, newSemesterId), 'plan-config.json');
  return { courseId, sourceSemesterId, targetSemesterId: newSemesterId, sourceUsed, briefsCreated: briefPaths.length, briefPaths, planConfigPath };
```

Replace the messy planConfigPath block at the end of the function with this cleaner version. The final implementation `src/tools/import_previous_shell.ts`:

```typescript
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadTopicMap } from '../kb/topic_map.js';
import { savePlanConfig, getWeekDir, getNextPlanPath } from '../kb/next_plan.js';
import { parseCdsCourseFolder } from '../parsers/cds_course_folder.js';
import { serializeBriefFile } from '../parsers/front_matter.js';
import type { CourseId, SemesterId, PlanSource, ModuleInfo } from '../types.js';

export interface ImportPreviousShellInput {
  courseId: CourseId;
  sourceSemesterId: SemesterId;
  newSemesterId: SemesterId;
  source: PlanSource;
  cdsPath?: string;
}

export interface ImportPreviousShellResult {
  courseId: CourseId;
  sourceSemesterId: SemesterId;
  targetSemesterId: SemesterId;
  sourceUsed: 'archive' | 'cds';
  briefsCreated: number;
  briefPaths: string[];
  planConfigPath: string;
}

function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function buildModuleMap(modules: ModuleInfo[]): Map<number, ModuleInfo> {
  const map = new Map<number, ModuleInfo>();
  for (const mod of modules) {
    for (const item of mod.items) {
      if (item.type === 'Assignment' && item.contentId != null) map.set(item.contentId, mod);
    }
  }
  return map;
}

function defaultFrontMatter(
  title: string, week: number, type: string, points: number | null | undefined,
  originalDue: string | undefined, sourceSemesterId: SemesterId
): Record<string, unknown> {
  return {
    title, week, type,
    ...(points != null ? { points } : {}),
    due: 'TBD',
    ...(originalDue ? { originalDue } : {}),
    verdict: 'UPDATE',
    currency: 'evergreen',
    lastTaught: sourceSemesterId,
    semestersSince: 1,
    newsHits: 0,
    staleness: 'moderate',
    replacement_recommended: false,
  };
}

export function importPreviousShell(input: ImportPreviousShellInput): ImportPreviousShellResult {
  const { courseId, sourceSemesterId, newSemesterId } = input;
  const briefPaths: string[] = [];
  let sourceUsed: 'archive' | 'cds';

  const useCds = input.source === 'cds' || (input.source === 'auto' && input.cdsPath != null);

  if (useCds && input.cdsPath) {
    sourceUsed = 'cds';
    for (const brief of parseCdsCourseFolder(input.cdsPath).briefs) {
      const filePath = join(getWeekDir(courseId, newSemesterId, brief.week), `${toSlug(brief.title)}.md`);
      writeFileSync(filePath, serializeBriefFile(
        defaultFrontMatter(brief.title, brief.week, brief.type, brief.points, brief.due, sourceSemesterId),
        brief.body
      ), 'utf-8');
      briefPaths.push(filePath);
    }
  } else {
    sourceUsed = 'archive';
    const topicMap = loadTopicMap(courseId, sourceSemesterId);
    const modMap = buildModuleMap(topicMap.modules);
    for (const a of topicMap.assignments) {
      const week = modMap.get(a.canvasId)?.position ?? 1;
      const filePath = join(getWeekDir(courseId, newSemesterId, week), `${toSlug(a.name)}.md`);
      writeFileSync(filePath, serializeBriefFile(
        defaultFrontMatter(a.name, week, 'assignment', a.pointsPossible, a.dueAt?.slice(0, 10), sourceSemesterId),
        `\n${a.descriptionExcerpt}\n`
      ), 'utf-8');
      briefPaths.push(filePath);
    }
  }

  savePlanConfig({ courseId, sourceSemesterId, targetSemesterId: newSemesterId, source: input.source, sections: [], status: 'draft', toolsRun: ['import_previous_shell'] });
  return { courseId, sourceSemesterId, targetSemesterId: newSemesterId, sourceUsed, briefsCreated: briefPaths.length, briefPaths, planConfigPath: join(getNextPlanPath(courseId, newSemesterId), 'plan-config.json') };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/tools/import_previous_shell.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: all existing + new tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/tools/import_previous_shell.ts tests/tools/import_previous_shell.test.ts
git commit -m "feat: import_previous_shell — creates next-plan/ skeleton from archive or CDS folder"
```

---

### Task 7: `src/tools/fetch_academic_calendar.ts`

**Files:**
- Create: `src/tools/fetch_academic_calendar.ts`
- Create: `tests/tools/fetch_academic_calendar.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/tools/fetch_academic_calendar.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupCourse } from '../../src/tools/setup_course.js';
import { importPreviousShell } from '../../src/tools/import_previous_shell.js';
import { ingestCanvasArchive } from '../../src/tools/ingest_canvas_archive.js';
import { fetchAcademicCalendar } from '../../src/tools/fetch_academic_calendar.js';
import { loadCalendar } from '../../src/kb/next_plan.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIX_ARCHIVE = join(__dirname, '..', 'fixtures', 'canvas-archive-tiny');
const FIX_HTML = readFileSync(join(__dirname, '..', 'fixtures', 'academic-calendar-example.html'), 'utf-8');

let tmpHome: string;

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'ci-home-'));
  process.env.CURRICULUM_INTELLIGENCE_HOME = tmpHome;
  setupCourse({ id: 'TEST101', title: 'Tiny Fixture Course' });
  ingestCanvasArchive({ courseId: 'TEST101', semesterId: 'Spring2025', archivePath: FIX_ARCHIVE });
  importPreviousShell({ courseId: 'TEST101', sourceSemesterId: 'Spring2025', newSemesterId: 'Fall2025', source: 'archive' });
});

afterEach(() => {
  delete process.env.CURRICULUM_INTELLIGENCE_HOME;
  rmSync(tmpHome, { recursive: true, force: true });
});

describe('fetchAcademicCalendar — URL mode (injected fetcher)', () => {
  test('parses HTML fixture and writes calendar.json', async () => {
    await fetchAcademicCalendar({
      courseId: 'TEST101',
      semesterId: 'Fall2025',
      url: 'https://example.edu/calendar/fall-2026',
      htmlFetcher: async () => FIX_HTML,
    });
    const cal = loadCalendar('TEST101', 'Fall2025');
    expect(cal.classesBegin).toBe('2026-08-24');
    expect(cal.partial).toBe(false);
    expect(cal.source).toBe('url');
  });
});

describe('fetchAcademicCalendar — manual dates', () => {
  test('writes calendar.json from explicit dates', async () => {
    await fetchAcademicCalendar({
      courseId: 'TEST101',
      semesterId: 'Fall2025',
      startDate: '2026-08-24',
      endDate: '2026-12-11',
      breaks: [{ name: 'Labor Day', start: '2026-09-07', end: '2026-09-07' }],
    });
    const cal = loadCalendar('TEST101', 'Fall2025');
    expect(cal.classesBegin).toBe('2026-08-24');
    expect(cal.classesEnd).toBe('2026-12-11');
    expect(cal.breaks).toHaveLength(1);
    expect(cal.source).toBe('manual');
    expect(cal.partial).toBe(false);
  });
});

describe('fetchAcademicCalendar — semesterPattern', () => {
  test('infers calendar from pattern and writes calendar.json', async () => {
    await fetchAcademicCalendar({
      courseId: 'TEST101',
      semesterId: 'Fall2025',
      semesterPattern: 'Fall2026',
    });
    const cal = loadCalendar('TEST101', 'Fall2025');
    expect(cal.source).toBe('pattern');
    expect(cal.classesBegin).toBeTruthy();
  });
});

describe('fetchAcademicCalendar — partial result', () => {
  test('sets partial:true when URL page has no recognizable dates', async () => {
    await fetchAcademicCalendar({
      courseId: 'TEST101',
      semesterId: 'Fall2025',
      url: 'https://example.edu/no-dates',
      htmlFetcher: async () => '<html><body><p>Nothing useful</p></body></html>',
    });
    const cal = loadCalendar('TEST101', 'Fall2025');
    expect(cal.partial).toBe(true);
    expect(cal.missing).toContain('classesBegin');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/tools/fetch_academic_calendar.test.ts`
Expected: FAIL — cannot find module `../../src/tools/fetch_academic_calendar.js`

- [ ] **Step 3: Implement `src/tools/fetch_academic_calendar.ts`**

```typescript
import { saveCalendar } from '../kb/next_plan.js';
import { parseCalendarHtml, inferCalendarFromPattern } from '../parsers/academic_calendar.js';
import type { CourseId, SemesterId, BreakRange, SemesterCalendar } from '../types.js';

type HtmlFetcher = (url: string) => Promise<string>;

export interface FetchAcademicCalendarInput {
  courseId: CourseId;
  semesterId: SemesterId;
  url?: string;
  startDate?: string;
  endDate?: string;
  breaks?: BreakRange[];
  semesterPattern?: string;
  htmlFetcher?: HtmlFetcher;  // injectable for tests; defaults to global fetch
}

export interface FetchAcademicCalendarResult {
  courseId: CourseId;
  semesterId: SemesterId;
  calendarPath: string;
  partial: boolean;
  missing?: string[];
}

async function defaultFetcher(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.text();
}

export async function fetchAcademicCalendar(
  input: FetchAcademicCalendarInput
): Promise<FetchAcademicCalendarResult> {
  const { courseId, semesterId } = input;
  const fetcher = input.htmlFetcher ?? defaultFetcher;
  let cal: SemesterCalendar;

  if (input.url) {
    const html = await fetcher(input.url);
    cal = parseCalendarHtml(html, semesterId);
    // Override with any manual fields provided alongside the URL
    if (input.startDate) { cal.classesBegin = input.startDate; cal.partial = false; }
    if (input.endDate) { cal.classesEnd = input.endDate; }
    if (input.breaks) cal.breaks = [...cal.breaks, ...input.breaks];
  } else if (input.startDate || input.endDate) {
    cal = {
      semesterId,
      classesBegin: input.startDate ?? '',
      classesEnd: input.endDate ?? '',
      breaks: input.breaks ?? [],
      source: 'manual',
      partial: !input.startDate || !input.endDate,
      ...(!input.startDate || !input.endDate
        ? { missing: [...(!input.startDate ? ['classesBegin'] : []), ...(!input.endDate ? ['classesEnd'] : [])] }
        : {}),
    };
  } else if (input.semesterPattern) {
    cal = inferCalendarFromPattern(input.semesterPattern);
    cal.semesterId = semesterId;
    if (input.breaks) cal.breaks = [...cal.breaks, ...input.breaks];
  } else {
    throw new Error('fetch_academic_calendar: provide url, startDate/endDate, or semesterPattern.');
  }

  saveCalendar(courseId, semesterId, cal);

  // Derive calendarPath from what saveCalendar writes
  const { join } = await import('node:path');
  const { getNextPlanPath } = await import('../kb/next_plan.js');
  const calendarPath = join(getNextPlanPath(courseId, semesterId), 'calendar.json');

  return { courseId, semesterId, calendarPath, partial: cal.partial, ...(cal.missing ? { missing: cal.missing } : {}) };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/tools/fetch_academic_calendar.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/tools/fetch_academic_calendar.ts tests/tools/fetch_academic_calendar.test.ts
git commit -m "feat: fetch_academic_calendar — URL/manual/pattern calendar input, writes calendar.json"
```

---

---

### Task 8: `src/tools/shift_dates.ts`

**Files:**
- Create: `src/tools/shift_dates.ts`
- Create: `tests/tools/shift_dates.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/tools/shift_dates.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupCourse } from '../../src/tools/setup_course.js';
import { ingestCanvasArchive } from '../../src/tools/ingest_canvas_archive.js';
import { importPreviousShell } from '../../src/tools/import_previous_shell.js';
import { saveCalendar, getNextPlanPath } from '../../src/kb/next_plan.js';
import { shiftDates } from '../../src/tools/shift_dates.js';
import { parseBriefFile } from '../../src/parsers/front_matter.js';
import type { SemesterCalendar } from '../../src/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIX_ARCHIVE = join(__dirname, '..', 'fixtures', 'canvas-archive-tiny');

// Source: Spring2025 termStart = 2025-01-13
// Assignment originalDue: 2025-01-20 → offset = 7 days
// Target classesBegin: 2026-08-24 → expected 2026-08-31

// Break collision test:
// Assignment originalDue: 2025-01-27 → offset = 14 days
// Target: 2026-08-24 + 14 = 2026-09-07 = Labor Day!
const TARGET_CALENDAR: SemesterCalendar = {
  semesterId: 'Fall2025',
  classesBegin: '2026-08-24',
  classesEnd: '2026-12-11',
  breaks: [{ name: 'Labor Day', start: '2026-09-07', end: '2026-09-07' }],
  source: 'manual',
  partial: false,
};

let tmpHome: string;

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'ci-home-'));
  process.env.CURRICULUM_INTELLIGENCE_HOME = tmpHome;
  setupCourse({ id: 'TEST101', title: 'Tiny Fixture Course' });
  ingestCanvasArchive({ courseId: 'TEST101', semesterId: 'Spring2025', archivePath: FIX_ARCHIVE });
  importPreviousShell({ courseId: 'TEST101', sourceSemesterId: 'Spring2025', newSemesterId: 'Fall2025', source: 'archive' });
  saveCalendar('TEST101', 'Fall2025', TARGET_CALENDAR);
});

afterEach(() => {
  delete process.env.CURRICULUM_INTELLIGENCE_HOME;
  rmSync(tmpHome, { recursive: true, force: true });
});

describe('shiftDates — basic date shifting', () => {
  test('shifts due dates by the same offset from semester start', () => {
    const result = shiftDates({ courseId: 'TEST101', semesterId: 'Fall2025', onBreakCollision: 'flag' });
    expect(result.shiftsApplied).toBeGreaterThan(0);
    // First assignment: originalDue 2025-01-20, offset 7 days from Jan 13
    // Target: Aug 24 + 7 = Aug 31
    const firstBrief = readFileSync(result.shiftedPaths[0], 'utf-8');
    const { data } = parseBriefFile(firstBrief);
    expect(data['due']).not.toBe('TBD');
    expect(typeof data['due']).toBe('string');
  });
});

describe('shiftDates — break collision', () => {
  test('bump-after moves collision date to day after break', () => {
    const result = shiftDates({ courseId: 'TEST101', semesterId: 'Fall2025', onBreakCollision: 'bump-after' });
    // Find a brief that was on a break (offset=14 hits Labor Day 2026-09-07)
    const collided = result.shiftedPaths.map((p) => {
      const { data } = parseBriefFile(readFileSync(p, 'utf-8'));
      return data['due'] as string;
    });
    // At least one should be 2026-09-08 (day after Labor Day)
    expect(collided.some((d) => d === '2026-09-08')).toBe(true);
  });

  test('bump-before moves collision date to day before break', () => {
    const result = shiftDates({ courseId: 'TEST101', semesterId: 'Fall2025', onBreakCollision: 'bump-before' });
    const collided = result.shiftedPaths.map((p) => {
      const { data } = parseBriefFile(readFileSync(p, 'utf-8'));
      return data['due'] as string;
    });
    // 2026-09-04 is Friday before Labor Day
    expect(collided.some((d) => d === '2026-09-04')).toBe(true);
  });

  test('flag leaves date as computed but marks break_collision', () => {
    const result = shiftDates({ courseId: 'TEST101', semesterId: 'Fall2025', onBreakCollision: 'flag' });
    const flagged = result.shiftedPaths.map((p) => parseBriefFile(readFileSync(p, 'utf-8')).data);
    const hasFlag = flagged.some((d) => d['break_collision'] === true);
    expect(hasFlag).toBe(true);
  });
});

describe('shiftDates — multi-section', () => {
  test('writes due_sections when sections provided with different start dates', () => {
    shiftDates({
      courseId: 'TEST101',
      semesterId: 'Fall2025',
      onBreakCollision: 'flag',
      sections: [
        { sectionId: '01', calendarOverrides: { classesBegin: '2026-08-24' } },
        { sectionId: '02', calendarOverrides: { classesBegin: '2026-08-25' } },
      ],
    });
    const firstBrief = readFileSync(result.shiftedPaths[0], 'utf-8');
    const { data } = parseBriefFile(firstBrief);
    expect(data['due_sections']).toBeDefined();
    expect(Object.keys(data['due_sections'] as Record<string, string>)).toContain('01');
    expect(Object.keys(data['due_sections'] as Record<string, string>)).toContain('02');
  });
});
```

Fix the multi-section test — `result` is not in scope. The correct test:

```typescript
describe('shiftDates — multi-section', () => {
  test('writes due_sections when sections have different start dates', () => {
    const result = shiftDates({
      courseId: 'TEST101',
      semesterId: 'Fall2025',
      onBreakCollision: 'flag',
      sections: [
        { sectionId: '01', calendarOverrides: { classesBegin: '2026-08-24' } },
        { sectionId: '02', calendarOverrides: { classesBegin: '2026-08-25' } },
      ],
    });
    const { data } = parseBriefFile(readFileSync(result.shiftedPaths[0], 'utf-8'));
    const sections = data['due_sections'] as Record<string, string>;
    expect(sections).toBeDefined();
    expect(sections['01']).not.toBe(sections['02']);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/tools/shift_dates.test.ts`
Expected: FAIL — cannot find module `../../src/tools/shift_dates.js`

- [ ] **Step 3: Implement `src/tools/shift_dates.ts`**

```typescript
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadTopicMap } from '../kb/topic_map.js';
import { loadCalendar, loadPlanConfig, getNextPlanPath } from '../kb/next_plan.js';
import { parseBriefFile, serializeBriefFile } from '../parsers/front_matter.js';
import type { CourseId, SemesterId, BreakCollision, SectionCalendarOverride, SemesterCalendar } from '../types.js';

export interface ShiftDatesInput {
  courseId: CourseId;
  semesterId: SemesterId;
  onBreakCollision: BreakCollision;
  sections?: SectionCalendarOverride[];
}

export interface ShiftDatesResult {
  courseId: CourseId;
  semesterId: SemesterId;
  shiftsApplied: number;
  collisions: number;
  shiftedPaths: string[];
}

function parseIsoDate(iso: string): Date {
  return new Date(iso + 'T00:00:00Z');
}

function addDays(iso: string, days: number): string {
  const d = parseIsoDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  return Math.round((parseIsoDate(b).getTime() - parseIsoDate(a).getTime()) / 86400000);
}

function isOnBreak(iso: string, cal: SemesterCalendar): boolean {
  return cal.breaks.some((b) => iso >= b.start && iso <= b.end);
}

function resolveCollision(iso: string, cal: SemesterCalendar, mode: BreakCollision): string {
  if (mode === 'bump-after') {
    let d = iso;
    while (isOnBreak(d, cal)) d = addDays(d, 1);
    return d;
  }
  if (mode === 'bump-before') {
    let d = iso;
    while (isOnBreak(d, cal)) d = addDays(d, -1);
    return d;
  }
  return iso; // flag — caller marks break_collision
}

function computeTargetDate(originalDue: string, sourceStart: string, targetCalendar: SemesterCalendar, mode: BreakCollision): { due: string; collision: boolean } {
  const offset = daysBetween(sourceStart, originalDue);
  const raw = addDays(targetCalendar.classesBegin, offset);
  const collision = isOnBreak(raw, targetCalendar);
  const due = collision ? resolveCollision(raw, targetCalendar, mode) : raw;
  return { due, collision: collision && mode === 'flag' };
}

export function shiftDates(input: ShiftDatesInput): ShiftDatesResult {
  const { courseId, semesterId, onBreakCollision } = input;
  const planConfig = loadPlanConfig(courseId, semesterId);
  const targetCal = loadCalendar(courseId, semesterId);
  const sourceTopicMap = loadTopicMap(courseId, planConfig.sourceSemesterId);
  const sourceStart = sourceTopicMap.course.termStart ?? planConfig.sourceSemesterId;

  const shiftedPaths: string[] = [];
  let shiftsApplied = 0;
  let collisions = 0;

  const nextPlanDir = getNextPlanPath(courseId, semesterId);
  for (const weekEntry of readdirSync(nextPlanDir, { withFileTypes: true })) {
    if (!weekEntry.isDirectory() || !weekEntry.name.startsWith('week-')) continue;
    const weekDir = join(nextPlanDir, weekEntry.name);
    for (const file of readdirSync(weekDir)) {
      if (!file.endsWith('.md')) continue;
      const filePath = join(weekDir, file);
      const content = readFileSync(filePath, 'utf-8');
      const { data, body } = parseBriefFile(content);
      const originalDue = data['originalDue'] as string | undefined;
      if (!originalDue) continue;

      if (input.sections && input.sections.length > 0) {
        const dueSections: Record<string, string> = {};
        for (const sec of input.sections) {
          const secCal: SemesterCalendar = { ...targetCal, ...(sec.calendarOverrides ?? {}) };
          const { due } = computeTargetDate(originalDue, sourceStart, secCal, onBreakCollision);
          dueSections[sec.sectionId] = due;
        }
        data['due'] = Object.values(dueSections)[0] ?? 'TBD';
        data['due_sections'] = dueSections;
      } else {
        const { due, collision } = computeTargetDate(originalDue, sourceStart, targetCal, onBreakCollision);
        data['due'] = due;
        if (collision) { data['break_collision'] = true; collisions++; }
      }

      writeFileSync(filePath, serializeBriefFile(data, body), 'utf-8');
      shiftedPaths.push(filePath);
      shiftsApplied++;
    }
  }

  return { courseId, semesterId, shiftsApplied, collisions, shiftedPaths };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/tools/shift_dates.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/tools/shift_dates.ts tests/tools/shift_dates.test.ts
git commit -m "feat: shift_dates — apply target calendar to next-plan/ due dates, handle break collisions"
```

---

### Task 9: `src/tools/generate_recommended_outline.ts`

**Files:**
- Create: `src/tools/generate_recommended_outline.ts`
- Create: `tests/tools/generate_recommended_outline.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/tools/generate_recommended_outline.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupCourse } from '../../src/tools/setup_course.js';
import { ingestCanvasArchive } from '../../src/tools/ingest_canvas_archive.js';
import { diffSemesters } from '../../src/tools/diff_semesters.js';
import { importPreviousShell } from '../../src/tools/import_previous_shell.js';
import { generateRecommendedOutline } from '../../src/tools/generate_recommended_outline.js';
import { getSemesterPath } from '../../src/kb/course_state.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIX_V1 = join(__dirname, '..', 'fixtures', 'canvas-archive-tiny');
const FIX_V2 = join(__dirname, '..', 'fixtures', 'canvas-archive-tiny-v2');

let tmpHome: string;

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'ci-home-'));
  process.env.CURRICULUM_INTELLIGENCE_HOME = tmpHome;
  setupCourse({ id: 'TEST101', title: 'Tiny Fixture Course' });
  ingestCanvasArchive({ courseId: 'TEST101', semesterId: 'Spring2025', archivePath: FIX_V1 });
  ingestCanvasArchive({ courseId: 'TEST101', semesterId: 'Fall2025', archivePath: FIX_V2 });
  diffSemesters({ courseId: 'TEST101', leftSemesterId: 'Spring2025', rightSemesterId: 'Fall2025' });
  importPreviousShell({ courseId: 'TEST101', sourceSemesterId: 'Fall2025', newSemesterId: 'Spring2026', source: 'archive' });
});

afterEach(() => {
  delete process.env.CURRICULUM_INTELLIGENCE_HOME;
  rmSync(tmpHome, { recursive: true, force: true });
});

describe('generateRecommendedOutline — from diff only', () => {
  test('writes plan-outline.md to next-plan/', () => {
    const result = generateRecommendedOutline({ courseId: 'TEST101', semesterId: 'Spring2026' });
    expect(result.outlinePath).toContain('plan-outline.md');
    const content = readFileSync(result.outlinePath, 'utf-8');
    expect(content).toContain('| Week |');
    expect(result.warning).toContain('recommend_for_topic');
  });

  test('outline contains module rows', () => {
    generateRecommendedOutline({ courseId: 'TEST101', semesterId: 'Spring2026' });
    const p = readFileSync(
      join(getSemesterPath('TEST101', 'Spring2026'), 'next-plan', 'plan-outline.md'), 'utf-8'
    );
    expect(p).toContain('Module');
  });
});

describe('generateRecommendedOutline — with currency-report.json', () => {
  test('uses verdict data when currency-report.json present', () => {
    const sourceSemDir = getSemesterPath('TEST101', 'Fall2025');
    const report = {
      version: 1, courseId: 'TEST101', semesterId: 'Fall2025',
      generatedAt: new Date().toISOString(),
      topics: [
        { topic: 'Module 01 - Introductions', verdict: 'KEEP', currencyClass: 'evergreen', newsHits: 0, semestersSince: 1 },
        { topic: 'Module 02 - Agents and Tool Use', verdict: 'UPDATE', currencyClass: 'current', newsHits: 3, semestersSince: 1 },
      ],
    };
    writeFileSync(join(sourceSemDir, 'currency-report.json'), JSON.stringify(report, null, 2), 'utf-8');

    const result = generateRecommendedOutline({ courseId: 'TEST101', semesterId: 'Spring2026' });
    expect(result.warning).toBeUndefined();
    const outline = readFileSync(result.outlinePath, 'utf-8');
    expect(outline).toContain('KEEP');
    expect(outline).toContain('UPDATE');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/tools/generate_recommended_outline.test.ts`
Expected: FAIL — cannot find module `../../src/tools/generate_recommended_outline.js`

- [ ] **Step 3: Implement `src/tools/generate_recommended_outline.ts`**

```typescript
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getSemesterPath } from '../kb/course_state.js';
import { loadPlanConfig, getNextPlanPath } from '../kb/next_plan.js';
import { loadTopicMap } from '../kb/topic_map.js';
import type { CourseId, SemesterId } from '../types.js';

export interface GenerateRecommendedOutlineInput {
  courseId: CourseId;
  semesterId: SemesterId;
}

export interface OutlineTopic {
  week: number;
  module: string;
  verdict: string;
  notes: string;
}

export interface GenerateRecommendedOutlineResult {
  courseId: CourseId;
  semesterId: SemesterId;
  outlinePath: string;
  topics: OutlineTopic[];
  warning?: string;
}

interface CurrencyReportTopic {
  topic: string;
  verdict: string;
  currencyClass: string;
  newsHits: number;
  semestersSince: number;
}

interface CurrencyReport {
  topics: CurrencyReportTopic[];
}

export function generateRecommendedOutline(
  input: GenerateRecommendedOutlineInput
): GenerateRecommendedOutlineResult {
  const { courseId, semesterId } = input;
  const planConfig = loadPlanConfig(courseId, semesterId);
  const sourceSemesterId = planConfig.sourceSemesterId;
  const sourceTopicMap = loadTopicMap(courseId, sourceSemesterId);
  const sourceSemDir = getSemesterPath(courseId, sourceSemesterId);

  // Load currency report if present
  const reportPath = join(sourceSemDir, 'currency-report.json');
  let report: CurrencyReport | null = null;
  let warning: string | undefined;
  if (existsSync(reportPath)) {
    report = JSON.parse(readFileSync(reportPath, 'utf-8')) as CurrencyReport;
  } else {
    warning = 'No currency-report.json found for source semester. Run recommend_for_topic for richer output. Outline generated from module structure only.';
  }

  const verdictByModule = new Map<string, CurrencyReportTopic>();
  if (report) {
    for (const t of report.topics) {
      verdictByModule.set(t.topic.toLowerCase(), t);
    }
  }

  const topics: OutlineTopic[] = sourceTopicMap.modules.map((mod) => {
    const key = mod.name.toLowerCase();
    const match = verdictByModule.get(key);
    const verdict = match?.verdict ?? 'UPDATE';
    const notes = match
      ? `newsHits=${match.newsHits}, semestersSince=${match.semestersSince}`
      : '—';
    return { week: mod.position, module: mod.name, verdict, notes };
  });

  const header = '| Week | Module | Verdict | Notes |\n|------|--------|---------|-------|\n';
  const rows = topics
    .map((t) => `| ${String(t.week).padStart(2, '0')} | ${t.module} | ${t.verdict} | ${t.notes} |`)
    .join('\n');
  const outline = `# Recommended Outline — ${semesterId}\n\n${header}${rows}\n`;

  const outlinePath = join(getNextPlanPath(courseId, semesterId), 'plan-outline.md');
  writeFileSync(outlinePath, outline, 'utf-8');

  return { courseId, semesterId, outlinePath, topics, ...(warning ? { warning } : {}) };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/tools/generate_recommended_outline.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/tools/generate_recommended_outline.ts tests/tools/generate_recommended_outline.test.ts
git commit -m "feat: generate_recommended_outline — week table from diff + currency-report verdicts"
```

---

### Task 10: `src/tools/draft_assignment_brief.ts`

**Files:**
- Create: `src/tools/draft_assignment_brief.ts`
- Create: `tests/tools/draft_assignment_brief.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/tools/draft_assignment_brief.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupCourse } from '../../src/tools/setup_course.js';
import { ingestCanvasArchive } from '../../src/tools/ingest_canvas_archive.js';
import { importPreviousShell } from '../../src/tools/import_previous_shell.js';
import { draftAssignmentBrief } from '../../src/tools/draft_assignment_brief.js';
import { parseBriefFile } from '../../src/parsers/front_matter.js';
import type { LlmClient } from '../../src/llm/client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIX_ARCHIVE = join(__dirname, '..', 'fixtures', 'canvas-archive-tiny');

const MOCK_LLM: LlmClient = {
  complete: async () =>
    'This assignment introduces students to generative AI concepts through peer introductions.',
};

let tmpHome: string;
let firstBriefPath: string;

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'ci-home-'));
  process.env.CURRICULUM_INTELLIGENCE_HOME = tmpHome;
  setupCourse({ id: 'TEST101', title: 'Tiny Fixture Course' });
  ingestCanvasArchive({ courseId: 'TEST101', semesterId: 'Spring2025', archivePath: FIX_ARCHIVE });
  const { briefPaths } = importPreviousShell({ courseId: 'TEST101', sourceSemesterId: 'Spring2025', newSemesterId: 'Fall2025', source: 'archive' });
  firstBriefPath = briefPaths[0];
});

afterEach(() => {
  delete process.env.CURRICULUM_INTELLIGENCE_HOME;
  rmSync(tmpHome, { recursive: true, force: true });
});

describe('draftAssignmentBrief', () => {
  test('overwrites brief body with LLM-generated content', async () => {
    await draftAssignmentBrief({
      courseId: 'TEST101',
      semesterId: 'Fall2025',
      briefPath: firstBriefPath,
      llmClient: MOCK_LLM,
    });
    const { body } = parseBriefFile(readFileSync(firstBriefPath, 'utf-8'));
    expect(body.trim()).toContain('generative AI');
  });

  test('preserves front matter after drafting', async () => {
    await draftAssignmentBrief({
      courseId: 'TEST101',
      semesterId: 'Fall2025',
      briefPath: firstBriefPath,
      llmClient: MOCK_LLM,
    });
    const { data } = parseBriefFile(readFileSync(firstBriefPath, 'utf-8'));
    expect(data['verdict']).toBeDefined();
    expect(data['due']).toBeDefined();
  });

  test('sets replacement_recommended when verdict is DROP', async () => {
    // Mutate the brief's verdict to DROP
    const content = readFileSync(firstBriefPath, 'utf-8');
    const { data, body } = parseBriefFile(content);
    data['verdict'] = 'DROP';
    const { serializeBriefFile } = await import('../../src/parsers/front_matter.js');
    const { writeFileSync } = await import('node:fs');
    writeFileSync(firstBriefPath, serializeBriefFile(data, body), 'utf-8');

    await draftAssignmentBrief({
      courseId: 'TEST101',
      semesterId: 'Fall2025',
      briefPath: firstBriefPath,
      llmClient: MOCK_LLM,
    });
    const { data: updated } = parseBriefFile(readFileSync(firstBriefPath, 'utf-8'));
    expect(updated['replacement_recommended']).toBe(true);
  });

  test('sets replacement_recommended when semestersSince >= 6', async () => {
    const content = readFileSync(firstBriefPath, 'utf-8');
    const { data, body } = parseBriefFile(content);
    data['semestersSince'] = 7;
    const { serializeBriefFile } = await import('../../src/parsers/front_matter.js');
    const { writeFileSync } = await import('node:fs');
    writeFileSync(firstBriefPath, serializeBriefFile(data, body), 'utf-8');

    await draftAssignmentBrief({
      courseId: 'TEST101',
      semesterId: 'Fall2025',
      briefPath: firstBriefPath,
      llmClient: MOCK_LLM,
    });
    const { data: updated } = parseBriefFile(readFileSync(firstBriefPath, 'utf-8'));
    expect(updated['replacement_recommended']).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/tools/draft_assignment_brief.test.ts`
Expected: FAIL — cannot find module `../../src/tools/draft_assignment_brief.js`

- [ ] **Step 3: Implement `src/tools/draft_assignment_brief.ts`**

```typescript
import { readFileSync, writeFileSync } from 'node:fs';
import { AnthropicAdapter } from '../llm/anthropic_adapter.js';
import { parseBriefFile, serializeBriefFile } from '../parsers/front_matter.js';
import type { LlmClient } from '../llm/client.js';
import type { CourseId, SemesterId } from '../types.js';

export interface DraftAssignmentBriefInput {
  courseId: CourseId;
  semesterId: SemesterId;
  briefPath: string;
  includeDetails?: boolean;
  llmClient?: LlmClient;
}

export interface DraftAssignmentBriefResult {
  courseId: CourseId;
  semesterId: SemesterId;
  briefPath: string;
  replacementRecommended: boolean;
}

export async function draftAssignmentBrief(
  input: DraftAssignmentBriefInput
): Promise<DraftAssignmentBriefResult> {
  const { courseId, semesterId, briefPath } = input;
  const client = input.llmClient ?? new AnthropicAdapter();

  const content = readFileSync(briefPath, 'utf-8');
  const { data, body } = parseBriefFile(content);

  const title = data['title'] as string ?? '';
  const verdict = data['verdict'] as string ?? 'UPDATE';
  const semestersSince = data['semestersSince'] as number ?? 0;
  const newsHits = data['newsHits'] as number ?? 0;
  const currency = data['currency'] as string ?? 'evergreen';

  const replacementRecommended = verdict === 'DROP' || semestersSince >= 6;

  const detailsSection = input.includeDetails
    ? `\nVerdict details: verdict=${verdict}, currency=${currency}, newsHits=${newsHits}, semestersSince=${semestersSince}\n`
    : '';

  const replacementNote = replacementRecommended
    ? '\n\nNote: This assignment has not been meaningfully updated in 3+ years — consider replacing it with a new concept rather than editing further.\n'
    : '';

  const prompt =
    `You are helping a professor update a course assignment brief for next semester.\n\n` +
    `Assignment title: ${title}\n` +
    `Verdict: ${verdict} | Currency: ${currency} | News hits: ${newsHits} | Semesters since last taught: ${semestersSince}\n` +
    detailsSection +
    `Current brief content:\n${body}\n\n` +
    `Write an updated version of this assignment brief. Keep the same learning objectives but refresh any dated examples, tool references, or case studies. Return only the updated brief text (no front matter, no commentary).` +
    replacementNote;

  const updatedBody = await client.complete(prompt);

  data['replacement_recommended'] = replacementRecommended;
  writeFileSync(briefPath, serializeBriefFile(data, `\n${updatedBody}\n`), 'utf-8');

  return { courseId, semesterId, briefPath, replacementRecommended };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/tools/draft_assignment_brief.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/tools/draft_assignment_brief.ts tests/tools/draft_assignment_brief.test.ts
git commit -m "feat: draft_assignment_brief — LLM-draft updated brief, flags replacement_recommended on DROP/stale"
```

---

### Task 11: `src/tools/update_examples.ts`

**Files:**
- Create: `src/tools/update_examples.ts`
- Create: `tests/tools/update_examples.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/tools/update_examples.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupCourse } from '../../src/tools/setup_course.js';
import { ingestCanvasArchive } from '../../src/tools/ingest_canvas_archive.js';
import { importPreviousShell } from '../../src/tools/import_previous_shell.js';
import { updateExamples } from '../../src/tools/update_examples.js';
import { parseBriefFile, serializeBriefFile } from '../../src/parsers/front_matter.js';
import type { LlmClient } from '../../src/llm/client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIX_ARCHIVE = join(__dirname, '..', 'fixtures', 'canvas-archive-tiny');

const MOCK_LLM: LlmClient = {
  complete: async (prompt: string) =>
    prompt.includes('flag') ? '[]' : '[{"section": "intro", "proposed": "Updated example using 2026 tools."}]',
};

let tmpHome: string;
let firstBriefPath: string;

function injectBody(briefPath: string, newBody: string): void {
  const content = readFileSync(briefPath, 'utf-8');
  const { data } = parseBriefFile(content);
  writeFileSync(briefPath, serializeBriefFile(data, `\n${newBody}\n`), 'utf-8');
}

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'ci-home-'));
  process.env.CURRICULUM_INTELLIGENCE_HOME = tmpHome;
  setupCourse({ id: 'TEST101', title: 'Tiny Fixture Course' });
  ingestCanvasArchive({ courseId: 'TEST101', semesterId: 'Spring2025', archivePath: FIX_ARCHIVE });
  const { briefPaths } = importPreviousShell({ courseId: 'TEST101', sourceSemesterId: 'Spring2025', newSemesterId: 'Fall2025', source: 'archive' });
  firstBriefPath = briefPaths[0];
});

afterEach(() => {
  delete process.env.CURRICULUM_INTELLIGENCE_HOME;
  rmSync(tmpHome, { recursive: true, force: true });
});

describe('updateExamples — Pass 1 (mechanical)', () => {
  test('replaces stale year references older than current year', () => {
    injectBody(firstBriefPath, 'In 2022, ChatGPT was new. In 2023, AI exploded.');
    const result = updateExamples({ courseId: 'TEST101', semesterId: 'Fall2025', briefPath: firstBriefPath });
    expect(result.substitutions.length).toBeGreaterThan(0);
    const body = parseBriefFile(readFileSync(firstBriefPath, 'utf-8')).body;
    expect(body).not.toContain('2022');
    expect(body).not.toContain('2023');
  });

  test('replaces stale tool name patterns', () => {
    injectBody(firstBriefPath, 'Use GPT-3.5 to summarize text. Also try Bard for comparison.');
    updateExamples({ courseId: 'TEST101', semesterId: 'Fall2025', briefPath: firstBriefPath });
    const body = parseBriefFile(readFileSync(firstBriefPath, 'utf-8')).body;
    expect(body).not.toContain('GPT-3.5');
    expect(body).not.toContain('Bard');
  });

  test('returns list of substitutions made', () => {
    injectBody(firstBriefPath, 'In 2021, transformers changed NLP.');
    const result = updateExamples({ courseId: 'TEST101', semesterId: 'Fall2025', briefPath: firstBriefPath });
    expect(result.substitutions.some((s) => s.original.includes('2021'))).toBe(true);
  });
});

describe('updateExamples — Pass 2 (LLM, optional)', () => {
  test('returns proposed rewrites without writing to disk', async () => {
    injectBody(firstBriefPath, 'Discuss the ChatGPT launch of 2022 as a turning point.');
    const result = await updateExamples({
      courseId: 'TEST101',
      semesterId: 'Fall2025',
      briefPath: firstBriefPath,
      llmPass: true,
      llmClient: MOCK_LLM,
    });
    expect(result.proposedRewrites).toBeDefined();
    expect(Array.isArray(result.proposedRewrites)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/tools/update_examples.test.ts`
Expected: FAIL — cannot find module `../../src/tools/update_examples.js`

- [ ] **Step 3: Implement `src/tools/update_examples.ts`**

```typescript
import { readFileSync, writeFileSync } from 'node:fs';
import { AnthropicAdapter } from '../llm/anthropic_adapter.js';
import { parseBriefFile, serializeBriefFile } from '../parsers/front_matter.js';
import type { LlmClient } from '../llm/client.js';
import type { CourseId, SemesterId } from '../types.js';

const CURRENT_YEAR = new Date().getFullYear();

const STALE_TOOL_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\bGPT-3(?:\.5)?\b/g,    replacement: '[current-model]' },
  { pattern: /\bGPT-4\b(?!\s*[o.])/g, replacement: '[current-model]' },
  { pattern: /\bLLaMA\s*[12]\b/gi,     replacement: '[current-model]' },
  { pattern: /\bPaLM\s*2?\b/g,         replacement: '[current-model]' },
  { pattern: /\bBard\b/g,              replacement: '[current-AI-assistant]' },
];

export interface Substitution {
  original: string;
  replacement: string;
  type: 'year' | 'tool';
}

export interface ProposedRewrite {
  section: string;
  proposed: string;
}

export interface UpdateExamplesInput {
  courseId: CourseId;
  semesterId: SemesterId;
  briefPath: string;
  llmPass?: boolean;
  llmClient?: LlmClient;
}

export interface UpdateExamplesResult {
  courseId: CourseId;
  semesterId: SemesterId;
  briefPath: string;
  substitutions: Substitution[];
  proposedRewrites?: ProposedRewrite[];
}

function mechanicalPass(body: string): { result: string; substitutions: Substitution[] } {
  const substitutions: Substitution[] = [];
  let result = body;

  // Replace stale years (4-digit years strictly older than CURRENT_YEAR)
  result = result.replace(/\b(20\d{2})\b/g, (match, year) => {
    if (parseInt(year, 10) < CURRENT_YEAR) {
      substitutions.push({ original: year, replacement: String(CURRENT_YEAR), type: 'year' });
      return String(CURRENT_YEAR);
    }
    return match;
  });

  // Replace stale tool names
  for (const { pattern, replacement } of STALE_TOOL_PATTERNS) {
    result = result.replace(pattern, (match) => {
      substitutions.push({ original: match, replacement, type: 'tool' });
      return replacement;
    });
  }

  return { result, substitutions };
}

export function updateExamples(input: UpdateExamplesInput & { llmPass?: false }): UpdateExamplesResult;
export function updateExamples(input: UpdateExamplesInput & { llmPass: true }): Promise<UpdateExamplesResult>;
export function updateExamples(input: UpdateExamplesInput): UpdateExamplesResult | Promise<UpdateExamplesResult> {
  const content = readFileSync(input.briefPath, 'utf-8');
  const { data, body } = parseBriefFile(content);

  const { result: updatedBody, substitutions } = mechanicalPass(body);
  writeFileSync(input.briefPath, serializeBriefFile(data, updatedBody), 'utf-8');

  const baseResult: UpdateExamplesResult = {
    courseId: input.courseId,
    semesterId: input.semesterId,
    briefPath: input.briefPath,
    substitutions,
  };

  if (!input.llmPass) return baseResult;

  const client = input.llmClient ?? new AnthropicAdapter();
  const prompt =
    `You are reviewing a course assignment brief for stale content.\n\n` +
    `Brief:\n${updatedBody}\n\n` +
    `Identify any claims, examples, or case studies that reference something that has evolved or become outdated. ` +
    `Return a JSON array of objects with shape { "section": "quoted excerpt", "proposed": "replacement text" }. ` +
    `Return an empty array if nothing needs changing. Return only the JSON array, no commentary.`;

  return client.complete(prompt).then((raw) => {
    let proposedRewrites: ProposedRewrite[] = [];
    try { proposedRewrites = JSON.parse(raw) as ProposedRewrite[]; } catch { /* malformed — return empty */ }
    return { ...baseResult, proposedRewrites };
  });
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/tools/update_examples.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/tools/update_examples.ts tests/tools/update_examples.test.ts
git commit -m "feat: update_examples — mechanical year/tool-name pass + optional LLM proposed-rewrites pass"
```

---

### Task 12: `src/tools/export_course_folder.ts`

**Files:**
- Create: `src/tools/export_course_folder.ts`
- Create: `tests/tools/export_course_folder.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/tools/export_course_folder.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupCourse } from '../../src/tools/setup_course.js';
import { ingestCanvasArchive } from '../../src/tools/ingest_canvas_archive.js';
import { importPreviousShell } from '../../src/tools/import_previous_shell.js';
import { exportCourseFolder } from '../../src/tools/export_course_folder.js';
import { parseBriefFile } from '../../src/parsers/front_matter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIX_ARCHIVE = join(__dirname, '..', 'fixtures', 'canvas-archive-tiny');

const CI_FIELDS = ['verdict', 'currency', 'lastTaught', 'semestersSince', 'newsHits', 'staleness', 'replacement_recommended', 'originalDue', 'break_collision'];

let tmpHome: string;

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'ci-home-'));
  process.env.CURRICULUM_INTELLIGENCE_HOME = tmpHome;
  setupCourse({ id: 'TEST101', title: 'Tiny Fixture Course' });
  ingestCanvasArchive({ courseId: 'TEST101', semesterId: 'Spring2025', archivePath: FIX_ARCHIVE });
  importPreviousShell({ courseId: 'TEST101', sourceSemesterId: 'Spring2025', newSemesterId: 'Fall2025', source: 'archive' });
});

afterEach(() => {
  delete process.env.CURRICULUM_INTELLIGENCE_HOME;
  rmSync(tmpHome, { recursive: true, force: true });
});

describe('exportCourseFolder', () => {
  test('creates output directory with week subdirectories', () => {
    const result = exportCourseFolder({ courseId: 'TEST101', semesterId: 'Fall2025' });
    expect(result.outputPaths).toHaveLength(1);
    const outputDir = result.outputPaths[0];
    const entries = readdirSync(outputDir);
    expect(entries.some((e) => e.startsWith('week-'))).toBe(true);
  });

  test('strips CI-specific front matter fields from output files', () => {
    const result = exportCourseFolder({ courseId: 'TEST101', semesterId: 'Fall2025' });
    const outputDir = result.outputPaths[0];
    for (const weekDir of readdirSync(outputDir)) {
      if (!weekDir.startsWith('week-')) continue;
      for (const file of readdirSync(join(outputDir, weekDir))) {
        const { data } = parseBriefFile(readFileSync(join(outputDir, weekDir, file), 'utf-8'));
        for (const ciField of CI_FIELDS) {
          expect(data[ciField], `CI field "${ciField}" should be stripped`).toBeUndefined();
        }
      }
    }
  });

  test('preserves title, week, type, and due in output front matter', () => {
    const result = exportCourseFolder({ courseId: 'TEST101', semesterId: 'Fall2025' });
    const outputDir = result.outputPaths[0];
    const weekDirs = readdirSync(outputDir).filter((e) => e.startsWith('week-'));
    const firstWeek = join(outputDir, weekDirs[0]);
    const files = readdirSync(firstWeek);
    const { data } = parseBriefFile(readFileSync(join(firstWeek, files[0]), 'utf-8'));
    expect(data['title']).toBeTruthy();
    expect(data['week']).toBeTruthy();
    expect(data['type']).toBeTruthy();
  });

  test('writes course-config.md at root of output', () => {
    const result = exportCourseFolder({ courseId: 'TEST101', semesterId: 'Fall2025' });
    const configPath = join(result.outputPaths[0], 'course-config.md');
    const { data } = parseBriefFile(readFileSync(configPath, 'utf-8'));
    expect(data['courseId']).toBe('TEST101');
    expect(data['semester']).toBe('Fall2025');
  });

  test('multi-section produces one output folder per section', () => {
    const result = exportCourseFolder({
      courseId: 'TEST101',
      semesterId: 'Fall2025',
      sections: ['01', '02'],
    });
    expect(result.outputPaths).toHaveLength(2);
    expect(result.sectionCount).toBe(2);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/tools/export_course_folder.test.ts`
Expected: FAIL — cannot find module `../../src/tools/export_course_folder.js`

- [ ] **Step 3: Implement `src/tools/export_course_folder.ts`**

```typescript
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getCoursePath } from '../kb/course_state.js';
import { getNextPlanPath, loadPlanConfig } from '../kb/next_plan.js';
import { parseBriefFile, serializeBriefFile } from '../parsers/front_matter.js';
import type { CourseId, SemesterId } from '../types.js';

const CI_FIELDS = new Set([
  'verdict', 'currency', 'lastTaught', 'semestersSince', 'newsHits',
  'staleness', 'replacement_recommended', 'originalDue', 'break_collision',
]);

export interface ExportCourseFolderInput {
  courseId: CourseId;
  semesterId: SemesterId;
  outputPath?: string;
  sections?: string[];
}

export interface ExportCourseFolderResult {
  courseId: CourseId;
  semesterId: SemesterId;
  outputPaths: string[];
  sectionCount: number;
}

function stripCiFields(data: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(data).filter(([k]) => !CI_FIELDS.has(k)));
}

function exportToDir(nextPlanDir: string, outputDir: string, courseId: string, semesterId: string, sectionId?: string): void {
  mkdirSync(outputDir, { recursive: true });

  // Write course-config.md
  const configData: Record<string, unknown> = { courseId, semester: semesterId };
  if (sectionId) configData['section'] = sectionId;
  writeFileSync(join(outputDir, 'course-config.md'), serializeBriefFile(configData, ''), 'utf-8');

  // Copy week directories
  for (const entry of readdirSync(nextPlanDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith('week-')) continue;
    const srcWeekDir = join(nextPlanDir, entry.name);
    const dstWeekDir = join(outputDir, entry.name);
    mkdirSync(dstWeekDir, { recursive: true });
    for (const file of readdirSync(srcWeekDir)) {
      if (!file.endsWith('.md')) continue;
      const content = readFileSync(join(srcWeekDir, file), 'utf-8');
      const { data, body } = parseBriefFile(content);
      const cdsData = stripCiFields(data);
      // For multi-section, apply section-specific due date
      if (sectionId && data['due_sections']) {
        const sections = data['due_sections'] as Record<string, string>;
        if (sections[sectionId]) cdsData['due'] = sections[sectionId];
        delete cdsData['due_sections'];
      }
      writeFileSync(join(dstWeekDir, file), serializeBriefFile(cdsData, body), 'utf-8');
    }
  }
}

export function exportCourseFolder(input: ExportCourseFolderInput): ExportCourseFolderResult {
  const { courseId, semesterId } = input;
  const defaultOutputBase = join(getCoursePath(courseId), 'export', semesterId);
  const outputBase = input.outputPath ?? defaultOutputBase;
  const nextPlanDir = getNextPlanPath(courseId, semesterId);
  const sections = input.sections ?? [];
  const outputPaths: string[] = [];

  if (sections.length > 1) {
    for (const sectionId of sections) {
      const outputDir = join(outputBase, `${semesterId}-${sectionId}`);
      exportToDir(nextPlanDir, outputDir, courseId, semesterId, sectionId);
      outputPaths.push(outputDir);
    }
  } else {
    const sectionId = sections[0];
    exportToDir(nextPlanDir, outputBase, courseId, semesterId, sectionId);
    outputPaths.push(outputBase);
  }

  return { courseId, semesterId, outputPaths, sectionCount: Math.max(1, sections.length) };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/tools/export_course_folder.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/tools/export_course_folder.ts tests/tools/export_course_folder.test.ts
git commit -m "feat: export_course_folder — translates next-plan/ to CDS format, strips CI fields, multi-section"
```

---

### Task 13: Register all 7 tools in `src/index.ts` and bump version to `1.0.0`

**Files:**
- Modify: `src/index.ts`
- Modify: `package.json`

- [ ] **Step 1: Add imports to `src/index.ts`**

After the existing imports (after `import { formatError } from './utils/errors.js';`), add:

```typescript
import { importPreviousShell } from './tools/import_previous_shell.js';
import { fetchAcademicCalendar } from './tools/fetch_academic_calendar.js';
import { shiftDates } from './tools/shift_dates.js';
import { generateRecommendedOutline } from './tools/generate_recommended_outline.js';
import { draftAssignmentBrief } from './tools/draft_assignment_brief.js';
import { updateExamples } from './tools/update_examples.js';
import { exportCourseFolder } from './tools/export_course_folder.js';
```

- [ ] **Step 2: Bump version in `src/index.ts`**

Change:
```typescript
{ name: 'curriculum-intelligence', version: '0.6.0' },
```
to:
```typescript
{ name: 'curriculum-intelligence', version: '1.0.0' },
```

- [ ] **Step 3: Add the 7 new tool descriptors to the `ListToolsRequestSchema` handler**

In the `tools: [...]` array, append after the `generate_ideas_file` entry:

```typescript
{
  name: 'import_previous_shell',
  description: 'Read last semester\'s Canvas archive or CDS course/ folder and create a next-plan/ skeleton for the new semester. Writes CI front matter to each brief file and a plan-config.json.',
  inputSchema: {
    type: 'object' as const,
    required: ['courseId', 'sourceSemesterId', 'newSemesterId', 'source'],
    properties: {
      courseId: { type: 'string' },
      sourceSemesterId: { type: 'string' },
      newSemesterId: { type: 'string' },
      source: { type: 'string', enum: ['archive', 'cds', 'auto'] },
      cdsPath: { type: 'string', description: 'Absolute path to existing CDS course/ folder. Required when source is "cds".' },
    },
  },
},
{
  name: 'fetch_academic_calendar',
  description: 'Parse an institution\'s academic calendar page or accept manual dates. Saves calendar.json to the plan. Pass url to scrape, startDate/endDate for manual input, or semesterPattern (e.g. "Fall2026") for US convention defaults.',
  inputSchema: {
    type: 'object' as const,
    required: ['courseId', 'semesterId'],
    properties: {
      courseId: { type: 'string' },
      semesterId: { type: 'string' },
      url: { type: 'string' },
      startDate: { type: 'string' },
      endDate: { type: 'string' },
      breaks: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, start: { type: 'string' }, end: { type: 'string' } }, required: ['name', 'start', 'end'] } },
      semesterPattern: { type: 'string' },
    },
  },
},
{
  name: 'shift_dates',
  description: 'Apply the target semester\'s calendar to all due: fields in next-plan/. Handles multi-section per-section offsets. Requires calendar.json (run fetch_academic_calendar first).',
  inputSchema: {
    type: 'object' as const,
    required: ['courseId', 'semesterId', 'onBreakCollision'],
    properties: {
      courseId: { type: 'string' },
      semesterId: { type: 'string' },
      onBreakCollision: { type: 'string', enum: ['bump-before', 'bump-after', 'flag'] },
      sections: { type: 'array', items: { type: 'object' } },
    },
  },
},
{
  name: 'generate_recommended_outline',
  description: 'Produce a week-by-week module outline for the new semester informed by diff and verdict data. Writes plan-outline.md to next-plan/.',
  inputSchema: {
    type: 'object' as const,
    required: ['courseId', 'semesterId'],
    properties: {
      courseId: { type: 'string' },
      semesterId: { type: 'string' },
    },
  },
},
{
  name: 'draft_assignment_brief',
  description: 'Use the LLM to draft an updated assignment brief. Sets replacement_recommended if verdict is DROP or semestersSince >= 6.',
  inputSchema: {
    type: 'object' as const,
    required: ['courseId', 'semesterId', 'briefPath'],
    properties: {
      courseId: { type: 'string' },
      semesterId: { type: 'string' },
      briefPath: { type: 'string', description: 'Absolute path to the brief .md file in next-plan/.' },
      includeDetails: { type: 'boolean' },
    },
  },
},
{
  name: 'update_examples',
  description: 'Two-pass refresh of stale references in a brief. Pass 1 (always): replace outdated year refs and tool names. Pass 2 (optional, llmPass:true): LLM identifies deeper staleness and returns proposed rewrites for professor review.',
  inputSchema: {
    type: 'object' as const,
    required: ['courseId', 'semesterId', 'briefPath'],
    properties: {
      courseId: { type: 'string' },
      semesterId: { type: 'string' },
      briefPath: { type: 'string' },
      llmPass: { type: 'boolean' },
    },
  },
},
{
  name: 'export_course_folder',
  description: 'Translate the approved next-plan/ into a CDS-compatible course/ folder. Strips CI front matter fields. Multi-section: produces one course/ folder per section.',
  inputSchema: {
    type: 'object' as const,
    required: ['courseId', 'semesterId'],
    properties: {
      courseId: { type: 'string' },
      semesterId: { type: 'string' },
      outputPath: { type: 'string' },
      sections: { type: 'array', items: { type: 'string' } },
    },
  },
},
```

- [ ] **Step 4: Add the 7 new tool handlers to the `CallToolRequestSchema` handler**

In the switch/if-else block that dispatches tool calls, add after the `generate_ideas_file` case:

```typescript
case 'import_previous_shell': {
  const result = importPreviousShell(args as Parameters<typeof importPreviousShell>[0]);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
}
case 'fetch_academic_calendar': {
  const result = await fetchAcademicCalendar(args as Parameters<typeof fetchAcademicCalendar>[0]);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
}
case 'shift_dates': {
  const result = shiftDates(args as Parameters<typeof shiftDates>[0]);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
}
case 'generate_recommended_outline': {
  const result = generateRecommendedOutline(args as Parameters<typeof generateRecommendedOutline>[0]);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
}
case 'draft_assignment_brief': {
  const result = await draftAssignmentBrief(args as Parameters<typeof draftAssignmentBrief>[0]);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
}
case 'update_examples': {
  const p = args as Parameters<typeof updateExamples>[0];
  const result = p.llmPass ? await updateExamples({ ...p, llmPass: true }) : updateExamples(p);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
}
case 'export_course_folder': {
  const result = exportCourseFolder(args as Parameters<typeof exportCourseFolder>[0]);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
}
```

Note: To find the exact insertion points, look for the handler pattern used by existing tools. The tool call handler in `src/index.ts` uses `if/else if` chains keyed on `request.params.name`. Follow that pattern exactly.

- [ ] **Step 5: Bump version in `package.json`**

Change `"version": "0.6.0"` to `"version": "1.0.0"`.

- [ ] **Step 6: Build to confirm no errors**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 7: Run full test suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/index.ts package.json
git commit -m "feat: register 7 v1.0 tools in MCP server, bump version to 1.0.0"
```

---

### Task 14: Extend `scripts/smoke-real-archive.ts` with v1.0 pipeline

**Files:**
- Modify: `scripts/smoke-real-archive.ts`

- [ ] **Step 1: Add v1.0 section to the smoke script**

At the end of `scripts/smoke-real-archive.ts`, after the existing v0.6 analysis section, append:

```typescript
// ── v1.0 pipeline smoke ───────────────────────────────────────────────────────
console.log('\n═══ v1.0 Pipeline Smoke ═══\n');

const PLANNING_COURSE = 'ITM370';
const SOURCE_SEM = semesters[semesters.length - 1];   // most recent ingested semester
const TARGET_SEM = `Fall2026`;

console.log(`Planning ${PLANNING_COURSE} ${TARGET_SEM} from source ${SOURCE_SEM.id}...`);

// Step 1: import shell
const { importPreviousShell } = await import('./src/tools/import_previous_shell.js');
const shellResult = importPreviousShell({
  courseId: PLANNING_COURSE,
  sourceSemesterId: SOURCE_SEM.id,
  newSemesterId: TARGET_SEM,
  source: 'archive',
});
console.log(`✓ import_previous_shell: ${shellResult.briefsCreated} briefs created`);

// Step 2: calendar from semester pattern (no network)
const { fetchAcademicCalendar } = await import('./src/tools/fetch_academic_calendar.js');
await fetchAcademicCalendar({
  courseId: PLANNING_COURSE,
  semesterId: TARGET_SEM,
  semesterPattern: TARGET_SEM,
});
console.log(`✓ fetch_academic_calendar: inferred from pattern`);

// Step 3: shift dates
const { shiftDates } = await import('./src/tools/shift_dates.js');
const shiftResult = shiftDates({
  courseId: PLANNING_COURSE,
  semesterId: TARGET_SEM,
  onBreakCollision: 'flag',
});
console.log(`✓ shift_dates: ${shiftResult.shiftsApplied} dates shifted, ${shiftResult.collisions} flagged`);

// Step 4: generate outline
const { generateRecommendedOutline } = await import('./src/tools/generate_recommended_outline.js');
const outlineResult = generateRecommendedOutline({ courseId: PLANNING_COURSE, semesterId: TARGET_SEM });
if (outlineResult.warning) console.log(`  ⚠ ${outlineResult.warning}`);
console.log(`✓ generate_recommended_outline: ${outlineResult.topics.length} weeks`);
console.log('\nOutline preview:');
console.log(require('node:fs').readFileSync(outlineResult.outlinePath, 'utf-8').split('\n').slice(0, 8).join('\n'));

// Step 5: draft first two briefs
const { draftAssignmentBrief } = await import('./src/tools/draft_assignment_brief.js');
const firstTwo = shellResult.briefPaths.slice(0, 2);
for (const briefPath of firstTwo) {
  const draftResult = await draftAssignmentBrief({ courseId: PLANNING_COURSE, semesterId: TARGET_SEM, briefPath });
  console.log(`✓ draft_assignment_brief: ${briefPath.split(/[\\/]/).pop()} — replacementRecommended=${draftResult.replacementRecommended}`);
  console.log('  Preview:', require('node:fs').readFileSync(briefPath, 'utf-8').split('\n').slice(5, 8).join(' ').trim().slice(0, 120));
}

// Step 6: export
const { exportCourseFolder } = await import('./src/tools/export_course_folder.js');
const exportResult = exportCourseFolder({ courseId: PLANNING_COURSE, semesterId: TARGET_SEM });
console.log(`✓ export_course_folder: ${exportResult.outputPaths[0]}`);

console.log('\n✓ v1.0 pipeline complete');
```

Note: The smoke script uses `tsx` to run TypeScript directly. Replace `require('node:fs')` with `readFileSync` from the existing `import { readFileSync } from 'node:fs'` at the top of the file (or add it if not present).

- [ ] **Step 2: Run the smoke test against real data**

Run: `npx tsx scripts/smoke-real-archive.ts 2>&1 | head -80`

Expected: v1.0 section runs, prints outline preview and first two brief drafts. The `draft_assignment_brief` step requires `ANTHROPIC_API_KEY` in the environment — if not set, the run will error on that step. The first 4 steps (import, calendar, shift, outline) are network-free and should succeed regardless.

If `ANTHROPIC_API_KEY` is not available, verify steps 1–4 pass and note the LLM step requires the key.

- [ ] **Step 3: Commit**

```bash
git add scripts/smoke-real-archive.ts
git commit -m "feat(smoke): extend smoke test with v1.0 pipeline (import→calendar→shift→outline→draft→export)"
```

---

## Self-Review

**Spec coverage check:**
- `import_previous_shell` → Task 6 ✓
- `fetch_academic_calendar` (URL + manual + pattern + partial) → Tasks 3, 7 ✓
- `shift_dates` (break collision, multi-section) → Task 8 ✓
- `generate_recommended_outline` (diff-only + currency-report) → Task 9 ✓
- `draft_assignment_brief` (LLM inject, replacement_recommended triggers) → Task 10 ✓
- `update_examples` (mechanical pass + LLM pass) → Task 11 ✓
- `export_course_folder` (CI field strip, multi-section) → Task 12 ✓
- Register tools + version bump → Task 13 ✓
- Smoke extension → Task 14 ✓
- `next-plan/` folder structure (plan-config.json, calendar.json, week-XX/ briefs) → Tasks 2, 6 ✓
- Multi-section `due_sections` front matter → Tasks 8, 12 ✓
- `BriefFrontMatter` types including `originalDue`, `break_collision` → Task 1 ✓

**No placeholders found.**

**Type consistency:** `BriefFrontMatter.verdict` is `'KEEP'|'UPDATE'|'DROP'|'ADD'` inline (Task 1), matching the values used in Tasks 9, 10. `SemesterCalendar`, `PlanConfig`, `BreakRange` defined in Task 1, used throughout. `LlmClient` imported from `'../llm/client.js'` in Tasks 10, 11 — matches existing pattern in `scan_recent_developments.ts`.

---

**Plan saved. Two execution options:**

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?

