# SP11: Assignment Type Customization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `proj-assignment` and `tech-assignment` as first-class page types with Canvas-safe HTML templates, scaffold prompts, `team` and `timeline` front-matter flags, and full integration across `setup_course`, `generate_week`, and `generate_course`.

**Architecture:** Four files change — `src/course-types.ts` (type definitions), `src/tools/course-scaffold.ts` (prompts + front matter), `src/tools/course-templates.ts` (render functions + parser), and `tests/course-templates.test.ts` (new tests). The `setup-course.ts` wizard requires no changes because it reads `PAGE_TYPE_LABELS` dynamically. Import-course detection already writes the right filenames (SP10b). This plan wires up the rendering end.

**Tech Stack:** TypeScript, Node.js ESM, vitest. No new dependencies.

---

## File Map

| File | Change |
|---|---|
| `src/course-types.ts` | Add `'proj-assignment'`, `'tech-assignment'` to `PAGE_TYPES`; add labels; add `team?` and `timeline?` to `PageFrontMatter`; widen index signature to include `boolean` |
| `src/tools/course-scaffold.ts` | Add `PAGE_PROMPTS` entries for both types; add `buildFrontMatter` cases (proj gets `team: false` + `timeline: true` defaults) |
| `src/tools/course-templates.ts` | Add boolean parsing in `parseFrontMatterSimple`; add `renderProjAssignment()` and `renderTechAssignment()`; add cases to `renderPage` switch |
| `tests/course-templates.test.ts` | Add rendering tests for both new types and `team`/`timeline` flag behavior |

---

## Task 1: Update course-types.ts

**Files:**
- Modify: `src/course-types.ts`

- [ ] **Step 1: Write the failing TypeScript check**

Run:
```
npx tsc --noEmit
```
Expected: passes currently (clean baseline). This step confirms the baseline before changes.

- [ ] **Step 2: Update PAGE_TYPES, PAGE_TYPE_LABELS, PageFrontMatter**

Replace the entire contents of `src/course-types.ts` with:

```typescript
export const PAGE_TYPES = [
  'front-page',
  'overview',
  'resources',
  'slides',
  'videos',
  'assignment',
  'engage-assignment',
  'proj-assignment',
  'tech-assignment',
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
  'front-page':        'Front Page (course home)',
  'overview':          'Overview (learning objectives, intro, activities)',
  'resources':         'Resources (slides, videos, readings combined)',
  'slides':            'Slides (dedicated slide deck page)',
  'videos':            'Videos (dedicated Panopto video page)',
  'assignment':        'Assignment',
  'engage-assignment': 'Engage Assignment (short in-class activity)',
  'proj-assignment':   'Project Assignment (multi-week deliverable)',
  'tech-assignment':   'Technical Assignment (hands-on, tool-based)',
  'reading':           'Reading',
  'reading-quiz':      'Reading Quiz',
  'weekly-quiz':       'Weekly Quiz',
  'lab':               'Lab',
  'discussion-board':  'Discussion Board',
  'extra-credit':      'Extra Credit',
  'custom':            'Custom (professor-defined sections)',
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
  weekStr: string;
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
  team?: boolean;
  timeline?: boolean;
  [key: string]: string | number | boolean | undefined;
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

- [ ] **Step 3: Verify TypeScript compiles**

```
npx tsc --noEmit
```

Expected: no errors. If `course-templates.ts` reports an error about the exhaustive switch (function lacks a return), that will be fixed in Task 3 — it's expected at this point.

- [ ] **Step 4: Run tests**

```
npx vitest run
```

Expected: all existing tests pass (the type change doesn't break runtime).

- [ ] **Step 5: Commit**

```
git add src/course-types.ts
git commit -m "feat(sp11): add proj-assignment and tech-assignment to PAGE_TYPES"
```

---

## Task 2: Update course-scaffold.ts

**Files:**
- Modify: `src/tools/course-scaffold.ts`

- [ ] **Step 1: Write failing scaffold test**

Add to `tests/course-scaffold.test.ts` (after the existing tests):

```typescript
it('creates proj-assignment.md when proj-assignment is in pageTypes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'scaffold-proj-'));
  const config = makeConfig({ pageTypes: ['proj-assignment'], weeks: 1 });
  createCourseScaffold(config, dir);
  expect(existsSync(join(dir, 'week-01', 'proj-assignment.md'))).toBe(true);
});

it('proj-assignment.md front matter includes team and timeline flags', () => {
  const dir = mkdtempSync(join(tmpdir(), 'scaffold-proj-fm-'));
  const config = makeConfig({ pageTypes: ['proj-assignment'], weeks: 1 });
  createCourseScaffold(config, dir);
  const content = readFileSync(join(dir, 'week-01', 'proj-assignment.md'), 'utf-8');
  expect(content).toContain('team: false');
  expect(content).toContain('timeline: true');
});

it('creates tech-assignment.md when tech-assignment is in pageTypes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'scaffold-tech-'));
  const config = makeConfig({ pageTypes: ['tech-assignment'], weeks: 1 });
  createCourseScaffold(config, dir);
  expect(existsSync(join(dir, 'week-01', 'tech-assignment.md'))).toBe(true);
});

it('tech-assignment.md front matter includes team flag', () => {
  const dir = mkdtempSync(join(tmpdir(), 'scaffold-tech-fm-'));
  const config = makeConfig({ pageTypes: ['tech-assignment'], weeks: 1 });
  createCourseScaffold(config, dir);
  const content = readFileSync(join(dir, 'week-01', 'tech-assignment.md'), 'utf-8');
  expect(content).toContain('team: false');
});
```

Check what imports are already at the top of `tests/course-scaffold.test.ts` — add `readFileSync` to the import if it is not already present.

- [ ] **Step 2: Run tests — verify they fail**

```
npx vitest run tests/course-scaffold.test.ts
```

Expected: FAIL — `proj-assignment.md` not created.

- [ ] **Step 3: Add PAGE_PROMPTS entries and buildFrontMatter cases**

In `src/tools/course-scaffold.ts`, add two entries to the `PAGE_PROMPTS` record (insert after `'engage-assignment'`):

```typescript
  'proj-assignment': `## Brief
[What the project is and why it matters to students' professional development]

## Timeline
| Milestone | Due |
|---|---|
| Draft | [date] |
| Peer Review | [date] |
| Final Submission | [date] |

## Rubric
- [Criterion 1 — e.g. Research depth]: [X] pts
- [Criterion 2 — e.g. Presentation quality]: [X] pts
- [Criterion 3 — e.g. Reflection]: [X] pts

## Submission Details
- Due: [date]
- Points: [number]
- Submit via: [Canvas Assignments / link]

## Team
[If team project: group size, role descriptions, note that one submission per group — delete section if solo]
`,
  'tech-assignment': `## Brief
[What the technical task is and what skill or tool it practices]

## Setup
[Software, accounts, files, or hardware students need before starting — leave blank if nothing required]

## Tasks
1. [First technical step]
2. [Second technical step]
3. [Third technical step]

## Deliverable
[What to submit — e.g. screenshot, exported file, GitHub repo link, Canvas text entry]

## Rubric
- [Criterion 1]: [X] pts
- [Criterion 2]: [X] pts

## Team
[If team work: group size and submission instructions — delete section if solo]
`,
```

In `buildFrontMatter()`, add two new cases (insert after the `'assignment'` case, before `'front-page'`):

```typescript
  if (pageType === 'proj-assignment') {
    return base + `assignment_number: "${config.courseNumber.replace(/\s+/g, '')}.${String(week).padStart(2, '0')}"
due: ""
points: 0
team: false
timeline: true
---\n\n`;
  }

  if (pageType === 'tech-assignment') {
    return base + `assignment_number: "${config.courseNumber.replace(/\s+/g, '')}.${String(week).padStart(2, '0')}"
due: ""
points: 0
team: false
---\n\n`;
  }
```

- [ ] **Step 4: Run tests — verify they pass**

```
npx vitest run tests/course-scaffold.test.ts
```

Expected: all scaffold tests pass.

- [ ] **Step 5: Run full suite**

```
npx vitest run
```

Expected: all existing tests pass plus 4 new ones.

- [ ] **Step 6: Commit**

```
git add src/tools/course-scaffold.ts tests/course-scaffold.test.ts
git commit -m "feat(sp11): add proj-assignment and tech-assignment scaffold prompts and front matter"
```

---

## Task 3: Update course-templates.ts

**Files:**
- Modify: `src/tools/course-templates.ts`
- Modify: `tests/course-templates.test.ts`

- [ ] **Step 1: Write failing template tests**

Add to `tests/course-templates.test.ts` (after the existing tests in the `renderPage` describe block):

```typescript
  it('renders proj-assignment page with Brief and Rubric sections', () => {
    const p = writeTmp(`---
week: 1
title: "Project 1.1"
hero_image: ""
assignment_number: "ITM370.01"
due: "2026-09-12"
points: 100
team: false
timeline: true
---

## Brief
Build an AI-augmented workflow tool.

## Timeline
| Milestone | Due |
|---|---|
| Draft | 2026-09-05 |
| Final | 2026-09-12 |

## Rubric
- Research: 50 pts
- Presentation: 50 pts

## Submission Details
- Submit to Canvas Assignments
`);
    const content = parsePageContent(p, 'proj-assignment');
    const html = renderPage(content, config);
    expect(html).toContain('Brief');
    expect(html).toContain('Rubric');
    expect(html).not.toContain('<style');
    expect(html).not.toContain('<h1');
  });

  it('renders proj-assignment Timeline section when timeline: true', () => {
    const p = writeTmp(`---
week: 1
title: ""
hero_image: ""
assignment_number: "ITM370.01"
due: ""
points: 0
team: false
timeline: true
---

## Brief
Do the project.

## Timeline
| Milestone | Due |
|---|---|
| Draft | Monday |

## Submission Details
Submit to Canvas.
`);
    const content = parsePageContent(p, 'proj-assignment');
    expect(content.frontMatter.timeline).toBe(true);
    const html = renderPage(content, config);
    expect(html).toContain('Project Timeline');
    expect(html).toContain('Monday');
  });

  it('renders proj-assignment Team section when team: true', () => {
    const p = writeTmp(`---
week: 1
title: ""
hero_image: ""
assignment_number: "ITM370.01"
due: ""
points: 0
team: true
timeline: false
---

## Brief
Work together.

## Team
Groups of 3. One submission per group.

## Submission Details
Submit to Canvas.
`);
    const content = parsePageContent(p, 'proj-assignment');
    expect(content.frontMatter.team).toBe(true);
    const html = renderPage(content, config);
    expect(html).toContain('Team');
    expect(html).toContain('Groups of 3');
  });

  it('does not render Team section when team: false', () => {
    const p = writeTmp(`---
week: 1
title: ""
hero_image: ""
assignment_number: "ITM370.01"
due: ""
points: 0
team: false
timeline: false
---

## Brief
Solo work.

## Team
This should not appear.

## Submission Details
Submit to Canvas.
`);
    const content = parsePageContent(p, 'proj-assignment');
    expect(content.frontMatter.team).toBe(false);
    const html = renderPage(content, config);
    expect(html).not.toContain('This should not appear');
  });

  it('renders tech-assignment page with Setup and Tasks sections', () => {
    const p = writeTmp(`---
week: 2
title: "Tech Assignment 2.1"
hero_image: ""
assignment_number: "ITM370.02"
due: "2026-09-19"
points: 50
team: false
---

## Brief
Configure a local AI dev environment.

## Setup
Install Node.js 20 and VS Code.

## Tasks
1. Install Node.js
2. Install VS Code
3. Run hello world

## Deliverable
Screenshot of terminal output.

## Rubric
- Completion: 50 pts
`);
    const content = parsePageContent(p, 'tech-assignment');
    const html = renderPage(content, config);
    expect(html).toContain('Brief');
    expect(html).toContain('Setup');
    expect(html).toContain('Tasks');
    expect(html).toContain('Deliverable');
    expect(html).not.toContain('<style');
    expect(html).not.toContain('<h1');
  });

  it('renders tech-assignment Team section when team: true', () => {
    const p = writeTmp(`---
week: 2
title: ""
hero_image: ""
assignment_number: "ITM370.02"
due: ""
points: 0
team: true
---

## Brief
Pair exercise.

## Tasks
1. Do step one together.

## Team
Work in pairs. Both names on submission.

## Deliverable
ZIP file.
`);
    const content = parsePageContent(p, 'tech-assignment');
    expect(content.frontMatter.team).toBe(true);
    const html = renderPage(content, config);
    expect(html).toContain('Team');
    expect(html).toContain('Work in pairs');
  });
```

- [ ] **Step 2: Run tests — verify they fail**

```
npx vitest run tests/course-templates.test.ts
```

Expected: FAIL — `renderPage` has no case for `proj-assignment` or `tech-assignment`.

- [ ] **Step 3: Update parseFrontMatterSimple for boolean flags**

In `src/tools/course-templates.ts`, find `parseFrontMatterSimple` and add two lines after the `'due'` case:

```typescript
function parseFrontMatterSimple(yaml: string): PageFrontMatter {
  const result: PageFrontMatter = {};
  for (const line of yaml.split('\n')) {
    const m = line.match(/^([a-z_]+):\s*"?([^"]*)"?\s*$/);
    if (!m) continue;
    const key = m[1];
    const val = m[2].trim();
    if (key === 'week')              { result.week = parseInt(val, 10) || undefined; continue; }
    if (key === 'points')            { result.points = parseInt(val, 10) || undefined; continue; }
    if (key === 'hero_image')        { result.heroImage = val || undefined; continue; }
    if (key === 'assignment_number') { result.assignmentNumber = val || undefined; continue; }
    if (key === 'title')             { result.title = val || undefined; continue; }
    if (key === 'due')               { result.due = val || undefined; continue; }
    if (key === 'team')              { result.team = val === 'true'; continue; }
    if (key === 'timeline')          { result.timeline = val === 'true'; continue; }
    (result as Record<string, string | number | boolean | undefined>)[key] = val || undefined;
  }
  return result;
}
```

- [ ] **Step 4: Add renderProjAssignment function**

Add this function in `src/tools/course-templates.ts` directly after `renderEngageAssignment` (before `renderReading`):

```typescript
function renderProjAssignment(c: PageContent, cfg: CourseConfig): string {
  const week = c.frontMatter.week;
  const assignNum = c.frontMatter.assignmentNumber ?? '';
  const due = c.frontMatter.due ?? '';
  const points = c.frontMatter.points ?? '';
  const title = c.frontMatter.title || `Project ${assignNum}`;
  const isTeam = c.frontMatter.team === true;
  const hasTimeline = c.frontMatter.timeline === true;
  const meta = [
    isTeam ? 'Team Project' : 'Individual Project',
    due ? `Due: ${due}` : '',
    points ? `${points} points` : '',
  ].filter(Boolean).join(' &nbsp;·&nbsp; ');
  return wrap([
    heroHtml(cfg, 'proj-assignment', week, title, meta, c.frontMatter.heroImage),
    callout(
      `<h2 style="color: ${cfg.colors.primary}; font-family: Lato, sans-serif; font-size: 13px; font-weight: 700; margin: 0 0 12px; text-transform: uppercase; letter-spacing: 1px;">Brief</h2>` +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.7; color: #1A1A1A;">${markdownToHtml(c.sections['Brief'] ?? '')}</div>`,
      cfg,
    ),
    hasTimeline ? card(
      sectionHeading('Project Timeline') +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.8; color: #1A1A1A;">${markdownToHtml(c.sections['Timeline'] ?? '')}</div>`
    ) : '',
    isTeam ? card(
      sectionHeading('Team') +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.75; color: #1A1A1A;">${markdownToHtml(c.sections['Team'] ?? '')}</div>`
    ) : '',
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
```

- [ ] **Step 5: Add renderTechAssignment function**

Add directly after `renderProjAssignment` (still before `renderReading`):

```typescript
function renderTechAssignment(c: PageContent, cfg: CourseConfig): string {
  const week = c.frontMatter.week;
  const assignNum = c.frontMatter.assignmentNumber ?? '';
  const due = c.frontMatter.due ?? '';
  const points = c.frontMatter.points ?? '';
  const title = c.frontMatter.title || `Tech Assignment ${assignNum}`;
  const isTeam = c.frontMatter.team === true;
  const meta = [
    isTeam ? 'Team' : 'Individual',
    due ? `Due: ${due}` : '',
    points ? `${points} points` : '',
  ].filter(Boolean).join(' &nbsp;·&nbsp; ');
  return wrap([
    heroHtml(cfg, 'tech-assignment', week, title, meta, c.frontMatter.heroImage),
    callout(
      `<h2 style="color: ${cfg.colors.primary}; font-family: Lato, sans-serif; font-size: 13px; font-weight: 700; margin: 0 0 12px; text-transform: uppercase; letter-spacing: 1px;">Brief</h2>` +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.7; color: #1A1A1A;">${markdownToHtml(c.sections['Brief'] ?? '')}</div>`,
      cfg,
    ),
    c.sections['Setup'] ? card(
      sectionHeading('Setup') +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.75; color: #1A1A1A;">${markdownToHtml(c.sections['Setup'])}</div>`
    ) : '',
    card(
      sectionHeading('Tasks') +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.8; color: #1A1A1A;">${markdownToHtml(c.sections['Tasks'] ?? '')}</div>`
    ),
    isTeam ? card(
      sectionHeading('Team') +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.75; color: #1A1A1A;">${markdownToHtml(c.sections['Team'] ?? '')}</div>`
    ) : '',
    card(
      sectionHeading('Deliverable') +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.75; color: #1A1A1A;">${markdownToHtml(c.sections['Deliverable'] ?? '')}</div>`
    ),
    c.sections['Rubric'] ? card(
      sectionHeading('Rubric') +
      `<div style="font-family: Lato, sans-serif; font-size: 15px; line-height: 1.8; color: #1A1A1A;">${markdownToHtml(c.sections['Rubric'])}</div>`
    ) : '',
  ]);
}
```

- [ ] **Step 6: Add cases to renderPage switch**

In the `renderPage` switch, add two cases after `'engage-assignment'`:

```typescript
    case 'engage-assignment':  return renderEngageAssignment(content, config);
    case 'proj-assignment':    return renderProjAssignment(content, config);
    case 'tech-assignment':    return renderTechAssignment(content, config);
    case 'reading':            return renderReading(content, config);
```

- [ ] **Step 7: Run template tests — verify they pass**

```
npx vitest run tests/course-templates.test.ts
```

Expected: all tests pass including 6 new ones.

- [ ] **Step 8: Run full suite**

```
npx vitest run
```

Expected: all tests pass. Run `npx tsc --noEmit` — no TypeScript errors.

- [ ] **Step 9: Commit**

```
git add src/tools/course-templates.ts tests/course-templates.test.ts
git commit -m "feat(sp11): add proj-assignment and tech-assignment templates with team and timeline flags"
```

---

## Task 4: Version Bump + Docs + Push

**Files:**
- Modify: `package.json`
- Modify: `docs/feature-roadmap.md`

- [ ] **Step 1: Run full suite one final time**

```
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 2: Verify TypeScript**

```
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Bump version to 0.9.8**

In `package.json`, change `"version": "0.9.7"` to `"version": "0.9.8"`.

- [ ] **Step 4: Update roadmap**

In `docs/feature-roadmap.md`:
- Change `**Last updated:** 2026-05-15 (SP10b complete)` to `**Last updated:** 2026-05-15 (SP11 complete)`
- Move the SP11 "Coming Next" section to "Now Available (v0.9.8)" and update its content:

Replace:
```markdown
## Coming Next (v1.0)

### SP11 — Assignment Type Customization

Professors will be able to define which assignment types their course uses — so `setup_course`, `generate_week`, and `generate_course` know about project, technical, and engage assignments as first-class page types alongside the standard assignment.

| Feature | What professors can do |
|---|---|
| Assignment type selection in `setup_course` | Choose which assignment types appear each week: Assignment, Engage Assignment, Project Assignment, Technical Assignment |
| Per-type page templates | Each assignment type gets its own Canvas page template with appropriate section structure |
| `proj-assignment`, `tech-assignment` page types | Full support for project and technical assignment pages across all generation tools |
```

With:
```markdown
## Now Available (v0.9.8)

### Assignment Type Customization (SP11)

Professors can now select project and technical assignment types in `setup_course` and generate Canvas-ready pages for each.

| Feature | What professors can do |
|---|---|
| `proj-assignment` page type | Generate a project assignment page with Brief, Timeline, Rubric, and Submission sections |
| `tech-assignment` page type | Generate a technical assignment page with Brief, Setup, Tasks, Deliverable, and Rubric sections |
| `team: true` front-matter flag | Any assignment type renders a Team section with group formation and submission instructions |
| `timeline: true` front-matter flag | Project assignments render a milestone table (Draft → Peer Review → Final Submission) |
| `setup_course` wizard | `proj-assignment` and `tech-assignment` appear in the page type checkbox list automatically |

## Coming Next (v1.0)

No specific SP is planned yet. Feedback from the AI Institute (Day 3) will shape the next sprint.
```

- [ ] **Step 5: Commit**

```
git add package.json docs/feature-roadmap.md
git commit -m "0.9.8"
```

- [ ] **Step 6: Push to both remotes**

```
git push origin master
git push backup master
```

---

## Self-Review

**Spec coverage:**

| Spec requirement | Covered by |
|---|---|
| `proj-assignment` in PAGE_TYPES | Task 1 |
| `tech-assignment` in PAGE_TYPES | Task 1 |
| PAGE_TYPE_LABELS entries for both | Task 1 |
| `team?: boolean` in PageFrontMatter | Task 1 |
| `timeline?: boolean` in PageFrontMatter | Task 1 |
| Scaffold prompts for proj-assignment | Task 2 |
| Scaffold prompts for tech-assignment | Task 2 |
| `buildFrontMatter` includes `team: false` + `timeline: true` for proj | Task 2 |
| `buildFrontMatter` includes `team: false` for tech | Task 2 |
| `parseFrontMatterSimple` parses boolean flags | Task 3 |
| `renderProjAssignment` with Timeline and Team sections | Task 3 |
| `renderTechAssignment` with Setup, Tasks, Deliverable, Team sections | Task 3 |
| `renderPage` switch handles both new types | Task 3 |
| `setup_course` wizard shows new types automatically | Covered by PAGE_TYPE_LABELS — no code change needed |
| Tests for all new behavior | Tasks 2 and 3 |

**Placeholder scan:** None found.

**Type consistency:** `team` and `timeline` are `boolean` in `PageFrontMatter`, parsed as `val === 'true'` in `parseFrontMatterSimple`, read as `=== true` in both render functions. Consistent throughout.
