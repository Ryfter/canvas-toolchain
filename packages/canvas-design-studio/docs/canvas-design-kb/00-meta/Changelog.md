# Changelog

Parent: [Canvas Design Knowledge Base](../README.md) | [KB Overview](KB-Overview.md)

## 2026-05-10 - Public Documentation Cleanup

- Removed production guidance for the third-party Canvas design add-on and deleted those 04-tools pages.
- Kept third-party showcase references only where they are framed as external inspiration in [Inspiration and Showcases](../07-resources/Inspiration-and-Showcases.md).
- Converted the KB map and major reference pages away from Obsidian-style links.
- Reworked public resources so Canvas Design Studio is positioned as a standalone Canvas-safe HTML generator, not an integration with a commercial Canvas add-on.

## 2026-05-10 - Public Release v0.9.3

- Published `canvas-design-mcp@0.9.3` to npm with GitHub Actions provenance.
  *(renamed to `@canvas-toolchain/canvas-design-studio` in v2.2.0)*
- Published the release Docker image to GitHub Container Registry.
- Added npm package repository metadata required for provenance validation.

## 2026-05-12 - Docker Hardening v0.9.5

- Moved the Docker image to the Node 24 Alpine LTS line.
- Removed npm/npx from the final runtime image after dependency install.
- Refreshed production transitive packages to clear `npm audit --omit=dev`.
- Added max-mode provenance and SBOM attestations to Docker publishing.
- Added explicit Docker Buildx setup so attestations work in GitHub Actions.

## 2026-05-15 - Course Design System + Assignment Types v0.9.8

### SP10a — Course Design Foundation (v0.9.6)
- Added `setup_course` wizard — select page types, set weeks, get a complete scaffold
- Added `generate_page`, `generate_week`, `generate_course` tools
- Added template engine covering 13 page types with Canvas-safe HTML output
- Color tokens inherited from institution config; per-course overrides supported

### SP10b — Canvas Backup Import (v0.9.7)
- Added `import_course` tool — extracts pages, assignments, quizzes, and discussions from a `canvas-backup` archive into a course folder
- Module-indexed assignment filenames (`assignment-1.1.md`, `assignment-1.2.md`) prevent silent overwrites
- Auto-detects assignment type from Canvas title: `assignment`, `engage-assignment`, `proj-assignment`, `tech-assignment`
- `[NEEDS REVIEW]` placeholders for quiz question content and LTI links

### SP11 — Assignment Type Customization (v0.9.8)
- Added `proj-assignment` and `tech-assignment` as first-class page types in `PAGE_TYPES` and `PAGE_TYPE_LABELS`
- `proj-assignment` template: Brief, Project Timeline (milestone table), Rubric, Submission Details
- `tech-assignment` template: Brief, Setup, Tasks, Deliverable, Rubric
- `team: true/false` front-matter flag — renders a Team section on any assignment type
- `timeline: true/false` front-matter flag — renders the milestone table on project assignments
- Both types appear automatically in the `setup_course` wizard checkbox list
- Published `canvas-design-mcp@0.9.8` to npm and Docker image to GHCR

## 2026-05-13 - npm Publishing Docs

- Added `docs/npm-publishing.md` as the release runbook.
- Updated install instructions to use the live npm package: `npm install -g canvas-design-mcp`.
- Recorded the current successful npm/Docker release as `v0.9.5`.

## 2026-04-28 - Resource Evaluation Pass

New files:

- [Canvas Built-In CSS Classes](../01-canvas-rce/Canvas-Built-In-CSS-Classes.md) - Canvas utility classes such as `border`, `content-box`, `grid-row`, `col-*`, and `ic-Table`.
- [Other Canvas Design Tools](../04-tools/Other-Canvas-Design-Tools.md) - external Canvas design references, including Loree, HowToCanvas, Fleximode, JHU, Canvas Commons, and Canvas source links.
- [Inspiration and Showcases](../07-resources/Inspiration-and-Showcases.md) - real Canvas examples and design lessons.

Updated files:

- [HTML Allowlist](../01-canvas-rce/HTML-Allowlist.md) - added built-in CSS class notes.
- [RCE Limitations and Workarounds](../01-canvas-rce/RCE-Limitations-and-Workarounds.md) - grid gap workaround references built-in classes.
- [Official Canvas Links](../07-resources/Official-Canvas-Links.md) - consolidated production-facing Canvas and utility links.
- [README](../README.md) - updated KB map and quick reference table.

## 2026-04-28 - Initial Build

- Created the first knowledge base structure.
- Populated the core Canvas RCE, design-system, pattern, accessibility, and resource files.

## Template for Future Entries

```text
## YYYY-MM-DD - Brief description

- What changed and why
- Source/reference if applicable
- Files affected: path/to/file.md
```

[KB Overview](KB-Overview.md) | [Contributing](Contributing.md)
