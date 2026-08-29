# QTI vs the New Quizzes API — research note

**Date:** 2026-08-29
**Status:** research only; no code, no decision taken
**Prompted by:** a Canvas Community thread on New Quizzes QTI import failing
**Relates to:** `2026-08-26-quiz-validation-engine-design.md` §3 non-goals

## Why this exists

The question "should we generate QTI so professors can bulk-import quizzes into New Quizzes?"
looks reasonable and is a dead end. This note records why, so it does not get re-derived.

## What Canvas actually does

Source: [New Quizzes QTI Import Not Working](https://community.instructure.com/en/discussion/665704/new-quizzes-qti-import-not-working),
accepted answer by Jeff_F (Community Coach — **not** Instructure staff), 2026-04-06.

**Canvas does not import QTI into New Quizzes at all.** The pipeline is:

1. QTI imports into **Classic** Quizzes.
2. A separate auto-migration layer then attempts Classic → New.

Step 2 "often fails silently or partially," particularly for question types and metadata New
Quizzes does not support. This is why disabling automatic migration makes an import appear to
succeed — Canvas stops trying to convert and leaves the quiz as Classic.

Two load-bearing statements from that answer:

> Instructure does not publish or certify any third party QTI generators as New Quizzes compatible.

> no tool can reliably promise that its QTI output will import cleanly into New Quizzes across all question types

**Consequence:** building QTI export to reach New Quizzes cannot be made reliable by us. The
failure would be in Canvas's migration layer, downstream of anything we emit, and would surface to
a professor as "the toolchain's quizzes don't import."

QTI remains fine for Classic Quizzes and for archival/transfer.

## The supported alternative

The same answer names "Canvas APIs designed for New Quizzes item creation" as a real path. It
exists and is documented:

| Purpose | Endpoint |
| --- | --- |
| Create a New Quiz | `POST /api/quiz/v1/courses/:course_id/quizzes` |
| Add an item | `POST /api/quiz/v1/courses/:course_id/quizzes/:quiz_id/items` |

- Auth: `Authorization: Bearer <token>` — the same Canvas token already stored in `canvas-config.json`.
- Question types are set by `item[entry][interaction_type_slug]` with documented per-type
  `interaction_data` / `scoring_data` shapes (multiple choice, true/false, essay, matching,
  multi-answer, formula).
- No XML, no package assembly, no content-migration polling, no migration layer to fail.

**Known API limits:**

- `QuestionItem` supports full CRUD. **`StimulusItem`, `BankItem`, and `BankEntry` are
  retrieve-only via the API** — item banks must be created in the UI. Anything depending on
  bank-backed questions cannot be built this way.
- These are `/api/quiz/v1/` endpoints, a different service from the main `/api/v1/` Canvas API.
  Token scope and per-institution enablement should be verified against a real course before
  anything is designed on top of them.

**Assessment:** the API is materially easier than QTI *and* it is the supported path. If quiz
authoring is ever in scope, this is the route.

## What this does NOT resolve

Adopting the New Quizzes API would reverse the **first** non-goal in the quiz-engine spec:

> `- Writing/updating quizzes on Canvas (create/update API)`

That is a bigger change than it appears. The engine is deliberately validate-first and read-only;
writing quizzes means creating content in a professor's live course, which is a different risk
posture requiring its own review-gate design. **This note does not propose that. It only records
that the path exists and is viable if the decision is revisited.**

## What fits the current design today

The spec already carries a New Quizzes row in §2:

> **New Quizzes** | Different surface; item API may be limited | v1: detect + report `NEW_QUIZZES_LIMITED` rather than fake full item QC

The migration hazard above extends that decision naturally and without reversing anything:
`validate_quiz` could warn when a quiz's constructs are unlikely to survive Classic → New
migration, so a professor learns before they hit it rather than after. Advisory, read-only,
no export. That is a candidate for the existing engine, not a new subsystem.

## Standing constraint

**Do not add QTI export targeting New Quizzes.** Not because it is hard, but because Canvas does
not support that path and no output can be made reliable across question types. If QTI is ever
wanted for *Classic* Quizzes or for archival, that is a different and defensible question.

Re-check if: Instructure ships native QTI → New Quizzes import, or certifies third-party
generators. Neither was true as of this note.
