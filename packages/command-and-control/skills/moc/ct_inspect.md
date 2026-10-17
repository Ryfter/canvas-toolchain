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
<!-- generated:end -->

# Notes

<!-- Hand-written. The generator regenerates everything above the marker. -->
