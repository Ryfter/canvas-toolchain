---
id: "publish_safety"
description: "The publish safety net: preview captures a rollback baseline, publish stops at the first failure, snapshots make the change reversible, and paste needs no token."
related: [list_publish_snapshots, preview_course_publish, prune_publish_snapshots, publish_course, rollback_course_publish, snapshot_course]
---

# Publish and rollback safety

Writing to live Canvas is the one irreversible-feeling step in the whole
toolchain, so it is built as a transaction with a captured baseline, an explicit
per-entry approval, a stop-on-first-failure rule, and a pointer file that says
which snapshot is live right now. The safety property is simple to state:
**every successful publish can be undone, because the preview captured what
Canvas looked like before it.**

## The order that works

1. [[preview_course_publish]] — reads Canvas (pages, assignments), compares, and
   writes a snapshot directory: `manifest.json` and `state.json`, per-entry
   `prior/<filename>`, `new/<filename>`, `diffs/<filename>.diff`, plus
   `pages-meta.json` and `widgets-meta.json`.
2. Read the manifest, then [[publish_course]] with two maps: `approvals`
   (`filename|relPath` → `'approve' | 'skip'`, and every non-skipped entry must
   appear or you get `APPROVALS_INCOMPLETE`) and `a11yAcknowledgments` where the
   gate demands it — see [[accessibility_gate]].
3. [[list_publish_snapshots]] — see what is live, what can be rolled back to, and
   what can be rolled forward to.
4. [[rollback_course_publish]] — restore a snapshot's published entries.
5. [[prune_publish_snapshots]] — retention. It also runs automatically after every
   successful publish.

[[generate_course]] and [[export_course_folder]] bracket the same work with no
Canvas at all: they produce the HTML and a CDS-ready folder to paste by hand.

## What makes it safe

**A missing baseline blocks the entry.** If the current Canvas body cannot be
fetched during preview, the entry gets a `severity: 'block'` warning and publish
refuses it — but the code still writes an empty `prior/<filename>`; the block
warning, not the absence of a stub, is what protects a later rollback. A *widget*
fetch failure is only `severity: 'warn'`
(`src/tools/workflows/preview_course_publish.ts`).

**Approval is per entry and complete.** The approval map is validated against the
manifest's non-skipped entries; missing or unknown keys are reported together.
Keys are the output-relative path (`entry.relPath ?? entry.filename`), with a
bare-filename fallback only when that filename is unambiguous
(`src/tools/publish/approvals.ts`).

**Stop on first failure.** A blocking warning, an `ACCESSIBILITY_ACK_REQUIRED`
refusal, a CDS re-gate failure, or a Canvas API error halts the publish and
records `phase: 'partial'` with the one entry that failed. Resume with
`resume: true`; `PublishState.failed` is singular by design because publishing
never continues past the first failure.

**State is an explicit phase machine.** Each snapshot's `state.json` moves
`preview` → `partial` → `published`, `rolled-back`, or `restored` (a rollback
target). Publishing a published snapshot returns `ALREADY_PUBLISHED`,
re-publishing a rolled-back one `ALREADY_ROLLED_BACK`; a dirty git tree is
refused unless you resume or pass `gitCommit: false`.

**Before overwriting, Canvas gets a breadcrumb.** When a page or widget collides
with an existing Canvas resource, an `[ARCHIVED] <original title>` copy is created
first and left unpublished, with widget files copied under
`/canvas-toolchain-archive/<date>/` (`src/tools/publish/breadcrumbs.ts`). It is
fail-soft — a breadcrumb failure warns rather than aborting — and the copies are
cleaned up when their snapshot is pruned.

**One pointer file decides what is live.** `publish-state-<courseId>.json` in the
snapshots root holds `currentlyLiveSnapshotId` plus a history whose entries record
`becameLiveVia: 'publish' | 'rollback' | 'roll-forward'`
(`src/tools/publish/state_meta.ts`). Preview writes each snapshot to the legacy
global root `~/.command-and-control/publish-snapshots/` (`createSnapshotDir`), and
`publish_course` / `rollback_course_publish` read it back from there
(`snapshotDir`); only `list_publish_snapshots` and pruning resolve the
course-local `<courseDir>/.canvas-toolchain/publish-snapshots/` root.

**Rollback reverses what was actually done.** It walks `state.published` in
reverse and restores each entry's prior body, deleting pages it created
(`entry.action === 'created'` → restore to nothing). If the live Canvas body has
drifted since the publish, the drift is *reported* and the restore proceeds. Then
the pointer flips to `targetSnapshotId`, or to the history entry immediately
before the rolled-back snapshot — i.e. "undo my last publish". The snapshot's
phase becomes `rolled-back`, which is what makes rolling forward possible.

## The no-token path is first-class

Publishing is optional. [[generate_course]] writes Canvas-safe HTML to
`<courseDir>/output` and [[export_course_folder]] writes a CDS course folder,
both with no credentials at all; you paste into Canvas by hand. **Preview and
publish both require a Canvas token** — they return `MISSING_API_TOKEN` without
one, and `rollback_course_publish` does too. So the credential-free path ends at
"HTML on disk", and everything after that is the optional publish feature.

## Pitfalls

- **`snapshot_course` is not a publish snapshot.** [[snapshot_course]] writes and
  updates a course *reference document* (identifiers, assignment groups, an
  append-only Update Log). It neither captures nor restores Canvas state. Both
  live in the same topic map, which is exactly why the confusion happens.
- **Retention can expire your escape hatch.** Pruning never deletes the live
  snapshot, and it drops a snapshot only when it is **both** beyond the newest 3
  **and** older than 30 days (both overridable in the Canvas config). It can still
  delete the snapshot you were planning to roll back to — run it with `dryRun`
  before a big change if you care.
- **Drift does not block a rollback.** That is intentional (a hand-edit in Canvas
  must not make the tool unusable), but it means rolling back after editing in
  Canvas silently discards that edit. The drift report is the warning.
- **Roll-back and roll-forward are different questions.** `canRollBackTo` is true
  for any non-live snapshot — including a `preview`-phase one; `canRollForwardTo`
  is true only for a non-live `rolled-back` snapshot.
- **Rollback failures are collected, not fatal.** Per-entry restore errors land in
  `restoreFailed` while the rest of the restore continues — so read that array
  rather than trusting the top-level success.
- **Prune failures never mask a publish.** The automatic prune after a successful
  publish swallows its own errors; a snapshot that should have been pruned still
  being present is not a publish failure.

## Sources

- `packages/command-and-control/src/tools/workflows/preview_course_publish.ts` —
  snapshot contents, the prior-body fetch failure as a blocking warning,
  `MISSING_API_TOKEN`.
- `packages/command-and-control/src/tools/workflows/publish_course.ts` — approval
  and a11y gates, phase transitions, stop-on-first-failure, pre-publish git
  commit, breadcrumbs, automatic prune.
- `packages/command-and-control/src/tools/workflows/rollback_course_publish.ts` —
  reverse-order restore, drift reporting, pointer flip, `restoreFailed`.
- `packages/command-and-control/src/tools/workflows/list_publish_snapshots.ts` —
  live marking and roll-back/forward eligibility.
- `packages/command-and-control/src/tools/publish/{approvals,a11y_gate,state_meta,snapshot_store,snapshot_location,pruning,drift_detection,hash,breadcrumbs}.ts`
  — the safety helpers and the on-disk snapshot format.
- `packages/canvas-design-studio/src/tools/generate-course.ts` and
  `packages/curriculum-intelligence/src/tools/export_course_folder.ts` — the
  credential-free HTML and folder outputs.
- `packages/command-and-control/src/surface/registry.ts` — the `publish_course`
  input schema and the snapshot operation descriptions.
