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

- [[review_canvas_rubric]] — Pull a rubric from Canvas (the assignment's attached rubric first; falls back to the course rubric list), detect whether it changed since your last student rewrite, and run a smart triage (acceptable / needs-update / needs-review) with specific flagged criteria. Read-only — writes nothing. When the verdict is needs-update it proposes a revised faculty rubric for your approval; feed the approved rubric to `ct_build` action `rubric`. Run `ct_setup` action `canvas` and `ct_setup` action `anthropic` first.
- [[check_shell_readiness]] — Advisory spot-check of a LIVE Canvas course shell. Run anytime (manual). Optional weekly cadence is opt-in via `ct_setup` action `spot_check` (recommends Saturday). Weeks: infer Week N from module titles + termStartMonday; weekMapOverrides win. Thorough = week beginning in ~2 weeks; lighter = ~1 week. Cross-checks due/unlock/lock. Emits quizCallouts for `ct_review` action `quiz` (sibling; validate-first). Read-only. `ct_setup` action `canvas` required.
- [[validate_quiz]] — Advisory live-Canvas quiz quality check (Classic Quizzes questions API): missing keys, empty stems, duplicate stems, points mismatch, week-map date mismatches, optional LLM triage for ambiguous keys / weak distractors. Pass courseId+quizId for spot-check (source of truth = Canvas). Optional local quizPath/quizMarkdown is authoring pre-check only. Manual anytime — does not require weeklyCheckEnabled. Usable from shell readiness call-out for primary/secondary weeks. Run `ct_setup` action `canvas` first for live mode. Does not write to Canvas or gate publish.
- [[accessibility_review_queue]] — The per-course "near the edge" accessibility worklist: pages with borderline findings, needs-human-review criteria, or acknowledged publishes. Lists open entries worst-margin first with live Canvas URLs for human-eyes verification; resolve marks a page reviewed. The professor is the final arbiter.
- [[audit_course_accessibility]] — Run the full WCAG 2.2 engine stack (in-house + axe-core) across every generated page of a course project, report per-page verdicts against the required level, and refresh the borderline review queue. The regular between-semesters check.
- [[review_accessibility_policy]] — The institution accessibility policy anchor (spec §7): shows the policy URLs, required conformance level, cadence, and last-verified date; confirm: true stamps today's date after the professor re-reads the policy. Also accepts updates to urls / requiredConformance / recheckWeeks / wcag3Advisory so nobody edits JSON by hand. Default level: WCAG 2.1 AA (ADA Title II baseline).
<!-- generated:end -->

# Notes

<!-- Hand-written. The generator regenerates everything above the marker. -->
