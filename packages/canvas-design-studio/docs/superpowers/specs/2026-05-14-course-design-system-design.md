# Course Design System — Spec

**Date:** 2026-05-14
**Status:** Approved, ready for implementation planning

---

## Overview

Extend `canvas-design-mcp` from one-off page generation to full course design. Professors build out an entire Canvas course — weekly modules with templated pages — from a folder structure. The system supports three entry points: start from scratch with a wizard, import a previous semester from a canvas-backup archive, or generate/tweak individual pages. All existing tools remain unchanged.

---

## Folder Structure

```
course/
├── course-config.md          ← course-level config (machine-readable YAML front matter + human-readable week outline)
├── front-page.md             ← course home page (top-level, not per-week)
├── week-01/
│   ├── overview.md
│   ├── resources.md
│   └── assignment.md         ← only the page types selected for this course
├── week-02/
│   └── ...
```

Output lands in `output/` organized by week:

```
output/
  front-page.html
  week-01/
    overview.html
    resources.html
    assignment.html
  week-02/
    ...
```

---

## `course-config.md` Format

YAML front matter block (machine-readable) + week outline table (human-editable):

```markdown
---
institution: Boise State University
course_name: AI Augmented Projects
course_number: ITM 370
professor: Dr. Rank
semester: Fall 2026
weeks: 16

page_types:
  - front-page
  - overview
  - resources
  - assignment
  - discussion-board
  - weekly-quiz

layout_fixed: true

colors:
  primary: ""        # leave blank to inherit from institution config
  secondary: ""      # leave blank to inherit from institution config

hero_images:
  front-page: ""
  overview: ""
  resources: ""
  assignment: ""
  discussion-board: ""
  weekly-quiz: ""
---

## Week Outline

| Week | Title | Topic |
|------|-------|-------|
| 01   | Introduction | What is AI Augmentation? |
| 02   | Foundations  | Prompt Engineering Basics |
```

**Key decisions:**
- Colors default to blank (inherits from institution config); professor adds only the overrides they want
- `layout_fixed: true` is the default — same template structure every week, content swapped in. `layout_fixed: false` (variable layouts) is out of scope for this sprint; the field is reserved for future use
- Hero images are per page type (consistent across all weeks); per-week override goes in the week's `.md` file front matter
- Config is designed for reuse across semesters — professor updates `semester`, dates, and week topics; everything else stays

---

## Page Types

The full supported list. Professor selects which apply to their course during `setup_course`:

| Page Type | Slug | Template Structure |
|---|---|---|
| Front Page | `front-page` | Hero + course intro + week nav cards + instructor info |
| Overview | `overview` | Hero + objectives list + intro paragraph + activities checklist |
| Resources | `resources` | Hero + slides card + videos section + readings list |
| Slides | `slides` | Hero + slide deck embed/link + description |
| Videos | `videos` | Hero + Panopto video section + descriptions |
| Assignment | `assignment` | Hero + brief + rubric table + submission details |
| Engage Assignment | `engage-assignment` | Hero + in-class prompt + time limit + deliverable |
| Reading | `reading` | Hero + context + reading link + reflection prompt |
| Reading Quiz | `reading-quiz` | Hero + quiz info + reading reminder + access link |
| Weekly Quiz | `weekly-quiz` | Hero + quiz info + topics covered + access link |
| Lab | `lab` | Hero + objectives + instructions + submission |
| Discussion Board | `discussion-board` | Hero + prompt + participation requirements + grading note |
| Extra Credit | `extra-credit` | Hero + opportunity description + requirements + deadline |
| Custom | `custom` | Professor-defined — wizard asks: "What sections should this page have?" Professor types a comma-separated list (e.g. "Prompt, Requirements, Submission"). Those become the `.md` file sections and the HTML template blocks |

---

## `.md` File Format (Per Page Type)

Each `.md` file uses YAML front matter for metadata and labeled markdown sections for content. The wizard pre-fills each file with section prompts. Professor replaces placeholder text — rough notes are fine, Claude rewrites into polished student-facing copy.

**`overview.md`**
```markdown
---
week: 01
title: What is AI Augmentation?
hero_image: ""   # optional per-week override
---

## Learning Objectives
- Students will be able to...

## Introduction
[Professor's notes — rough is fine, Claude rewrites]

## Activities
- Lecture: Introduction to AI Tools (Panopto)
- Reading: Chapter 1 — due Sunday
- Assignment 1.1 — due Friday
```

**`resources.md`**
```markdown
---
week: 01
---

## Slides
- [Week 1 Slides](https://...)

## Videos
- Panopto ID: abc-123-def

## Readings
- [Article Title](https://...)

## Other
- Weekly Quiz opens Monday
```

**`assignment.md`**
```markdown
---
week: 01
assignment_number: 1.1
due: Friday, September 5
points: 50
---

## Brief
[Raw assignment instructions]

## Rubric
[Optional — inherited from course level if not provided]
```

---

## New MCP Tools (5)

| Tool | Description |
|---|---|
| `setup_course` | Interactive wizard: collects course details, presents page type checkbox selector with recommendations, asks `layout_fixed` preference, creates full `course/` scaffold with pre-filled `.md` prompt files and `course-config.md` |
| `import_course` | Reads a canvas-backup archive folder; maps modules to weeks; detects page types from existing pages/assignments/quizzes/discussions; extracts content into `.md` files; scaffolds full `course/` folder pre-filled with last semester's content. Works at three granularities: full course, single week, single assignment |
| `generate_page` | Generates one Canvas HTML page from a single `.md` file. Entry point for one-off pages and per-page tweaks |
| `generate_week` | Generates all pages for one week folder. Reads `course-config.md` for colors, page types, and hero images |
| `generate_course` | Batch generates all weeks. Reads `course-config.md`, calls page generation for each week and each active page type |

### `import_course` Detail

Input: path to a canvas-backup archive folder (e.g., `D:/CanvasArchive/2026/Spring/ITM370`)

Process:
1. Read `manifests/course.json` → pre-fill `course-config.md`
2. Read `manifests/modules.json` → map modules to weeks, build week outline table
3. Read `modules/*/items.json` → detect which page types each week uses
4. Read `pages/*.html` + `assignments/*.html` → extract content into week `.md` files
5. Scaffold `course/` folder

Content that won't import cleanly is flagged as `[NEEDS REVIEW]` in the `.md` files:
- Quiz question content (Canvas API returns metadata only)
- External tool / LTI links
- Panopto embeds (video IDs preserved, flagged for re-verification)

---

## Color and Theming

- Institution colors from `~/.canvas-design-mcp/institution.json` are the baseline
- `course-config.md` `colors:` block holds per-course overrides (minor tweaks, highlights)
- Templates are color-token driven — changing colors in config changes the visual style across all generated pages without touching HTML
- Hero images defined per page type in `course-config.md`; optional per-week override in each `.md` front matter

---

## Entry Points Summary

| Starting point | Tool |
|---|---|
| Brand new course | `setup_course` wizard |
| Previous semester (full course) | `import_course <archive-path>` |
| Previous semester (one week) | `import_course <archive-path> --week 03` |
| Previous semester (one assignment) | `import_course <archive-path> --assignment "Assignment Name"` |
| One-off page or tweak | `generate_page <path-to-md>` |

---

## Platform Extensibility

A renderer layer separates the content model from Canvas-specific HTML output. The `course/` folder structure, `course-config.md`, and `.md` files remain the same regardless of target platform. Adding a Blackboard renderer later means implementing the renderer interface — no changes to the content model or tools.

---

## Integration with Existing Tools

All existing tools (`ingest_assignment_folder`, `generate_canvas_page`, `validate_canvas_html`, `publish_to_canvas`, etc.) are unchanged. The course design system is purely additive.

Publishing generated pages uses the existing `publish_to_canvas` tool — no changes needed.

---

## Testing Approach

- Unit tests for each new tool following existing vitest patterns
- `import_course`: fixture canvas-backup archives in `tests/fixtures/canvas-backup/` (real folder trees, no mocking — consistent with SP6 ingest test approach)
- `setup_course`: wizard logic tested via direct function calls with injected answers (same pattern as existing wizard tests)
- `generate_week` / `generate_course`: snapshot tests on HTML output per page type
- Template rendering: one test per page type verifying required sections are present and colors are applied
