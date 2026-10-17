---
id: "ct_plan"
kind: "intent"
description: "Plan next semester: outlines, date shifts, assignment briefs."
ops: 4
related: [research]
---
# ct_plan (intent tool)

Plan next semester: outlines, date shifts, assignment briefs.

## Operations (4)

- [[plan_next_semester]] — Answer "get me ready to plan next semester" — imports previous shell, fetches the academic calendar, shifts all due dates, and generates a recommended outline.
- [[shift_dates]] — Apply target calendar to all due: fields in next-plan/ briefs.
- [[generate_recommended_outline]] — Generate a week-by-week outline from diff + optional currency-report.
- [[draft_assignment_brief]] — LLM-draft an updated assignment brief. Sets replacement_recommended on DROP/stale.

## Concepts (1)

- [[semester_rollover]] — Rolling a course into a new semester: archive and ingest the old term, analyze it, copy the shell, move every due date onto the new calendar, then rebuild.
<!-- generated:end -->

# Notes

<!-- Hand-written. The generator regenerates everything above the marker. -->
