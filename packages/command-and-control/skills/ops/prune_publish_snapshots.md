---
id: "prune_publish_snapshots"
description: "Apply retention policy to a course's publish snapshots. Removes snapshots older than the configured retention window AND beyond the configured retention count (defaults: keep 3 most-recent, keep anything ≤ 30 days old). Never removes the currently-live snapshot. When dryRun is true, lists what would be pruned without taking action. Auto-pruning also runs after every successful `ct_publish` action `publish`."
section: "snapshots"
intent_tool: ""
intent_action: ""
exposure: "advanced"
related: [preview_course_publish, publish_course, rollback_course_publish, list_publish_snapshots, snapshot_course]
---
<!-- generated:end -->

# prune_publish_snapshots

## When to use

<!-- Hand-written guidance starts here. The generator only rewrites the frontmatter above the marker. -->

## Pitfalls
