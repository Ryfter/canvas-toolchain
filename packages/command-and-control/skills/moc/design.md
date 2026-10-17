---
id: "design"
kind: "section"
description: "Canvas pattern catalog, previews, layout templates."
ops: 12
related: [ct_import, ct_plan, ct_build, ct_review, ct_advanced]
---
# design section

Canvas pattern catalog, previews, layout templates.

## Operations (12)

- [[show_canvas_capabilities]] — Returns the catalog of Canvas-safe design patterns. Optionally filter by category (layout, information, interactive, pedagogical, branded) or supportStatus (supported, partial, aspirational). Use this to discover what patterns exist; then call `ct_build` action `preview_pattern` to see any specific pattern rendered.
- [[preview_canvas_pattern]] — Renders a specific Canvas capability pattern to a standalone HTML file that can be opened in any browser. Use this after `ct_advanced` run `show_canvas_capabilities` to actually see a pattern in action.
- [[update_course_materials]] — Answer "update my materials and export" — drafts updated briefs for every assignment in next-plan/, runs the examples update pass, and exports to CDS format.
- [[draft_student_rubric]] — Take a faculty-facing rubric and use the Anthropic API to produce a student-facing rewrite plus worked examples per criterion. Writes a markdown file matching the CDS rubric page-type schema so `ct_build` action `course` can render it as a Canvas page + downloadable .md for students to paste into an LLM. Run `ct_setup` action `anthropic` first if not configured.
- [[review_canvas_rubric]] — Pull a rubric from Canvas (the assignment's attached rubric first; falls back to the course rubric list), detect whether it changed since your last student rewrite, and run a smart triage (acceptable / needs-update / needs-review) with specific flagged criteria. Read-only — writes nothing. When the verdict is needs-update it proposes a revised faculty rubric for your approval; feed the approved rubric to `ct_build` action `rubric`. Run `ct_setup` action `canvas` and `ct_setup` action `anthropic` first.
- [[generate_quiz]] — Author a local quiz draft markdown from course materials (books/slides/lectures) with difficulty-mix knobs. Writes under week-NN/quizzes/ (temp+rename). Manual anytime — not required for the weekly shell spot-check (use `ct_review` action `quiz` for live Canvas). Requires an active LLM (`ct_setup` action `anthropic` or Ollama). Does not publish to Canvas Quizzes.
- [[paste_layout]] — Paste raw HTML and CSS (e.g. from Stitch or Figma) to adapt it into a Canvas-safe slot layout and audit accessibility.
- [[save_layout_as_template]] — Formulate and save a successfully adapted layout as a reusable template in the local registry.
- [[draft_assignment_brief]] — LLM-draft an updated assignment brief. Sets replacement_recommended on DROP/stale.
- [[update_examples]] — Mechanical year/tool-name replacement pass + optional LLM proposed rewrites.
- [[import_course]] — [@canvas-toolchain/canvas-design-studio] Import a Canvas Backup archive into a Canvas Design Studio course folder.
- [[generate_course]] — [@canvas-toolchain/canvas-design-studio] Generate Canvas-safe HTML for every page in a Canvas Design Studio course folder.
<!-- generated:end -->

# Notes

<!-- Hand-written. The generator regenerates everything above the marker. -->
