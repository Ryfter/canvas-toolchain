---
id: "generate_quiz"
description: "Author a local quiz draft markdown from course materials (books/slides/lectures) with difficulty-mix knobs. Writes under week-NN/quizzes/ (temp+rename). Manual anytime — not required for the weekly shell spot-check (use `ct_review` action `quiz` for live Canvas). Requires an active LLM (`ct_setup` action `anthropic` or Ollama). Does not publish to Canvas Quizzes."
section: "design"
intent_tool: "ct_build"
intent_action: "quiz"
exposure: "intent"
related: [preview_canvas_pattern, update_course_materials, full_pipeline, draft_student_rubric, paste_layout, update_examples, generate_course]
---
<!-- generated:end -->

# generate_quiz

## When to use

<!-- Hand-written guidance starts here. The generator only rewrites the frontmatter above the marker. -->

## Pitfalls
