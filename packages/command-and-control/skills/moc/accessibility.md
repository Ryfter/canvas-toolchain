---
id: "accessibility"
kind: "section"
description: "Deep accessibility checks beyond the standard audit."
ops: 4
related: [ct_review, ct_advanced]
---
# accessibility section

Deep accessibility checks beyond the standard audit.

## Operations (4)

- [[accessibility_review_queue]] — The per-course "near the edge" accessibility worklist: pages with borderline findings, needs-human-review criteria, or acknowledged publishes. Lists open entries worst-margin first with live Canvas URLs for human-eyes verification; resolve marks a page reviewed. The professor is the final arbiter.
- [[audit_course_accessibility]] — Run the full WCAG 2.2 engine stack (in-house + axe-core) across every generated page of a course project, report per-page verdicts against the required level, and refresh the borderline review queue. The regular between-semesters check.
- [[review_accessibility_policy]] — The institution accessibility policy anchor (spec §7): shows the policy URLs, required conformance level, cadence, and last-verified date; confirm: true stamps today's date after the professor re-reads the policy. Also accepts updates to urls / requiredConformance / recheckWeeks / wcag3Advisory so nobody edits JSON by hand. Default level: WCAG 2.1 AA (ADA Title II baseline).
- [[wave_deep_check]] — Deep accessibility check of a PUBLICLY-visible page via the paid WAVE API (WebAIM). Two-call spend gate: first call previews the cost (~2 credits) and runs nothing; re-call with confirm: true to spend. Auth-gated Canvas URLs are refused before any spend — use the free WAVE browser extension or MS Accessibility Insights for those. Optional apiKey is saved to the institution config on first use.
<!-- generated:end -->

# Notes

<!-- Hand-written. The generator regenerates everything above the marker. -->
