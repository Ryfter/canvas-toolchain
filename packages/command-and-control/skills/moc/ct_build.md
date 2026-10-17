---
id: "ct_build"
kind: "intent"
description: "Generate Canvas-safe materials, examples, layouts, and rubrics."
ops: 8
related: [design]
---
# ct_build (intent tool)

Generate Canvas-safe materials, examples, layouts, and rubrics.

## Operations (8)

- [[preview_canvas_pattern]] — Renders a specific Canvas capability pattern to a standalone HTML file that can be opened in any browser. Use this after `ct_advanced` run `show_canvas_capabilities` to actually see a pattern in action.
- [[update_course_materials]] — Answer "update my materials and export" — drafts updated briefs for every assignment in next-plan/, runs the examples update pass, and exports to CDS format.
- [[full_pipeline]] — Run `ct_analyze` action `course` → `ct_plan` action `semester` → `ct_build` action `materials` end-to-end. Returns results from all three phases.
- [[draft_student_rubric]] — Take a faculty-facing rubric and use the Anthropic API to produce a student-facing rewrite plus worked examples per criterion. Writes a markdown file matching the CDS rubric page-type schema so `ct_build` action `course` can render it as a Canvas page + downloadable .md for students to paste into an LLM. Run `ct_setup` action `anthropic` first if not configured.
- [[generate_quiz]] — Author a local quiz draft markdown from course materials (books/slides/lectures) with difficulty-mix knobs. Writes under week-NN/quizzes/ (temp+rename). Manual anytime — not required for the weekly shell spot-check (use `ct_review` action `quiz` for live Canvas). Requires an active LLM (`ct_setup` action `anthropic` or Ollama). Does not publish to Canvas Quizzes.
- [[paste_layout]] — Paste raw HTML and CSS (e.g. from Stitch or Figma) to adapt it into a Canvas-safe slot layout and audit accessibility.
- [[update_examples]] — Mechanical year/tool-name replacement pass + optional LLM proposed rewrites.
- [[generate_course]] — [@canvas-toolchain/canvas-design-studio] Generate Canvas-safe HTML for every page in a Canvas Design Studio course folder.
<!-- generated:end -->

# Notes

<!-- Hand-written. The generator regenerates everything above the marker. -->
