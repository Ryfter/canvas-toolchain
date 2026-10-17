---
id: "ct_inspect"
kind: "intent"
description: "Read current course state: assignments, pages, modules, resources."
ops: 6
related: [admin]
---
# ct_inspect (intent tool)

Read current course state: assignments, pages, modules, resources.

## Operations (6)

- [[get_course_state]] — List registered courses with their on-disk paths, semester history, and feed counts.
- [[list_assignments]] — List assignments for a course/semester from its ingested topic map.
- [[list_pages]] — List pages for a course/semester from its ingested topic map.
- [[list_canvas_modules]] — List modules for a course/semester. Pass expandItems=true to include item details.
- [[list_resources]] — List external resource links referenced in pages, assignments, and discussions.
- [[export_course_folder]] — Strip CI fields and write CDS course/ format; one folder per section.

## Concepts (3)

- [[module_channel]] — Plug-in modules and Canvas modules share a word, not a system: installing and enabling a tool bundle is nothing like reading a Canvas course's modules.
- [[publish_safety]] — The publish safety net: preview captures a rollback baseline, publish stops at the first failure, snapshots make the change reversible, and paste needs no token.
- [[semester_rollover]] — Rolling a course into a new semester: archive and ingest the old term, analyze it, copy the shell, move every due date onto the new calendar, then rebuild.
<!-- generated:end -->

# Notes

<!-- Hand-written. The generator regenerates everything above the marker. -->
