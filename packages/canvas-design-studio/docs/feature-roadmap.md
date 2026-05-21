# Canvas Design Studio Roadmap

**Last updated:** 2026-05-17  
**Audience:** Professors, instructional designers, and teaching collaborators  
**Purpose:** A shareable overview of what Canvas Design Studio can do now, what is coming next, and where professor feedback would help.

Canvas Design Studio helps professors create polished Canvas LMS pages without hand-writing Canvas-safe HTML. The easiest workflow stays simple: generate HTML, paste it into Canvas, and keep teaching. Direct Canvas publishing is being added as an optional convenience for users who want it.

## Where We Are

| Stage | Status | What it means |
|---|---|---|
| Generate and paste | Available now | Create Canvas-ready HTML and paste it into Canvas manually. No API setup required. |
| Validate before use | Available now | Check whether HTML will survive Canvas's editor rules. |
| Publish directly to Canvas | Available now | Let the tool publish pages for you after optional Canvas API setup. |
| Accessibility checks | Available now | WCAG 2.1 AA advisory checks built into color setup, page generation, publishing, and validation. |
| Design critique and redesign | Available now | Scored visual design feedback with prioritized findings, mechanical HTML fixes, and KB context for deeper redesign. |

## Available Now

| Feature | What professors can do |
|---|---|
| Canvas-safe page generation | Turn assignment instructions into a polished Canvas page. |
| Manual paste workflow | Try the tool without Canvas API credentials or advanced setup. |
| HTML validation | Catch common Canvas editor problems before students see the page. |
| Institution styling | Use consistent colors, spacing, headings, and Canvas-compatible layout patterns. |
| Knowledge base refresh | Keep the tool aligned with Canvas editor rules as they change. |

## Now Available (v0.4)

SP2 added the Canvas connection layer, course picker, and direct publishing. SP3 added advisory WCAG 2.1 AA checks across color setup, page generation, publishing, and validation. SP4 added visual design critique and mechanical redesign.

| Feature | What professors can do |
|---|---|
| Optional Canvas API setup | Start simple with generate-and-paste, then add direct publishing when ready. |
| Course picker | See Canvas courses with student count, teacher list, and term — enough to pick the right one. |
| Favorite courses | Pin frequently used course IDs to the top of the list. |
| Direct page publishing | Send generated HTML directly into a Canvas page with one command. |
| FERPA preflight | Catch obvious student IDs or grade disclosures before publishing. |
| Title collision protection | Avoid accidentally overwriting or duplicating an existing Canvas page. |
| Plain-language Canvas errors | Understand what went wrong without decoding raw API messages. |
| Accessibility checks (WCAG 2.1 AA) | Get advisory warnings for color contrast, heading structure, link text, table headers, and alt text — at every stage. |
| Design critique | Get a scored visual design report (0–100) with strengths and prioritized findings. Quick mode runs 8 structural checks instantly; comprehensive mode includes design KB context for deeper analysis. |
| Design redesign | Apply mechanical fixes automatically (font floor, hero image placeholders) and get a list of remaining findings for Claude to address. Accessibility check runs on the output automatically. |

## Now Available (v0.5)

SP5 added Panopto video integration. Professors with Panopto access can now search their lecture library, generate accessible video embeds, and download caption transcripts directly from Claude.

| Feature | What professors can do |
|---|---|
| Panopto video search | Browse or search your full Panopto lecture library — titles, durations, captions status — without leaving Claude. Requires Panopto API credentials. |
| Accessible video embeds | Generate Canvas-safe embed HTML for any Panopto video: iframe embed for whitelisted institutions, or an accessible fallback link when not whitelisted. Works without API credentials. |
| Caption transcript download | Download Panopto captions, strip timestamps, and save as a plain-text Markdown transcript to your local KB. Build a searchable lecture knowledge base over time. Requires API credentials. |
| Video captions check | Accessibility validation now flags Panopto iframes without `captions=true` in the embed URL. |

## Now Available (v0.6)

### Assignment Folder Ingest (SP6)

Professors can now drop raw assignment materials into a folder and generate a complete Canvas page in one command.

| Feature | What professors can do |
|---|---|
| Simple folder ingest | Put course config, brief, and optional rubric/shell/style-notes in `ingest/` — one command generates the Canvas page |
| Assignment group support | Create `assignments/ai-challenge/` with a shared rubric and shell; each week only needs a brief |
| Rubric alignment review | Claude reviews the generated page against the rubric and brief to flag alignment gaps |
| Shell fidelity check | When a page outline is provided, Claude compares it against the generated structure |

## Now Available (v0.7)

### Teaching Philosophy KB (SP7)

Professors can now build a persistent teaching philosophy profile that shapes every Canvas page Claude generates, critiques, or redesigns.

| Feature | What professors can do |
|---|---|
| Philosophy KB setup | Run the setup wizard to answer 6 structured questions and build a teaching philosophy profile — once, reused forever |
| KB in context | Load your philosophy KB at the start of any Claude session; it steers tone, emphasis, and pedagogy across all tools |
| Incremental additions | Add quotes, aphorisms, and course-specific notes at any time through conversation |
| Lecture-sourced philosophy | Scan Panopto transcripts for teaching philosophy statements and save approved ones to the KB |

## Now Available (v0.8)

### Student Persona Review (SP8)

Professors can now get feedback on Canvas assignment instructions from realistic, statistically grounded student perspectives before publishing.

| Feature | What professors can do |
|---|---|
| Generate student personas | Create 3–20 student personas using real demographic distributions for race/ethnicity and learning disabilities |
| Save and reuse personas | Personas are saved across sessions; Claude asks whether to reuse or regenerate on each review |
| Assignment instruction review | Ask Claude to review any assignment through each student persona's lens — confusion points, missing info, tone flags, accessibility barriers |
| Aggregate summary | See which issues were flagged by multiple personas — the high-agreement items are the priority |

## Now Available (v0.9)

### Assignment Improvement Loop

| Feature | Description |
|---|---|
| `load_canvas_page` | Reads the most recently generated page from `output/` back into context (or a named file). Returns HTML + filename for passing to save. |
| `save_canvas_page` | Writes improved HTML back to `output/` with automatic `.bak` backup of the previous version. Original is never clobbered until backup succeeds. |

## Now Available (v0.9.6)

### Course Design Foundation (SP10a)

Professors can now build out an entire Canvas course from a folder structure — weekly modules with templated pages — instead of generating one-off pages.

| Feature | What professors can do |
|---|---|
| `setup_course` wizard | Run once per course: select page types from a checkbox list, set weeks, get a complete folder scaffold pre-filled with content prompts |
| `generate_page` | Generate or regenerate a single page for one-off pages and tweaks |
| `generate_week` | Generate all pages for one week at once |
| `generate_course` | Batch generate the entire course in one command |
| 13 page type templates | Overview, Resources, Slides, Videos, Assignment, Engage Assignment, Reading, Reading Quiz, Weekly Quiz, Lab, Discussion Board, Extra Credit, Custom |
| Color inheritance | Course pages inherit institution brand colors with optional per-course overrides |
| Reusable course config | `course-config.md` persists across semesters — update semester and dates, regenerate |

## Now Available (v0.9.7)

### Canvas Backup Import (SP10b)

Professors with an existing semester archived in `canvas-backup` can seed their course folder from last semester's content.

| Feature | What professors can do |
|---|---|
| `import_course` (full course) | Point at a canvas-backup archive folder, get a pre-filled `course/` folder with last semester's pages, assignments, and discussions |
| `import_course` (one week) | Pull in just one week's content from the archive |
| `import_course` (one assignment) | Pull in a single assignment to update and reuse |
| Module-indexed assignment filenames | Multiple assignments per week are named `assignment-1.1.md`, `assignment-1.2.md` — no silent overwrites |
| Assignment type auto-detection | Canvas assignment titles are parsed to route content to the right file: `assignment`, `engage-assignment`, `proj-assignment`, or `tech-assignment` |
| `[NEEDS REVIEW]` placeholders | Quiz question content, LTI links, and Panopto embeds are flagged for manual review — nothing is silently dropped |

Implementation plans: `docs/superpowers/plans/2026-05-14-sp10a-course-design-foundation.md` and `docs/superpowers/plans/2026-05-14-sp10b-import-course.md`

Architecture and design decisions: `docs/course-design-architecture.md`

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

## Now Available (v1.0.0)

### First-Professor Polish (SP12)

v1.0.0 is a public-readiness release focused on onboarding, discoverability, and self-service error recovery. No new features — every change is polish.

**Three new orientation docs:**

| Doc | Purpose |
|---|---|
| `docs/start_here.md` | Orientation for AI hosts and professors — what works without setup, three entry points, first-session paths, Context7 hint |
| `docs/troubleshooting.md` | Error reference organized by area — Canvas API, Panopto, HTML validation, wizard, publishing. Each entry: Symptom → Cause → Fix → ChatGPT help link |
| `docs/setup-worksheet.md` | Fillable pre-setup template — professors complete it before running the wizard, with plain-English field explanations and "where to find it" guidance |

**New tool: `get_started`**

Returns a tailored orientation based on current config state:
- No config: lists tools that work immediately, prompts `setup_institution`
- Config present but no API token: shows active tools, lists what an API token enables
- Fully configured: lists all active capabilities and quick-start prompts

All three states include a Context7 hint for the latest documentation.

**Setup wizard improvements:**
- Inline explanations on every prompt (what the field means, where to find it, example)
- New brand standards URL field — paste your institution's brand page URL and your AI extracts colors automatically
- Trailing-slash validation on Canvas URL
- Stronger API token validation (must be 20+ chars if provided)
- Email format validation on professor email
- Post-setup summary: formatted markdown table of settings + capabilities list replaces generic "setup complete" message

**Rich error messages:**

All error messages from `publish_to_canvas`, `list_canvas_courses`, `search_panopto_videos`, `generate_canvas_page`, and `ingest_assignment_folder` now follow a structured format:

```
❌ [title]
[message]
Cause: [cause]
Fix:
  1. [step]
  ...
▶ Get help: https://chatgpt.com/?q=[error context pre-filled]
(Opens ChatGPT with this error pre-filled. Copy the prompt to use with any AI assistant.)
```

## Now Available (post-v1.1.0)

### Brand Color Extraction (SP14a)

Professors can now point the tool at their institution's brand standards page and get color candidates extracted automatically — no manual hex hunting.

| Feature | What professors can do |
|---|---|
| `fetch_brand_colors` | Pass your brand standards URL; the tool fetches the page and linked stylesheets, extracts hex colors, and returns a suggested primary and secondary color with reasoning plus a full ranked list |
| CSS variable detection | When the brand page uses CSS custom properties (`--color-primary`, `--brand-blue`), the tool uses variable names as authoritative signals — more reliable than raw color frequency |
| Frequency fallback | When no CSS variables are present, colors are ranked by how often they appear across all fetched CSS |
| Structural color filtering | Near-black, near-white, and mid-gray shades are labeled `(structural)` in the list and excluded from the primary/secondary suggestion — so background and text colors don't crowd out brand colors |
| Works before setup | The tool takes a URL directly — no institution config required. Use it to identify colors before running `setup_institution` |

### Worksheet Validation (SP14b)

Catches format errors in a filled `setup-worksheet.md` before they reach the wizard — preventing crashes on malformed hex values and Canvas API failures from bad URLs.

| Feature | What professors can do |
|---|---|
| `validate_worksheet` tool | Pass your filled worksheet contents; get a list of format errors (bad hex, missing `https://`) or a confirmation that it's ready to use |
| Validation gate in `setup_institution` | When a worksheet is provided, format errors are caught and returned before the wizard starts — no silent failures |

## Feedback Requested

These are the best questions to ask other professors right now:

1. Is the no-API generate-and-paste workflow enough for first-time users?
2. What course details would help you confidently pick the right Canvas course?
3. What FERPA warnings should block publishing, and what should only warn?
4. If a similar Canvas page already exists, what wording makes Update, Create New, and Cancel clear?
5. Which accessibility warnings would you want surfaced first?
6. After running a design critique, would you want the tool to automatically apply all mechanical fixes, or would you prefer to review each one?
7. Would student-persona feedback help you improve an assignment before publishing it?

## How This Roadmap Is Maintained

This shareable roadmap is updated whenever a feature changes status or professor feedback changes the direction. A more detailed implementation roadmap lives in `docs/technical-roadmap.md`.
