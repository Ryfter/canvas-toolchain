---
id: "validate_quiz"
description: "Advisory live-Canvas quiz quality check (Classic Quizzes questions API): missing keys, empty stems, duplicate stems, points mismatch, week-map date mismatches, optional LLM triage for ambiguous keys / weak distractors. Pass courseId+quizId for spot-check (source of truth = Canvas). Optional local quizPath/quizMarkdown is authoring pre-check only. Manual anytime — does not require weeklyCheckEnabled. Usable from shell readiness call-out for primary/secondary weeks. Run `ct_setup` action `canvas` first for live mode. Does not write to Canvas or gate publish."
section: "admin"
intent_tool: "ct_review"
intent_action: "quiz"
exposure: "intent"
related: [review_canvas_rubric, check_shell_readiness, accessibility_review_queue, audit_course_accessibility, review_accessibility_policy]
---
<!-- generated:end -->

# validate_quiz

## When to use

<!-- Hand-written guidance starts here. The generator only rewrites the frontmatter above the marker. -->

## Pitfalls
