---
id: "quiz_migration"
description: "Classic Quizzes still work, but Canvas is migrating them: what validate_quiz flags in advance, what it can only see on a live quiz, and what the API hides."
related: [check_shell_readiness, generate_quiz, validate_quiz]
---

# Classic Quizzes and the New Quizzes migration

```text
generate_quiz -> local draft markdown under week-NN/quizzes/
              -> the professor puts it into Canvas
              -> validate_quiz reads the live quiz back and flags hazards
```

The authoring and checking halves are deliberately separate, and the separation is
the point: the checks that matter most only exist **against a live Canvas quiz**.
A local draft can be read for structure, but Canvas's own migration behavior is
not visible until the quiz is in Canvas and read back through the API.

## Which half does what

- [[generate_quiz]] writes a local draft to
  `<courseDir>/week-NN/quizzes/<slug-title>-draft.md`, with a difficulty mix and a
  question count. It never publishes — by description and by code, it only writes
  a file and then checks its own items structurally.
- [[validate_quiz]] is the reader, and it is **read-only**. Its source is either
  live (`courseId` + `quizId`) or local (`quizPath` or `quizMarkdown`), and mixing
  the two is an error. Local mode forces the LLM triage off in this version, so a
  local pre-check is the deterministic checks only.

## What a live check adds

Reading a live quiz through the Canvas API is what makes the migration advice
possible:

- **New Quizzes are only partly readable.** When Canvas returns no question
  bodies for a quiz that should have questions, the tool reports
  `NEW_QUIZZES_LIMITED` (and `ITEMS_UNAVAILABLE` whenever item bodies are missing)
  and tells you to review in the Canvas UI — Classic Quizzes are the ones the API
  exposes fully. That detection is a heuristic on quiz type, item availability,
  and question count (`packages/command-and-control/src/tools/quiz/canvas_fetch.ts`).
- **`MIGRATION_RISK` fires only on a Classic quiz** — the exact inverse condition.
  It warns per hazard:
  - a **Multiple Dropdowns** question becomes Fill in the Blank after migration;
  - a **Fill in Multiple Blanks** question becomes Fill in the Blank too, and the
    message says plainly that this comes from third-party reports rather than
    Instructure's official guide — a hedged claim, flagged as hedged;
  - a **practice quiz** becomes zero points possible and disappears from the
    Gradebook and the Grades page.
- **The deterministic checks** cover a published-or-dated quiz with no items,
  missing answer keys, empty stems and choices, duplicate stems, choice counts,
  points mismatch against `pointsPossible`, inconsistent due/unlock/lock order, an
  unpublished quiz that carries a due date, and `WEEK_MAP_MISMATCH` when dates
  fall outside the Monday–Sunday window implied by the week map.
- **Optional LLM triage** adds `AMBIGUOUS_KEY`, `WEAK_DISTRACTOR`, and
  `COVERAGE_GAP`.

Verdicts roll up simply: any error → `needs-fixes`; warnings or a
limited/unavailable read → `needs-review`; suggestions only → `ok`.

## Where it fits in the term

[[check_shell_readiness]] is the shell-sized view and the natural entry point: it
resolves Week N from Canvas module titles against `termStartMonday`, cross-checks
due/unlock/lock dates in the week window, and collects Classic Quiz module items
as a **call-out list** — precisely the ids to hand to [[validate_quiz]]. Its
windows are relative to today: the week two ahead gets the thorough pass, the week
one ahead a lighter one, so you check quizzes shortly before students meet them.
Both operations are read-only and can run any time. [[setup_spot_check]] only
records a preferred reminder day for this routine; it installs no OS cron.

## Pitfalls

- **A New Quizzes quiz will not warn about migration** — it is already migrated.
  Absence of `MIGRATION_RISK` on a New Quizzes quiz means "this check does not
  apply", not "you are safe".
- **Item-level hazards need item bodies.** If Canvas returns none, the per-item
  checks cannot run — `POINTS_MISMATCH` also needs items, and the Classic-only
  `MIGRATION_RISK` block is skipped entirely while the read is limited.
- **These are advisories, not gates.** `validate_quiz` never writes to Canvas and
  never blocks a publish; it returns findings and a verdict for a human.
- **Some migration hazards are documented but not implemented.** Question banks
  linked through question groups, "Sync to SIS enabled", and "a migrated quiz
  arrives unpublished" are named in the design spec as deferred, so the current
  checks are silent about them. Treat the spec, not just today's findings, as the
  hazard list (`packages/command-and-control/docs/superpowers/specs/2026-08-29-migration-risk-check-design.md`).
- **`check_shell_readiness` infers the week.** Module titles must look like
  "Week 3" and `termStartMonday` must be set; explicit overrides win over the
  inference. Without a term start it returns `TERM_START_REQUIRED` rather than
  guessing.
- **The quiz call-out is Classic-only by construction.** It collects quiz-typed
  module items; a quiz with no module placement will not appear, so use
  `validate_quiz` with an explicit `quizId` in that case.

## Sources

- `packages/command-and-control/src/tools/quiz/canvas_fetch.ts` — live quiz fetch,
  `looksLikeNewQuizzes`, `newQuizzesLimited`, `itemsAvailable`.
- `packages/command-and-control/src/tools/quiz/validate.ts` — every deterministic
  finding code, the `MIGRATION_RISK` advisories and their exact wording, verdict
  roll-up.
- `packages/command-and-control/src/tools/workflows/validate_quiz.ts` — live vs
  local source rules and the local-mode triage gate.
- `packages/command-and-control/src/tools/quiz/generate.ts` and
  `src/tools/workflows/generate_quiz.ts` — draft output path, difficulty mix,
  count limits, structural self-check.
- `packages/command-and-control/src/tools/workflows/check_shell_readiness.ts`,
  `src/tools/shell_ready/{weeks,format_report,packs/*}.ts` — week resolution,
  depth windows, date cross-checks, the quiz call-out.
- `packages/command-and-control/docs/superpowers/specs/2026-08-29-migration-risk-check-design.md`
  — the deferred hazards and the rejected guesses.
