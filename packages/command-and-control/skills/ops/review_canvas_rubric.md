---
id: "review_canvas_rubric"
description: "Pull a rubric from Canvas (the assignment's attached rubric first; falls back to the course rubric list), detect whether it changed since your last student rewrite, and run a smart triage (acceptable / needs-update / needs-review) with specific flagged criteria. Read-only — writes nothing. When the verdict is needs-update it proposes a revised faculty rubric for your approval; feed the approved rubric to `ct_build` action `rubric`. Run `ct_setup` action `canvas` and `ct_setup` action `anthropic` first."
section: "design"
intent_tool: "ct_review"
intent_action: "rubric"
exposure: "intent"
related: [check_shell_readiness, validate_quiz, accessibility_review_queue, audit_course_accessibility, review_accessibility_policy]
---
<!-- generated:end -->

# review_canvas_rubric

## When to use

<!-- Hand-written guidance starts here. The generator only rewrites the frontmatter above the marker. -->

## Pitfalls
