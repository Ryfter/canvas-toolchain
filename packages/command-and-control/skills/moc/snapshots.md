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
- [[list_publish_snapshots]] — List all publish snapshots for a course in oldest-to-newest order, showing which is currently live in Canvas and which can be rolled back to / rolled forward to. Pipe the snapshotId from a row into `ct_publish` action `rollback` to restore that version.
- [[prune_publish_snapshots]] — Apply retention policy to a course's publish snapshots. Removes snapshots older than the configured retention window AND beyond the configured retention count (defaults: keep 3 most-recent, keep anything ≤ 30 days old). Never removes the currently-live snapshot. When dryRun is true, lists what would be pruned without taking action. Auto-pruning also runs after every successful `ct_publish` action `publish`.
- [[snapshot_course]] — Write or update a course reference markdown doc capturing course identifiers, assignment groups, modules, and an append-only Update Log. Re-running against the same outputPath regenerates the auto-managed sections (delimited by AUTO:start/AUTO:end HTML comment markers) and preserves all hand-edited prose around them.
<!-- generated:end -->

# Notes

<!-- Hand-written. The generator regenerates everything above the marker. -->
