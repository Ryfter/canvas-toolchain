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

- [[show_canvas_capabilities]] — Canvas-safe pattern catalog: filter by category (layout, information, interactive, pedagogical, branded) or supportStatus (supported/partial/aspirational). Then ct_build preview_pattern renders one.
- [[preview_canvas_pattern]] — Render a Canvas capability pattern to a standalone HTML file openable in any browser. Use after `ct_advanced` run `show_canvas_capabilities` to see a pattern in action.
- [[update_course_materials]] — Answer "update my materials and export" — drafts updated briefs for every assignment in next-plan/, runs the examples update pass, and exports to CDS format.
- [[draft_student_rubric]] — Rewrite a faculty rubric into student-facing language with worked examples per criterion. Writes CDS rubric markdown for ct_build course to render as a Canvas page + student .md. Needs Anthropic.
- [[review_canvas_rubric]] — Pull a Canvas rubric (attached, else course list), diff since last rewrite, triage acceptable/needs-update/needs-review. Read-only; needs-update proposes a rubric for ct_build rubric. Needs Canvas+AI.
- [[generate_quiz]] — Author a local quiz draft (books/slides/lectures) with difficulty-mix knobs, written under week-NN/quizzes/. Needs an LLM. Does not publish to Canvas — use ct_review quiz for live checks.
- [[paste_layout]] — Paste raw HTML and CSS (e.g. from Stitch or Figma) to adapt it into a Canvas-safe slot layout and audit accessibility.
- [[save_layout_as_template]] — Formulate and save a successfully adapted layout as a reusable template in the local registry.
- [[draft_assignment_brief]] — LLM-draft an updated assignment brief. Sets replacement_recommended on DROP/stale.
- [[update_examples]] — Mechanical year/tool-name replacement pass + optional LLM proposed rewrites.
- [[import_course]] — [@canvas-toolchain/canvas-design-studio] Import a Canvas Backup archive into a Canvas Design Studio course folder.
- [[generate_course]] — [@canvas-toolchain/canvas-design-studio] Generate Canvas-safe HTML for every page in a Canvas Design Studio course folder.
<!-- generated:end -->

# Notes

<!-- Hand-written. The generator regenerates everything above the marker. -->
