# SP10b: Canvas Backup Import — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `import_course` — an MCP tool that reads a `canvas-backup` archive folder and scaffolds a pre-filled `course/` folder from last semester's content, ready to update and regenerate.

**Architecture:** Reads the canvas-backup archive format (see `github.com/Ryfter/canvas-backup`): JSON manifests in `manifests/`, HTML + JSON pairs in `pages/` and `assignments/`, numbered module folders in `modules/`. Maps modules → weeks, detects page types from existing content, extracts text from HTML into `.md` files, and calls `createCourseScaffold` to write the folder. Content that can't be cleanly extracted is written as `[NEEDS REVIEW]` placeholders.

**Prerequisite:** SP10a must be complete. This plan depends on `createCourseScaffold` from `src/tools/course-scaffold.ts` and the course types from `src/course-types.ts`.

**Tech Stack:** TypeScript, Node.js ESM (`node:fs`, `node:path`), vitest. No new dependencies — HTML parsing uses regex extraction (Canvas-backup HTML is well-structured, generated output, not arbitrary web HTML).

---

## Spec Reference

`docs/superpowers/specs/2026-05-14-course-design-system-design.md` — Import Workflow section.

---

## Canvas Backup Archive Format

```
ArchiveRoot/
  manifests/
    course.json        ← course metadata (name, code, etc.)
    modules.json       ← module list with position order
    pages.json         ← page list (title, url, body)
    assignments.json   ← assignment list (name, description, due_at, points_possible)
    quizzes.json       ← quiz metadata only (no question content)
    discussions.json   ← discussion list (title, message)
  modules/
    00-module-index.md
    01-Module Title/
      module.json      ← {id, name, position}
      items.json       ← [{type, title, content_id, position}]
      README.md
  pages/
    Page Title.html    ← raw Canvas page body HTML
    Page Title.json    ← {title, url, updated_at, ...}
  assignments/
    Assignment Name.html  ← assignment description HTML
    Assignment Name.json  ← {name, due_at, points_possible, ...}
  quizzes/             ← JSON only, no HTML
  discussions/
    Discussion Title.json
    Discussion Title.html  ← if Canvas provided a message body
```

Key mapping decisions:
- Each module → one week folder
- Module `items.json` types: `Page`, `Assignment`, `Quiz`, `Discussion`, `File`, `ExternalUrl`, `ExternalTool`
- `Page` items → look up in `pages/` by title → `overview.md` or `resources.md` (heuristic)
- `Assignment` items → look up in `assignments/` → `assignment.md`
- `Quiz` items → `weekly-quiz.md` or `reading-quiz.md` placeholder
- `Discussion` items → `discussion-board.md`
- `File`, `ExternalUrl`, `ExternalTool` → noted as `[NEEDS REVIEW]` in `resources.md`

---

## File Map

### New files

| File | Responsibility |
|---|---|
| `src/tools/import-course.ts` | `importCourse` function + HTML extraction utilities |
| `tests/import-course.test.ts` | Tests for import logic |
| `tests/fixtures/canvas-backup/ITM370/manifests/course.json` | Fixture: course metadata |
| `tests/fixtures/canvas-backup/ITM370/manifests/modules.json` | Fixture: module list |
| `tests/fixtures/canvas-backup/ITM370/manifests/pages.json` | Fixture: page list |
| `tests/fixtures/canvas-backup/ITM370/manifests/assignments.json` | Fixture: assignment list |
| `tests/fixtures/canvas-backup/ITM370/manifests/quizzes.json` | Fixture: quiz metadata |
| `tests/fixtures/canvas-backup/ITM370/manifests/discussions.json` | Fixture: discussion list |
| `tests/fixtures/canvas-backup/ITM370/modules/00-module-index.md` | Fixture: module index |
| `tests/fixtures/canvas-backup/ITM370/modules/01-Week 1 Introduction/module.json` | Fixture |
| `tests/fixtures/canvas-backup/ITM370/modules/01-Week 1 Introduction/items.json` | Fixture |
| `tests/fixtures/canvas-backup/ITM370/modules/01-Week 1 Introduction/README.md` | Fixture |
| `tests/fixtures/canvas-backup/ITM370/modules/02-Week 2 Foundations/module.json` | Fixture |
| `tests/fixtures/canvas-backup/ITM370/modules/02-Week 2 Foundations/items.json` | Fixture |
| `tests/fixtures/canvas-backup/ITM370/modules/02-Week 2 Foundations/README.md` | Fixture |
| `tests/fixtures/canvas-backup/ITM370/pages/Week 1 Overview.html` | Fixture |
| `tests/fixtures/canvas-backup/ITM370/pages/Week 1 Overview.json` | Fixture |
| `tests/fixtures/canvas-backup/ITM370/pages/Week 1 Resources.html` | Fixture |
| `tests/fixtures/canvas-backup/ITM370/pages/Week 1 Resources.json` | Fixture |
| `tests/fixtures/canvas-backup/ITM370/assignments/Assignment 1.1.html` | Fixture |
| `tests/fixtures/canvas-backup/ITM370/assignments/Assignment 1.1.json` | Fixture |
| `tests/fixtures/canvas-backup/ITM370/discussions/Week 1 Discussion.json` | Fixture |
| `tests/fixtures/canvas-backup/ITM370/discussions/Week 1 Discussion.html` | Fixture |

### Modified files

| File | Change |
|---|---|
| `src/index.ts` | Register `import_course` tool |

---

## Task 1: Canvas Backup Fixtures

**Files:** All fixture files listed above.

- [ ] **Step 1: Create `tests/fixtures/canvas-backup/ITM370/manifests/course.json`**

```json
{
  "id": 12345,
  "name": "AI Augmented Projects",
  "course_code": "ITM 370",
  "sis_course_id": "ITM370-F26",
  "start_at": "2026-08-24T00:00:00Z",
  "end_at": "2026-12-15T00:00:00Z",
  "time_zone": "America/Denver"
}
```

- [ ] **Step 2: Create `tests/fixtures/canvas-backup/ITM370/manifests/modules.json`**

```json
[
  { "id": 101, "name": "Week 1: Introduction", "position": 1, "items_count": 4 },
  { "id": 102, "name": "Week 2: Foundations",  "position": 2, "items_count": 3 }
]
```

- [ ] **Step 3: Create `tests/fixtures/canvas-backup/ITM370/manifests/pages.json`**

```json
[
  { "title": "Week 1 Overview",   "url": "week-1-overview",   "updated_at": "2026-08-28T10:00:00Z" },
  { "title": "Week 1 Resources",  "url": "week-1-resources",  "updated_at": "2026-08-28T10:00:00Z" },
  { "title": "Week 2 Overview",   "url": "week-2-overview",   "updated_at": "2026-09-04T10:00:00Z" }
]
```

- [ ] **Step 4: Create `tests/fixtures/canvas-backup/ITM370/manifests/assignments.json`**

```json
[
  {
    "id": 201,
    "name": "Assignment 1.1",
    "due_at": "2026-09-05T23:59:00Z",
    "points_possible": 50,
    "submission_types": ["online_upload"]
  },
  {
    "id": 202,
    "name": "Assignment 2.1",
    "due_at": "2026-09-12T23:59:00Z",
    "points_possible": 75,
    "submission_types": ["online_upload"]
  }
]
```

- [ ] **Step 5: Create `tests/fixtures/canvas-backup/ITM370/manifests/quizzes.json`**

```json
[
  { "id": 301, "title": "Reading Quiz 1", "quiz_type": "assignment", "points_possible": 10 },
  { "id": 302, "title": "Week 2 Quiz",    "quiz_type": "assignment", "points_possible": 15 }
]
```

- [ ] **Step 6: Create `tests/fixtures/canvas-backup/ITM370/manifests/discussions.json`**

```json
[
  { "id": 401, "title": "Week 1 Discussion: Share Your AI Experience", "posted_at": "2026-08-28T08:00:00Z" },
  { "id": 402, "title": "Week 2 Discussion: Prompt Critique",          "posted_at": "2026-09-04T08:00:00Z" }
]
```

- [ ] **Step 7: Create module folders**

Create `tests/fixtures/canvas-backup/ITM370/modules/00-module-index.md`:

```markdown
# Module Index

| Position | Name |
|---|---|
| 1 | Week 1: Introduction |
| 2 | Week 2: Foundations |
```

Create `tests/fixtures/canvas-backup/ITM370/modules/01-Week 1 Introduction/module.json`:

```json
{ "id": 101, "name": "Week 1: Introduction", "position": 1 }
```

Create `tests/fixtures/canvas-backup/ITM370/modules/01-Week 1 Introduction/items.json`:

```json
[
  { "id": 1001, "type": "Page",       "title": "Week 1 Overview",                       "content_id": null, "position": 1 },
  { "id": 1002, "type": "Page",       "title": "Week 1 Resources",                      "content_id": null, "position": 2 },
  { "id": 1003, "type": "Assignment", "title": "Assignment 1.1",                         "content_id": 201,  "position": 3 },
  { "id": 1004, "type": "Discussion", "title": "Week 1 Discussion: Share Your AI Experience", "content_id": 401, "position": 4 }
]
```

Create `tests/fixtures/canvas-backup/ITM370/modules/01-Week 1 Introduction/README.md`:

```markdown
# Week 1: Introduction

Items: Week 1 Overview, Week 1 Resources, Assignment 1.1, Week 1 Discussion
```

Create `tests/fixtures/canvas-backup/ITM370/modules/02-Week 2 Foundations/module.json`:

```json
{ "id": 102, "name": "Week 2: Foundations", "position": 2 }
```

Create `tests/fixtures/canvas-backup/ITM370/modules/02-Week 2 Foundations/items.json`:

```json
[
  { "id": 2001, "type": "Page",       "title": "Week 2 Overview",    "content_id": null, "position": 1 },
  { "id": 2002, "type": "Assignment", "title": "Assignment 2.1",     "content_id": 202,  "position": 2 },
  { "id": 2003, "type": "Quiz",       "title": "Week 2 Quiz",        "content_id": 302,  "position": 3 }
]
```

Create `tests/fixtures/canvas-backup/ITM370/modules/02-Week 2 Foundations/README.md`:

```markdown
# Week 2: Foundations

Items: Week 2 Overview, Assignment 2.1, Week 2 Quiz
```

- [ ] **Step 8: Create page HTML + JSON fixtures**

Create `tests/fixtures/canvas-backup/ITM370/pages/Week 1 Overview.html`:

```html
<h2>Learning Objectives</h2>
<ul>
<li>Define AI augmentation and distinguish it from AI replacement</li>
<li>Identify three professional domains where AI augmentation is already in use</li>
</ul>
<h2>Introduction</h2>
<p>This week we lay the foundation. We'll look at what AI augmentation means in practice.</p>
<h2>Activities</h2>
<ul>
<li>Lecture: What is AI Augmentation? (Panopto — 22 min)</li>
<li>Reading: Chapter 1 — due Sunday</li>
<li>Assignment 1.1 — due Friday</li>
</ul>
```

Create `tests/fixtures/canvas-backup/ITM370/pages/Week 1 Overview.json`:

```json
{
  "title": "Week 1 Overview",
  "url": "week-1-overview",
  "updated_at": "2026-08-28T10:00:00Z",
  "published": true
}
```

Create `tests/fixtures/canvas-backup/ITM370/pages/Week 1 Resources.html`:

```html
<h2>Slides</h2>
<p><a href="https://slides.example.com/week1">Week 1: Introduction Slides</a></p>
<h2>Videos</h2>
<p>Panopto: Week 1 Lecture (22 min)</p>
<h2>Readings</h2>
<ul>
<li><a href="https://example.com/article1">What is AI Augmentation?</a></li>
<li>Chapter 1 of the course text</li>
</ul>
```

Create `tests/fixtures/canvas-backup/ITM370/pages/Week 1 Resources.json`:

```json
{ "title": "Week 1 Resources", "url": "week-1-resources", "updated_at": "2026-08-28T10:00:00Z", "published": true }
```

- [ ] **Step 9: Create assignment HTML + JSON fixtures**

Create `tests/fixtures/canvas-backup/ITM370/assignments/Assignment 1.1.html`:

```html
<p>Pick three tasks from your current work or studies that you perform at least once a week.</p>
<p>For each task, document how long it currently takes, what the pain points are, and write one paragraph on how an AI tool might augment your process.</p>
<h2>Rubric</h2>
<ul>
<li>Task documentation (3 tasks described clearly): 15 pts</li>
<li>Time/pain point analysis: 15 pts</li>
<li>AI augmentation proposal: 15 pts</li>
<li>Writing quality: 5 pts</li>
</ul>
```

Create `tests/fixtures/canvas-backup/ITM370/assignments/Assignment 1.1.json`:

```json
{
  "id": 201,
  "name": "Assignment 1.1",
  "due_at": "2026-09-05T23:59:00Z",
  "points_possible": 50,
  "submission_types": ["online_upload"]
}
```

- [ ] **Step 10: Create discussion fixture**

Create `tests/fixtures/canvas-backup/ITM370/discussions/Week 1 Discussion.json`:

```json
{
  "id": 401,
  "title": "Week 1 Discussion: Share Your AI Experience",
  "posted_at": "2026-08-28T08:00:00Z"
}
```

Create `tests/fixtures/canvas-backup/ITM370/discussions/Week 1 Discussion.html`:

```html
<p>Introduce yourself and share one task from your professional or academic life that you'd like to augment with AI.</p>
<p>Respond to at least two classmates with a question or observation about their use case.</p>
```

- [ ] **Step 11: Commit all fixtures**

```bash
git add tests/fixtures/canvas-backup/
git commit -m "test(sp10b): add canvas-backup fixture archive"
```

---

## Task 2: import_course Tool

**Files:**
- Create: `src/tools/import-course.ts`
- Create: `tests/import-course.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/import-course.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { importCourse } from '../src/tools/import-course.js';

const archiveDir = join(import.meta.dirname, 'fixtures/canvas-backup/ITM370');

describe('importCourse — full course', () => {
  it('creates course-config.md from archive', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'ic-'));
    importCourse({ archivePath: archiveDir, outputDir: outDir });
    expect(existsSync(join(outDir, 'course-config.md'))).toBe(true);
  });

  it('course-config.md contains course name from course.json', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'ic-'));
    importCourse({ archivePath: archiveDir, outputDir: outDir });
    const config = readFileSync(join(outDir, 'course-config.md'), 'utf-8');
    expect(config).toContain('AI Augmented Projects');
    expect(config).toContain('ITM 370');
  });

  it('creates week folder for each module', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'ic-'));
    importCourse({ archivePath: archiveDir, outputDir: outDir });
    expect(existsSync(join(outDir, 'week-01'))).toBe(true);
    expect(existsSync(join(outDir, 'week-02'))).toBe(true);
  });

  it('creates overview.md for Page items', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'ic-'));
    importCourse({ archivePath: archiveDir, outputDir: outDir });
    expect(existsSync(join(outDir, 'week-01', 'overview.md'))).toBe(true);
  });

  it('overview.md contains extracted content from page HTML', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'ic-'));
    importCourse({ archivePath: archiveDir, outputDir: outDir });
    const content = readFileSync(join(outDir, 'week-01', 'overview.md'), 'utf-8');
    expect(content).toContain('AI augmentation');
    expect(content).toContain('Learning Objectives');
  });

  it('creates resources.md for Resource-type pages', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'ic-'));
    importCourse({ archivePath: archiveDir, outputDir: outDir });
    expect(existsSync(join(outDir, 'week-01', 'resources.md'))).toBe(true);
  });

  it('creates assignment.md for Assignment items', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'ic-'));
    importCourse({ archivePath: archiveDir, outputDir: outDir });
    expect(existsSync(join(outDir, 'week-01', 'assignment.md'))).toBe(true);
  });

  it('assignment.md contains due date and points from assignment.json', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'ic-'));
    importCourse({ archivePath: archiveDir, outputDir: outDir });
    const content = readFileSync(join(outDir, 'week-01', 'assignment.md'), 'utf-8');
    expect(content).toContain('50');
    expect(content).toContain('2026-09-05');
  });

  it('creates discussion-board.md for Discussion items', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'ic-'));
    importCourse({ archivePath: archiveDir, outputDir: outDir });
    expect(existsSync(join(outDir, 'week-01', 'discussion-board.md'))).toBe(true);
  });

  it('creates weekly-quiz.md for Quiz items', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'ic-'));
    importCourse({ archivePath: archiveDir, outputDir: outDir });
    expect(existsSync(join(outDir, 'week-02', 'weekly-quiz.md'))).toBe(true);
  });

  it('weekly-quiz.md contains [NEEDS REVIEW] for quiz question content', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'ic-'));
    importCourse({ archivePath: archiveDir, outputDir: outDir });
    const content = readFileSync(join(outDir, 'week-02', 'weekly-quiz.md'), 'utf-8');
    expect(content).toContain('[NEEDS REVIEW]');
  });

  it('returns import summary with file count', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'ic-'));
    const result = importCourse({ archivePath: archiveDir, outputDir: outDir });
    expect(result.filesCreated).toBeGreaterThan(0);
    expect(result.weeksImported).toBe(2);
  });
});

describe('importCourse — single week', () => {
  it('creates only week-01 folder when weekNumber is 1', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'ic-'));
    importCourse({ archivePath: archiveDir, outputDir: outDir, weekNumber: 1 });
    expect(existsSync(join(outDir, 'week-01'))).toBe(true);
    expect(existsSync(join(outDir, 'week-02'))).toBe(false);
  });
});

describe('importCourse — single assignment', () => {
  it('creates assignment.md only when assignmentName is specified', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'ic-'));
    importCourse({ archivePath: archiveDir, outputDir: outDir, assignmentName: 'Assignment 1.1' });
    expect(existsSync(join(outDir, 'week-01', 'assignment.md'))).toBe(true);
    // Should not create overview or resources
    expect(existsSync(join(outDir, 'week-01', 'overview.md'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npx vitest run tests/import-course.test.ts
```

Expected: FAIL — `importCourse` not found.

- [ ] **Step 3: Write `src/tools/import-course.ts`**

```typescript
// src/tools/import-course.ts

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createCourseScaffold } from './course-scaffold.js';
import type { CourseConfig, PageType } from '../course-types.js';

// ─── Types ───────────────────────────────────────────────────────────────────

interface CourseJson {
  id: number;
  name: string;
  course_code: string;
  sis_course_id?: string;
}

interface ModuleJson {
  id: number;
  name: string;
  position: number;
}

interface ModuleItem {
  id: number;
  type: 'Page' | 'Assignment' | 'Quiz' | 'Discussion' | 'File' | 'ExternalUrl' | 'ExternalTool' | string;
  title: string;
  content_id: number | null;
  position: number;
}

interface AssignmentJson {
  id: number;
  name: string;
  due_at: string | null;
  points_possible: number;
  submission_types: string[];
}

interface DiscussionJson {
  id: number;
  title: string;
  posted_at?: string;
}

export interface ImportCourseInput {
  archivePath: string;
  outputDir: string;
  weekNumber?: number;          // import one specific week (1-based)
  assignmentName?: string;      // import one specific assignment by name
}

export interface ImportCourseResult {
  filesCreated: number;
  weeksImported: number;
  warnings: string[];
}

// ─── HTML → Markdown extraction ───────────────────────────────────────────────

function stripHtmlTags(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&middot;/g, '·')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractSectionsFromHtml(html: string): Record<string, string> {
  const sections: Record<string, string> = {};
  const headingRegex = /<h[2-4][^>]*>(.*?)<\/h[2-4]>/gi;
  const parts = html.split(headingRegex);

  // parts alternates: [pre-heading-content, heading-text, content, heading-text, content, ...]
  if (parts.length <= 1) {
    sections['Content'] = stripHtmlTags(html);
    return sections;
  }

  // parts[0] is content before first heading (often empty)
  for (let i = 1; i < parts.length; i += 2) {
    const heading = stripHtmlTags(parts[i]).trim();
    const content = parts[i + 1] ? stripHtmlTags(parts[i + 1]).trim() : '';
    if (heading) sections[heading] = content;
  }

  return sections;
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  return iso.slice(0, 10); // YYYY-MM-DD
}

// ─── Page type detection ──────────────────────────────────────────────────────

function detectPageTypeFromTitle(title: string): PageType {
  const lower = title.toLowerCase();
  if (lower.includes('resource') || lower.includes('slide') || lower.includes('video')) return 'resources';
  if (lower.includes('overview') || lower.includes('introduction') || lower.includes('welcome')) return 'overview';
  if (lower.includes('lab')) return 'lab';
  return 'overview'; // default for unrecognized pages
}

// ─── .md content builders ─────────────────────────────────────────────────────

function buildOverviewMd(week: number, title: string, sections: Record<string, string>): string {
  const objectives = sections['Learning Objectives'] ?? sections['Objectives'] ?? '[NEEDS REVIEW — paste learning objectives here]';
  const intro = sections['Introduction'] ?? sections['Overview'] ?? sections['Content'] ?? '[NEEDS REVIEW — paste introduction here]';
  const activities = sections['Activities'] ?? sections['This Week'] ?? '[NEEDS REVIEW — paste activities list here]';

  return `---
week: ${week}
title: "${title}"
hero_image: ""
---

## Learning Objectives
${objectives}

## Introduction
${intro}

## Activities
${activities}
`;
}

function buildResourcesMd(week: number, title: string, sections: Record<string, string>): string {
  const slides   = sections['Slides']   ?? '[NEEDS REVIEW — paste slide links here]';
  const videos   = sections['Videos']   ?? '[NEEDS REVIEW — paste Panopto IDs here]';
  const readings = sections['Readings'] ?? '[NEEDS REVIEW — paste reading links here]';
  const other    = sections['Other']    ?? '';

  return `---
week: ${week}
title: "${title}"
hero_image: ""
---

## Slides
${slides}

## Videos
${videos}

## Readings
${readings}
${other ? `\n## Other\n${other}\n` : ''}`;
}

function buildAssignmentMd(week: number, assignment: AssignmentJson, bodyHtml: string): string {
  const sections = extractSectionsFromHtml(bodyHtml);
  const brief  = sections['Brief']  ?? sections['Content'] ?? stripHtmlTags(bodyHtml);
  const rubric = sections['Rubric'] ?? '';
  const due = formatDate(assignment.due_at);

  return `---
week: ${week}
title: ""
hero_image: ""
assignment_number: "${assignment.name}"
due: "${due}"
points: ${assignment.points_possible}
---

## Brief
${brief}

## Rubric
${rubric || '[NEEDS REVIEW — paste rubric here]'}

## Submission Details
- Due: ${due}
- Points: ${assignment.points_possible}
- Submit via: [NEEDS REVIEW — add Canvas submission link]
`;
}

function buildDiscussionMd(week: number, title: string, bodyHtml: string): string {
  const prompt = bodyHtml ? stripHtmlTags(bodyHtml).trim() : '[NEEDS REVIEW — paste discussion prompt here]';
  return `---
week: ${week}
title: "${title}"
hero_image: ""
---

## Prompt
${prompt}

## Requirements
- Initial post: [NEEDS REVIEW — add word count and due date]
- Responses: [NEEDS REVIEW — add peer response requirements]

## Grading
[NEEDS REVIEW — add grading description]
`;
}

function buildQuizMd(week: number, quizTitle: string, quizType: 'weekly-quiz' | 'reading-quiz'): string {
  return `---
week: ${week}
title: "${quizTitle}"
hero_image: ""
---

## Quiz Details
- Opens: [NEEDS REVIEW]
- Closes: [NEEDS REVIEW]
- Questions: [NEEDS REVIEW — quiz question content not available via Canvas API]
- Points: [NEEDS REVIEW]

## ${quizType === 'reading-quiz' ? 'What It Covers' : 'Topics Covered'}
[NEEDS REVIEW — quiz question content is not exported by canvas-backup; check Canvas directly]

## Access
[NEEDS REVIEW — add Canvas quiz link]
`;
}

// ─── Archive readers ──────────────────────────────────────────────────────────

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, 'utf-8')) as T;
}

function readHtmlFile(dir: string, title: string): string {
  const htmlPath = join(dir, `${title}.html`);
  return existsSync(htmlPath) ? readFileSync(htmlPath, 'utf-8') : '';
}

function findModuleFolders(modulesDir: string): Array<{ position: number; folder: string }> {
  if (!existsSync(modulesDir)) return [];
  return readdirSync(modulesDir, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => {
      const match = e.name.match(/^(\d+)-/);
      return match ? { position: parseInt(match[1], 10), folder: join(modulesDir, e.name) } : null;
    })
    .filter((x): x is { position: number; folder: string } => x !== null)
    .sort((a, b) => a.position - b.position);
}

// ─── Main import function ─────────────────────────────────────────────────────

export function importCourse(input: ImportCourseInput): ImportCourseResult {
  const { archivePath, outputDir, weekNumber, assignmentName } = input;
  const archiveAbs = resolve(archivePath);
  const outAbs = resolve(outputDir);
  mkdirSync(outAbs, { recursive: true });

  const manifestsDir   = join(archiveAbs, 'manifests');
  const modulesDir     = join(archiveAbs, 'modules');
  const pagesDir       = join(archiveAbs, 'pages');
  const assignmentsDir = join(archiveAbs, 'assignments');
  const discussionsDir = join(archiveAbs, 'discussions');

  const course      = readJson<CourseJson>(join(manifestsDir, 'course.json'));
  const modules     = readJson<ModuleJson[]>(join(manifestsDir, 'modules.json'));
  const assignments = existsSync(join(manifestsDir, 'assignments.json'))
    ? readJson<AssignmentJson[]>(join(manifestsDir, 'assignments.json'))
    : [];

  const assignmentsByName = new Map(assignments.map(a => [a.name, a]));

  const moduleFolders = findModuleFolders(modulesDir);
  const warnings: string[] = [];
  let filesCreated = 0;
  let weeksImported = 0;

  // Determine which weeks to process
  const sortedModules = modules.sort((a, b) => a.position - b.position);
  const weeksToProcess = weekNumber
    ? sortedModules.filter((_, i) => i + 1 === weekNumber)
    : sortedModules;

  for (let idx = 0; idx < weeksToProcess.length; idx++) {
    const mod = weeksToProcess[idx];
    const weekNum = weekNumber ?? sortedModules.indexOf(mod) + 1;
    const weekStr = `week-${String(weekNum).padStart(2, '0')}`;
    const weekDir = join(outAbs, weekStr);
    mkdirSync(weekDir, { recursive: true });

    // Find matching module folder by position
    const modFolder = moduleFolders.find(f => f.position === mod.position);
    if (!modFolder) {
      warnings.push(`No module folder found for module "${mod.name}" (position ${mod.position})`);
      continue;
    }

    const itemsPath = join(modFolder.folder, 'items.json');
    if (!existsSync(itemsPath)) {
      warnings.push(`items.json not found for module "${mod.name}"`);
      continue;
    }

    const items = readJson<ModuleItem[]>(itemsPath);
    const pageItems = items.filter(i => i.type === 'Page');
    const assignmentItems = items.filter(i => i.type === 'Assignment');
    const quizItems = items.filter(i => i.type === 'Quiz');
    const discussionItems = items.filter(i => i.type === 'Discussion');

    // Single assignment mode
    if (assignmentName) {
      const target = assignmentItems.find(a => a.title === assignmentName);
      if (!target) {
        warnings.push(`Assignment "${assignmentName}" not found in module "${mod.name}"`);
        continue;
      }
      const assignData = assignmentsByName.get(target.title);
      if (!assignData) {
        warnings.push(`Assignment metadata not found for "${target.title}"`);
        continue;
      }
      const html = readHtmlFile(assignmentsDir, target.title);
      const mdContent = buildAssignmentMd(weekNum, assignData, html);
      writeFileSync(join(weekDir, 'assignment.md'), mdContent, 'utf-8');
      filesCreated++;
      weeksImported++;
      continue;
    }

    // Page items → overview or resources
    for (const item of pageItems) {
      const html = readHtmlFile(pagesDir, item.title);
      const sections = extractSectionsFromHtml(html);
      const pageType = detectPageTypeFromTitle(item.title);
      const mdPath = join(weekDir, `${pageType}.md`);

      let content: string;
      if (pageType === 'resources') {
        content = buildResourcesMd(weekNum, item.title, sections);
      } else {
        content = buildOverviewMd(weekNum, item.title, sections);
      }

      writeFileSync(mdPath, content, 'utf-8');
      filesCreated++;
    }

    // Assignment items
    for (const item of assignmentItems) {
      const assignData = assignmentsByName.get(item.title);
      if (!assignData) {
        warnings.push(`Assignment metadata not found for "${item.title}" — skipping`);
        continue;
      }
      const html = readHtmlFile(assignmentsDir, item.title);
      const mdContent = buildAssignmentMd(weekNum, assignData, html);
      writeFileSync(join(weekDir, 'assignment.md'), mdContent, 'utf-8');
      filesCreated++;
    }

    // Quiz items
    for (const item of quizItems) {
      const quizType = item.title.toLowerCase().includes('reading') ? 'reading-quiz' : 'weekly-quiz';
      const mdContent = buildQuizMd(weekNum, item.title, quizType);
      writeFileSync(join(weekDir, `${quizType}.md`), mdContent, 'utf-8');
      filesCreated++;
    }

    // Discussion items
    for (const item of discussionItems) {
      const htmlPath = join(discussionsDir, `${item.title}.html`);
      const html = existsSync(htmlPath) ? readFileSync(htmlPath, 'utf-8') : '';
      const mdContent = buildDiscussionMd(weekNum, item.title, html);
      writeFileSync(join(weekDir, 'discussion-board.md'), mdContent, 'utf-8');
      filesCreated++;
    }

    weeksImported++;
  }

  // Write course-config.md (unless single-assignment mode)
  if (!assignmentName) {
    const courseCode = course.course_code ?? '';
    const [courseNum, ...nameParts] = courseCode.split(' ');
    const mockConfig: CourseConfig = {
      institution: 'Example University',
      courseName: course.name,
      courseNumber: courseCode,
      professor: '[NEEDS REVIEW — add professor name]',
      semester: '[NEEDS REVIEW — update semester]',
      weeks: sortedModules.length,
      pageTypes: ['overview', 'resources', 'assignment', 'discussion-board', 'weekly-quiz'],
      layoutFixed: true,
      colors: { primary: '#0033A0', primaryDark: '#002277', primaryLight: '#E6ECF9', secondary: '#D64309' },
      heroImages: {},
      weekOutline: sortedModules.map((m, i) => ({
        week: i + 1,
        weekStr: String(i + 1).padStart(2, '0'),
        title: m.name.replace(/^Week \d+:\s*/i, '').trim(),
        topic: '[NEEDS REVIEW]',
      })),
    };
    createCourseScaffold(mockConfig, outAbs);
    filesCreated++;
  }

  return { filesCreated, weeksImported, warnings };
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npx vitest run tests/import-course.test.ts
```

Expected: all 13 tests pass.

- [ ] **Step 5: Run full suite**

```bash
npx vitest run
```

Expected: SP10a total + 13 = new total, all passing.

- [ ] **Step 6: Commit**

```bash
git add src/tools/import-course.ts tests/import-course.test.ts
git commit -m "feat(sp10b): add import_course tool"
```

---

## Task 3: Register import_course in index.ts

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Add import at top of `src/index.ts`**

After the existing SP10a imports, add:

```typescript
import { importCourse } from './tools/import-course.js';
import type { ImportCourseInput } from './tools/import-course.js';
```

- [ ] **Step 2: Add tool descriptor to `ListToolsRequestSchema` handler**

Inside `tools: [...]`, after `generate_course`, add:

```typescript
{
  name: 'import_course',
  description: 'Import a previous semester\'s course from a canvas-backup archive folder. Reads modules, pages, assignments, quizzes, and discussions and scaffolds a pre-filled course/ folder ready to update and regenerate. Works at three granularities: full course (omit weekNumber and assignmentName), one week (provide weekNumber), or one assignment (provide assignmentName). Content that cannot be cleanly extracted — quiz questions, LTI links, external tools — is written as [NEEDS REVIEW] placeholders.',
  inputSchema: {
    type: 'object' as const,
    required: ['archivePath'],
    properties: {
      archivePath: {
        type: 'string',
        description: 'Path to the canvas-backup archive folder for the course (e.g. "D:/CanvasArchive/2026/Spring/ITM370").',
      },
      outputDir: {
        type: 'string',
        description: 'Directory to write the imported course folder into. Defaults to "course/" in the current project.',
      },
      weekNumber: {
        type: 'number',
        description: 'Import only this week (1-based). Omit to import all weeks.',
      },
      assignmentName: {
        type: 'string',
        description: 'Import only this specific assignment by name. Omit to import all content.',
      },
    },
  },
},
```

- [ ] **Step 3: Add tool handler to `CallToolRequestSchema` handler**

After the `generate_course` handler and before the unknown-tool fallback, add:

```typescript
if (name === 'import_course') {
  const { archivePath, outputDir, weekNumber, assignmentName } = (args ?? {}) as ImportCourseInput & { outputDir?: string };
  const result = importCourse({
    archivePath,
    outputDir: outputDir ?? 'course',
    weekNumber,
    assignmentName,
  });
  const lines = [
    `✓ Import complete`,
    `  Weeks imported: ${result.weeksImported}`,
    `  Files created: ${result.filesCreated}`,
  ];
  if (result.warnings.length > 0) {
    lines.push(`\n⚠ Warnings (${result.warnings.length}):`);
    lines.push(...result.warnings.map(w => `  • ${w}`));
  }
  lines.push('\nNext steps:');
  lines.push('  1. Open course-config.md — update semester, professor name, and week topics');
  lines.push('  2. Search for [NEEDS REVIEW] in .md files and fill in missing content');
  lines.push('  3. Tell Claude: "Generate the course from the course/ folder"');
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

Expected: all tests pass, no regressions.

- [ ] **Step 6: Commit**

```bash
git add src/index.ts
git commit -m "feat(sp10b): register import_course in MCP server"
```

---

## Task 4: Version Bump + Final Verification

- [ ] **Step 1: Run full test suite**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Bump version**

SP10a bumped to 0.9.6. This is SP10b — bump to `0.9.7` in `package.json`.

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "0.9.7"
```

---

## Self-Review

**Spec coverage:**

| Spec requirement | Covered by |
|---|---|
| Import full course from canvas-backup archive | Task 2: `importCourse` with no `weekNumber`/`assignmentName` |
| Import single week | Task 2: `importCourse({ weekNumber: N })` |
| Import single assignment | Task 2: `importCourse({ assignmentName: 'X' })` |
| Map modules → weeks | Task 2: `findModuleFolders` + position-based sort |
| Extract page HTML → overview/resources .md | Task 2: `extractSectionsFromHtml` + `buildOverviewMd`/`buildResourcesMd` |
| Extract assignment HTML + JSON → assignment .md | Task 2: `buildAssignmentMd` |
| Quizzes get `[NEEDS REVIEW]` placeholders | Task 2: `buildQuizMd` |
| Discussions extracted to discussion-board.md | Task 2: `buildDiscussionMd` |
| Creates course-config.md from course.json | Task 2: `createCourseScaffold` call at end |
| Tool registered in MCP server | Task 3 |
| LTI/ExternalTool items: no explicit test | Items with type `ExternalUrl` or `ExternalTool` are silently skipped — no .md written, no crash. Add a warning line for these if desired as a future improvement. |
