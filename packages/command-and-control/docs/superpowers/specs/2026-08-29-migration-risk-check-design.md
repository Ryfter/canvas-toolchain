# `MIGRATION_RISK` check — design, deferred to the next build

**Date:** 2026-08-29
**Status:** designed, NOT implemented. Deferred by Kevin to the next build.
**Extends:** `2026-08-26-quiz-validation-engine-design.md` §2 (the New Quizzes row)
**Companion:** `2026-08-29-qti-vs-new-quizzes-api-research.md`

## Why this is in scope (it reverses nothing)

The quiz spec §2 already decided, for New Quizzes: *"detect + report `NEW_QUIZZES_LIMITED`
rather than fake full item QC."* This check is the mirror image — for a **Classic** quiz, warn
about what will not survive if it is converted to New Quizzes. Still advisory, still read-only,
no export, no Canvas writes. None of the §3 non-goals are touched.

## Evidence base — read this before changing the list

Hazards below come from Instructure's official guide
[How do I migrate a Canvas quiz to New Quizzes?](https://community.instructure.com/en/kb/articles/661049-how-do-i-migrate-a-canvas-quiz-to-new-quizzes),
last updated 2026-07-22. **Do not extend this list from intuition.** Two plausible-sounding
guesses were checked against the guide during design and both were WRONG:

- `text_only_question` — assumed unsupported. The guide states Text No Question items **do** migrate.
- `file_upload_question` — assumed unsupported. File Upload **is** a New Quizzes question type.

Either would have fired on healthy quizzes. A false warning here is worse than no check: it
teaches the professor to skip the finding.

## Confirmed hazards

### Question types that transform

| Classic type | Becomes | Evidence |
| --- | --- | --- |
| `multiple_dropdowns_question` | Fill in the Blank | **Official.** "After migration to New Quizzes, Multiple Dropdown questions display as Fill in the Blank questions." |
| `fill_in_multiple_blanks_question` | Fill in the Blank | **Third-party only** (Alamo Colleges KB) — weaker. Hedge the finding or verify before shipping. |

Every other Classic type maps cleanly: calculated→Formula, essay→Essay, file_upload→File Upload,
matching→Matching, multiple_answers→Multiple Answer, multiple_choice→Multiple Choice,
numerical→Numeric, short_answer→Fill in the Blank, text_only→Text Block, true_false→True/False.

### Quiz-level hazards (all official)

| Hazard | Effect |
| --- | --- |
| Question banks linked via question groups | Migrate **only if the institution enabled the migration feature option**; otherwise questions must be added individually first |
| Sync to SIS enabled | Must be turned off before migrating |
| Practice quiz | Becomes zero points possible, hidden from Gradebook and Grades |
| Any migration | Migrated quizzes arrive unpublished |

## Design

One new finding code, **`MIGRATION_RISK`**, emitted from `validate.ts` when the quiz is
**Classic** — the inverse of the existing `live.newQuizzesLimited` signal.

- Severity `warning`, which already routes to `needs-review` via `verdictFrom()`. No verdict
  logic changes.
- One finding per detected hazard, not one lumped finding — the professor needs to know which.
- `questionId` set for per-question hazards; omitted for quiz-level ones.
- `fixHint` names the concrete action ("rebuild these as Fill in the Blank before migrating",
  "turn Sync to SIS off first").

Detection uses data the existing fetch already returns: `question_type` per item, `quiz_type`
for the practice-quiz case. **One unverified dependency:** question-group / bank linkage.
Confirm `canvas_fetch.ts` surfaces that field before building the bank finding; if it does not,
extend the fetch or drop that finding rather than guessing.

**Scope:** `validate.ts`, `types.ts` (if codes are typed), and tests. No new files.

## The judgment call this design rests on

The bank-migration hazard is **institution-dependent**, and the API does not expose whether the
admin enabled the migration feature option. So that finding must be phrased as a conditional —
*check with your Canvas admin whether bank migration is enabled* — never as an assertion. A
warning that says "this will break" when it depends on a setting we cannot see would be wrong
roughly half the time, and wrong warnings are how a check becomes noise a professor learns to skip.

The same caution governs the `fill_in_multiple_blanks` row: official evidence gets a plain
statement, third-party evidence gets hedged or verified first.

## OPEN QUESTION — unanswered, answer before building

**Does Kevin's workflow use question banks / question groups, or are his quizzes mostly
manually-authored questions?**

This decides whether the conditional bank finding is worth its noise. Hand-authored quizzes mean
the bank hazard never fires for him and the conditional warning is pure cost — better dropped, to
keep the check sharp. If he does use banks, it is the most valuable finding in the set, because
it is the one that silently loses content.

Asked 2026-08-29; the session ended before it was answered.
