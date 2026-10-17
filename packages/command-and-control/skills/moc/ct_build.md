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

- [[preview_canvas_pattern]] — Render a Canvas capability pattern to a standalone HTML file openable in any browser. Use after `ct_advanced` run `show_canvas_capabilities` to see a pattern in action.
- [[update_course_materials]] — Answer "update my materials and export" — drafts updated briefs for every assignment in next-plan/, runs the examples update pass, and exports to CDS format.
- [[full_pipeline]] — Run `ct_analyze` action `course` → `ct_plan` action `semester` → `ct_build` action `materials` end-to-end. Returns results from all three phases.
- [[draft_student_rubric]] — Rewrite a faculty rubric into student-facing language with worked examples per criterion. Writes CDS rubric markdown for ct_build course to render as a Canvas page + student .md. Needs Anthropic.
- [[generate_quiz]] — Author a local quiz draft (books/slides/lectures) with difficulty-mix knobs, written under week-NN/quizzes/. Needs an LLM. Does not publish to Canvas — use ct_review quiz for live checks.
- [[paste_layout]] — Paste raw HTML and CSS (e.g. from Stitch or Figma) to adapt it into a Canvas-safe slot layout and audit accessibility.
- [[update_examples]] — Mechanical year/tool-name replacement pass + optional LLM proposed rewrites.
- [[generate_course]] — [@canvas-toolchain/canvas-design-studio] Generate Canvas-safe HTML for every page in a Canvas Design Studio course folder.

## Concepts (2)

- [[quiz_migration]] — Classic Quizzes still work, but Canvas is migrating them:...
- [[semester_rollover]] — Rolling a course into a new semester: archive and ingest ...
<!-- generated:end -->

# Notes

<!-- Hand-written. The generator regenerates everything above the marker. -->
