---
id: "ct_review"
kind: "intent"
description: "Accessibility and quality gates before students see anything."
ops: 6
related: [accessibility]
---
# ct_review (intent tool)

Accessibility and quality gates before students see anything.

## Operations (6)

- [[review_canvas_rubric]] — Pull a Canvas rubric (attached, else course list), diff since last rewrite, triage acceptable/needs-update/needs-review. Read-only; needs-update proposes a rubric for ct_build rubric. Needs Canvas+AI.
- [[check_shell_readiness]] — LIVE Canvas shell check: Week N from module titles+termStartMonday (overrides win); ~2w thorough, ~1w lighter; cross-check due/unlock/lock; ct_review quiz callouts. Anytime. Read-only; needs Canvas.
- [[validate_quiz]] — Advisory quiz check (Classic Quizzes): missing keys, empty/dup stems, points mismatch, week-map dates, optional LLM triage. Live via courseId+quizId (Canvas) or local quizPath/quizMarkdown. Read-only.
- [[accessibility_review_queue]] — Course "near the edge" a11y worklist: borderline findings, needs-review criteria, and acknowledged publishes, worst-margin first, live Canvas URLs. resolve marks a page reviewed; professor is arbiter.
- [[audit_course_accessibility]] — Run the full WCAG 2.2 stack (in-house + axe-core) over every generated page, report per-page verdicts vs the required level, and refresh the borderline queue. The between-semesters check.
- [[review_accessibility_policy]] — Accessibility policy anchor: shows policy URLs, required level, cadence, last-verified; confirm:true stamps a re-read. Updates urls/requiredConformance/recheckWeeks/wcag3Advisory. Default WCAG 2.1 AA.
<!-- generated:end -->

# Notes

<!-- Hand-written. The generator regenerates everything above the marker. -->
