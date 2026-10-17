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

## Concepts (2)

- [[accessibility_gate]] — How the accessibility gate works: what blocks a Canvas publish, what only queues for human review, and the acknowledgment the professor must write to continue.
- [[publish_safety]] — The publish safety net: preview captures a rollback baseline, publish stops at the first failure, snapshots make the change reversible, and paste needs no token.
<!-- generated:end -->

# Notes

<!-- Hand-written. The generator regenerates everything above the marker. -->
