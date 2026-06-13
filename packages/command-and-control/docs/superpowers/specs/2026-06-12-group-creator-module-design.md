# Group Creator / Maintainer module — design

- **Issue:** to be filed (v2.0 module wave)
- **Milestone:** v2.0
- **Date:** 2026-06-12
- **Status:** Design — approved in brainstorm, pending spec review
- **Author tool tier:** `agent:opus`

---

## 1. Context & motivation

Kevin forms and **re-mixes student teams several times a semester** so students meet new people, and he applies rules: avoid pairing the same students together more than once; and for the final project, form teams using a ranked, weighted accomplishment formula. PeerAssessment.com (which he uses and likes for peer evaluation) is clumsy at creating/rotating multiple group sets across a semester — so the group *formation* is the real pain, and functionally his **top near-term need**.

Kevin also maintains a **pseudonymized roster**: each student gets a stable anonymous id (e.g. `SU26-001`), PII (name/email/town/state/major from PeopleSoft) lives in a private key table, and his working datasets carry only the pseudonym + de-identified attributes so he can track things across semesters without exposing identities. This module is designed to fit that model exactly.

This is one of three related-but-independent modules identified on 2026-06-12 (Kevin: "separate modules… not related"):
1. **Group Creator/Maintainer** — THIS spec (built first; highest functional need).
2. **Roster/Identity Manager** — deferred (automates the PeopleSoft→pseudonym→de-id pipeline + Google Forms joins + cross-semester tracking). Supplies the roster file this module consumes.
3. **PeerAssessment.com round-trip** — deferred (Canvas groups → PeerAssessment import; exported score CSV → Canvas gradebook). Its exported review scores will later feed this module's `priorReview` metric.

## 2. Goal & non-goals

**Goal.** An opt-in module that builds student teams from Canvas data + a thin roster file, using a chosen formation strategy and honoring a no-repeat-pairing memory across the semester, and emits the groups as a file (always) and optionally as a Canvas Group Set.

**Non-goals (deferred — §11).**
- No PeopleSoft import, ID assignment, PII/de-identification pipeline, Google Forms joins, or cross-semester longitudinal store — that's the separate Roster/Identity Manager. This module **consumes** a thin roster file; it does not build or maintain the identity key.
- No PeerAssessment.com import/export here (separate module).
- No grade computation — it reads metrics, it doesn't compute course grades.
- The tool never handles student names or emails (PII-free by construction).

## 3. Locked decisions (from the 2026-06-12 brainstorm)

- **D1 — Group formation is the headline**, separate from PeerAssessment integration and from the roster pipeline. This module is standalone.
- **D2 — PII-free identity model.** Working join key = **Canvas user ID** (opaque internal id, not public PII). Paired with the professor's **pseudonym** (`SU26-001`). Name/email/town/state never enter the tool; only **major** (a non-Canvas attribute) is supplied. Output is keyed by pseudonym + Canvas ID; re-identification is the professor's via their private key.
- **D3 — Hybrid data sourcing.** Grades, assignment completion, attendance-if-a-gradebook-column, and roster membership are pulled from the **Canvas API** (by Canvas ID). The professor supplies a thin **`canvas_id, pseudonym, major`** file for the rest.
- **D4 — Six formation strategies** (§5): random, alphabetical, weighted-by-accomplishment, heterogeneous/balanced, homogeneous, major-diversity.
- **D5 — No-repeat pairing is a soft objective** backed by a per-course **pairing-history store** (the "maintainer"). The optimizer minimizes repeats and reports any that are unavoidable; it never hard-fails.
- **D6 — Score-and-optimize algorithm** (§7): generate many strategy-consistent candidate groupings, score against a composite objective, keep the best. Seeded for reproducibility.
- **D7 — Opt-in module** (not C&C core), config-time enabled via `modules.json`, consistent with the module pattern. No external vendor, so **no provider seam** — strategies are internal.
- **D8 — Two tools:** `create_groups` (preview/build) and a **separate** `record_groups` (commit a chosen grouping to the pairing-history store), so the professor can preview before committing.
- **D9 — Output:** always write a canonical groups file (CSV + readable markdown); optionally push to Canvas as a Group Set via the Canvas API (`pushToCanvas: true`).

## 4. Identity & data model (PII-free)

The data layer builds one record per active student, keyed by Canvas ID:

```
StudentRecord {
  canvasId: string;          // join key, from Canvas
  pseudonym: string;         // SU26-001, from the roster file
  major?: string;            // from the roster file
  majorBucket?: string;      // derived via the major→bucket map (§5.6)
  metrics: {
    overallGrade?: number;       // Canvas current/final score
    attendance?: number;         // a designated Canvas gradebook column, if present
    assignmentsCompleted?: number; // count over a designated assignment group/ids (e.g. Power BI)
    priorReview?: number;        // from the roster file for now; later from the PeerAssessment module
    [custom: string]: number | undefined;
  };
}
```

**Sourcing:**
- **Canvas API (by Canvas ID):** active student roster; `overallGrade` (current score); `assignmentsCompleted` (count of submitted/graded items in a configured assignment group or id list); `attendance` (value of a configured gradebook column, if the professor designates one).
- **Roster file (professor-supplied CSV):** required columns `canvas_id, pseudonym`; optional `major`, and any extra metric columns (e.g. `priorReview`, or an `attendance` override). The merge is by `canvas_id`. Students in Canvas but missing from the file still group (by Canvas ID, pseudonym blank → flagged); students in the file but not in the active Canvas roster are ignored (with a warning).

The tool **never** reads or emits name/email. Missing metrics are simply absent and strategies that need them degrade (§5).

## 5. Formation strategies

Each strategy defines a **candidate generator** (produces many strategy-consistent randomized groupings) consumed by the optimizer (§7). The caller picks one strategy per run, plus group size *or* group count.

1. **Random** — uniform random assignment (seeded). Candidates = many shuffles; the optimizer picks the one with fewest repeat pairings.
2. **Alphabetical** — sort by pseudonym, chunk into groups. Deterministic single layout (no-repeat not applicable; documented). Mostly a convenience/utility option.
3. **Weighted by accomplishment** — compute a composite score per student from a configurable weight map over metric columns; default weights encode Kevin's ranking (highest→lowest: `priorReview`, `attendance`, `assignmentsCompleted`, `overallGrade`). Metrics absent for the term (e.g. `priorReview` before the PeerAssessment module exists) drop out and remaining weights renormalize. Default behavior **balances** the composite across groups (fair teams); a `mode: balance|cluster` flag allows clustering instead. (Balance is the default per the "fair final teams" intent; confirm at review.)
4. **Heterogeneous / balanced** — spread a chosen metric (default `overallGrade`) evenly across groups via tiered snake-draft (one from each performance tier per group); candidates via shuffling within tiers.
5. **Homogeneous** — cluster similar performers on a chosen metric (sort + chunk, shuffle within ties).
6. **Major diversity** — distribute **major archetype buckets** across groups so each team mixes types. The professor supplies a one-time `major→bucket` map (e.g. `IT→technical`, `Marketing→creative`, `Accounting→business`, `General Business→business`); the generator round-robins buckets into groups; candidates via shuffles. Unmapped majors fall into an `other` bucket (flagged so the map can be extended).

All strategies except alphabetical feed the optimizer, so the **no-repeat-pairing** objective applies on top of the strategy's intent.

## 6. Constraints & the "maintainer"

- **Pairing-history store** — a per-course persistent file (e.g. `~/.command-and-control/groups/<courseId>/pairing-history.json`) recording, per past committed grouping, which pseudonyms shared a group. `create_groups` reads it to penalize repeats; `record_groups` appends to it.
- **No-repeat pairing (soft)** — the optimizer penalizes each pair that has been grouped before (weighted by how recently/often). Late in the semester full avoidance is combinatorially impossible, so the tool reports the minimal unavoidable repeats rather than failing.
- **Group size / count** — caller sets a target group size **or** a target number of groups; the engine balances remainder members (sizes differ by at most one). Validation rejects impossible combinations.

## 7. Algorithm — score-and-optimize

```
bestScore = +inf; best = null
for i in 1..N (default ~300, configurable; seeded RNG so runs are reproducible):
    candidate = strategy.generateCandidate(records, groupSpec, rng)
    score = w_fit   * strategyMisfit(candidate)        // how far from the strategy's ideal
          + w_repeat* repeatPairingPenalty(candidate, history)
          + w_size  * sizeImbalancePenalty(candidate, groupSpec)
    if score < bestScore: bestScore = score; best = candidate
return best, diagnostics(best)   // incl. unavoidable repeat pairings, size spread, strategy fit
```

- **Seeded** (caller-supplied or recorded seed) → identical inputs reproduce identical groups.
- **Weights** `w_fit / w_repeat / w_size` have sensible defaults; advanced override allowed. `repeatPairingPenalty` reads the §6 history store.
- Deterministic strategies (alphabetical) bypass the loop (single candidate).

## 8. MCP tools

- **`create_groups`** — inputs: `courseId`, `strategy`, `groupSize` *or* `groupCount`, optional `rosterFile` path, optional `weights` map, optional `majorBuckets` map, optional `metric` (for heterogeneous/homogeneous), optional `seed`, optional `attendanceColumn` / `assignmentGroup` (Canvas sourcing config), `pushToCanvas?`. Pulls Canvas data, merges the roster file, runs the engine, writes the output file, optionally creates the Canvas Group Set, and returns a summary + diagnostics (unavoidable repeats, size spread, any unmapped majors / missing pseudonyms). **Does not** mutate the pairing history (preview-safe).
- **`record_groups`** — inputs: `courseId`, the grouping (or a path/handle to the just-created output). Appends the grouping to the pairing-history store so future runs avoid it. Separate from `create_groups` so the professor previews before committing.

## 9. Output

- **Always:** a canonical groups file under the course output dir — CSV (`group,pseudonym,canvas_id`) + a readable markdown roster (groups with member pseudonyms + the diagnostics summary).
- **Optional (`pushToCanvas: true`):** create a Canvas **Group Set / category** and the member groups via the Canvas API, mapping pseudonyms back to Canvas IDs (which the tool already holds). Requires Canvas credentials; absent them, it writes the file and notes the push was skipped.

## 10. Architecture & package

New package **`@canvas-toolchain/module-group-builder`** (module id `group-builder`), mirroring the module pattern (default-exports a `CanvasToolchainModule`; registered in C&C `KNOWN_MODULES`; config-time enabled). No provider seam.

- `src/data/` — Canvas pull (reuses the existing C&C Canvas API client; injected for tests) + roster-file parse + merge → `StudentRecord[]`.
- `src/strategies/` — one file per strategy, each exposing a `generateCandidate` + `strategyMisfit`; a registry maps strategy id → implementation.
- `src/engine/` — the score-and-optimize loop, the penalty functions, seeded RNG.
- `src/history/` — pairing-history store (read/append, per-course, atomic write 0o600).
- `src/output/` — CSV + markdown writers; Canvas Group Set push (injected Canvas client).
- `src/tools.ts` — `create_groups`, `record_groups` ModuleTools.
- `src/index.ts` — the module default export.

Boundary note: this module needs the **Canvas API client**. To avoid inverting the dependency (module importing C&C), the Canvas client is **injected** into the tool handlers by C&C at registration, or the module depends on a shared Canvas-client package. Resolve in the plan (mirror however `module-video` reaches shared infrastructure; if there's no shared Canvas-client package, the module reads `canvas-config.json` itself like `module-video` reads its own config, and uses a minimal local Canvas client for the few endpoints it needs: list students, get grades, get assignment submissions, create group categories/groups).

## 11. Deferred (YAGNI)

- **Roster/Identity Manager** (the PeopleSoft→pseudonym→de-id→Google-Forms→cross-semester pipeline) — separate module; supplies the roster file.
- **PeerAssessment.com round-trip** — separate module; later feeds `priorReview`.
- **Attendance capture** beyond reading a designated Canvas column — if attendance isn't in Canvas, it comes via the roster file; no new attendance-tracking system here.
- **Optimization beyond random-restart scoring** (e.g. simulated annealing, ILP) — only if the simple optimizer proves inadequate at real class sizes.

## 12. Testing

Fully hermetic: the Canvas client is injected/stubbed; the RNG is seeded so group output is deterministic; the pairing-history store uses a temp dir. Unit tests per strategy (generator produces strategy-consistent groups), the penalty functions, the optimizer (best-candidate selection, reproducibility under a fixed seed), the history store (read/append/no-repeat enforcement), the output writers, and the two tools (preview vs commit separation, pushToCanvas path with a stubbed client). No network.

## 13. Source-of-truth pointers (for the implementation plan)

- Module pattern: `packages/module-video/`, contract `packages/module-contract/src/index.ts`, C&C wiring `packages/command-and-control/src/modules/{registry.ts,manifest.ts}` + `src/index.ts`.
- Canvas API client + credentials: `packages/canvas-design-studio/src/` (`publish_to_canvas`, `list_canvas_courses`) and/or `packages/command-and-control/src/tools/setup_canvas.ts` — identify the reusable Canvas client and group/grade endpoints during planning.
- Catalog (#76): a `group-builder` capability is internal (no vendor), so likely **no** `known-tools.yaml` entry (that catalog is for external ed-tech tools). Confirm in the plan.
- Recent precedent for an LLM-free, file-writing module + tool registration: the just-shipped `packages/module-oral-assessment` (2026-06-12).
