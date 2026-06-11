# publish_course — Design Spec

**Date:** 2026-05-30
**Issue:** #64 (last v0.9 feature)
**Scope:** Replace the C&C `publish_course` placeholder with a real, reviewed, page-by-page Canvas publishing transaction. Course-wide publish becomes a three-tool flow: preview → publish-with-approvals → optional rollback. Publishes Canvas Pages and Canvas Assignment *descriptions* (not grading settings); updates only — never auto-creates assignments.

**Depends on:** `publishToCanvas` in canvas-design-mcp (page-level publish, FERPA/validation/a11y/collision already shipped). `generate_course` in canvas-design-mcp (produces structured `GenerateCourseResult` keyed by `pageType`). Canvas API token via `setup_canvas`.

**Out of scope (v0.9):** auto-creating new Canvas assignments (C2 — deferred to v1.x); publishing quizzes, discussions, modules, files (S3/S4 — deferred to v1.x); grading settings (points, due date, rubric attachments — never in scope for this tool); concurrent multi-course publishes; a "watch and re-publish on change" mode.

**Manual path stays first-class.** A professor who never configures a Canvas API token can still use the full workflow up to `generate_course`, then copy-paste each HTML file into Canvas by hand. `publish_course` is optional convenience for token-holders; it does not become the only path.

---

## Design Decisions (from brainstorm 2026-05-30)

1. **Two-phase: preview then publish.** `preview_course_publish` returns a manifest of every page's diff and warnings; the professor reads it in Claude's chat; Claude calls `publish_course` with an explicit approval list. **Why:** MCP tools are single-shot — there is no built-in "pause mid-call and ask the professor." A cursor-style one-call-per-page loop is too chatty; a fail-on-question hybrid is too implicit about what just got pushed. The two-phase shape matches Claude Code's conversational loop: read the manifest, decide, act.

2. **Tiered diff: structural summary by default, full HTML diff on request.** Per page the preview shows: prior word count, new word count, sections changed, callouts/images added or removed, accessibility warnings, FERPA findings, title collisions. The professor can ask "show me the full diff for Week 4" and the preview re-runs (or a separate tool surfaces) the raw unified diff. **Why:** Canvas page HTML is inline-styled and verbose; a raw diff is technically accurate but unskimmable. Structural summary is the right default; raw diff is the right escape hatch. (4) over (1)/(2)/(3) in the brainstorm.

3. **Stop-on-failure with reusable snapshots (R2).** The preview phase already fetches every page's current Canvas HTML to compute the diff — that same fetched HTML *is* the rollback snapshot. Publish iterates in order. The moment any page returns a non-recoverable error, `publish_course` stops, returns a structured report (succeeded list, failed page + reason, untried list), and writes the snapshot bundle + the approval list to disk. The professor either calls `rollback_course_publish` to restore everything already pushed, or fixes the failing page and calls `publish_course --resume` to continue from the failure point. **Why:** Canvas has no transactions. "Full auto-rollback" (R1) sounds atomic but adds a second failure mode — rollback itself can partially fail, and now state is worse than just stopping clean. R2 gives most of R1's safety with no extra failure mode, and the snapshot is a byproduct of work the preview phase already does.

4. **Git-aware with G1 nudge + G4 opt-in surfacing.** If `<courseDir>` is already a git repo: preview verifies the working tree is clean (or warns), `publish_course` commits a pre-publish snapshot before pushing anything, and on success creates a tag like `published-2026-05-30-bus105-fall26`. If a remote is configured, the success report asks "push tag to GitHub?" If `<courseDir>` is *not* a git repo: preview surfaces a friendly nudge ("your course folder isn't in git — recovery story is weaker; want me to `git init` and commit before publishing?"). Professor can decline. **Why:** the course folder structure (markdown source in `course/`, generated HTML in `output/`) is already a repo waiting to happen. Git gives a third recovery layer beyond Canvas snapshots, makes the change history reviewable in professor's normal tools, and — per the professor — should encourage professors to think in version-control terms without forcing it. G2 (require git) raises the floor too high; G3 (silent internal git) hides the layer that's supposed to teach the habit.

5. **Scope: Canvas Pages + Assignment descriptions (S2).** `generate_course` already buckets generated files by `pageType`. The publish tool routes by bucket: page-like `pageType`s (`front-page`, `overview`, `resources`, `slides`, `videos`, `reading`, `lab`, `extra-credit`, `custom`) → Canvas Pages via existing `publishToCanvas`. Assignment-like `pageType`s (`assignment`, `engage-assignment`, `proj-assignment`, `tech-assignment`) → new Canvas Assignment description update path. Quiz-like and discussion-like types (`reading-quiz`, `weekly-quiz`, `discussion-board`) → in the manifest as `skipped: out-of-scope-v0.9` with a clear warning. **Why over S1:** assignment descriptions are the common case for a course refresh, the existing workflow is already in our hands, and the Assignment API path is small (a PUT to `/api/v1/courses/:id/assignments/:assignmentId` with `{ assignment: { description: html } }`). **Why over S3:** modules and quizzes have their own failure modes (a half-published module is structurally visible to students immediately) and deserve their own design pass.

6. **Unmatched assignments → skip with warning (C1). Never auto-create.** If an assignment output file's title has no name-match against the course's existing Canvas assignments, the preview surfaces it as `unmatched — will be skipped` and `publish_course` ignores it. The professor either creates the assignment manually in Canvas first (with whatever grading config they want) and re-runs publish_course, or removes the orphan file. **Why:** a Canvas Assignment needs points, grading type, assignment group, optionally a due date and rubric — none of which lives in the HTML. Auto-creating with safe defaults (C3) drops 0-point, ungrouped, no-due-date "drafts" into the course as junk the professor has to find and clean up. Opt-in create-stub (C2) is reasonable but adds another approval shape and another safety surface — defer until v0.9 ships and the workflow proves itself. The existing `publishToCanvas` already takes this stance for pages (explicit `collisionAction: 'create'` opt-in); assignments stay even more conservative.

---

## Architecture

Three new tools in C&C. New per-assignment-description function in CDS. No changes to `generate_course`, `publishToCanvas`, or `setup_canvas`.

```
C&C: preview_course_publish (workflow)
       │   inputs: { courseDir, courseId, outputDir? }
       │
       ├─ CDS:  generateCourse(courseDir, outputDir)   → GenerateCourseResult (idempotent re-run)
       │
       ├─ C&C:  routePages(weekResults)                 → { pages[], assignments[], skipped[] }
       │
       ├─ CDS:  listCanvasPages(courseId)               → CanvasPage[] (for title-match + snapshot)
       ├─ CDS:  listCanvasAssignments(courseId)         → CanvasAssignment[] (for name-match + snapshot)
       │
       ├─ C&C:  buildDiffs(routed, canvasState)         → PageManifestEntry[] | AssignmentManifestEntry[]
       │           (structural summary; full diff cached per entry, surfaced on request)
       │
       ├─ C&C:  scanWarnings(routed)                    → FERPA + a11y + validation findings per entry
       ├─ C&C:  detectGitState(courseDir)               → { isRepo, clean, remote? } → nudge or commit hint
       ├─ C&C:  detectStaleSnapshot(courseId)           → resumable? → { snapshotId, lastFailedFile }
       │
       └─ persist:  ~/.command-and-control/publish-snapshots/<snapshotId>/
                      manifest.json + per-entry { prior.html, new.html, warnings, type }

C&C: publish_course (workflow)
       │   inputs: { snapshotId, approvals: { [filename]: 'approve' | 'skip' }, resume?: boolean,
       │             gitCommit?: boolean (default true if isRepo), pushTag?: boolean (default ask) }
       │
       ├─ C&C:  loadSnapshot(snapshotId)
       ├─ C&C:  validateApprovals(approvals, manifest) → reject if missing entries or unknown filenames
       ├─ git:  preCommit(courseDir) if gitCommit
       │
       ├─ for each approved entry, in manifest order:
       │     if type == 'page':       CDS.publishToCanvas(html, title, config, api, snapshot.collisionAction)
       │     if type == 'assignment': CDS.updateAssignmentDescription(courseId, assignmentId, html, api)
       │     on success → append to result.published[]
       │     on failure → write failure to snapshot, break loop, return stop-on-failure report
       │
       ├─ git:  tagOnSuccess(courseDir, tag) if gitCommit
       └─ git:  promptPushTag() if remote && pushTag

C&C: rollback_course_publish (workflow)
       │   inputs: { snapshotId }
       │
       ├─ for each entry in snapshot.published[], in reverse order:
       │     if type == 'page':       CDS.restorePage(courseId, pageUrl, prior.html, api)
       │     if type == 'assignment': CDS.updateAssignmentDescription(courseId, id, prior.html, api)
       │     accumulate per-entry restore success/failure
       │
       └─ return restore report. Does NOT delete newly-created entries (none can exist in v0.9 —
           C1 forbids assignment creation, and a Canvas Page is only newly created when the
           professor explicitly opted in via the existing publishToCanvas collisionAction='create').
           For v0.9, "create" actions are still restored to "no page existed" via Canvas page delete
           when the snapshot recorded action='created'; this is the only destructive rollback path.
```

The split keeps Canvas API surface in CDS (one package owns the Canvas client), orchestration + persistence in C&C, and re-uses `publishToCanvas` unchanged.

---

## Canvas-side surface (CDS additions)

New exports from `canvas-design-mcp`:

```ts
// Reads current Canvas Pages for diff + snapshot.
export function listCanvasPages(courseId: number, api: PublishApi): Promise<CanvasPage[]>;

// Reads current Canvas Assignments (id, name, description) for diff + snapshot.
export interface CanvasAssignment { id: number; name: string; description: string | null; }
export function listCanvasAssignments(courseId: number, api: AssignmentApi): Promise<CanvasAssignment[]>;

// PUT /api/v1/courses/:id/assignments/:assignmentId  — description field only.
export function updateAssignmentDescription(
  courseId: number,
  assignmentId: number,
  html: string,
  api: AssignmentApi,
): Promise<CanvasAssignment>;

// Rollback path: restore a page to its prior HTML, or delete it if it was newly created.
export function restorePage(
  courseId: number,
  pageUrl: string,
  priorHtml: string | null,  // null → page was newly created → delete instead
  api: PublishApi,
): Promise<void>;
```

`AssignmentApi` mirrors `PublishApi`'s shape: a thin interface so tests inject fakes without touching real Canvas.

---

## Manifest shape

```ts
interface PreviewManifest {
  snapshotId: string;                      // UUID; also the folder name under publish-snapshots/
  courseId: number;
  courseDir: string;
  generatedAt: string;                     // ISO
  git: {
    isRepo: boolean;
    clean?: boolean;                       // only set if isRepo
    remote?: string;                       // only set if isRepo and remote configured
    nudge?: 'init-suggested' | 'dirty-tree-warning';
  };
  staleSnapshot?: {                        // present if a prior incomplete publish exists
    snapshotId: string;
    lastFailedFile: string;
    failedAt: string;
    fix: string[];
  };
  entries: ManifestEntry[];
  summary: {
    total: number;
    pages: number;
    assignments: number;
    skipped: number;
    warningsCount: number;
    ferpaCount: number;
    collisionsCount: number;
  };
}

type ManifestEntry =
  | ({ type: 'page' } & PageEntry)
  | ({ type: 'assignment' } & AssignmentEntry)
  | { type: 'skipped'; filename: string; pageType: PageType; reason: 'out-of-scope-v0.9' | 'unmatched-assignment'; recommendation: string };

interface PageEntry {
  filename: string;                        // source HTML filename in output/
  pageType: PageType;
  intendedTitle: string;                   // PageFrontMatter.title from the source markdown
                                            // (existing generate-page convention; never invented here)
  canvasMatch?: { pageId: string; url: string; existingTitle: string; similarity: number };
                                            // present if a title match was found (>=0.8 similarity)
  collisionAction: 'update' | 'create';    // 'update' if canvasMatch; 'create' otherwise.
                                            // v0.9 never emits 'related' — that action remains available
                                            // on the underlying publishToCanvas but is not surfaced through
                                            // publish_course (would require per-entry related-title input).
  diff: DiffSummary;                       // structural summary only
  warnings: Warning[];                     // FERPA, a11y, validation
}

interface AssignmentEntry {
  filename: string;
  pageType: PageType;
  intendedTitle: string;                   // PageFrontMatter.title (same source as PageEntry)
  canvasMatch: { assignmentId: number; name: string; similarity: number };
                                            // assignments REQUIRE a match (C1); when absent the entry
                                            // is emitted as { type: 'skipped', reason: 'unmatched-assignment' }
                                            // instead of as an AssignmentEntry — so this field is required.
  diff: DiffSummary;
  warnings: Warning[];
}

interface DiffSummary {
  priorWords: number | null;               // null if newly-created page (no prior content)
  newWords: number;
  delta: number;
  sectionsChanged: number;
  calloutsAdded: number;
  calloutsRemoved: number;
  imagesChanged: number;
  hasFullDiff: boolean;                    // always true; controls UI affordance
}

interface Warning {
  kind: 'ferpa' | 'a11y' | 'validation';
  severity: 'block' | 'warn';
  message: string;
  line?: number;
  // Block-severity warnings (FERPA hits, validation failures) cause publish_course to refuse
  // the entry even if approved — they must be fixed in source first.
}
```

`PreviewManifest.snapshotId` is the handle for `publish_course` and `rollback_course_publish`. The disk layout under `~/.command-and-control/publish-snapshots/<snapshotId>/`:

```
manifest.json              — full PreviewManifest
prior/<filename>.html      — pre-publish Canvas snapshot per entry (rollback source of truth)
new/<filename>.html        — generated HTML at preview time
diffs/<filename>.diff      — full unified diff cached per entry
state.json                 — { phase: 'preview' | 'partial' | 'published' | 'rolled-back',
                              published: PublishedEntry[], failed?: FailedEntry, lastUpdatedAt }
```

`state.json` is the source of truth for resume. Failed-partway snapshots stay on disk indefinitely; a future cleanup tool can prune them.

---

## Tool surface

```jsonc
// MCP tool — preview phase
{
  "name": "preview_course_publish",
  "description": "Generate a publish preview: per-page diffs, warnings, and a manifest. No Canvas writes occur.",
  "inputSchema": {
    "type": "object",
    "required": ["courseDir", "courseId"],
    "properties": {
      "courseDir": { "type": "string", "description": "Canvas Design Studio course folder." },
      "courseId":  { "type": "number", "description": "Canvas course numeric ID." },
      "outputDir": { "type": "string", "description": "Override for generate_course's output folder." },
      "fullDiffFor": { "type": "array", "items": { "type": "string" },
                       "description": "Filenames to surface the full unified diff for (default: none)." }
    }
  }
}

// MCP tool — publish phase (no Canvas writes happen until this is called)
{
  "name": "publish_course",
  "description": "Publish the previewed manifest to Canvas with explicit per-entry approvals. Stops on first failure.",
  "inputSchema": {
    "type": "object",
    "required": ["snapshotId", "approvals"],
    "properties": {
      "snapshotId": { "type": "string" },
      "approvals":  {
        "type": "object",
        "description": "Map of manifest entry filename → 'approve' or 'skip'. Every non-skipped manifest entry must appear.",
        "additionalProperties": { "enum": ["approve", "skip"] }
      },
      "resume":     { "type": "boolean", "description": "Continue a prior partial publish from its failure point.", "default": false },
      "gitCommit":  { "type": "boolean", "description": "Commit + tag in courseDir. Defaults to true when courseDir is a git repo.", "default": true },
      "pushTag":    { "type": "boolean", "description": "If a git remote is configured, push the success tag. Default: ask in the result." }
    }
  }
}

// MCP tool — rollback phase
{
  "name": "rollback_course_publish",
  "description": "Restore every successfully-published entry from a snapshot to its prior Canvas state.",
  "inputSchema": {
    "type": "object",
    "required": ["snapshotId"],
    "properties": { "snapshotId": { "type": "string" } }
  }
}
```

The placeholder `publish_course` entry in `src/passthrough/design_tools.ts` (the one that returns `COURSE_PUBLISH_NOT_AVAILABLE`) is removed; `publish_course` becomes a real C&C workflow alongside `preview_course_publish` and `rollback_course_publish`.

---

## Error handling

| Code                              | When                                                          | Action |
|-----------------------------------|---------------------------------------------------------------|--------|
| `MISSING_API_TOKEN`               | No Canvas token in institution config                         | Preview refuses with `setup_canvas` fix steps. |
| `COURSE_ID_REQUIRED`              | `courseId` missing                                            | Preview refuses with `list_canvas_courses` fix step. |
| `COURSE_DIR_NOT_FOUND`            | `courseDir` doesn't exist or has no `course-config.md`        | Preview refuses with import_course fix step. |
| `GENERATE_FAILED`                 | `generateCourse()` itself throws                              | Preview refuses; surface generate_course's error verbatim. |
| `NO_PUBLISHABLE_ENTRIES`          | Manifest entries empty (all out-of-scope or all unmatched)    | Preview returns the manifest anyway with a clear message; publish refuses. |
| `BLOCKING_WARNINGS`               | At least one entry has severity:'block' warnings              | Preview surfaces them; publish refuses any approved entry that still has blocks. |
| `SNAPSHOT_NOT_FOUND`              | publish/rollback called with unknown `snapshotId`             | Refuse with `preview_course_publish` first hint. |
| `APPROVALS_INCOMPLETE`            | publish called with `approvals` missing manifest entries      | Refuse with the missing filenames listed. |
| `STALE_SNAPSHOT`                  | A prior partial publish exists for this courseId              | Preview surfaces it; publish refuses unless `resume:true` or a new snapshotId. |
| `CANVAS_*` (401/403/404/429)      | Bubbled from `publishToCanvas`/Canvas API                     | Stop-on-failure: write failure to `state.json`, return report. |
| `GIT_DIRTY_TREE`                  | courseDir is a git repo with uncommitted changes              | Preview warns; publish refuses if `gitCommit:true` until clean (or pass `gitCommit:false`). |
| `ROLLBACK_PARTIAL`                | Rollback itself fails partway                                 | Return a per-entry restore report — failed restores stay visible so the professor can act. |

Every error follows the `formatError(...)` pattern already used by `publishToCanvas`: title, message, cause, fix steps, context.

---

## Data flow walkthrough

```
1. Professor runs:  preview_course_publish { courseDir: './my-course', courseId: 12345 }

2. C&C calls generateCourse → fresh HTML in ./my-course/output/
   C&C calls listCanvasPages + listCanvasAssignments → current Canvas state
   C&C routes each generated page by pageType → pages bucket | assignments bucket | skipped bucket
   C&C computes diff summaries, runs FERPA + a11y + validation scans, detects git state.
   C&C writes snapshot bundle to ~/.command-and-control/publish-snapshots/<snapshotId>/

3. Claude renders the manifest:
     "Course refresh preview for BUS105 (snapshot ce4a9b…):
        Pages: 12 to update, 1 to create, 0 skipped.
        Assignments: 4 to update, 2 unmatched (will skip — listed below).
        Quizzes/Discussions: 3 (out of scope for v0.9 — see warnings).
        Warnings: 1 FERPA finding on Week 3 Resources (line 47); 2 missing alt text on hero images.
        Git: courseDir is a clean git repo with remote origin.
      Want full diffs on any specific entry, or approve everything except the FERPA-blocked one?"

4. Professor: "Show me Week 3 Resources, fix the FERPA hit later. Approve everything else, skip the FERPA one."

5. Claude calls preview_course_publish again with fullDiffFor: ['week-3-resources.html']
     → manifest now includes the cached full diff for that file.

6. Professor reads the diff, confirms: "Approve everything except week-3-resources.html."

7. Claude calls publish_course with the approval map + snapshotId + gitCommit:true (default).

8. C&C verifies clean tree, commits, then iterates manifest in order.
     Each page → CDS.publishToCanvas; each assignment → CDS.updateAssignmentDescription.
     state.json gets updated after each success.

9a. Happy path: all approved entries succeed → C&C tags the commit "published-2026-05-30-bus105-..."
                                              → C&C surfaces "push tag to GitHub origin? y/n"
                                              → success report: published[], skipped[], git tag.

9b. Failure path: page 7 of 13 returns 429 → C&C stops, writes failure to state.json, returns:
       "published 6, failed on Week 4 Overview (429 rate limited), 6 untried.
        Snapshot ce4a9b… retained. Options:
          1. Wait 60s, call publish_course with snapshotId and resume:true.
          2. Call rollback_course_publish snapshotId to restore the 6 already-published.
          3. Investigate and call publish_course --resume when ready."

10. If rollback is chosen:
     C&C reverse-iterates state.json.published[], calls CDS.restorePage / updateAssignmentDescription
     with the snapshot's prior HTML. Per-entry restore success/failure is reported.
```

---

## Testing approach (TDD anchors)

Unit-level (no Canvas, no LLM):

* **route-pages.test.ts** — every `PageType` routes to pages | assignments | skipped exactly once; new types added later don't silently fall through.
* **build-diff-summary.test.ts** — word count, section count, callout-add/remove are correct for fixture HTML pairs; null prior → "new page" summary.
* **manifest-shape.test.ts** — manifest fields populate correctly from synthetic GenerateCourseResult + synthetic Canvas state.
* **scan-warnings.test.ts** — FERPA finding becomes a block-severity warning; a11y warnings carry severity:'warn'; validation failures become block:'block'.
* **approvals-validation.test.ts** — incomplete approvals rejected with the specific missing filenames; unknown filenames rejected.
* **snapshot-io.test.ts** — round-trip a manifest + per-entry HTML to/from disk; resume-detection finds a half-written `state.json`.
* **stop-on-failure.test.ts** — with a fake API that 429s on the 3rd call, exactly the first 2 entries land in published[], `state.json` records the failure on entry 3, untried[] contains entries 4+.
* **rollback.test.ts** — reverse-iterates published[]; created-action entries trigger the page-delete path; restore failures accumulate in the report.
* **git-state.test.ts** — non-repo → nudge; dirty tree → warning + GIT_DIRTY_TREE on publish with gitCommit:true; clean repo + remote → commit + tag + push prompt.

Integration-level (mocked Canvas client, real generate_course on a tiny fixture course):

* **preview-end-to-end.test.ts** — feed a fixture courseDir + a fake `listCanvasPages`/`listCanvasAssignments`; assert the manifest matches a golden file.
* **publish-end-to-end.test.ts** — approve all entries, fake API succeeds for all, assert published[] count + git tag created.
* **publish-then-rollback.test.ts** — publish 3 entries, rollback, assert each prior HTML was written back.

No real Canvas calls in CI. The single "did this work against a live Canvas" check is a manual test plan entry, same model as the installer's manual tests.

---

## Reality gaps (acknowledged, not blocking the spec)

* **Live Canvas verification.** Like #60, this ships with full unit/integration coverage but the first real run will be against the professor's University sandbox course. Plan that as a manual test before the v0.9 → v1.0 cut.
* **Assignment description sanitization.** Canvas's HTML allowlist for assignments isn't documented as separate from Pages; the existing `validateCanvasHtml` is the rule of the road. If Canvas turns out to strip something the Pages allowlist permits, that's a downstream `validateCanvasHtml` patch — not a publish_course design change.
* **Title-match tuning.** The existing 0.8 similarity threshold for page collisions is reused for assignment name-matching. If false-positives surface, the threshold becomes a constant in one place.

---

## Relation to other work

* **[[project-installer-design]]** — `publish_course` does not change the installer surface; the existing `setup_canvas` flow already covers the Canvas token requirement.
* **[[project-current-state]]** — closes the last v0.9 milestone item. After publish_course ships, `v0.9 — Core Workflow` is empty and the milestone closes.
* **#65 (Canvas capability showcase) and v1.x cluster** — out of scope here; publish_course is a transport tool, not a design tool. The showcase work pulls in template creation; publishing remains the same surface either way.
* **C2 / S3 deferred work** — if real-world usage demands creating assignments from the toolchain, that becomes a v1.x issue with its own brainstorm (it adds points/group/due-date design surface). If module reordering surfaces, same.

---

## Out-of-scope reminders (don't quietly grow scope)

* No publish-on-write daemon, no scheduled publishes, no batch-across-courses.
* No grading-config touch (points, due dates, rubrics, assignment groups) — period.
* No quiz publishing in v0.9, even though `weekly-quiz` and `reading-quiz` exist in PAGE_TYPES.
* No discussion-board publishing in v0.9.
* No module structure publishing in v0.9.
* No new Canvas Page creation outside the existing `publishToCanvas` opt-in (`collisionAction: 'create'`) — the publish_course default is `update` matches only.

Each of these is its own v1.x issue when the time comes.
