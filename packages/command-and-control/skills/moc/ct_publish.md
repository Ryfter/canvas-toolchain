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
- [[list_publish_snapshots]] — List a course's publish snapshots oldest-to-newest, marking the one live in Canvas and which can be rolled back/forward. Feed a row's snapshotId to ct_publish rollback.
<!-- generated:end -->

# Notes

<!-- Hand-written. The generator regenerates everything above the marker. -->
