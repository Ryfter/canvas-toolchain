---
id: "ct_publish"
kind: "intent"
description: "Preview, publish, roll back, and snapshot Canvas content."
ops: 4
related: [snapshots]
---
# ct_publish (intent tool)

Preview, publish, roll back, and snapshot Canvas content.

## Operations (4)

- [[preview_course_publish]] — Generate a publish preview: per-page diffs, warnings, and a manifest. No Canvas writes occur.
- [[publish_course]] — Publish the previewed manifest to Canvas with explicit per-entry approvals. Stops on first failure.
- [[rollback_course_publish]] — Restore every successfully-published entry from a snapshot to its prior Canvas state.
- [[list_publish_snapshots]] — List all publish snapshots for a course in oldest-to-newest order, showing which is currently live in Canvas and which can be rolled back to / rolled forward to. Pipe the snapshotId from a row into `ct_publish` action `rollback` to restore that version.
<!-- generated:end -->

# Notes

<!-- Hand-written. The generator regenerates everything above the marker. -->
