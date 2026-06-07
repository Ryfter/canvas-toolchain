# Canvas Design Studio — Claude Code Instructions

## Project Purpose

This project is a **Canvas LMS HTML Design Studio** — a tool for generating, previewing, and managing rich HTML page templates for Canvas LMS courses.

The reference knowledge base in `docs/canvas-design-kb/` contains everything needed to generate valid, well-designed Canvas HTML. **Always consult it before generating any Canvas HTML.**

## Role in the Four-Project Workflow

Canvas Design Studio is the presentation and Canvas-safe HTML layer in the larger course refresh workflow:

```text
Canvas Backup archive
  -> Curriculum Intelligence analysis and next-plan
  -> Canvas Design Studio course folder
  -> Canvas-safe HTML
  -> optional Canvas publishing
```

`D:\Dev\Command-and-Control-MCP` now imports this project as the real local npm package `canvas-design-mcp`. Do not use or document the stale package name `canvas-design-studio-mcp`.

Command & Control currently calls these Design Studio functions directly:

- `import_course`: Canvas Backup archive -> Design Studio `course/` folder
- `generate_course`: Design Studio `course/` folder -> Canvas-safe HTML

`publish_course` remains a Command & Control placeholder because course-wide publishing needs a reviewed page-by-page transaction model. Keep the manual generate-and-paste workflow first-class; Canvas API publishing is optional convenience, not a requirement.

Reasoning:

- This project already has tested TypeScript MCP tooling and should not be rewritten just to fit the coordinator.
- Canvas Backup remains Python for now and is reached through C&C's CLI bridge.
- Go is only a future candidate for a single installer/launcher or downloader rewrite if setup friction becomes the blocker.

Architecture review follow-up:

- Preserve the ignore-unknown-front-matter behavior. Curriculum Intelligence may later export namespaced planning metadata such as `ci:` or a sidecar `planning-manifest.json`; Design Studio should not fail on non-design keys.
- Do not silently discard planning metadata if Design Studio later adds a roundtrip/export path. Keep design concerns and CI planning concerns separated.

---

## How to Use the Knowledge Base

The KB is in `docs/canvas-design-kb/`. Key files to read before doing Canvas-related work:

| Need | File to read |
|---|---|
| What CSS is allowed | `docs/canvas-design-kb/01-canvas-rce/HTML-Allowlist.md` |
| Canvas's built-in classes (grid, borders) | `docs/canvas-design-kb/01-canvas-rce/Canvas-Built-In-CSS-Classes.md` |
| What gets stripped by Canvas | `docs/canvas-design-kb/01-canvas-rce/RCE-Limitations-and-Workarounds.md` |
| Design tokens (colors, type, spacing) | `docs/canvas-design-kb/02-design-md/DESIGN-MD-Canvas-Template.md` |
| Ready-to-use HTML components | `docs/canvas-design-kb/03-design-systems/Component-Library.md` |
| Full home page template | `docs/canvas-design-kb/05-patterns/Course-Home-Page.md` |
| Accessibility rules | `docs/canvas-design-kb/06-accessibility/Accessibility-Overview.md` |

---

## Hard Rules for Canvas HTML Generation

These are non-negotiable constraints sourced from the Canvas RCE sanitizer. Violating them produces broken output.

1. **No `<style>` blocks** — all CSS must be inline `style=""` attributes
2. **No `<script>` tags** — no JavaScript
3. **No `box-shadow`** — stripped by Canvas
4. **No `filter`, `transform`, `transition`, `animation`, `opacity`** — all stripped
5. **No `gap`** in flex/grid — use `margin` on children OR use Canvas's built-in grid classes
6. **No `<h1>`** in body HTML — Canvas uses H1 for the page title; start at H2
7. **No `@font-face` or `@import`** — use `Lato, sans-serif`
8. **No event attributes** (`onclick`, `onload`, etc.)
9. `border-radius` **IS** allowed — use freely
10. `display: flex` and `display: grid` **ARE** allowed as shorthand

---

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

---

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

---

## Course Learning Outcomes (CLOs, #91)

Each course can declare a CLO catalog in `course-config.md` front matter:

```yaml
clos:
  - id: '1'
    name: Analyzing
    statement: Students will be able to analyze business data.
    tag: core             # optional: 'core' | 'supporting'
  - id: '2'
    name: Communicating
    statement: Students will be able to communicate insights.
```

Each assignment or rubric page references catalog IDs via `clos: ['1', '2']` in its own front matter. At render time, `generate_page` joins the IDs against the catalog and surfaces a "Supports CLOs:" line at the bottom of the existing TL;DR card from #66.

CLOs render only on **assignment** and **rubric** page types — not on other page types. Unknown IDs degrade silently (line shows resolved CLOs only; nothing renders if zero resolve).

---

## Canvas Built-In CSS Classes (Use These for Layouts)

These classes come from Canvas's own stylesheet — no admin access needed:

```html
<!-- Responsive 2-column layout (stacks on mobile automatically) -->
<div class="content-box">
  <div class="grid-row">
    <div class="col-xs-12 col-md-6">Left column</div>
    <div class="col-xs-12 col-md-6">Right column</div>
  </div>
</div>

<!-- Bordered rounded box -->
<div class="border border-trbl border-round" style="padding: 16px;">
  Content
</div>

<!-- Professional data table -->
<table class="ic-Table ic-Table--hover-row" style="width: 100%;">...</table>
```

---

## Design Tokens

From `docs/canvas-design-kb/02-design-md/DESIGN-MD-Canvas-Template.md`:

```
Primary:        #0033A0  (BSU blue — hero banners, active nav, primary buttons)
Primary-dark:   #002277  (footer bars, hover states)
Primary-light:  #E6ECF9  (callout backgrounds, light tints)
Neutral:        #F4F3EF  (page background, nav bar background)
Neutral-dark:   #e0e0d8  (card borders)
Text-primary:   #1A1A1A  (body text)
Text-secondary: #555550  (muted text)
White:          #ffffff  (card backgrounds)

Info:    bg #E6F1FB / text+border #185FA5
Success: bg #EAF3DE / text+border #3B6D11
Warning: bg #FAEEDA / text+border #854F0B
Danger:  bg #FCEBEB / text+border #A32D2D

Border-radius: sm=4px  md=8px  lg=10px  xl=14px  pill=20px
Spacing:       xs=4px  sm=8px  md=16px  lg=24px  xl=48px
Font:          Lato, sans-serif
```

---

## Project Structure

```
canvas-design-studio/
├── CLAUDE.md                    ← This file (loaded every session)
├── DESIGN.md                    ← Canvas design system spec (for AI agent use)
├── docs/
│   └── canvas-design-kb/        ← Full reference KB (23 Markdown files)
│       ├── README.md            ← KB map of content
│       ├── 01-canvas-rce/       ← RCE constraints and workarounds
│       ├── 02-design-md/        ← DESIGN.md spec and templates
│       ├── 03-design-systems/   ← Component library and design principles
│       ├── 04-tools/            ← Theme Editor, external Canvas design references
│       ├── 05-patterns/         ← Full page templates
│       ├── 06-accessibility/    ← WCAG 2.1 AA reference
│       └── 07-resources/        ← External links and showcases
├── src/
│   └── templates/               ← Generated HTML templates live here
└── output/                      ← Final Canvas-ready HTML files
```

---

## Workflow for Generating Canvas HTML

1. Read the relevant KB file(s) for the page type
2. Apply design tokens from `DESIGN.md` or the KB template
3. Generate HTML using only allowed tags and CSS properties
4. Use `content-box` + `grid-row` + `col-*` classes for multi-column layouts
5. Verify: no `<style>` blocks, no `<script>`, no disallowed CSS properties
6. Check heading hierarchy (H2 → H3 → H4, never H1)
7. Verify every `<img>` has an `alt=""` attribute
8. Save output to `src/templates/` or `output/`

---

## KB Update Policy

When Canvas changes its HTML allowlist:
1. Update the relevant file in `docs/canvas-design-kb/`
2. Add an entry to `docs/canvas-design-kb/00-meta/Changelog.md`
3. If the change affects `CLAUDE.md` (e.g., a new allowed/disallowed property), update it here too

---

## Ingest Workflow (Primary Entry Point for Professors)

When a professor wants to generate a Canvas page, they fill in the `ingest/` folder and give you a single prompt. **Always check `ingest/` before starting any page generation.**

### Ingest Folder

```
ingest/
├── course-config.md      ← REQUIRED: course number, name, professor, semester
├── assignment-brief.md   ← REQUIRED: raw assignment instructions (any format)
└── style-notes.md        ← OPTIONAL: layout, tone, hero image, extra sections
```

### How to Process an Ingest Request

When asked to "build a page from ingest/" or similar:

1. Read `ingest/course-config.md` — scan every field for unfilled placeholders (anything in `[brackets]` or left blank after the colon)
   - If any required fields are unfilled (Institution, Professor, Course Number, Course Name, Assignment Number, Semester): ask the professor for all missing values in a single message — do not ask one at a time
   - Once you have the answers, write them into `ingest/course-config.md` before proceeding
   - Optional fields (Page Title, Tone) can remain blank — use project defaults
2. Read `ingest/assignment-brief.md` — this is the raw source content; rewrite it into polished, student-friendly copy
3. Read `ingest/style-notes.md` — apply any layout or tone preferences; use project defaults for anything left blank
4. Read the relevant KB file(s) for the page type
5. Generate the HTML using all Canvas hard rules and design tokens
6. Save to `output/[course-number]-[assignment-number]-page.html`
7. Report: what was built, the output filename, and the hero image prompt if one is needed

### The Prompt Professors Use

> "Read everything in `ingest/`, then generate a Canvas assignment page using the design system in this project. Save it to `output/`."

That's it. Everything else is derived from the ingest files and this CLAUDE.md.

### Hero Image

If `style-notes.md` requests a hero image (or if it's blank and the assignment warrants one), generate a ChatGPT image prompt tailored to the assignment topic and tell the professor:
- The prompt to use
- The required size (1200×400px)
- That they replace `HERO_IMAGE_URL` in the output file with the hosted image URL

---

## Common Tasks

**"Build a page from ingest/"** *(most common)*
→ Read all three files in `ingest/`, then follow the Ingest Workflow section above.

**"Generate a course home page"**
→ Read `docs/canvas-design-kb/05-patterns/Course-Home-Page.md`, then generate with actual course content.

**"Add a callout box"**
→ Read `docs/canvas-design-kb/03-design-systems/Component-Library.md` section 3.

**"Make a two-column layout"**
→ Use `content-box` + `grid-row` + `col-xs-12 col-md-6` (Canvas built-in classes, no admin needed).

**"Check if a CSS property is allowed"**
→ Read `docs/canvas-design-kb/01-canvas-rce/HTML-Allowlist.md`.

**"Update the design system colors"**
→ Edit `DESIGN.md` and update the Design Tokens section above in this file.
