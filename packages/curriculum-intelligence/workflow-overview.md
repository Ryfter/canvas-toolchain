# Three-App Workflow — Feature Overview

**Last updated:** 2026-05-19
**Status:** Integrated workflow documented and fixture-smoke-tested through Command & Control

---

## The Workflow

```
Canvas Backup → Curriculum Intelligence → Canvas Design Studio
              \________________ Command & Control ________________/
```

Each domain app has one job. Command & Control provides the single MCP entrypoint and orchestrates the handoff between them. A professor can still enter at any stage.

---

## App 1: Canvas Backup

**Job:** Get the data out of Canvas and Panopto and onto your machine.

| Feature | Description |
|---|---|
| Download course pages | Export all Canvas pages for a course to Markdown or HTML files |
| Download assignments | Export assignment instructions, rubrics, and due dates |
| Download discussions | Export discussion prompts and, optionally, student responses |
| Download quizzes | Export quiz questions and answer keys |
| Download modules | Preserve module structure and ordering |
| Download syllabus | Export the course syllabus |
| Canvas backup format | Output follows Canvas export archive structure — compatible with Canvas Design Studio's `import_course` tool |
| Bulk Panopto transcript download | Download caption files for all lectures in a course in one command |
| Panopto video metadata | Collect titles, durations, dates, and captions status for the full course library |
| Output to local disk | Save everything to a local folder |
| Output to Google Drive | Alternative output path for professors who work in Drive |
| Semester labeling | Name output folders by semester (e.g., `ITM370-Spring2025/`) |

**Current implementation:** `D:\Dev\Canvas-Download`, Python package/CLI `canvas-backup`. Command & Control invokes it through a CLI bridge instead of importing it as an npm package.

**What it does NOT do:** Analyze, synthesize, score, or design anything. It just gets files.

---

## App 2: Curriculum Intelligence

**Job:** Understand what was actually taught, score how current it is, and plan what to teach next.

### Past Course Reading

| Feature | Description |
|---|---|
| Read Canvas archive | Ingest a Canvas export folder (from Canvas Downloader or manual export) |
| Extract week-by-week topic map | Build a structured list: week, topic, assignment type, key concepts |
| Extract assignment briefs | Pull assignment instructions out of pages and format them for review |
| Extract discussion prompts | Capture discussion questions and their pedagogical intent |
| Extract quiz questions | Inventory what was formally assessed and at what level |
| Build resource link index | Catalog all external links — articles, tools, videos — referenced in the course |

### Lecture Transcript Synthesis

| Feature | Description |
|---|---|
| Ingest Panopto transcripts | Read caption files downloaded by Canvas Downloader |
| Extract actually-taught topics | What did the professor say in each lecture vs. what was on the syllabus? |
| Surface recurring themes | Identify frameworks, phrases, and concepts the professor returns to often |
| Flag off-syllabus coverage | Topics that got significant lecture time but weren't in the official materials |
| Build key quote bank | Extract notable statements for reuse in syllabi, assignment intros, or philosophy KB |
| Map transcripts to weeks | Match lecture recordings to the week/module they belong to |

### Topic Currency Scoring

| Feature | Description |
|---|---|
| Classify topics by shelf life | **Evergreen** (prompt engineering principles), **Current** (specific model versions), **Dated** (specific incidents, early novelty demos) |
| Track topic history across semesters | When was each topic first taught? When dropped? How deep each time? |
| Flag superseded topics | "You covered GPT-3 limitations in Fall 2023. That's now outdated." |
| Pull in AI news for new topic suggestions | Surface topics worth adding that weren't covered yet (RSS, Perplexity, or manual list) |
| Recommend drop / keep / update for each topic | Simple three-state assessment with reasoning |

### Semester-to-Semester Diff

| Feature | Description |
|---|---|
| Side-by-side semester comparison | What was added, dropped, or changed in depth between two semesters? |
| Assignment reuse tracking | Which assignments were reused verbatim vs. rewritten? |
| Topic expansion/contraction | Did coverage of a topic grow, shrink, or disappear? |
| Identify "kept meaning to add" topics | Topics that appeared in planning notes but never made it into the course |
| Week-load analysis | Were some weeks consistently over-packed? Which had room? |

### Next Semester Planning

| Feature | Description |
|---|---|
| Generate recommended topic list | Based on past courses + current landscape, here's what to cover |
| Flag what to keep, update, drop, add | One-line assessment per topic with reasoning |
| Draft updated assignment briefs | Rewrite briefs to use current examples and tools |
| Suggest week structure | How to distribute topics given course length and pacing constraints |
| Export planning outline | A structured outline ready to hand to Canvas Design Studio |

### Shell Update and Date Shifting

| Feature | Description |
|---|---|
| Import existing Canvas shell | Take last semester's course folder as a starting point |
| Shift all due dates | Move every assignment date forward by the right number of days for the new semester |
| Update topic references | Replace dated references (specific model names, news events) with current ones |
| Update example placeholders | Flag where examples need new screenshots, URLs, or tools |
| Output updated course folder | A ready-to-fill folder for Canvas Design Studio to design and publish |

**What it does NOT do:** Design pages, generate HTML, or publish to Canvas. It produces content — Design Studio handles presentation.

---

## App 3: Canvas Design Studio

**Job:** Take course content and make it look polished and accessible in Canvas.

**Status:** Live at v1.1.0 — 27 tools in the MCP entrypoint, 391 tests passing locally, available as `canvas-design-mcp`.
*(renamed to `@canvas-toolchain/canvas-design-studio` in v2.2.0)*

### Setup and Configuration

| Feature | Tool |
|---|---|
| Initial institution setup | `setup_institution` — KB, colors, Canvas API, Panopto API |
| Orientation for new users | `get_started` — shows active capabilities based on config state |
| Read pre-filled worksheet | `get_setup_worksheet` — professor fills a form, tool reads it into the wizard |
| Validate worksheet before wizard | `validate_worksheet` *(SP14b, coming next)* |
| Extract colors from brand page | `fetch_brand_colors` — scrapes hex values from a brand standards URL |

### Page Generation

| Feature | Tool |
|---|---|
| Generate a single page | `generate_canvas_page` — from an ingest folder or direct prompt |
| Ingest assignment folder | `ingest_assignment_folder` — reads brief, rubric, shell, style-notes |
| Generate one page (course mode) | `generate_page` — generate or regenerate one page in a course folder |
| Generate a full week | `generate_week` — all pages for one week at once |
| Generate the entire course | `generate_course` — batch generate all 80+ pages |

### Course Design System

| Feature | Tool |
|---|---|
| Set up course folder structure | `setup_course` — wizard selects page types, sets weeks, scaffolds folders |
| Import from Canvas backup | `import_course` — seed a course folder from last semester's Canvas export |
| 13 page type templates | Overview, Resources, Slides, Videos, Assignment, Engage Assignment, Reading, Reading Quiz, Weekly Quiz, Lab, Discussion Board, Extra Credit, Custom |

### Review and Improvement

| Feature | Tool |
|---|---|
| Load a generated page | `load_canvas_page` — read output HTML back into context |
| Save improved page | `save_canvas_page` — write back with automatic backup |
| Design critique | `critique_canvas_page` — scored visual design report (0–100) |
| Mechanical redesign | `redesign_canvas_page` — apply fixes, get remaining findings |
| HTML validation | `validate_canvas_html` — catch Canvas editor problems before publishing |

### Accessibility

| Feature | Tool |
|---|---|
| WCAG 2.1 AA advisory checks | Built into generate, publish, critique, redesign, and validation |
| Color contrast check | Checks primary/secondary against white text |
| Heading structure check | No H1 in body, sequential levels, no skipped levels |
| Link text check | Flags "click here" and bare URL link text |
| Table headers check | Tables must have `<th>` elements |
| Alt text check | Images must have non-empty alt attributes |
| Video captions check | Panopto iframes must have captions enabled |

### Canvas Publishing

| Feature | Tool |
|---|---|
| List Canvas courses | `list_canvas_courses` — browse with student count, term, teachers |
| Publish to Canvas | `publish_to_canvas` — send HTML directly to a Canvas page |
| FERPA preflight | Checks for student IDs or grade disclosures before publish |
| Title collision protection | Avoids overwriting or duplicating existing pages |
| Rich error messages | Structured errors with cause, fix steps, and ChatGPT help link |

### Panopto Integration

| Feature | Tool |
|---|---|
| Search lecture library | `search_panopto_videos` — browse by title, filter by captions status |
| Generate accessible embed | `embed_panopto_video` — Canvas-safe iframe or accessible fallback link |
| Download caption transcript | `fetch_panopto_captions` — strip timestamps, save as Markdown to local KB |

*Note: Bulk transcript download for curriculum synthesis belongs in Curriculum Intelligence, not here. `fetch_panopto_captions` handles single-video transcript download for page design use.*

### Professor Knowledge and Personas

| Feature | Tool |
|---|---|
| Teaching philosophy KB | `get_philosophy_kb` / `update_philosophy_kb` — persistent profile that shapes all generation |
| Setup wizard for philosophy | Structured 6-question wizard, runs once, reused forever |
| Lecture-sourced philosophy | Scan transcripts for philosophy statements, approve and save |
| Generate student personas | `generate_student_personas` — 3–20 demographically grounded personas |
| Save and reuse personas | Persistent across sessions |
| Assignment instruction review | `get_student_personas` — review instructions through each persona's lens |

### KB Maintenance

| Feature | Tool |
|---|---|
| Update Canvas HTML rules | `update_canvas_kb` — refresh KB from GitHub when Canvas changes its editor |

---

## What Flows Between Apps

```
Canvas Backup
  → Outputs: canvas-backup/ folder, Panopto transcript files (.vtt/.srt)

Curriculum Intelligence
  → Inputs:  canvas-backup/ folder, Panopto transcripts
  → Outputs: topic map, assignment briefs, updated course shell (course/ folder)

Canvas Design Studio
  → Inputs:  course/ folder (from Curriculum Intelligence or built manually)
  → Outputs: polished HTML files, published Canvas pages
```

A professor doing a full semester refresh would:
1. Run Canvas Backup on last semester's course
2. Run Curriculum Intelligence to see what changed and plan the new semester
3. Run Canvas Design Studio to generate and publish the updated pages

A professor starting fresh can skip to step 3 and use `setup_course` directly.

---

## Command & Control Layer

`D:\Dev\canvas-toolchain\packages\command-and-control` is the combined workflow project.

Implemented now:

- Imports `@canvas-toolchain/curriculum-intelligence` as a real local npm dependency.
- Imports `@canvas-toolchain/canvas-design-studio` as a real local npm dependency.
- Exposes real `import_course` and `generate_course` pass-throughs from Design Studio.
- Invokes Canvas Backup through the Python CLI bridge for `download_canvas_archive`.
- Verifies the archive-analysis-design flow with `npm run smoke:integration`.

Reasoning:

- Keep the core MCP coordinator in TypeScript because two domain MCP apps are already TypeScript and tested.
- Keep Canvas Backup in Python for now because it already works and has professor-friendly launchers.
- Consider Go later for a single installer/launcher or a future downloader rewrite, not for a full-stack rewrite today.

## Open Questions

1. **Bulk Panopto transcript download:** Still not implemented. Current lean: Canvas Backup should own the bulk download; Curriculum Intelligence should own transcript synthesis.
2. **Course-wide publishing:** Still needs a reviewed transaction model before it should update live Canvas pages in bulk.
3. **Single installer:** Go is a candidate for a future wrapper/installer, but not a reason to rewrite the tested TypeScript/Python product logic now.
4. **Curriculum export to Design Studio:** The durable handoff format remains the Canvas Design Studio `course/` folder.
