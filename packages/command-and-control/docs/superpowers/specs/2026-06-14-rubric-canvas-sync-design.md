# Canvas Rubric Sync — Design Spec

**Date:** 2026-06-14
**Status:** Approved (design); ready for implementation plan
**Author:** Kevin Rank + Claude (brainstorm)
**Job:** `j-2026-06-14-ai-friendly-rubric-system-rewrite`

## Goal

Pull a rubric directly from Canvas (instead of pasting it), help the professor
decide whether it still fits — *acceptable as-is / needs updating / needs a
closer look* — and feed the approved rubric into the **existing**
`draft_student_rubric` workflow. This removes the "right now it is not simple to
get the rubric" friction at the source.

## Context: what already exists (do NOT rebuild)

The "AI-Friendly Rubric System" idea is **~70% already shipped** as the
`draft_student_rubric` MCP tool (issue #67 Part B, PR #87, 2026-06-01; migrated
into Command & Control 2026-06-03):

- `packages/command-and-control/src/tools/rubric/` — `prompts.ts`,
  `render_md.ts`, `types.ts`, `llm_client.ts`
- `packages/command-and-control/src/tools/workflows/draft_student_rubric.ts`

It takes **pasted** faculty rubric text → LLM → per-criterion `studentFacing` +
`workedExample` + `facultyFacing` (the original language, verbatim) → renders the
CDS rubric-page-type markdown → Canvas-safe HTML + an LLM-paste `.md`. It routes
through `resolveActiveLlmClient` (Anthropic / Ollama).

**The one missing piece** is that its input is pasted text: nothing pulls the
live rubric from Canvas, and `packages/canvas-design-studio/src/canvas-api.ts`
has **zero** rubric endpoints. This spec fills exactly that gap.

## Scope decision

This is built as a **two-phase** effort. The destination is full auto-mining of
prior-semester signals ("scope C"), but the two signals are very unevenly built,
so they are sequenced:

- **Phase 1 (this spec, build now):** Canvas rubric pull + change detection +
  smart triage, where the "assignment changed?" signal reuses Curriculum
  Intelligence's existing `diff_semesters` / archive parsing (or, minimally, the
  current assignment brief). Feeds the existing drafter.
- **Phase 2 (specced here, built as a fast-follow):** auto-mine last semester's
  **student questions** as an additional triage signal — gated on a data spike
  confirming Canvas Backup archives actually contain discussions/announcements
  and that they can be tied to an assignment. If the data is not there, Phase 2
  degrades to "the professor pastes in the questions."

### Key architecture decisions

1. **Extend Command & Control's rubric toolset; do NOT create a `module-rubric`
   package.** The drafter it feeds already lives in C&C, and C&C already imports
   the CDS Canvas API client and Curriculum Intelligence (`diff_semesters`). A
   new module would have to re-import all of that and duplicate the Canvas
   client. The sync is a coordinator workflow — C&C's job.
2. **Propose → commit.** The triage produces a *reviewed proposal*; nothing flows
   into `draft_student_rubric` until the professor approves. Same idiom as
   `module-roster` and `module-peerassessment`.
3. **No new state store for change detection.** The existing rendered rubric
   markdown already stores each criterion's original faculty language verbatim
   (`facultyFacing`). Change detection diffs the freshly-pulled rubric against
   those blocks. A sidecar fingerprint hash is the fallback when no prior
   rendered file is found.
4. **Reuse the drafter unchanged.** The pulled (and possibly revised) rubric is
   serialized into the `facultyRubricText` the existing drafter already parses.
   No change to `draft_student_rubric`'s public contract.
5. **Built in Claude Code** via the subagent-driven TDD flow (NOT handed to
   Codex — Codex is out of usage). Matches how the last four modules shipped.

## Phase 1 — components

All new files under `packages/command-and-control/src/tools/rubric/`.

### 1. Canvas rubric fetch — `canvas_fetch.ts`

`pullRubric({ courseId, assignmentId? }, deps): Promise<PulledRubric>`

- **Assignment-first:** when `assignmentId` is given, fetch the assignment and
  read its attached rubric
  (`GET /api/v1/courses/:courseId/assignments/:assignmentId`; the assignment
  object carries `rubric` (criteria) and `rubric_settings`). The assignment
  description is captured as the `assignmentBrief` for grounding worked examples.
- **List fallback:** when no `assignmentId`, or the assignment has no attached
  rubric, list course rubrics
  (`GET /api/v1/courses/:courseId/rubrics`) and return the pick-list for the
  professor to choose; a chosen id is fetched via
  `GET /api/v1/courses/:courseId/rubrics/:id`.
- Adds rubric methods to the existing `CanvasApiClient` (in CDS) rather than a
  new client. Reuses its paging, retry, and `CanvasApiError` mapping.
- Returns a structured `PulledRubric`:
  ```ts
  interface PulledRubric {
    source: { kind: 'assignment' | 'course-rubric'; courseId: string;
              assignmentId?: string; rubricId?: string; title: string };
    criteria: Array<{ id: string; name: string; points: number;
                      description: string; longDescription?: string;
                      ratings?: Array<{ points: number; description: string }> }>;
    assignmentBrief?: string;        // present when sourced from an assignment
  }
  ```

### 2. Change detection — `change_detect.ts`

`detectRubricChange(pulled: PulledRubric, priorRenderedPath?: string): RubricChangeReport`

- Loads the prior student rewrite's `facultyFacing` blocks (parsed from the
  existing rendered markdown) when available; falls back to a sidecar fingerprint
  file if the rendered file is absent.
- Diffs criterion-by-criterion → `{ status: 'first-draft' | 'unchanged' |
  'changed', added: string[], removed: string[], modified: Array<{ name: string;
  before: string; after: string }> }`.
- `first-draft` when nothing prior exists (nothing to compare).

### 3. Smart triage — `triage.ts`

`triageRubric(input, deps): Promise<RubricTriageReport>`

- One LLM call (smart mode) over: the pulled rubric, the change report, and the
  "assignment changed?" signal. The assignment signal is sourced, in order of
  availability: (a) CI `diff_semesters` output for the assignment, else (b) the
  current `assignmentBrief` compared against the rubric.
- Produces:
  ```ts
  interface RubricTriageReport {
    verdict: 'acceptable' | 'needs-update' | 'needs-review';
    flags: Array<{ criterion: string; issue: string;
                   evidence: 'assignment-drift' | 'vague-language' | 'change-detected' }>;
    proposedFacultyRubric?: string;   // present iff verdict === 'needs-update'
    rationale: string;
  }
  ```
- When `needs-update`, the LLM proposes a revised faculty rubric; the professor
  approves it before it goes downstream (propose → commit).
- Injectable `deps.llm` (mirrors `draft_student_rubric`'s `hooks.llm`).

### 4. Orchestrator MCP tool — `review_canvas_rubric`

Registered in `command-and-control/src/index.ts`. Runs
fetch → change-detect → triage and returns one `ReviewReport`
(`{ source, change, triage }`). Read-only; writes nothing. On approval, the
professor (or the agent) calls the existing `draft_student_rubric` with the
approved rubric text — no new "commit" tool is required because the drafter IS
the commit step.

Tool input:
```jsonc
{
  "courseId": "string (required)",
  "assignmentId": "string (optional — assignment-first when present)",
  "priorRenderedPath": "string (optional — last rubric .md for change detection)",
  "assignmentBrief": "string (optional — overrides the pulled description)"
}
```

## Data flow

```
Canvas
  → pullRubric (assignment-first → course-list fallback)
  → PulledRubric
  → detectRubricChange (vs last rewrite's facultyFacing blocks)  ┐
  → triageRubric (vs assignment-change signal)                   ┘
  → ReviewReport { source, change, triage(verdict, flags, proposedRubric?) }
  → [professor approves]
  → draft_student_rubric (existing, unchanged)
  → CDS rubric page (Canvas-safe HTML + LLM-paste .md)
```

## Error handling

Reuse the existing `CanvasApiError` codes and the toolchain's structured
`{ error, message, fix }` result shape. New cases:

- **Assignment has no attached rubric** → fall back to the course rubric list
  (not an error).
- **Course has zero rubrics** → clear "nothing to pull" result with a fix hint.
- **No prior rewrite found** → change-detect returns `first-draft` (not an
  error).
- **Triage LLM failure / invalid JSON** → structured error, same pattern as
  `draft_student_rubric`'s `parseCriteriaJson`.
- **401/403/404/422/429** → reuse the existing Canvas error mapping verbatim.

## Testing

TDD, vitest, established package pattern. No live Canvas or LLM calls.

- Injectable Canvas client + injectable LLM (`deps`).
- `canvas_fetch`: assignment-with-rubric, assignment-without-rubric → list
  fallback, course-list pick, mapping of Canvas criteria → `PulledRubric`.
- `change_detect`: first-draft, unchanged, added/removed/modified criteria,
  sidecar-fingerprint fallback.
- `triage`: each verdict, flag generation, `proposedFacultyRubric` present iff
  `needs-update`, JSON parse failure path.
- Orchestrator: end-to-end with mocked deps; every error case above.

## Phase 2 — student-question mining (deferred)

**Gated on a data spike.** Before building, confirm: (1) Canvas Backup archives
capture discussions/announcements; (2) those can be attributed to a specific
assignment. If yes, add a `priorQuestions` signal to `triageRubric` sourced from
a new CI extractor. If no, Phase 2 ships as a `priorQuestions?: string` input the
professor pastes in. No Phase 2 code lands until the spike resolves this.

## Out of scope (YAGNI)

- Writing rubrics back to Canvas (the toolchain never writes student-facing
  Canvas content without the reviewed publish path).
- Grade/assessment round-trip.
- Per-persona criterion explanations (a separate, already-identified gap — not
  this project).
