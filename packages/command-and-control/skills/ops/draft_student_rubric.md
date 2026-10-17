---
id: "draft_student_rubric"
description: "Take a faculty-facing rubric and use the Anthropic API to produce a student-facing rewrite plus worked examples per criterion. Writes a markdown file matching the CDS rubric page-type schema so `ct_build` action `course` can render it as a Canvas page + downloadable .md for students to paste into an LLM. Run `ct_setup` action `anthropic` first if not configured."
section: "design"
intent_tool: "ct_build"
intent_action: "rubric"
exposure: "intent"
related: [preview_canvas_pattern, update_course_materials, full_pipeline, generate_quiz, paste_layout, update_examples, generate_course]
---
<!-- generated:end -->

# draft_student_rubric

## When to use

<!-- Hand-written guidance starts here. The generator only rewrites the frontmatter above the marker. -->

## Pitfalls
