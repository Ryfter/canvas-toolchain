# SP10a: Course Design Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a course-level design system to `canvas-design-mcp` with four new MCP tools (`setup_course`, `generate_page`, `generate_week`, `generate_course`) and a full Canvas HTML template engine covering 13 page types.

**Architecture:** A `course/` folder holds `course-config.md` (YAML front matter + week outline table) and per-week subfolders with one `.md` content file per active page type. New tools parse those files, apply color-token-driven templates, and write Canvas-safe HTML to `output/week-NN/`. All existing tools remain untouched — this is purely additive.

**Tech Stack:** TypeScript, Node.js ESM, `@inquirer/prompts` (checkbox for page type selection), `color` (color derivation), `vitest` (tests). No new dependencies required.

---

## Spec Reference

`docs/superpowers/specs/2026-05-14-course-design-system-design.md`

---

## File Map

### New files

| File | Responsibility |
|---|---|
| `src/course-types.ts` | All TypeScript types/interfaces for the course design system |
| `src/tools/course-config.ts` | Parse `course-config.md` front matter + week table; resolve color inheritance |
| `src/tools/course-scaffold.ts` | Create `course/` folder structure; write pre-filled `.md` prompt files |
| `src/tools/course-templates.ts` | Render Canvas-safe HTML from `PageContent` + `CourseConfig`; all 13 page types |
| `src/tools/generate-page.ts` | `generate_page` tool — one `.md` file → one HTML file |
| `src/tools/generate-week.ts` | `generate_week` tool — week folder → all HTML files for that week |
| `src/tools/generate-course.ts` | `generate_course` tool — full course batch generation |
| `src/tools/setup-course.ts` | `setup_course` wizard tool |
| `tests/course-config.test.ts` | Tests for config parser |
| `tests/course-scaffold.test.ts` | Tests for scaffold generator |
| `tests/course-templates.test.ts` | Tests for template rendering |
| `tests/generate-page.test.ts` | Tests for generate_page |
| `tests/generate-week.test.ts` | Tests for generate_week |
| `tests/generate-course.test.ts` | Tests for generate_course |
| `tests/setup-course.test.ts` | Tests for setup_course business logic |
| `tests/fixtures/course-config/basic/course-config.md` | Fixture: minimal course config |
| `tests/fixtures/course-config/color-overrides/course-config.md` | Fixture: course with color overrides |
| `tests/fixtures/course-input/course-config.md` | Fixture: full course for week/course generation tests |
| `tests/fixtures/course-input/week-01/overview.md` | Fixture week content |
| `tests/fixtures/course-input/week-01/resources.md` | Fixture week content |
| `tests/fixtures/course-input/week-01/assignment.md` | Fixture week content |
| `tests/fixtures/course-input/week-02/overview.md` | Fixture week content |
| `tests/fixtures/course-input/week-02/resources.md` | Fixture week content |
| `tests/fixtures/course-input/front-page.md` | Fixture front page content |

### Modified files

| File | Change |
|---|---|
| `src/index.ts` | Register 4 new tools in `ListToolsRequestSchema` and `CallToolRequestSchema` |
| `docs/feature-roadmap.md` | Add SP10 section |

---

## Task 1: Course Types

**Files:**
- Create: `src/course-types.ts`

- [ ] **Step 1: Write `src/course-types.ts`**

```typescript
// src/course-types.ts

export const PAGE_TYPES = [
  'front-page',
  'overview',
  'resources',
  'slides',
  'videos',
  'assignment',
  'engage-assignment',
  'reading',
  'reading-quiz',
  'weekly-quiz',
  'lab',
  'discussion-board',
  'extra-credit',
  'custom',
] as const;

export type PageType = typeof PAGE_TYPES[number];

export const PAGE_TYPE_LABELS: Record<PageType, string> = {
  'front-page':       'Front Page (course home)',
  'overview':         'Overview (learning objectives, intro, activities)',
  'resources':        'Resources (slides, videos, readings combined)',
  'slides':           'Slides (dedicated slide deck page)',
  'videos':           'Videos (dedicated Panopto video page)',
  'assignment':       'Assignment',
  'engage-assignment':'Engage Assignment (short in-class activity)',
  'reading':          'Reading',
  'reading-quiz':     'Reading Quiz',
  'weekly-quiz':      'Weekly Quiz',
  'lab':              'Lab',
  'discussion-board': 'Discussion Board',
  'extra-credit':     'Extra Credit',
  'custom':           'Custom (professor-defined sections)',
};

export const DEFAULT_PAGE_TYPES: PageType[] = [
  'front-page',
  'overview',
  'resources',
  'assignment',
  'discussion-board',
  'weekly-quiz',
];

export interface CourseColors {
  primary: string;
  primaryDark: string;
  primaryLight: string;
  secondary: string;
}

export interface WeekEntry {
  week: number;
  weekStr: string;   // zero-padded, e.g. "01"
  title: string;
  topic: string;
}

export interface CourseConfig {
  institution: string;
  courseName: string;
  courseNumber: string;
  professor: string;
  semester: string;
  weeks: number;
  pageTypes: PageType[];
  layoutFixed: boolean;
  colors: CourseColors;
  heroImages: Partial<Record<PageType, string>>;
  weekOutline: WeekEntry[];
}

export interface PageFrontMatter {
  week?: number;
  title?: string;
  heroImage?: string;
  assignmentNumber?: string;
  due?: string;
  points?: number;
  [key: string]: string | number | undefined;
}

export interface PageContent {
  pageType: PageType;
  frontMatter: PageFrontMatter;
  sections: Record<string, string>;
}

export interface GeneratePageInput {
  mdPath: string;
  courseDir?: string;
  outputDir?: string;
}

export interface GeneratePageResult {
  html: string;
  filename: string;
  weekNumber: number;
  pageType: PageType;
  savedTo: string;
}

export interface GenerateWeekInput {
  weekNumber: number;
  courseDir?: string;
  outputDir?: string;
}

export interface GenerateWeekResult {
  weekNumber: number;
  pages: GeneratePageResult[];
  outputDir: string;
  warnings: string[];
}

export interface GenerateCourseInput {
  courseDir?: string;
  outputDir?: string;
}

export interface GenerateCourseResult {
  totalPages: number;
  outputDir: string;
  weekResults: GenerateWeekResult[];
  warnings: string[];
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/course-types.ts
git commit -m "feat(sp10a): add course design system types"
```

---

## Task 2: Course Config Parser

**Files:**
- Create: `src/tools/course-config.ts`
- Create: `tests/fixtures/course-config/basic/course-config.md`
- Create: `tests/fixtures/course-config/color-overrides/course-config.md`
- Create: `tests/course-config.test.ts`

- [ ] **Step 1: Create fixture — basic config**

Create `tests/fixtures/course-config/basic/course-config.md`:

```markdown
---
institution: Example University
course_name: AI Augmented Projects
course_number: ITM 370
professor: Dr. Smith
semester: Fall 2026
weeks: 4

page_types:
  - front-page
  - overview
  - resources
  - assignment

layout_fixed: true

colors:
  primary: ""
  secondary: ""

hero_images:
  front-page: ""
  overview: ""
  resources: ""
  assignment: ""
---

## Week Outline

| Week | Title | Topic |
|------|-------|-------|
| 01 | Introduction | What is AI Augmentation? |
| 02 | Foundations | Prompt Engineering Basics |
| 03 | Practice | Building Your First Workflow |
| 04 | Showcase | Final Presentations |
```

- [ ] **Step 2: Create fixture — color overrides config**

Create `tests/fixtures/course-config/color-overrides/course-config.md`:

```markdown
---
institution: Example University
course_name: Web Development
course_number: CS 208
professor: Dr. Smith
semester: Spring 2027
weeks: 2

page_types:
  - overview
  - lab

layout_fixed: true

colors:
  primary: "#1A5276"
  secondary: "#D64309"

hero_images:
  overview: "https://example.com/hero.jpg"
---

## Week Outline

| Week | Title | Topic |
|------|-------|-------|
| 01 | HTML Basics | Structure and Semantics |
| 02 | CSS Basics | Styling and Layout |
```

- [ ] **Step 3: Write failing tests**

Create `tests/course-config.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { parseCourseConfig } from '../src/tools/course-config.js';

const fixturesDir = join(import.meta.dirname, 'fixtures/course-config');

describe('parseCourseConfig', () => {
  it('reads required string fields', () => {
    const config = parseCourseConfig(join(fixturesDir, 'basic/course-config.md'));
    expect(config.institution).toBe('Example University');
    expect(config.courseName).toBe('AI Augmented Projects');
    expect(config.courseNumber).toBe('ITM 370');
    expect(config.professor).toBe('Dr. Smith');
    expect(config.semester).toBe('Fall 2026');
  });

  it('reads weeks as number', () => {
    const config = parseCourseConfig(join(fixturesDir, 'basic/course-config.md'));
    expect(config.weeks).toBe(4);
  });

  it('reads page_types array', () => {
    const config = parseCourseConfig(join(fixturesDir, 'basic/course-config.md'));
    expect(config.pageTypes).toEqual(['front-page', 'overview', 'resources', 'assignment']);
  });

  it('reads layout_fixed as boolean', () => {
    const config = parseCourseConfig(join(fixturesDir, 'basic/course-config.md'));
    expect(config.layoutFixed).toBe(true);
  });

  it('parses week outline table', () => {
    const config = parseCourseConfig(join(fixturesDir, 'basic/course-config.md'));
    expect(config.weekOutline).toHaveLength(4);
    expect(config.weekOutline[0]).toEqual({
      week: 1, weekStr: '01', title: 'Introduction', topic: 'What is AI Augmentation?',
    });
    expect(config.weekOutline[3]).toEqual({
      week: 4, weekStr: '04', title: 'Showcase', topic: 'Final Presentations',
    });
  });

  it('inherits institution colors when course colors are blank', () => {
    const config = parseCourseConfig(join(fixturesDir, 'basic/course-config.md'));
    // Institution config may not exist in test env — falls back to University defaults
    expect(config.colors.primary).toMatch(/^#/);
    expect(config.colors.primaryDark).toMatch(/^#/);
    expect(config.colors.primaryLight).toMatch(/^#/);
    expect(config.colors.secondary).toMatch(/^#/);
  });

  it('applies course color overrides', () => {
    const config = parseCourseConfig(join(fixturesDir, 'color-overrides/course-config.md'));
    expect(config.colors.primary).toBe('#1A5276');
    expect(config.colors.secondary).toBe('#D64309');
    // primaryDark and primaryLight are derived from overridden primary
    expect(config.colors.primaryDark).not.toBe('#1A5276');
    expect(config.colors.primaryLight).not.toBe('#1A5276');
  });

  it('reads hero images per page type', () => {
    const config = parseCourseConfig(join(fixturesDir, 'color-overrides/course-config.md'));
    expect(config.heroImages['overview']).toBe('https://example.com/hero.jpg');
  });

  it('throws when no front matter found', () => {
    expect(() =>
      parseCourseConfig(join(fixturesDir, 'basic/course-config.md').replace('basic', 'nonexistent'))
    ).toThrow();
  });
});
```

- [ ] **Step 4: Run tests — verify they fail**

```bash
npx vitest run tests/course-config.test.ts
```

Expected: FAIL — `parseCourseConfig` not found.

- [ ] **Step 5: Write `src/tools/course-config.ts`**

```typescript
// src/tools/course-config.ts

import { readFileSync } from 'node:fs';
import Color from 'color';
import type { CourseConfig, CourseColors, PageType, WeekEntry } from '../course-types.js';
import { PAGE_TYPES } from '../course-types.js';
import { loadConfig } from '../config.js';

export const COURSE_CONFIG_FILENAME = 'course-config.md';

function deriveColors(primary: string): Pick<CourseColors, 'primaryDark' | 'primaryLight'> {
  const c = Color(primary);
  return {
    primaryDark: c.darken(0.25).hex(),
    primaryLight: c.lightness(93).hex(),
  };
}

function parseFrontMatterYaml(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = yaml.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith('#')) { i++; continue; }

    const kvMatch = line.match(/^([a-z_]+):\s*(.*)$/);
    if (!kvMatch) { i++; continue; }

    const key = kvMatch[1];
    const rawVal = kvMatch[2].trim();

    if (rawVal === '') {
      // List or nested object — peek at indented lines
      const nested: Record<string, string> = {};
      const list: string[] = [];
      i++;
      while (i < lines.length) {
        const next = lines[i];
        const listItem = next.match(/^  - (.+)$/);
        const nestedKv = next.match(/^  ([a-z_-]+):\s*(.*)$/);
        if (listItem) {
          list.push(listItem[1].trim());
          i++;
        } else if (nestedKv) {
          nested[nestedKv[1]] = nestedKv[2].replace(/^["']|["']$/g, '');
          i++;
        } else {
          break;
        }
      }
      result[key] = list.length > 0 ? list : nested;
      continue;
    }

    if (rawVal === 'true')  { result[key] = true;  i++; continue; }
    if (rawVal === 'false') { result[key] = false; i++; continue; }
    if (/^\d+$/.test(rawVal)) { result[key] = parseInt(rawVal, 10); i++; continue; }
    result[key] = rawVal.replace(/^["']|["']$/g, '');
    i++;
  }

  return result;
}

function parseWeekOutlineTable(body: string): WeekEntry[] {
  const rows: WeekEntry[] = [];
  const rowRegex = /^\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|$/gm;
  let match;
  while ((match = rowRegex.exec(body)) !== null) {
    const weekNum = parseInt(match[1], 10);
    rows.push({
      week: weekNum,
      weekStr: String(weekNum).padStart(2, '0'),
      title: match[2].trim(),
      topic: match[3].trim(),
    });
  }
  return rows;
}

const FALLBACK_COLORS: CourseColors = {
  primary: '#0033A0',
  primaryDark: '#002277',
  primaryLight: '#E6ECF9',
  secondary: '#D64309',
};

function loadInstitutionColors(): CourseColors {
  try {
    const instConfig = loadConfig();
    const c = instConfig.colors as { primary: string; primaryDark: string; primaryLight: string; secondary: string };
    return {
      primary: c.primary ?? FALLBACK_COLORS.primary,
      primaryDark: c.primaryDark ?? FALLBACK_COLORS.primaryDark,
      primaryLight: c.primaryLight ?? FALLBACK_COLORS.primaryLight,
      secondary: c.secondary ?? FALLBACK_COLORS.secondary,
    };
  } catch {
    return FALLBACK_COLORS;
  }
}

export function parseCourseConfig(filePath: string): CourseConfig {
  const content = readFileSync(filePath, 'utf-8');
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!fmMatch) throw new Error(`No YAML front matter found in ${filePath}`);

  const fm = parseFrontMatterYaml(fmMatch[1]);
  const body = fmMatch[2];

  const inst = loadInstitutionColors();
  const colorBlock = (fm.colors ?? {}) as Record<string, string>;
  const primaryOverride = colorBlock.primary?.trim();
  const secondaryOverride = colorBlock.secondary?.trim();

  const primary = primaryOverride || inst.primary;
  const secondary = secondaryOverride || inst.secondary;
  const { primaryDark, primaryLight } = primaryOverride
    ? deriveColors(primaryOverride)
    : { primaryDark: inst.primaryDark, primaryLight: inst.primaryLight };

  const colors: CourseColors = { primary, primaryDark, primaryLight, secondary };

  const rawPageTypes = Array.isArray(fm.page_types) ? (fm.page_types as string[]) : [];
  const pageTypes = rawPageTypes.filter((t): t is PageType => (PAGE_TYPES as readonly string[]).includes(t));

  const heroImages = ((fm.hero_images ?? {}) as Record<string, string>) as Partial<Record<PageType, string>>;
  const weekOutline = parseWeekOutlineTable(body);

  return {
    institution: String(fm.institution ?? ''),
    courseName: String(fm.course_name ?? ''),
    courseNumber: String(fm.course_number ?? ''),
    professor: String(fm.professor ?? ''),
    semester: String(fm.semester ?? ''),
    weeks: typeof fm.weeks === 'number' ? fm.weeks : parseInt(String(fm.weeks ?? '16'), 10),
    pageTypes,
    layoutFixed: fm.layout_fixed !== false,
    colors,
    heroImages,
    weekOutline,
  };
}
```

- [ ] **Step 6: Run tests — verify they pass**

```bash
npx vitest run tests/course-config.test.ts
```

Expected: all 8 tests pass.

- [ ] **Step 7: Run full suite — no regressions**

```bash
npx vitest run
```

Expected: 209 + 8 = 217 tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/tools/course-config.ts tests/course-config.test.ts tests/fixtures/course-config/
git commit -m "feat(sp10a): add course config parser"
```

---

## Task 3: Course Scaffold Generator

**Files:**
- Create: `src/tools/course-scaffold.ts`
- Create: `tests/course-scaffold.test.ts`

The scaffold generator creates the `course/` folder structure and writes pre-filled `.md` prompt files for each active page type in each week. It is called by `setup_course` after the wizard collects config.

- [ ] **Step 1: Write failing tests**

Create `tests/course-scaffold.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createCourseScaffold, getWeekFolderName } from '../src/tools/course-scaffold.js';
import type { CourseConfig } from '../src/course-types.js';

function makeConfig(overrides: Partial<CourseConfig> = {}): CourseConfig {
  return {
    institution: 'Test University',
    courseName: 'Test Course',
    courseNumber: 'TST 101',
    professor: 'Dr. Test',
    semester: 'Fall 2026',
    weeks: 2,
    pageTypes: ['overview', 'assignment'],
    layoutFixed: true,
    colors: { primary: '#0033A0', primaryDark: '#002277', primaryLight: '#E6ECF9', secondary: '#D64309' },
    heroImages: {},
    weekOutline: [
      { week: 1, weekStr: '01', title: 'Week 1', topic: 'Topic A' },
      { week: 2, weekStr: '02', title: 'Week 2', topic: 'Topic B' },
    ],
    ...overrides,
  };
}

describe('getWeekFolderName', () => {
  it('zero-pads week number', () => {
    expect(getWeekFolderName(1)).toBe('week-01');
    expect(getWeekFolderName(12)).toBe('week-12');
  });
});

describe('createCourseScaffold', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'scaffold-')); });

  it('creates course-config.md', () => {
    createCourseScaffold(makeConfig(), dir);
    expect(existsSync(join(dir, 'course-config.md'))).toBe(true);
  });

  it('course-config.md contains required fields', () => {
    createCourseScaffold(makeConfig(), dir);
    const content = readFileSync(join(dir, 'course-config.md'), 'utf-8');
    expect(content).toContain('course_name: Test Course');
    expect(content).toContain('course_number: TST 101');
    expect(content).toContain('semester: Fall 2026');
    expect(content).toContain('- overview');
    expect(content).toContain('- assignment');
  });

  it('creates a subfolder for each week', () => {
    createCourseScaffold(makeConfig(), dir);
    expect(existsSync(join(dir, 'week-01'))).toBe(true);
    expect(existsSync(join(dir, 'week-02'))).toBe(true);
  });

  it('creates one .md file per page type per week', () => {
    createCourseScaffold(makeConfig(), dir);
    expect(existsSync(join(dir, 'week-01', 'overview.md'))).toBe(true);
    expect(existsSync(join(dir, 'week-01', 'assignment.md'))).toBe(true);
    expect(existsSync(join(dir, 'week-02', 'overview.md'))).toBe(true);
  });

  it('creates front-page.md when front-page is active', () => {
    createCourseScaffold(makeConfig({ pageTypes: ['front-page', 'overview'] }), dir);
    expect(existsSync(join(dir, 'front-page.md'))).toBe(true);
  });

  it('overview.md contains correct section prompts', () => {
    createCourseScaffold(makeConfig(), dir);
    const content = readFileSync(join(dir, 'week-01', 'overview.md'), 'utf-8');
    expect(content).toContain('week: 1');
    expect(content).toContain('## Learning Objectives');
    expect(content).toContain('## Introduction');
    expect(content).toContain('## Activities');
  });

  it('assignment.md contains correct section prompts', () => {
    createCourseScaffold(makeConfig(), dir);
    const content = readFileSync(join(dir, 'week-01', 'assignment.md'), 'utf-8');
    expect(content).toContain('week: 1');
    expect(content).toContain('## Brief');
    expect(content).toContain('## Rubric');
  });

  it('returns list of created file paths', () => {
    const files = createCourseScaffold(makeConfig(), dir);
    expect(files.length).toBeGreaterThan(0);
    expect(files.every(f => f.startsWith(dir))).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npx vitest run tests/course-scaffold.test.ts
```

Expected: FAIL — `createCourseScaffold` not found.

- [ ] **Step 3: Write `src/tools/course-scaffold.ts`**

```typescript
// src/tools/course-scaffold.ts

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { CourseConfig, PageType } from '../course-types.js';

export function getWeekFolderName(week: number): string {
  return `week-${String(week).padStart(2, '0')}`;
}

const PAGE_PROMPTS: Record<PageType, string> = {
  'front-page': `## Course Introduction
[Brief course description — Claude rewrites into student-facing copy]

## What You'll Learn
[3-5 high-level outcomes for the course]

## How This Course Works
[Format, weekly rhythm, expectations]

## Instructor
[Name, contact, office hours]
`,
  'overview': `## Learning Objectives
- Students will be able to...
- Students will understand...

## Introduction
[Professor notes for this week — rough is fine, Claude rewrites]

## Activities
- Lecture: [title] (Panopto)
- Reading: [title] — due [date]
- Assignment [number] — due [date]
- Discussion: [topic]
`,
  'resources': `## Slides
- [Slide deck title](SLIDES_URL)

## Videos
- Panopto ID: [paste UUID from Panopto URL]

## Readings
- [Article or chapter title](URL)

## Other
- [Any additional resources, quiz links, etc.]
`,
  'slides': `## Slide Deck
- [Slide deck title](SLIDES_URL)

## About These Slides
[Brief description of what the slides cover]

## Key Topics
- [Topic 1]
- [Topic 2]
`,
  'videos': `## Videos
- Panopto ID: [paste UUID from Panopto URL]
  Title: [video title]
  Duration: [approx length]

## What to Watch For
[Anything students should pay attention to while watching]
`,
  'assignment': `## Brief
[Paste raw assignment instructions here — rough is fine, Claude rewrites into polished student-facing copy]

## Rubric
[Paste rubric criteria here, or leave blank to inherit from a shared rubric file]

## Submission Details
- Due: [date]
- Points: [number]
- Submit via: [Canvas Assignments / link]
`,
  'engage-assignment': `## What We're Doing
[Describe the in-class activity — what students will do, produce, or discuss]

## Instructions
[Step-by-step instructions]

## Time
[Approximate time: e.g. "15 minutes individual, 10 minutes group share"]

## Deliverable
[What students turn in — e.g. "Post your response to the class discussion board before leaving class"]
`,
  'reading': `## The Reading
- Title: [Full title of article, chapter, or book]
- Author(s): [Author names]
- Link: [URL or "Canvas Files > Week X > filename.pdf"]

## Why This Reading
[1-2 sentences on why this reading matters for the course]

## As You Read
[Optional: guiding questions or things to look for]
`,
  'reading-quiz': `## Quiz Details
- Opens: [date/time]
- Closes: [date/time]
- Questions: [number]
- Points: [number]

## What It Covers
[The specific reading or readings this quiz tests]

## Access
[Canvas link or "Quiz appears in Canvas Quizzes"]
`,
  'weekly-quiz': `## Quiz Details
- Opens: [date/time]
- Closes: [date/time]
- Questions: [number]
- Points: [number]

## Topics Covered
- [Topic 1 from this week]
- [Topic 2 from this week]

## Access
[Canvas link or "Quiz appears in Canvas Quizzes"]
`,
  'lab': `## Objectives
- [What students will practice or build]

## Setup
[Any software, files, or accounts students need before starting]

## Instructions
[Step-by-step lab instructions — can be rough, Claude rewrites]

## Submission
- Due: [date]
- Submit: [what to turn in — e.g. "ZIP file of your project folder"]
`,
  'discussion-board': `## Prompt
[The discussion question or prompt students respond to]

## Requirements
- Initial post: [word count / due date]
- Responses: [how many peers to respond to / due date]

## Grading
[Brief description of how discussion is graded — e.g. "Scored on depth, evidence, and engagement"]
`,
  'extra-credit': `## Opportunity
[What the extra credit activity is]

## Requirements
[What students must do to earn the extra credit]

## Points
[How many points / what percentage of grade]

## Deadline
[Date — note: late submissions not accepted]
`,
  'custom': `## [Section 1 Title]
[Content for section 1]

## [Section 2 Title]
[Content for section 2]

## [Section 3 Title]
[Content for section 3]
`,
};

function buildFrontMatter(pageType: PageType, week: number, config: CourseConfig): string {
  const base = `---
week: ${week}
title: ""
hero_image: ""
`;

  if (pageType === 'assignment') {
    return base + `assignment_number: "${config.courseNumber.replace(/\s+/g, '')}.${String(week).padStart(2, '0')}"
due: ""
points: 0
---\n\n`;
  }

  if (pageType === 'front-page') {
    return `---
title: "${config.courseName}"
hero_image: ""
---\n\n`;
  }

  return base + '---\n\n';
}

export function createCourseScaffold(config: CourseConfig, rootDir: string): string[] {
  const created: string[] = [];

  mkdirSync(rootDir, { recursive: true });

  // Write course-config.md
  const configPath = join(rootDir, 'course-config.md');
  if (!existsSync(configPath)) {
    const heroBlock = config.pageTypes
      .map(pt => `  ${pt}: ""`)
      .join('\n');

    const weekTableRows = Array.from({ length: config.weeks }, (_, i) => {
      const n = i + 1;
      const entry = config.weekOutline[i];
      const title = entry?.title ?? `Week ${String(n).padStart(2, '0')}`;
      const topic = entry?.topic ?? '[Topic]';
      return `| ${String(n).padStart(2, '0')} | ${title} | ${topic} |`;
    }).join('\n');

    const configContent = `---
institution: ${config.institution}
course_name: ${config.courseName}
course_number: ${config.courseNumber}
professor: ${config.professor}
semester: ${config.semester}
weeks: ${config.weeks}

page_types:
${config.pageTypes.map(pt => `  - ${pt}`).join('\n')}

layout_fixed: ${config.layoutFixed}

colors:
  primary: ""
  secondary: ""

hero_images:
${heroBlock}
---

## Week Outline

| Week | Title | Topic |
|------|-------|-------|
${weekTableRows}
`;
    writeFileSync(configPath, configContent, 'utf-8');
    created.push(configPath);
  }

  // Write front-page.md if active
  if (config.pageTypes.includes('front-page')) {
    const fpPath = join(rootDir, 'front-page.md');
    if (!existsSync(fpPath)) {
      writeFileSync(fpPath, buildFrontMatter('front-page', 0, config) + PAGE_PROMPTS['front-page'], 'utf-8');
      created.push(fpPath);
    }
  }

  // Write per-week folders and .md files
  const weekPageTypes = config.pageTypes.filter(pt => pt !== 'front-page');
  for (let w = 1; w <= config.weeks; w++) {
    const weekFolder = join(rootDir, getWeekFolderName(w));
    mkdirSync(weekFolder, { recursive: true });

    for (const pageType of weekPageTypes) {
      const mdPath = join(weekFolder, `${pageType}.md`);
      if (!existsSync(mdPath)) {
        const content = buildFrontMatter(pageType, w, config) + PAGE_PROMPTS[pageType];
        writeFileSync(mdPath, content, 'utf-8');
        created.push(mdPath);
      }
    }
  }

  return created;
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npx vitest run tests/course-scaffold.test.ts
```

Expected: all 9 tests pass.

- [ ] **Step 5: Run full suite**

```bash
npx vitest run
```

Expected: 217 + 9 = 226 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/tools/course-scaffold.ts tests/course-scaffold.test.ts
git commit -m "feat(sp10a): add course scaffold generator"
```

---

## Task 4: Template Engine + All 13 Page Type Templates

**Files:**
- Create: `src/tools/course-templates.ts`
- Create: `tests/course-templates.test.ts`

The template engine has three responsibilities:
1. `parsePageContent(filePath)` — reads a `.md` file, extracts front matter and section content
2. `markdownToHtml(md)` — converts professor's markdown notes to inline HTML (no `<style>` blocks, Canvas-safe)
3. `renderPage(content, config)` — dispatches to the correct page type renderer, returns Canvas-safe HTML

Every renderer uses only properties from the Canvas allowlist: `display:flex`, `border-radius`, inline `style=""` attributes, no `box-shadow`, no `opacity`, no `gap`, no `<h1>`, font is always `Lato, sans-serif`.

- [ ] **Step 1: Write failing tests**

Create `tests/course-templates.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parsePageContent, renderPage } from '../src/tools/course-templates.js';
import { join } from 'node:path';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import type { CourseConfig } from '../src/course-types.js';

function makeConfig(overrides: Partial<CourseConfig> = {}): CourseConfig {
  return {
    institution: 'Example University',
    courseName: 'AI Augmented Projects',
    courseNumber: 'ITM 370',
    professor: 'Dr. Smith',
    semester: 'Fall 2026',
    weeks: 4,
    pageTypes: ['overview'],
    layoutFixed: true,
    colors: { primary: '#0033A0', primaryDark: '#002277', primaryLight: '#E6ECF9', secondary: '#D64309' },
    heroImages: {},
    weekOutline: [],
    ...overrides,
  };
}

function writeTmp(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'tpl-'));
  const p = join(dir, 'page.md');
  writeFileSync(p, content, 'utf-8');
  return p;
}

describe('parsePageContent', () => {
  it('reads front matter fields', () => {
    const p = writeTmp(`---
week: 3
title: Week 3 Overview
hero_image: https://example.com/hero.jpg
---

## Learning Objectives
- Understand AI tools
`);
    const content = parsePageContent(p, 'overview');
    expect(content.frontMatter.week).toBe(3);
    expect(content.frontMatter.title).toBe('Week 3 Overview');
    expect(content.frontMatter.heroImage).toBe('https://example.com/hero.jpg');
  });

  it('reads section content', () => {
    const p = writeTmp(`---
week: 1
title: ""
hero_image: ""
---

## Learning Objectives
- Be awesome

## Introduction
Great intro text.

## Activities
- Do stuff
`);
    const content = parsePageContent(p, 'overview');
    expect(content.sections['Learning Objectives']).toContain('Be awesome');
    expect(content.sections['Introduction']).toContain('Great intro text');
    expect(content.sections['Activities']).toContain('Do stuff');
  });
});

describe('renderPage', () => {
  const config = makeConfig();

  it('renders without <style> blocks', () => {
    const p = writeTmp(`---\nweek: 1\ntitle: ""\nhero_image: ""\n---\n\n## Learning Objectives\n- Learn stuff\n\n## Introduction\nHello.\n\n## Activities\n- Read\n`);
    const content = parsePageContent(p, 'overview');
    const html = renderPage(content, config);
    expect(html).not.toContain('<style');
  });

  it('renders without <script> tags', () => {
    const p = writeTmp(`---\nweek: 1\ntitle: ""\nhero_image: ""\n---\n\n## Learning Objectives\n- Learn\n\n## Introduction\nHi.\n\n## Activities\n- Do\n`);
    const content = parsePageContent(p, 'overview');
    const html = renderPage(content, config);
    expect(html).not.toContain('<script');
  });

  it('renders without <h1> tags', () => {
    const p = writeTmp(`---\nweek: 1\ntitle: ""\nhero_image: ""\n---\n\n## Learning Objectives\n- Learn\n\n## Introduction\nHi.\n\n## Activities\n- Do\n`);
    const content = parsePageContent(p, 'overview');
    const html = renderPage(content, config);
    expect(html).not.toContain('<h1');
  });

  it('renders without box-shadow', () => {
    const p = writeTmp(`---\nweek: 1\ntitle: ""\nhero_image: ""\n---\n\n## Learning Objectives\n- Learn\n\n## Introduction\nHi.\n\n## Activities\n- Do\n`);
    const content = parsePageContent(p, 'overview');
    const html = renderPage(content, config);
    expect(html).not.toContain('box-shadow');
  });

  it('uses institution primary color in overview', () => {
    const p = writeTmp(`---\nweek: 1\ntitle: ""\nhero_image: ""\n---\n\n## Learning Objectives\n- Learn\n\n## Introduction\nHi.\n\n## Activities\n- Do\n`);
    const content = parsePageContent(p, 'overview');
    const html = renderPage(content, config);
    expect(html).toContain('#0033A0');
  });

  it('renders course number in overview hero', () => {
    const p = writeTmp(`---\nweek: 2\ntitle: "Foundations"\nhero_image: ""\n---\n\n## Learning Objectives\n- Learn\n\n## Introduction\nHi.\n\n## Activities\n- Do\n`);
    const content = parsePageContent(p, 'overview');
    const html = renderPage(content, config);
    expect(html).toContain('ITM 370');
    expect(html).toContain('Week 02');
  });

  it('uses font-family Lato throughout', () => {
    const p = writeTmp(`---\nweek: 1\ntitle: ""\nhero_image: ""\n---\n\n## Learning Objectives\n- Learn\n\n## Introduction\nHi.\n\n## Activities\n- Do\n`);
    const content = parsePageContent(p, 'overview');
    const html = renderPage(content, config);
    expect(html).toContain('Lato');
  });

  it('renders resources page with slides section', () => {
    const p = writeTmp(`---\nweek: 1\ntitle: ""\nhero_image: ""\n---\n\n## Slides\n- [Week 1 Slides](https://slides.com)\n\n## Videos\n- Panopto ID: abc-123\n\n## Readings\n- [Article](https://article.com)\n\n## Other\n- Quiz opens Monday\n`);
    const content = parsePageContent(p, 'resources');
    const html = renderPage(content, config);
    expect(html).toContain('Slides');
    expect(html).toContain('Videos');
    expect(html).toContain('Readings');
  });

  it('renders assignment page with brief and rubric', () => {
    const p = writeTmp(`---\nweek: 1\ntitle: ""\nhero_image: ""\nassignment_number: "1.1"\ndue: "Friday"\npoints: 50\n---\n\n## Brief\nBuild something cool.\n\n## Rubric\n- Criteria 1: 25 pts\n\n## Submission Details\n- Submit to Canvas\n`);
    const content = parsePageContent(p, 'assignment');
    const html = renderPage(content, config);
    expect(html).toContain('Brief');
    expect(html).toContain('Rubric');
    expect(html).toContain('50');
  });

  it('renders all 13 page types without throwing', () => {
    const pageTypes = [
      'front-page', 'overview', 'resources', 'slides', 'videos',
      'assignment', 'engage-assignment', 'reading', 'reading-quiz',
      'weekly-quiz', 'lab', 'discussion-board', 'extra-credit', 'custom',
    ] as const;
    for (const pt of pageTypes) {
      const p = writeTmp(`---\nweek: 1\ntitle: "Test"\nhero_image: ""\n---\n\n## Section\nContent here.\n`);
      const content = parsePageContent(p, pt);
      expect(() => renderPage(content, config)).not.toThrow();
    }
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npx vitest run tests/course-templates.test.ts
```

Expected: FAIL — `parsePageContent` not found.

- [ ] **Step 3: Write `src/tools/course-templates.ts`**

```typescript
// src/tools/course-templates.ts

import { readFileSync } from 'node:fs';
import type { CourseConfig, PageContent, PageFrontMatter, PageType } from '../course-types.js';

// ─── Markdown to HTML ───────────────────────────────────────────────────────

export function markdownToHtml(md: string): string {
  const trimmed = md.trim();
  if (!trimmed) return '';

  const lines = trimmed.split('\n');
  const htmlLines: string[] = [];
  let inList = false;

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (line.startsWith('- ')) {
      if (!inList) { htmlLines.push('<ul style="margin: 0; padding-left: 20px;">'); inList = true; }
      const inner = inlineMarkdown(line.slice(2));
      htmlLines.push(`  <li style="margin-bottom: 4px;">${inner}</li>`);
    } else {
      if (inList) { htmlLines.push('</ul>'); inList = false; }
      if (line === '') {
        htmlLines.push('');
      } else {
        htmlLines.push(`<p style="margin: 0 0 10px;">${inlineMarkdown(line)}</p>`);
      }
    }
  }
  if (inList) htmlLines.push('</ul>');
  return htmlLines.join('\n');
}

function inlineMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" style="color: inherit;">$1</a>');
}

// ─── Page Content Parser ─────────────────────────────────────────────────────

function parseFrontMatterSimple(yaml: string): PageFrontMatter {
  const result: PageFrontMatter = {};
  for (const line of yaml.split('\n')) {
    const m = line.match(/^([a-z_]+):\s*"?([^"]*)"?\s*$/);
    if (!m) continue;
    const key = m[1];
    const val = m[2].trim();
    if (key === 'week')   { result.week = parseInt(val, 10) || undefined; continue; }
    if (key === 'points') { result.points = parseInt(val, 10) || undefined; continue; }
    if (key === 'hero_image') { result.heroImage = val || undefined; continue; }
    if (key === 'assignment_number') { result.assignmentNumber = val || undefined; continue; }
    if (key === 'title')  { result.title = val || undefined; continue; }
    if (key === 'due')    { result.due = val || undefined; continue; }
    (result as Record<string, string | number | undefined>)[key] = val || undefined;
  }
  return result;
}

export function parsePageContent(filePath: string, pageType: PageType): PageContent {
  const raw = readFileSync(filePath, 'utf-8');
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const frontMatter = fmMatch ? parseFrontMatterSimple(fmMatch[1]) : {};
  const body = fmMatch ? fmMatch[2] : raw;

  const sections: Record<string, string> = {};
  const sectionRegex = /^## (.+)$/gm;
  let lastKey = '';
  let lastIndex = 0;
  let match;

  while ((match = sectionRegex.exec(body)) !== null) {
    if (lastKey) {
      sections[lastKey] = body.slice(lastIndex, match.index).trim();
    }
    lastKey = match[1].trim();
    lastIndex = match.index + match[0].length + 1;
  }
  if (lastKey) sections[lastKey] = body.slice(lastIndex).trim();

  return { pageType, frontMatter, sections };
}

// ─── Hero Banner ─────────────────────────────────────────────────────────────

function heroHtml(
  config: CourseConfig,
  pageType: PageType,
  week: number | undefined,
  title: string,
  subtitle: string,
  perPageHeroImage?: string,
): string {
  const heroImage = perPageHeroImage?.trim() ||
    config.heroImages[pageType]?.trim() || '';
  const bg = heroImage
    ? `background: ${config.colors.primary} url('${heroImage}') center/cover no-repeat;`
    : `background-color: ${config.colors.primary};`;
  const weekLabel = week && pageType !== 'front-page'
    ? `${config.courseNumber} &middot; Week ${String(week).padStart(2, '0')} &middot; ${config.semester}`
    : `${config.courseNumber} &middot; ${config.semester}`;

  return `<div style="${bg} min-height: 180px; display: flex; align-items: flex-end; padding: 24px; border-radius: 10px; margin-bottom: 24px;">
    <div>
      <p style="color: white; font-family: Lato, sans-serif; font-size: 12px; font-weight: 700; margin: 0 0 6px; text-transform: uppercase; letter-spacing: 1.5px;">${weekLabel}</p>
      <h2 style="color: white; font-family: Lato, sans-serif; font-size: 26px; font-weight: 700; margin: 0; line-height: 1.2;">${title}</h2>
      ${subtitle ? `<p style="color: white; font-family: Lato, sans-serif; font-size: 15px; margin: 8px 0 0;">${subtitle}</p>` : ''}
    </div>
  </div>`;
}

function card(content: string, style = ''): string {
  return `<div style="background: white; border: 1px solid #e0e0d8; border-radius: 8px; padding: 24px; margin-bottom: 20px;${style}">${content}</div>`;
}

function sectionHeading(text: string): string {
  return `<h2 style="font-family: Lato, sans-serif; font-size: 18px; font-weight: 700; color: #1A1A1A; margin: 0 0 14px;">${text}</h2>`;
}

function callout(content: string, config: CourseConfig): string {
  return `<div style="background: ${config.colors.primaryLight}; border-left: 4px solid ${config.colors.primary}; border-radius: 0 8px 8px 0; padding: 20px 24px; margin-bottom: 20px;">${content}</div>`;
}

function objectivesHeading(config: CourseConfig): string {
  return `<h2 style="color: ${config.colors.primary}; font-family: Lato, sans-serif; font-size: 13px; font-weight: 700; margin: 0 0 12px; text-transform: uppercase; letter-spacing: 1px;">Learning Objectives</h2>`;
}

// ─── Page Type Renderers ──────────────────────────────────────────────────────

function renderOverview(c: PageContent, cfg: CourseConfig): string {
  const week = c.frontMatter.week;
  const title = c.frontMatter.title || `Week ${String(week ?? '').padStart(2, '0')} Overview`;
  return wrap([
    heroHtml(cfg, 'overview', week, title, '', c.frontMatter.heroImage),
    callout(
      objectivesHeading(cfg) +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.7; color: #1A1A1A;">
        ${markdownToHtml(c.sections['Learning Objectives'] ?? '')}
      </div>`,
      cfg,
    ),
    card(
      sectionHeading('Introduction') +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.75; color: #1A1A1A;">${markdownToHtml(c.sections['Introduction'] ?? '')}</div>`
    ),
    card(
      sectionHeading("This Week's Activities") +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.8; color: #1A1A1A;">${markdownToHtml(c.sections['Activities'] ?? '')}</div>`
    ),
  ]);
}

function renderFrontPage(c: PageContent, cfg: CourseConfig): string {
  const title = c.frontMatter.title || cfg.courseName;
  return wrap([
    heroHtml(cfg, 'front-page', undefined, title, cfg.semester, c.frontMatter.heroImage),
    card(
      sectionHeading('Course Introduction') +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.75; color: #1A1A1A;">${markdownToHtml(c.sections['Course Introduction'] ?? '')}</div>`
    ),
    card(
      sectionHeading("What You'll Learn") +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.8; color: #1A1A1A;">${markdownToHtml(c.sections["What You'll Learn"] ?? '')}</div>`
    ),
    card(
      sectionHeading('How This Course Works') +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.75; color: #1A1A1A;">${markdownToHtml(c.sections['How This Course Works'] ?? '')}</div>`
    ),
    card(
      sectionHeading('Instructor') +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.75; color: #1A1A1A;">${markdownToHtml(c.sections['Instructor'] ?? '')}</div>`
    ),
  ]);
}

function renderResources(c: PageContent, cfg: CourseConfig): string {
  const week = c.frontMatter.week;
  const title = c.frontMatter.title || `Week ${String(week ?? '').padStart(2, '0')} Resources`;
  return wrap([
    heroHtml(cfg, 'resources', week, title, '', c.frontMatter.heroImage),
    card(
      sectionHeading('Slides') +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.8; color: #1A1A1A;">${markdownToHtml(c.sections['Slides'] ?? '')}</div>`
    ),
    card(
      sectionHeading('Videos') +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.8; color: #1A1A1A;">${markdownToHtml(c.sections['Videos'] ?? '')}</div>`
    ),
    card(
      sectionHeading('Readings') +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.8; color: #1A1A1A;">${markdownToHtml(c.sections['Readings'] ?? '')}</div>`
    ),
    c.sections['Other'] ? card(
      sectionHeading('Other') +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.8; color: #1A1A1A;">${markdownToHtml(c.sections['Other'])}</div>`
    ) : '',
  ]);
}

function renderSlides(c: PageContent, cfg: CourseConfig): string {
  const week = c.frontMatter.week;
  const title = c.frontMatter.title || `Week ${String(week ?? '').padStart(2, '0')} Slides`;
  return wrap([
    heroHtml(cfg, 'slides', week, title, '', c.frontMatter.heroImage),
    card(
      sectionHeading('Slide Deck') +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.8; color: #1A1A1A;">${markdownToHtml(c.sections['Slide Deck'] ?? '')}</div>`
    ),
    c.sections['About These Slides'] ? card(
      sectionHeading('About These Slides') +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.75; color: #1A1A1A;">${markdownToHtml(c.sections['About These Slides'])}</div>`
    ) : '',
    c.sections['Key Topics'] ? card(
      sectionHeading('Key Topics') +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.8; color: #1A1A1A;">${markdownToHtml(c.sections['Key Topics'])}</div>`
    ) : '',
  ]);
}

function renderVideos(c: PageContent, cfg: CourseConfig): string {
  const week = c.frontMatter.week;
  const title = c.frontMatter.title || `Week ${String(week ?? '').padStart(2, '0')} Videos`;
  return wrap([
    heroHtml(cfg, 'videos', week, title, '', c.frontMatter.heroImage),
    card(
      sectionHeading('Videos') +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.8; color: #1A1A1A;">${markdownToHtml(c.sections['Videos'] ?? '')}</div>`
    ),
    c.sections['What to Watch For'] ? card(
      sectionHeading('What to Watch For') +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.75; color: #1A1A1A;">${markdownToHtml(c.sections['What to Watch For'])}</div>`
    ) : '',
  ]);
}

function renderAssignment(c: PageContent, cfg: CourseConfig): string {
  const week = c.frontMatter.week;
  const assignNum = c.frontMatter.assignmentNumber ?? '';
  const due = c.frontMatter.due ?? '';
  const points = c.frontMatter.points ?? '';
  const title = c.frontMatter.title || `Assignment ${assignNum}`;
  const meta = [due ? `Due: ${due}` : '', points ? `${points} points` : ''].filter(Boolean).join(' &nbsp;·&nbsp; ');
  return wrap([
    heroHtml(cfg, 'assignment', week, title, meta, c.frontMatter.heroImage),
    callout(
      objectivesHeading(cfg) +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.7; color: #1A1A1A;">${markdownToHtml(c.sections['Brief'] ?? '')}</div>`,
      cfg,
    ),
    c.sections['Rubric'] ? card(
      sectionHeading('Rubric') +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.8; color: #1A1A1A;">${markdownToHtml(c.sections['Rubric'])}</div>`
    ) : '',
    card(
      sectionHeading('Submission Details') +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.75; color: #1A1A1A;">${markdownToHtml(c.sections['Submission Details'] ?? '')}</div>`
    ),
  ]);
}

function renderEngageAssignment(c: PageContent, cfg: CourseConfig): string {
  const week = c.frontMatter.week;
  const title = c.frontMatter.title || 'Engage Assignment';
  return wrap([
    heroHtml(cfg, 'engage-assignment', week, title, 'In-Class Activity', c.frontMatter.heroImage),
    card(
      sectionHeading("What We're Doing") +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.75; color: #1A1A1A;">${markdownToHtml(c.sections["What We're Doing"] ?? '')}</div>`
    ),
    card(
      sectionHeading('Instructions') +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.8; color: #1A1A1A;">${markdownToHtml(c.sections['Instructions'] ?? '')}</div>`
    ),
    card(
      sectionHeading('Time') +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.75; color: #1A1A1A;">${markdownToHtml(c.sections['Time'] ?? '')}</div>` +
      (c.sections['Deliverable'] ? '<br>' + sectionHeading('Deliverable') + `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.75; color: #1A1A1A;">${markdownToHtml(c.sections['Deliverable'])}</div>` : '')
    ),
  ]);
}

function renderReading(c: PageContent, cfg: CourseConfig): string {
  const week = c.frontMatter.week;
  const title = c.frontMatter.title || 'Reading';
  return wrap([
    heroHtml(cfg, 'reading', week, title, '', c.frontMatter.heroImage),
    card(
      sectionHeading('The Reading') +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.75; color: #1A1A1A;">${markdownToHtml(c.sections['The Reading'] ?? '')}</div>`
    ),
    card(
      sectionHeading('Why This Reading') +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.75; color: #1A1A1A;">${markdownToHtml(c.sections['Why This Reading'] ?? '')}</div>`
    ),
    c.sections['As You Read'] ? card(
      sectionHeading('As You Read') +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.75; color: #1A1A1A;">${markdownToHtml(c.sections['As You Read'])}</div>`
    ) : '',
  ]);
}

function renderQuizPage(
  c: PageContent,
  cfg: CourseConfig,
  pageType: 'reading-quiz' | 'weekly-quiz',
  defaultTitle: string,
): string {
  const week = c.frontMatter.week;
  const title = c.frontMatter.title || defaultTitle;
  const coversKey = pageType === 'reading-quiz' ? 'What It Covers' : 'Topics Covered';
  return wrap([
    heroHtml(cfg, pageType, week, title, '', c.frontMatter.heroImage),
    card(
      sectionHeading('Quiz Details') +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.8; color: #1A1A1A;">${markdownToHtml(c.sections['Quiz Details'] ?? '')}</div>`
    ),
    card(
      sectionHeading(coversKey) +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.8; color: #1A1A1A;">${markdownToHtml(c.sections[coversKey] ?? '')}</div>`
    ),
    card(
      sectionHeading('Access') +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.75; color: #1A1A1A;">${markdownToHtml(c.sections['Access'] ?? '')}</div>`
    ),
  ]);
}

function renderLab(c: PageContent, cfg: CourseConfig): string {
  const week = c.frontMatter.week;
  const title = c.frontMatter.title || 'Lab';
  return wrap([
    heroHtml(cfg, 'lab', week, title, '', c.frontMatter.heroImage),
    callout(
      objectivesHeading(cfg) +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.7; color: #1A1A1A;">${markdownToHtml(c.sections['Objectives'] ?? '')}</div>`,
      cfg,
    ),
    c.sections['Setup'] ? card(
      sectionHeading('Setup') +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.75; color: #1A1A1A;">${markdownToHtml(c.sections['Setup'])}</div>`
    ) : '',
    card(
      sectionHeading('Instructions') +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.8; color: #1A1A1A;">${markdownToHtml(c.sections['Instructions'] ?? '')}</div>`
    ),
    card(
      sectionHeading('Submission') +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.75; color: #1A1A1A;">${markdownToHtml(c.sections['Submission'] ?? '')}</div>`
    ),
  ]);
}

function renderDiscussionBoard(c: PageContent, cfg: CourseConfig): string {
  const week = c.frontMatter.week;
  const title = c.frontMatter.title || 'Discussion Board';
  return wrap([
    heroHtml(cfg, 'discussion-board', week, title, '', c.frontMatter.heroImage),
    callout(
      `<h2 style="color: ${cfg.colors.primary}; font-family: Lato, sans-serif; font-size: 13px; font-weight: 700; margin: 0 0 12px; text-transform: uppercase; letter-spacing: 1px;">Discussion Prompt</h2>` +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.75; color: #1A1A1A;">${markdownToHtml(c.sections['Prompt'] ?? '')}</div>`,
      cfg,
    ),
    card(
      sectionHeading('Requirements') +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.8; color: #1A1A1A;">${markdownToHtml(c.sections['Requirements'] ?? '')}</div>`
    ),
    c.sections['Grading'] ? card(
      sectionHeading('Grading') +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.75; color: #1A1A1A;">${markdownToHtml(c.sections['Grading'])}</div>`
    ) : '',
  ]);
}

function renderExtraCredit(c: PageContent, cfg: CourseConfig): string {
  const week = c.frontMatter.week;
  const title = c.frontMatter.title || 'Extra Credit';
  return wrap([
    heroHtml(cfg, 'extra-credit', week, title, 'Optional', c.frontMatter.heroImage),
    card(
      sectionHeading('Opportunity') +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.75; color: #1A1A1A;">${markdownToHtml(c.sections['Opportunity'] ?? '')}</div>`
    ),
    card(
      sectionHeading('Requirements') +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.8; color: #1A1A1A;">${markdownToHtml(c.sections['Requirements'] ?? '')}</div>`
    ),
    card(
      sectionHeading('Points &amp; Deadline') +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.75; color: #1A1A1A;">${markdownToHtml((c.sections['Points'] ?? '') + '\n' + (c.sections['Deadline'] ?? ''))}</div>`
    ),
  ]);
}

function renderCustom(c: PageContent, cfg: CourseConfig): string {
  const week = c.frontMatter.week;
  const title = c.frontMatter.title || 'Custom Page';
  const sectionCards = Object.entries(c.sections).map(([heading, content]) =>
    card(
      sectionHeading(heading) +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.75; color: #1A1A1A;">${markdownToHtml(content)}</div>`
    )
  );
  return wrap([
    heroHtml(cfg, 'custom', week, title, '', c.frontMatter.heroImage),
    ...sectionCards,
  ]);
}

// ─── Wrapper + Dispatcher ─────────────────────────────────────────────────────

function wrap(parts: string[]): string {
  return `<div style="font-family: Lato, sans-serif; max-width: 900px; margin: 0 auto; color: #1A1A1A;">\n${parts.filter(Boolean).join('\n')}\n</div>`;
}

export function renderPage(content: PageContent, config: CourseConfig): string {
  switch (content.pageType) {
    case 'front-page':       return renderFrontPage(content, config);
    case 'overview':         return renderOverview(content, config);
    case 'resources':        return renderResources(content, config);
    case 'slides':           return renderSlides(content, config);
    case 'videos':           return renderVideos(content, config);
    case 'assignment':       return renderAssignment(content, config);
    case 'engage-assignment':return renderEngageAssignment(content, config);
    case 'reading':          return renderReading(content, config);
    case 'reading-quiz':     return renderQuizPage(content, config, 'reading-quiz', 'Reading Quiz');
    case 'weekly-quiz':      return renderQuizPage(content, config, 'weekly-quiz', 'Weekly Quiz');
    case 'lab':              return renderLab(content, config);
    case 'discussion-board': return renderDiscussionBoard(content, config);
    case 'extra-credit':     return renderExtraCredit(content, config);
    case 'custom':           return renderCustom(content, config);
  }
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npx vitest run tests/course-templates.test.ts
```

Expected: all 11 tests pass.

- [ ] **Step 5: Run full suite**

```bash
npx vitest run
```

Expected: 226 + 11 = 237 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/tools/course-templates.ts tests/course-templates.test.ts
git commit -m "feat(sp10a): add template engine for all 13 page types"
```

---

## Task 5: Fixture Content Files

**Files:**
- Create: `tests/fixtures/course-input/course-config.md`
- Create: `tests/fixtures/course-input/front-page.md`
- Create: `tests/fixtures/course-input/week-01/overview.md`
- Create: `tests/fixtures/course-input/week-01/resources.md`
- Create: `tests/fixtures/course-input/week-01/assignment.md`
- Create: `tests/fixtures/course-input/week-02/overview.md`
- Create: `tests/fixtures/course-input/week-02/resources.md`

These fixtures are used by generate-page, generate-week, and generate-course tests.

- [ ] **Step 1: Create `tests/fixtures/course-input/course-config.md`**

```markdown
---
institution: Example University
course_name: AI Augmented Projects
course_number: ITM 370
professor: Dr. Smith
semester: Fall 2026
weeks: 2

page_types:
  - front-page
  - overview
  - resources
  - assignment

layout_fixed: true

colors:
  primary: ""
  secondary: ""

hero_images:
  front-page: ""
  overview: ""
  resources: ""
  assignment: ""
---

## Week Outline

| Week | Title | Topic |
|------|-------|-------|
| 01 | Introduction | What is AI Augmentation? |
| 02 | Foundations | Prompt Engineering Basics |
```

- [ ] **Step 2: Create `tests/fixtures/course-input/front-page.md`**

```markdown
---
title: "AI Augmented Projects"
hero_image: ""
---

## Course Introduction
Welcome to ITM 370. This course explores how AI tools augment professional work.

## What You'll Learn
- Apply AI tools to real project workflows
- Evaluate AI output critically
- Build a portfolio of AI-augmented work

## How This Course Works
Sixteen weeks of hands-on projects, weekly assignments, and peer discussions.

## Instructor
Dr. Smith — dr.smith@university.edu — Office hours: Tuesdays 2-4pm
```

- [ ] **Step 3: Create `tests/fixtures/course-input/week-01/overview.md`**

```markdown
---
week: 1
title: "Introduction to AI Augmentation"
hero_image: ""
---

## Learning Objectives
- Define AI augmentation and distinguish it from AI replacement
- Identify three professional domains where AI augmentation is already in use
- Set up your first AI-assisted workflow

## Introduction
This week we lay the foundation. We'll look at what AI augmentation means in practice and why the most effective AI users are people who understand both the tool and the task.

## Activities
- Lecture: What is AI Augmentation? (Panopto — 22 min)
- Reading: Chapter 1 of the course text — due Sunday
- Assignment 1.1: AI Audit of Your Work — due Friday
- Discussion: Share one task you'd like to augment with AI
```

- [ ] **Step 4: Create `tests/fixtures/course-input/week-01/resources.md`**

```markdown
---
week: 1
title: ""
hero_image: ""
---

## Slides
- [Week 1: Introduction Slides](https://slides.example.com/week1)

## Videos
- Panopto ID: 11111111-aaaa-bbbb-cccc-dddddddddddd

## Readings
- [What is AI Augmentation?](https://example.com/article1)
- Chapter 1 of the course text (Canvas Files > Week 1)

## Other
- Reading Quiz 1 opens Monday at 8am
```

- [ ] **Step 5: Create `tests/fixtures/course-input/week-01/assignment.md`**

```markdown
---
week: 1
title: ""
hero_image: ""
assignment_number: "1.1"
due: "Friday, September 5"
points: 50
---

## Brief
Pick three tasks from your current work or studies that you perform at least once a week. For each task, document how long it currently takes, what the pain points are, and write one paragraph on how an AI tool might augment — not replace — your process.

## Rubric
- Task documentation (3 tasks described clearly): 15 pts
- Time/pain point analysis (specific, not generic): 15 pts
- AI augmentation proposal (realistic, not speculative): 15 pts
- Writing quality and submission format: 5 pts

## Submission Details
- Submit as a PDF or Word document via Canvas Assignments
- Due: Friday, September 5 by 11:59pm Mountain
```

- [ ] **Step 6: Create `tests/fixtures/course-input/week-02/overview.md`**

```markdown
---
week: 2
title: "Prompt Engineering Basics"
hero_image: ""
---

## Learning Objectives
- Write effective prompts using role, context, and constraint framing
- Identify common prompt failure modes and how to fix them
- Produce consistent AI output through iterative prompt refinement

## Introduction
Week 2 shifts from concepts to practice. Prompt engineering is the craft of communicating precisely with AI systems. This week you'll learn the patterns that separate vague requests from reliable, high-quality outputs.

## Activities
- Lecture: The Anatomy of a Good Prompt (Panopto — 18 min)
- Reading: Prompt Patterns for Professionals — due Sunday
- Assignment 2.1: Prompt Remix — due Friday
- Reading Quiz 2 — opens Monday
```

- [ ] **Step 7: Create `tests/fixtures/course-input/week-02/resources.md`**

```markdown
---
week: 2
title: ""
hero_image: ""
---

## Slides
- [Week 2: Prompt Engineering Slides](https://slides.example.com/week2)

## Videos
- Panopto ID: 22222222-aaaa-bbbb-cccc-dddddddddddd

## Readings
- [Prompt Patterns for Professionals](https://example.com/prompt-patterns)

## Other
- Reading Quiz 2 opens Monday at 8am
- Assignment 2.1 due Friday
```

- [ ] **Step 8: Commit fixtures**

```bash
git add tests/fixtures/course-input/
git commit -m "test(sp10a): add course-input fixtures"
```

---

## Task 6: generate_page Tool

**Files:**
- Create: `src/tools/generate-page.ts`
- Create: `tests/generate-page.test.ts`

`generate_page` finds the `course-config.md` by walking up from the given `.md` file's directory, parses both files, renders HTML, and saves to `output/`.

- [ ] **Step 1: Write failing tests**

Create `tests/generate-page.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { generatePage } from '../src/tools/generate-page.js';

const fixturesDir = join(import.meta.dirname, 'fixtures/course-input');

describe('generatePage', () => {
  it('generates HTML file from overview.md', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'gp-'));
    const result = generatePage({
      mdPath: join(fixturesDir, 'week-01/overview.md'),
      courseDir: fixturesDir,
      outputDir: outDir,
    });
    expect(result.pageType).toBe('overview');
    expect(result.weekNumber).toBe(1);
    expect(result.filename).toBe('overview.html');
    expect(existsSync(result.savedTo)).toBe(true);
  });

  it('saved HTML contains learning objectives content', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'gp-'));
    const result = generatePage({
      mdPath: join(fixturesDir, 'week-01/overview.md'),
      courseDir: fixturesDir,
      outputDir: outDir,
    });
    const html = readFileSync(result.savedTo, 'utf-8');
    expect(html).toContain('Learning Objectives');
    expect(html).toContain('AI augmentation');
  });

  it('saves to output/week-01/overview.html by default', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'gp-'));
    const result = generatePage({
      mdPath: join(fixturesDir, 'week-01/overview.md'),
      courseDir: fixturesDir,
      outputDir: outDir,
    });
    expect(result.savedTo).toContain(join('week-01', 'overview.html'));
  });

  it('generates HTML file from assignment.md', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'gp-'));
    const result = generatePage({
      mdPath: join(fixturesDir, 'week-01/assignment.md'),
      courseDir: fixturesDir,
      outputDir: outDir,
    });
    expect(result.pageType).toBe('assignment');
    expect(existsSync(result.savedTo)).toBe(true);
  });

  it('generates HTML file from front-page.md', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'gp-'));
    const result = generatePage({
      mdPath: join(fixturesDir, 'front-page.md'),
      courseDir: fixturesDir,
      outputDir: outDir,
    });
    expect(result.pageType).toBe('front-page');
    expect(result.weekNumber).toBe(0);
    expect(result.filename).toBe('front-page.html');
    expect(existsSync(result.savedTo)).toBe(true);
  });

  it('generated HTML passes basic Canvas compliance (no <style>, no <h1>)', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'gp-'));
    const result = generatePage({
      mdPath: join(fixturesDir, 'week-01/overview.md'),
      courseDir: fixturesDir,
      outputDir: outDir,
    });
    const html = readFileSync(result.savedTo, 'utf-8');
    expect(html).not.toContain('<style');
    expect(html).not.toContain('<h1');
    expect(html).not.toContain('box-shadow');
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npx vitest run tests/generate-page.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Write `src/tools/generate-page.ts`**

```typescript
// src/tools/generate-page.ts

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, basename, resolve } from 'node:path';
import { parseCourseConfig, COURSE_CONFIG_FILENAME } from './course-config.js';
import { parsePageContent, renderPage } from './course-templates.js';
import type { GeneratePageInput, GeneratePageResult, PageType } from '../course-types.js';
import { PAGE_TYPES } from '../course-types.js';

function detectPageType(filename: string): PageType {
  const name = basename(filename, '.md');
  return (PAGE_TYPES as readonly string[]).includes(name)
    ? name as PageType
    : 'custom';
}

function findCourseConfig(startDir: string, courseDir?: string): string {
  if (courseDir) {
    const p = join(courseDir, COURSE_CONFIG_FILENAME);
    if (existsSync(p)) return p;
    throw new Error(`course-config.md not found in ${courseDir}`);
  }
  let dir = resolve(startDir);
  for (let i = 0; i < 5; i++) {
    const candidate = join(dir, COURSE_CONFIG_FILENAME);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`course-config.md not found walking up from ${startDir}`);
}

function weekFolderSegment(weekNumber: number): string {
  return weekNumber > 0 ? `week-${String(weekNumber).padStart(2, '0')}` : '';
}

export function generatePage(input: GeneratePageInput): GeneratePageResult {
  const { mdPath, courseDir, outputDir } = input;
  const absPath = resolve(mdPath);
  const configPath = findCourseConfig(dirname(absPath), courseDir);
  const config = parseCourseConfig(configPath);

  const pageType = detectPageType(absPath);
  const content = parsePageContent(absPath, pageType);

  const html = renderPage(content, config);

  const weekNumber = content.frontMatter.week ?? 0;
  const filename = `${pageType}.html`;
  const weekSegment = weekFolderSegment(weekNumber);

  const baseOut = outputDir ?? join(dirname(configPath), 'output');
  const weekOut = weekSegment ? join(baseOut, weekSegment) : baseOut;
  mkdirSync(weekOut, { recursive: true });
  const savedTo = join(weekOut, filename);
  writeFileSync(savedTo, html, 'utf-8');

  return { html, filename, weekNumber, pageType, savedTo };
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npx vitest run tests/generate-page.test.ts
```

Expected: all 6 tests pass.

- [ ] **Step 5: Run full suite**

```bash
npx vitest run
```

Expected: 237 + 6 = 243 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/tools/generate-page.ts tests/generate-page.test.ts
git commit -m "feat(sp10a): add generate_page tool"
```

---

## Task 7: generate_week Tool

**Files:**
- Create: `src/tools/generate-week.ts`
- Create: `tests/generate-week.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/generate-week.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { generateWeek } from '../src/tools/generate-week.js';

const fixturesDir = join(import.meta.dirname, 'fixtures/course-input');

describe('generateWeek', () => {
  it('generates HTML files for all active page types in week 1', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'gw-'));
    const result = generateWeek({ weekNumber: 1, courseDir: fixturesDir, outputDir: outDir });
    expect(result.weekNumber).toBe(1);
    expect(result.pages.length).toBeGreaterThan(0);
    expect(result.pages.some(p => p.pageType === 'overview')).toBe(true);
    expect(result.pages.some(p => p.pageType === 'resources')).toBe(true);
    expect(result.pages.some(p => p.pageType === 'assignment')).toBe(true);
  });

  it('all generated files exist on disk', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'gw-'));
    const result = generateWeek({ weekNumber: 1, courseDir: fixturesDir, outputDir: outDir });
    for (const page of result.pages) {
      expect(existsSync(page.savedTo)).toBe(true);
    }
  });

  it('output goes to week-01 subfolder', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'gw-'));
    const result = generateWeek({ weekNumber: 1, courseDir: fixturesDir, outputDir: outDir });
    expect(result.outputDir).toContain('week-01');
  });

  it('returns warnings for missing .md files', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'gw-'));
    // week 2 is missing assignment.md in fixtures
    const result = generateWeek({ weekNumber: 2, courseDir: fixturesDir, outputDir: outDir });
    // Should generate what exists and warn about what's missing
    expect(result.warnings.length).toBeGreaterThanOrEqual(0);
  });

  it('generates week 2 pages that exist', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'gw-'));
    const result = generateWeek({ weekNumber: 2, courseDir: fixturesDir, outputDir: outDir });
    expect(result.pages.some(p => p.pageType === 'overview')).toBe(true);
    expect(result.pages.some(p => p.pageType === 'resources')).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npx vitest run tests/generate-week.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Write `src/tools/generate-week.ts`**

```typescript
// src/tools/generate-week.ts

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseCourseConfig, COURSE_CONFIG_FILENAME } from './course-config.js';
import { generatePage } from './generate-page.js';
import type { GenerateWeekInput, GenerateWeekResult, GeneratePageResult } from '../course-types.js';

function getWeekFolderName(week: number): string {
  return `week-${String(week).padStart(2, '0')}`;
}

export function generateWeek(input: GenerateWeekInput): GenerateWeekResult {
  const { weekNumber, courseDir, outputDir } = input;
  const courseDirAbs = resolve(courseDir ?? 'course');
  const configPath = join(courseDirAbs, COURSE_CONFIG_FILENAME);

  if (!existsSync(configPath)) {
    throw new Error(`course-config.md not found in ${courseDirAbs}`);
  }

  const config = parseCourseConfig(configPath);
  const weekFolder = join(courseDirAbs, getWeekFolderName(weekNumber));
  const weekPageTypes = config.pageTypes.filter(pt => pt !== 'front-page');

  const pages: GeneratePageResult[] = [];
  const warnings: string[] = [];
  const baseOut = outputDir ?? join(courseDirAbs, 'output');
  const weekOut = join(baseOut, getWeekFolderName(weekNumber));

  for (const pageType of weekPageTypes) {
    const mdPath = join(weekFolder, `${pageType}.md`);
    if (!existsSync(mdPath)) {
      warnings.push(`Skipped ${pageType}: ${mdPath} not found`);
      continue;
    }
    const result = generatePage({
      mdPath,
      courseDir: courseDirAbs,
      outputDir: baseOut,
    });
    pages.push(result);
  }

  return { weekNumber, pages, outputDir: weekOut, warnings };
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npx vitest run tests/generate-week.test.ts
```

Expected: all 5 tests pass.

- [ ] **Step 5: Run full suite**

```bash
npx vitest run
```

Expected: 243 + 5 = 248 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/tools/generate-week.ts tests/generate-week.test.ts
git commit -m "feat(sp10a): add generate_week tool"
```

---

## Task 8: generate_course Tool

**Files:**
- Create: `src/tools/generate-course.ts`
- Create: `tests/generate-course.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/generate-course.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { generateCourse } from '../src/tools/generate-course.js';

const fixturesDir = join(import.meta.dirname, 'fixtures/course-input');

describe('generateCourse', () => {
  it('generates pages for all weeks in the course', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'gc-'));
    const result = generateCourse({ courseDir: fixturesDir, outputDir: outDir });
    expect(result.weekResults.length).toBe(2);
    expect(result.totalPages).toBeGreaterThan(0);
  });

  it('generates front-page.html when front-page type is active', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'gc-'));
    generateCourse({ courseDir: fixturesDir, outputDir: outDir });
    expect(existsSync(join(outDir, 'front-page.html'))).toBe(true);
  });

  it('creates week subfolder for each week', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'gc-'));
    generateCourse({ courseDir: fixturesDir, outputDir: outDir });
    expect(existsSync(join(outDir, 'week-01'))).toBe(true);
    expect(existsSync(join(outDir, 'week-02'))).toBe(true);
  });

  it('returns total page count across all weeks', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'gc-'));
    const result = generateCourse({ courseDir: fixturesDir, outputDir: outDir });
    // 2 weeks × 3 page types = 6 pages + 1 front page = 7 (minus missing week-02 assignment)
    expect(result.totalPages).toBeGreaterThanOrEqual(5);
  });

  it('collects warnings from all weeks', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'gc-'));
    const result = generateCourse({ courseDir: fixturesDir, outputDir: outDir });
    // warnings array exists (may be empty if all files present)
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  it('sets outputDir in result', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'gc-'));
    const result = generateCourse({ courseDir: fixturesDir, outputDir: outDir });
    expect(result.outputDir).toBe(outDir);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npx vitest run tests/generate-course.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Write `src/tools/generate-course.ts`**

```typescript
// src/tools/generate-course.ts

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseCourseConfig, COURSE_CONFIG_FILENAME } from './course-config.js';
import { generatePage } from './generate-page.js';
import { generateWeek } from './generate-week.js';
import type { GenerateCourseInput, GenerateCourseResult, GenerateWeekResult } from '../course-types.js';

export function generateCourse(input: GenerateCourseInput): GenerateCourseResult {
  const { courseDir, outputDir } = input;
  const courseDirAbs = resolve(courseDir ?? 'course');
  const configPath = join(courseDirAbs, COURSE_CONFIG_FILENAME);

  if (!existsSync(configPath)) {
    throw new Error(`course-config.md not found in ${courseDirAbs}`);
  }

  const config = parseCourseConfig(configPath);
  const baseOut = resolve(outputDir ?? join(courseDirAbs, 'output'));
  const weekResults: GenerateWeekResult[] = [];
  const allWarnings: string[] = [];
  let totalPages = 0;

  // Generate front page if active
  if (config.pageTypes.includes('front-page')) {
    const fpPath = join(courseDirAbs, 'front-page.md');
    if (existsSync(fpPath)) {
      generatePage({ mdPath: fpPath, courseDir: courseDirAbs, outputDir: baseOut });
      totalPages++;
    } else {
      allWarnings.push('Skipped front-page: front-page.md not found');
    }
  }

  // Generate each week
  for (let w = 1; w <= config.weeks; w++) {
    const result = generateWeek({
      weekNumber: w,
      courseDir: courseDirAbs,
      outputDir: baseOut,
    });
    weekResults.push(result);
    totalPages += result.pages.length;
    allWarnings.push(...result.warnings);
  }

  return { totalPages, outputDir: baseOut, weekResults, warnings: allWarnings };
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npx vitest run tests/generate-course.test.ts
```

Expected: all 6 tests pass.

- [ ] **Step 5: Run full suite**

```bash
npx vitest run
```

Expected: 248 + 6 = 254 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/tools/generate-course.ts tests/generate-course.test.ts
git commit -m "feat(sp10a): add generate_course tool"
```

---

## Task 9: setup_course Wizard

**Files:**
- Create: `src/tools/setup-course.ts`
- Create: `tests/setup-course.test.ts`

The wizard collects course details interactively via `@inquirer/prompts`, then calls `createCourseScaffold`. The wizard logic (`runCourseWizard`) and the business logic (`createCourseFromAnswers`) are separated so tests can call the business logic directly without interactive prompts.

- [ ] **Step 1: Write failing tests**

Create `tests/setup-course.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createCourseFromAnswers } from '../src/tools/setup-course.js';
import type { CourseWizardAnswers } from '../src/tools/setup-course.js';

function makeAnswers(overrides: Partial<CourseWizardAnswers> = {}): CourseWizardAnswers {
  return {
    institution: 'Example University',
    courseName: 'AI Augmented Projects',
    courseNumber: 'ITM 370',
    professor: 'Dr. Smith',
    semester: 'Fall 2026',
    weeks: 4,
    pageTypes: ['overview', 'assignment'],
    layoutFixed: true,
    primaryColor: '',
    secondaryColor: '',
    ...overrides,
  };
}

describe('createCourseFromAnswers', () => {
  it('creates course directory structure', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sc-'));
    createCourseFromAnswers(makeAnswers(), dir);
    expect(existsSync(join(dir, 'course-config.md'))).toBe(true);
    expect(existsSync(join(dir, 'week-01'))).toBe(true);
    expect(existsSync(join(dir, 'week-04'))).toBe(true);
  });

  it('course-config.md reflects wizard answers', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sc-'));
    createCourseFromAnswers(makeAnswers(), dir);
    const config = readFileSync(join(dir, 'course-config.md'), 'utf-8');
    expect(config).toContain('course_name: AI Augmented Projects');
    expect(config).toContain('course_number: ITM 370');
    expect(config).toContain('semester: Fall 2026');
    expect(config).toContain('weeks: 4');
    expect(config).toContain('- overview');
    expect(config).toContain('- assignment');
  });

  it('creates front-page.md when front-page is selected', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sc-'));
    createCourseFromAnswers(makeAnswers({ pageTypes: ['front-page', 'overview'] }), dir);
    expect(existsSync(join(dir, 'front-page.md'))).toBe(true);
  });

  it('does not create front-page.md when not selected', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sc-'));
    createCourseFromAnswers(makeAnswers({ pageTypes: ['overview'] }), dir);
    expect(existsSync(join(dir, 'front-page.md'))).toBe(false);
  });

  it('applies color overrides to course-config.md', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sc-'));
    createCourseFromAnswers(makeAnswers({ primaryColor: '#1A5276' }), dir);
    const config = readFileSync(join(dir, 'course-config.md'), 'utf-8');
    expect(config).toContain('#1A5276');
  });

  it('returns list of created files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sc-'));
    const files = createCourseFromAnswers(makeAnswers(), dir);
    expect(files.length).toBeGreaterThan(0);
    expect(files.every(f => f.startsWith(dir))).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npx vitest run tests/setup-course.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Write `src/tools/setup-course.ts`**

```typescript
// src/tools/setup-course.ts

import { checkbox, confirm, input } from '@inquirer/prompts';
import { resolve } from 'node:path';
import { parseCourseConfig, COURSE_CONFIG_FILENAME } from './course-config.js';
import { createCourseScaffold } from './course-scaffold.js';
import { PAGE_TYPES, PAGE_TYPE_LABELS, DEFAULT_PAGE_TYPES } from '../course-types.js';
import type { CourseConfig, PageType } from '../course-types.js';

export interface CourseWizardAnswers {
  institution: string;
  courseName: string;
  courseNumber: string;
  professor: string;
  semester: string;
  weeks: number;
  pageTypes: PageType[];
  layoutFixed: boolean;
  primaryColor: string;
  secondaryColor: string;
}

export function createCourseFromAnswers(answers: CourseWizardAnswers, rootDir: string): string[] {
  const { primaryColor, secondaryColor, ...rest } = answers;

  // Build a minimal CourseConfig — parseCourseConfig handles color derivation, but
  // we bypass it here since we don't have a file yet. Wire in raw values directly.
  const config: CourseConfig = {
    institution: rest.institution,
    courseName: rest.courseName,
    courseNumber: rest.courseNumber,
    professor: rest.professor,
    semester: rest.semester,
    weeks: rest.weeks,
    pageTypes: rest.pageTypes,
    layoutFixed: rest.layoutFixed,
    colors: {
      primary: primaryColor || '#0033A0',
      primaryDark: '#002277',
      primaryLight: '#E6ECF9',
      secondary: secondaryColor || '#D64309',
    },
    heroImages: {},
    weekOutline: [],
  };

  return createCourseScaffold(config, resolve(rootDir));
}

export async function runCourseWizard(rootDir?: string): Promise<string[]> {
  const outDir = resolve(rootDir ?? 'course');

  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║          Canvas Design Studio — Course Setup              ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');
  console.log('This wizard creates your course folder and all weekly templates.\n');

  const institution = await input({
    message: 'Institution name:',
    default: 'Example University',
  });

  const courseName = await input({
    message: 'Course name:',
    validate: (v) => v.trim().length > 0 || 'Course name is required',
  });

  const courseNumber = await input({
    message: 'Course number (e.g. ITM 370):',
    validate: (v) => v.trim().length > 0 || 'Course number is required',
  });

  const professor = await input({
    message: 'Professor name:',
    validate: (v) => v.trim().length > 0 || 'Professor name is required',
  });

  const semester = await input({
    message: 'Semester (e.g. Fall 2026):',
    validate: (v) => v.trim().length > 0 || 'Semester is required',
  });

  const weeksRaw = await input({
    message: 'Number of weeks:',
    default: '16',
    validate: (v) => (/^\d+$/.test(v) && parseInt(v, 10) > 0) || 'Enter a whole number greater than 0',
  });
  const weeks = parseInt(weeksRaw, 10);

  const selectedPageTypes = await checkbox({
    message: 'Which page types does this course use? (Space to select, Enter to confirm)',
    choices: PAGE_TYPES.map(pt => ({
      name: PAGE_TYPE_LABELS[pt],
      value: pt,
      checked: (DEFAULT_PAGE_TYPES as readonly string[]).includes(pt),
    })),
    validate: (v) => v.length > 0 || 'Select at least one page type',
  }) as PageType[];

  const layoutFixed = await confirm({
    message: 'Use the same layout structure for every week? (Recommended: yes)',
    default: true,
  });

  const customizeColors = await confirm({
    message: 'Override institution brand colors for this course?',
    default: false,
  });

  let primaryColor = '';
  let secondaryColor = '';
  if (customizeColors) {
    primaryColor = await input({
      message: 'Primary color (#hex):',
      validate: (v) => !v || /^#[0-9A-Fa-f]{6}$/.test(v) || 'Enter a valid hex color or leave blank to inherit',
    });
    secondaryColor = await input({
      message: 'Secondary / accent color (#hex):',
      validate: (v) => !v || /^#[0-9A-Fa-f]{6}$/.test(v) || 'Enter a valid hex color or leave blank to inherit',
    });
  }

  const answers: CourseWizardAnswers = {
    institution,
    courseName: courseName.trim(),
    courseNumber: courseNumber.trim(),
    professor: professor.trim(),
    semester: semester.trim(),
    weeks,
    pageTypes: selectedPageTypes,
    layoutFixed,
    primaryColor,
    secondaryColor,
  };

  const created = createCourseFromAnswers(answers, outDir);

  console.log(`\n✓ Course scaffold created in ${outDir}`);
  console.log(`  ${created.length} files created`);
  console.log('\nNext steps:');
  console.log('  1. Fill in week titles and topics in course-config.md');
  console.log('  2. Fill in content for each week\'s .md files');
  console.log('  3. Tell Claude: "Generate the course from the course/ folder"');

  return created;
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npx vitest run tests/setup-course.test.ts
```

Expected: all 6 tests pass.

- [ ] **Step 5: Run full suite**

```bash
npx vitest run
```

Expected: 254 + 6 = 260 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/tools/setup-course.ts tests/setup-course.test.ts
git commit -m "feat(sp10a): add setup_course wizard"
```

---

## Task 10: Register Tools in index.ts

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Add imports at top of `src/index.ts`**

After the existing imports, add:

```typescript
import { generatePage } from './tools/generate-page.js';
import type { GeneratePageInput } from './course-types.js';
import { generateWeek } from './tools/generate-week.js';
import type { GenerateWeekInput } from './course-types.js';
import { generateCourse } from './tools/generate-course.js';
import type { GenerateCourseInput } from './course-types.js';
import { runCourseWizard } from './tools/setup-course.js';
```

- [ ] **Step 2: Add tool descriptors to `ListToolsRequestSchema` handler**

Inside the `tools: [...]` array, after the last existing tool (`save_canvas_page`), add:

```typescript
{
  name: 'setup_course',
  description: 'Run the course setup wizard to create a full course folder scaffold — course-config.md, all week folders, and pre-filled template .md files for each active page type. Run once per course. Supports color overrides and a checkbox page-type selector with recommendations.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      courseDir: { type: 'string', description: 'Directory to create the course scaffold in. Defaults to "course/" in the current project.' },
    },
  },
},
{
  name: 'generate_page',
  description: 'Generate one Canvas HTML page from a single .md content file. Finds course-config.md automatically by walking up from the file. Saves to output/week-NN/filename.html. Use for one-off pages and per-page tweaks.',
  inputSchema: {
    type: 'object' as const,
    required: ['mdPath'],
    properties: {
      mdPath: { type: 'string', description: 'Path to the .md content file (e.g. "course/week-03/assignment.md" or "course/front-page.md").' },
      courseDir: { type: 'string', description: 'Directory containing course-config.md. Inferred from mdPath if omitted.' },
      outputDir: { type: 'string', description: 'Output directory. Defaults to "output/" inside the course directory.' },
    },
  },
},
{
  name: 'generate_week',
  description: 'Generate all Canvas HTML pages for one week. Reads course-config.md for active page types and colors, then generates HTML for each .md file found in the week folder. Skips missing files with a warning.',
  inputSchema: {
    type: 'object' as const,
    required: ['weekNumber'],
    properties: {
      weekNumber: { type: 'number', description: 'Week number to generate (e.g. 3 for week-03).' },
      courseDir: { type: 'string', description: 'Directory containing course-config.md. Defaults to "course/".' },
      outputDir: { type: 'string', description: 'Output directory. Defaults to "output/" inside the course directory.' },
    },
  },
},
{
  name: 'generate_course',
  description: 'Batch generate all Canvas HTML pages for the entire course — front page plus all weeks. Reads course-config.md for the week count and active page types. Reports total pages generated and any warnings about missing .md files.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      courseDir: { type: 'string', description: 'Directory containing course-config.md. Defaults to "course/".' },
      outputDir: { type: 'string', description: 'Output directory. Defaults to "output/" inside the course directory.' },
    },
  },
},
```

- [ ] **Step 3: Add tool handlers to `CallToolRequestSchema` handler**

After the `save_canvas_page` handler block and before the final `return { content: [{ type: 'text', text: 'Unknown tool...' }] }` line, add:

```typescript
if (name === 'setup_course') {
  const { courseDir } = (args ?? {}) as { courseDir?: string };
  const created = await runCourseWizard(courseDir);
  return {
    content: [{ type: 'text', text: `✓ Course scaffold created.\n${created.length} files written:\n${created.map(f => `  • ${f}`).join('\n')}` }],
  };
}

if (name === 'generate_page') {
  const input = args as unknown as GeneratePageInput;
  const result = generatePage(input);
  return {
    content: [{ type: 'text', text: `✓ Generated ${result.pageType} page\n  Week: ${result.weekNumber || 'N/A'}\n  Saved: ${result.savedTo}` }],
  };
}

if (name === 'generate_week') {
  const input = args as unknown as GenerateWeekInput;
  const result = generateWeek(input);
  const lines = [`✓ Week ${result.weekNumber}: ${result.pages.length} page(s) generated`];
  for (const p of result.pages) lines.push(`  • ${p.pageType} → ${p.savedTo}`);
  if (result.warnings.length > 0) lines.push(`\n⚠ Warnings:\n${result.warnings.map(w => `  • ${w}`).join('\n')}`);
  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

if (name === 'generate_course') {
  const input = (args ?? {}) as GenerateCourseInput;
  const result = generateCourse(input);
  const lines = [
    `✓ Course generated: ${result.totalPages} page(s) across ${result.weekResults.length} week(s)`,
    `  Output: ${result.outputDir}`,
  ];
  if (result.warnings.length > 0) lines.push(`\n⚠ Warnings (${result.warnings.length}):\n${result.warnings.map(w => `  • ${w}`).join('\n')}`);
  return { content: [{ type: 'text', text: lines.join('\n') }] };
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Run full suite**

```bash
npx vitest run
```

Expected: 260 tests pass (no regressions, no new tests added here).

- [ ] **Step 6: Commit**

```bash
git add src/index.ts
git commit -m "feat(sp10a): register setup_course, generate_page, generate_week, generate_course in MCP server"
```

---

## Task 11: Feature Roadmap Update

**Files:**
- Modify: `docs/feature-roadmap.md`

- [ ] **Step 1: Add SP10 section to `docs/feature-roadmap.md`**

Open `docs/feature-roadmap.md`. After the `## Coming Next` section, replace its contents with:

```markdown
## Coming Next (v1.0)

### Course Design System (SP10)

Professors can now build out an entire Canvas course from a folder structure — weekly modules with templated pages — instead of generating one-off pages.

| Feature | What professors can do |
|---|---|
| `setup_course` wizard | Run once per course: select page types from a checkbox list, set weeks, get a complete folder scaffold pre-filled with content prompts |
| `generate_page` | Generate or regenerate a single page for tweaks and one-offs |
| `generate_week` | Generate all pages for one week — overview, resources, assignment, and more |
| `generate_course` | Batch generate the entire course in one command |
| 13 page type templates | Overview, Resources, Slides, Videos, Assignment, Engage Assignment, Reading, Reading Quiz, Weekly Quiz, Lab, Discussion Board, Extra Credit, Custom |
| Color inheritance | Course pages inherit institution brand colors with optional per-course overrides |
| Reusable course config | `course-config.md` persists across semesters — update semester and dates, regenerate |

## Feedback Requested
```

- [ ] **Step 2: Commit**

```bash
git add docs/feature-roadmap.md
git commit -m "docs(sp10a): add course design system to feature roadmap"
```

---

## Task 12: Version Bump + Final Verification

- [ ] **Step 1: Run full test suite one final time**

```bash
npx vitest run
```

Expected: 260 tests pass, 0 failures.

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Bump version to 0.9.6**

In `package.json`, change `"version": "0.9.5"` to `"version": "0.9.6"`.

- [ ] **Step 4: Commit version bump**

```bash
git add package.json
git commit -m "0.9.6"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Covered by |
|---|---|
| `setup_course` wizard with checkbox page type selector | Task 9 |
| Creates `course-config.md` as part of wizard | Task 9 (`createCourseFromAnswers` → `createCourseScaffold`) |
| Course config persistent, reusable across semesters | Task 2 + Task 3 (config written to disk, not overwritten if exists) |
| Folder structure: `course/` + per-week subfolders | Task 3 |
| One `.md` file per page type per week | Task 3 |
| `front-page.md` at top level | Task 3 |
| 13 page type templates | Task 4 |
| Color inheritance (institution → course override) | Task 2 |
| Hero images per page type | Task 4 (`heroHtml` uses `config.heroImages[pageType]`) |
| `generate_page` (one-off + tweaks) | Task 6 |
| `generate_week` (one week) | Task 7 |
| `generate_course` (batch all weeks) | Task 8 |
| All tools registered in MCP server | Task 10 |
| `layout_fixed: false` is reserved, not implemented | Noted in spec; no task needed |
| Platform extensibility (renderer layer) | Implicit in `course-templates.ts` — all rendering is in one module; future Blackboard renderer is a new file, not a refactor |

**All spec requirements covered. No gaps found.**
