---
id: "snapshots"
kind: "section"
description: "Publish snapshot listing and pruning."
ops: 6
related: [ct_publish, ct_advanced]
---
# snapshots section

Publish snapshot listing and pruning.

## Operations (6)

- [[preview_course_publish]] — Generate a publish preview: per-page diffs, warnings, and a manifest. No Canvas writes occur.
- [[publish_course]] — Publish the previewed manifest to Canvas with explicit per-entry approvals. Stops on first failure.
- [[rollback_course_publish]] — Restore every successfully-published entry from a snapshot to its prior Canvas state.
- [[list_publish_snapshots]] — List a course's publish snapshots oldest-to-newest, marking the one live in Canvas and which can be rolled back/forward. Feed a row's snapshotId to ct_publish rollback.
- [[prune_publish_snapshots]] — Apply retention to publish snapshots: drops those past the window and count (default keep 3, keep ≤30 days), never the live one. dryRun lists only; also runs after every successful publish.
- [[snapshot_course]] — Write/update a course reference doc (identifiers, assignment groups, modules, append-only Update Log). Re-runs regenerate the AUTO:start/AUTO:end sections but preserve hand-edited prose around them.

## Concepts (2)

- [[accessibility_gate]] — How the accessibility gate works: what blocks a Canvas publish, what only queues for human review, and the acknowledgment the professor must write to continue.
- [[publish_safety]] — The publish safety net: preview captures a rollback baseline, publish stops at the first failure, snapshots make the change reversible, and paste needs no token.
<!-- generated:end -->

# Notes

<!-- Hand-written. The generator regenerates everything above the marker. -->
