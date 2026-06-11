# Course Design System — Architecture and Reasoning

**Date:** 2026-05-14
**Audience:** Any agent or developer picking this up cold

This document explains WHY the course design system is built the way it is. The WHAT is in the spec (`docs/superpowers/specs/2026-05-14-course-design-system-design.md`). The HOW is in the implementation plans (`docs/superpowers/plans/`). This document is for understanding the reasoning behind decisions so future changes can be made coherently.

---

## Why This Exists

The MCP server (SP1–SP9) generates one-off Canvas assignment pages. Every page is treated as an independent document. A professor who has a 16-week course with 5 page types per week has to generate 80+ pages one at a time, with no shared structure, no consistent styling system, and no reuse across semesters.

The course design system solves this by making the course — not the page — the unit of work. The professor defines the structure once, fills in content for each week, and generates everything in one command. The second semester takes minutes instead of hours: update dates and content, regenerate.

---

## Why a Folder Structure (Not a Database or Single File)

**Three alternatives were considered:**

1. **Single course file** (YAML or JSON) — everything in one file. Rejected because professors would have to navigate a large, monolithic file to find week 7's assignment brief. Editing becomes error-prone, diffing is painful, and there's no natural boundary for collaboration.

2. **Database / SQLite** — structured, queryable. Rejected because it requires tooling, breaks the "edit in any text editor" principle, can't be version-controlled naturally, and adds a dependency that provides no real benefit over a folder of markdown files.

3. **Folder structure with one `.md` per page type per week** — chosen. Reasons:
   - Each file has one job. A professor editing Week 3's assignment doesn't touch Week 4's overview.
   - Git diffs are clean: changes to one file show up as changes to one file.
   - Files can be opened, edited, copied, and deleted with no tooling.
   - Inherits from the existing ingest workflow pattern (same `.md` + front matter approach).
   - Easy to scaffold: the wizard creates the empty files with prompts; the professor fills in the blanks.

---

## Why YAML Front Matter (Not a Separate Config File Per Page)

Canvas-backup pages have metadata (title, due date, points) that needs to travel with the content. Putting it in a separate `.json` or `.toml` sidecar creates two files to manage per page. YAML front matter (the `---` block at the top of a `.md` file) is the established pattern in static site generators and this project's own ingest files. Professors recognize it. It keeps metadata co-located with content.

The front matter is minimal: only fields that the template engine actually needs to render the page (`week`, `title`, `hero_image`, and page-type-specific fields like `due` and `points`). Everything else is in the section content below.

---

## Why 13 Page Types (Not a Flexible Schema)

**The rejected alternative:** Let professors define their own page types with arbitrary section names, similar to how a CMS lets you define content types. This would be maximally flexible but would require:
- A schema definition step before content creation
- A renderer that handles arbitrary section lists
- No type-safe template code

**What we did instead:** Fixed 13 page types covering the full range of Canvas content that University professors actually use (based on ITM 370 course structure and conversations with the professor). Each page type has a dedicated renderer with intentional layout choices. A `custom` type is the escape hatch for anything not covered.

The `custom` type lets professors define their own section names via the wizard. The renderer for `custom` pages iterates over all sections and renders them as generic cards — no layout intelligence, but functional.

**Future consideration:** If 3+ professors ask for the same page type that isn't in the list, add it. Don't add speculatively.

---

## Why Color Tokens (Not Hardcoded Colors)

Every rendered template uses `config.colors.primary`, `config.colors.primaryDark`, `config.colors.primaryLight`, and `config.colors.secondary` — never hex strings directly. This means:

- Changing the institution's brand color in `course-config.md` → re-running `generate_course` → all pages updated. No find-and-replace across HTML files.
- A course can override just the primary color (e.g., a department has a slightly different accent) without touching templates.
- Adding a new institution takes seconds: change the colors in `institution.json`, regenerate.

The color inheritance chain is: institution config (`~/.canvas-design-mcp/institution.json`) → course config (`course-config.md` `colors:` block, optional overrides) → template rendering. If a course config field is blank, the institution value is used. If the institution config doesn't exist (test environments), University defaults are used.

---

## Why Hero Images Are Per Page Type (Not Per Week)

A professor has 16 weeks × 5 page types = 80 pages. Sourcing 80 different hero images is unrealistic. A course looks coherent when Overview pages always have the same hero image, Resources pages always have the same Resources hero, etc.

Per-week hero override is available (set `hero_image:` in the page's front matter) for cases where a specific week warrants a different image — e.g., a final project week might have a more dramatic visual. But the default is per-type consistency.

**The `HERO_IMAGE_URL` pattern:** Hero images are inserted as CSS `background-image` URLs. If the field is blank, the hero uses the solid primary color as background — it still looks good, just without a photo. Professor sets the URL after generating the page and hosting the image.

---

## Why `import_course` Is a Separate Sprint (SP10b)

`import_course` reads from a third-party archive format (canvas-backup) and has no dependencies on any other SP10a tool except `createCourseScaffold`. It can be built, tested, and shipped independently. Breaking it out means:

- SP10a ships a working course design system even if import isn't ready.
- The import logic can be iterated on without touching templates, scaffold generation, or generation tools.
- Test fixtures for the canvas-backup format (a significant amount of JSON) don't bloat the SP10a test run.

The canvas-backup archive format is documented at `github.com/Ryfter/canvas-backup`. The format is stable (it's the professor's own project), but if it changes, only `import-course.ts` needs to be updated — no other files are affected.

---

## Why HTML Extraction Uses Regex (Not a DOM Parser)

Canvas-backup HTML is generated output, not arbitrary web HTML. The structure is predictable: headings use `<h2>`, `<h3>`, `<h4>`; content is in `<p>` and `<ul><li>` blocks; no deeply nested layouts. A full DOM parser (like jsdom or cheerio) would add a significant dependency for minimal gain.

The regex-based extractor (`stripHtmlTags`, `extractSectionsFromHtml`) handles the actual patterns in canvas-backup output. It's not a general-purpose HTML parser and shouldn't be used as one. If canvas-backup HTML becomes significantly more complex, replace with a real parser at that point.

---

## Why `[NEEDS REVIEW]` Placeholders (Not Errors or Omissions)

When import encounters content it can't cleanly extract — quiz questions, LTI external tools, Panopto embed IDs — it writes `[NEEDS REVIEW]` in the relevant section. This is intentional:

- The professor sees exactly which sections need attention, in context.
- The file is still valid and can be generated from — the placeholder text will appear in the rendered HTML, which signals to the professor that something is missing before they publish to Canvas.
- Silently omitting the section would make it easy to miss.
- Erroring out would block the import of everything else.

The placeholder regex used elsewhere in the codebase (`/\[[A-Z ]{3,}\]/`) catches `[NEEDS REVIEW]` — so validation tools will surface these automatically.

---

## Why the Renderer Is Centralized in `course-templates.ts`

All 13 page type renderers live in one file. Alternative: one file per page type. Rejected because:

- The renderers share helper functions (`heroHtml`, `card`, `sectionHeading`, `callout`, `markdownToHtml`, `wrap`). Splitting them means either duplicating these helpers or creating a shared utilities file, which adds import complexity.
- All renderers need to be updated together if the Canvas HTML allowlist changes (e.g., if Canvas starts allowing a new CSS property). One file = one change.
- The file is large but highly repetitive and easy to scan. The dispatching `switch` in `renderPage` is the entry point — every renderer is a pure function from `(PageContent, CourseConfig) → string`.

**Future Blackboard renderer:** A second file `course-templates-blackboard.ts` would export its own `renderPage` function with different HTML structure. The tools (`generate-page.ts`, `generate-week.ts`, `generate-course.ts`) would accept an optional `renderer` parameter defaulting to the Canvas renderer. No changes to the content model or scaffold system.

---

## Canvas HTML Constraints Baked Into Every Template

Every renderer follows these rules (sourced from `CLAUDE.md` hard rules and `docs/canvas-design-kb/01-canvas-rce/`):

| Rule | Why |
|---|---|
| No `<style>` blocks | Canvas RCE strips them on save |
| No `<script>` tags | Canvas RCE strips them |
| No `box-shadow` | Stripped by Canvas sanitizer |
| No `opacity` | Stripped — use `rgba()` for transparency instead |
| No `gap` in flex/grid | Use `margin` on children instead |
| No `<h1>` | Canvas uses H1 for the page title; body content starts at H2 |
| Font: `Lato, sans-serif` | Canvas's built-in font; consistent across all pages |
| `border-radius` is allowed | Used freely for rounded cards |
| `display: flex` is allowed | Used for hero banner alignment |

These are tested in `course-templates.test.ts` — every page type is checked for `<style`, `<h1`, and `box-shadow` absence.

---

## Relationship to Existing Tools

The course design system is purely additive. Nothing in SP1–SP9 was modified:

- `ingest_assignment_folder` still works for one-off pages. `generate_page` is the course-system version of the same concept.
- `publish_to_canvas` works unchanged — professor points it at any HTML file in `output/`.
- `validate_canvas_html` works unchanged — runs on any generated HTML.
- `critique_canvas_page` and `redesign_canvas_page` work unchanged — they operate on HTML strings.
- `load_canvas_page` / `save_canvas_page` work unchanged — they operate on files in `output/`.

The intended workflow for a full course redesign cycle:

```
setup_course  →  fill in .md files  →  generate_course
                                      ↓
                                   publish_to_canvas (per page)
                                      ↓
                                   load_canvas_page → critique_canvas_page
                                      ↓
                                   redesign_canvas_page → save_canvas_page
                                      ↓
                                   publish_to_canvas (updated)
```

Or with import:

```
import_course  →  review [NEEDS REVIEW] placeholders
               →  update semester/dates in course-config.md
               →  generate_course
               →  publish_to_canvas (per page)
```

---

## Test Strategy

Tests follow the same conventions as SP1–SP9:

- **No mocking of the filesystem.** Real files, real `tmpdir()` folders. This caught actual bugs in the scaffold generator (path separator issues, missing `mkdirSync recursive` calls) that mocks would have hidden.
- **Fixture files are real content.** The `tests/fixtures/course-input/` folder contains actual filled-in `.md` files that look like professor-authored content. Tests read these and verify the rendered HTML contains expected text.
- **Template tests check Canvas compliance.** Every page type is tested for `<style` absence, `<h1` absence, and `box-shadow` absence — not just that it renders without throwing.
- **Import tests use a complete fixture archive.** The `tests/fixtures/canvas-backup/ITM370/` folder is a realistic (small) canvas-backup archive. Tests verify the full import pipeline end-to-end.
