# SP11: Assignment Type Customization — Design

**Date:** 2026-05-15  
**Status:** Approved (auto-accepted, the professor sleeping before AI institute Day 3)  
**Author:** Claude Code

---

## Goal

Add `proj-assignment` and `tech-assignment` as first-class page types alongside the existing `assignment` and `engage-assignment`. Add `team` and `timeline` front-matter flags that any assignment template can use to render team-specific and multi-stage schedule sections.

---

## Context

SP10b's `import_course` tool already detects and names files as `proj-assignment-N.M.md` and `tech-assignment-N.M.md`, but these types don't exist in `PAGE_TYPES` — the template engine falls back to `'custom'`. SP11 makes them real types end-to-end.

The professor flagged two important assignment attributes:
- **Timeline** — projects often span multiple weeks with staged deadlines (draft → peer review → final)
- **Solo vs. Team** — team assignments need different page content (group formation, one-submission-per-group)

---

## Architecture

Four files change. No new files.

| File | Change |
|---|---|
| `src/course-types.ts` | Add `'proj-assignment'`, `'tech-assignment'` to PAGE_TYPES; add `team?` and `timeline?` to PageFrontMatter; add PAGE_TYPE_LABELS entries |
| `src/tools/course-templates.ts` | Update `parseFrontMatterSimple` to parse boolean flags; add `renderProjAssignment()` and `renderTechAssignment()`; add switch cases |
| `src/tools/course-scaffold.ts` | Add PAGE_PROMPTS entries for both new types |
| Tests | Add rendering tests for both new types and flag behavior |

`setup-course.ts` needs no changes — the wizard already reads `PAGE_TYPE_LABELS` dynamically, so new types appear automatically in the checkbox list.

---

## Page Type Specifications

### proj-assignment

A multi-week project with staged milestones. `timeline: true` by default in the scaffold.

**Scaffold front matter:**
```yaml
---
week: 1
title: ""
hero_image: ""
assignment_number: "Project 1.1"
due: ""
points: 100
team: false
timeline: true
---
```

**Sections:**
- `## Brief` — what the project is and why it matters
- `## Timeline` — milestone table (Draft, Peer Review, Final Submission with due dates); rendered only when `timeline: true`
- `## Team` — group formation instructions, roles, one-submission-per-group note; rendered only when `team: true`
- `## Rubric` — criteria and point values
- `## Submission Details` — how and where to submit

### tech-assignment

Hands-on technical work: lab-style, tool-based, or code-based tasks.

**Scaffold front matter:**
```yaml
---
week: 1
title: ""
hero_image: ""
assignment_number: "Tech 1.1"
due: ""
points: 50
team: false
---
```

**Sections:**
- `## Brief` — what the technical task is
- `## Setup` — tools, software, environment needed before starting
- `## Tasks` — numbered step-by-step technical tasks
- `## Team` — rendered only when `team: true`
- `## Deliverable` — what to submit (file, URL, screenshot, etc.)
- `## Rubric` — criteria and point values

---

## Front-Matter Flags

`parseFrontMatterSimple` currently returns all values as strings. Two boolean fields are added:

| Key | Type | Default | Effect |
|---|---|---|---|
| `team` | boolean | `false` | Renders a Team section with formation/submission instructions |
| `timeline` | boolean | `false` | Renders a Timeline section with milestone table (`proj-assignment` scaffold sets `true`) |

Parser update: when `key === 'team'` or `key === 'timeline'`, compare value string to `'true'` and store as boolean in PageFrontMatter.

---

## PAGE_TYPE_LABELS

```
'proj-assignment'  → 'Project Assignment (multi-week deliverable)'
'tech-assignment'  → 'Technical Assignment (hands-on, tool-based)'
```

These appear in the `setup_course` wizard checkbox list automatically.

---

## Template Rendering Strategy

All four assignment types (`assignment`, `engage-assignment`, `proj-assignment`, `tech-assignment`) share the same team-section helper. `timeline` section is only rendered by `proj-assignment` (other types ignore the flag). This avoids complexity while keeping the team flag universally useful.

Team section HTML (shared helper):
- Card with heading "Team"
- Fields: group size, role descriptions, one-submission note
- Pulls from `sections['Team']` front matter content or renders a prompt placeholder

Timeline section HTML (proj-assignment only):
- Card with heading "Project Timeline"
- Renders a `<table>` with Milestone / Due Date columns
- Pulls from `sections['Timeline']` or renders a placeholder table

---

## Testing

- `renderPage` for `proj-assignment` with default sections → no errors, contains "Brief" and "Rubric"
- `renderPage` for `proj-assignment` with `timeline: true` → contains "Timeline" section
- `renderPage` for `proj-assignment` with `team: true` → contains "Team" section
- `renderPage` for `tech-assignment` with default sections → no errors, contains "Setup" and "Tasks"
- `renderPage` for `tech-assignment` with `team: true` → contains "Team" section
- Scaffold creates `proj-assignment.md` and `tech-assignment.md` per week when types are selected

---

## Out of Scope

- Adding `team` or `timeline` flags to `assignment` or `engage-assignment` templates (those types are well-established; adding flags is a future incremental improvement)
- Per-type default selected in `setup_course` wizard — professors choose at setup time
- Import detection already handles these in SP10b — no changes to `import-course.ts`
