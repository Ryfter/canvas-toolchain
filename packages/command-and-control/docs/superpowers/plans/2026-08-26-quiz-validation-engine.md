# Quiz validate + generate engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship C&C MCP tools `validate_quiz` (first) and `generate_quiz` (sibling) so Saturday/manual live-Canvas quiz spot-checks work without waiting on authoring.

**Architecture:** Domain logic under `packages/command-and-control/src/tools/quiz/`; thin workflows under `src/tools/workflows/`; register in `src/index.ts` like `review_canvas_rubric`. Live Canvas via `loadInstitutionConfig()` + injectable `fetchFn` (rubric `canvas_fetch` idiom). Week resolution imports shell’s `resolveCourseWeeks` from `src/tools/shell_ready/weeks.ts` (copy for local compile until shell merges — shell owns canonical). Preference (`weeklyCheckEnabled` / `weeklyCheckDay`) is shell-owned; quiz tools never gate on it.

**Tech Stack:** TypeScript ESM, vitest, `@canvas-toolchain/shared-llm`, Node ≥20. Hermetic tests only (inject `fetchFn` + `llm`).

**Phase 1+2 STATUS (2026-08-26):** IMPLEMENTED — `validate_quiz` + `generate_quiz` registered on WT-ct-quiz-engine.

**Spec:** `packages/command-and-control/docs/superpowers/specs/2026-08-26-quiz-validation-engine-design.md` (**Approved for planning**).

## Global Constraints

- **Validate-first:** Tasks 1–6 must complete and register `validate_quiz` before Task 7+ (`generate_quiz`). Spot-check must not wait on generate.
- Worktree `WT-ct-quiz-engine` only; no merge `main`; no npm publish; institution scrub in fixtures (`EXAMPLE101`, `example.instructure.com`).
- Advisory only — never gate `publish_course`; never write Canvas quizzes.
- Manual tools always work; do not read `weeklyCheckEnabled` as a permission check.
- YAGNI: no QTI, no quiz API write, no auto-discover quiz ids, no installer cron.
- Off-origin `Link: rel="next"` pagination must be refused (`CANVAS_OFF_ORIGIN_PAGINATION`).

## Sequencing (Priority C)

```text
Phase 1 (spot-check critical path)     Phase 2 (same plan, after Phase 1 green)
─────────────────────────────────     ────────────────────────────────────────
types → canvas_fetch → mix checks     parse (draft) → generate → generate_quiz
  → validate → prompts/triage           workflow → index.ts register generate
  → validate_quiz workflow
  → index.ts register validate_quiz
```

Shell composition/call-out is documented for the shell worktree; this plan exports a stable `validateQuiz()` for them to call.

## File Structure

| File | Phase | Responsibility |
| --- | --- | --- |
| `src/tools/quiz/types.ts` | 1 | Shared types |
| `src/tools/quiz/canvas_fetch.ts` | 1 | Live quiz + questions pull |
| `src/tools/quiz/mix.ts` | 1 | Mix normalize + realized mix from items |
| `src/tools/quiz/validate.ts` | 1 | Deterministic + optional LLM triage |
| `src/tools/quiz/prompts.ts` | 1 | Triage prompts (generate prompts in phase 2) |
| `src/tools/quiz/weeks_bridge.ts` | 1 | Thin re-export / date-in-window using shell `weeks.ts` |
| `src/tools/shell_ready/weeks.ts` + `types.ts` | 1 (copy) | Shell-owned week helper for local compile |
| `src/tools/workflows/validate_quiz.ts` | 1 | Public API + deps |
| `src/tools/quiz/index.ts` | 1 | Re-export `validateQuiz` for shell compose |
| `src/index.ts` | 1 then 2 | Register validate first; generate later |
| `src/tools/quiz/parse.ts` | 2 | Draft markdown ↔ object |
| `src/tools/quiz/generate.ts` | 2 | LLM draft write |
| `src/tools/workflows/generate_quiz.ts` | 2 | Public API |
| `tests/tools/quiz/*.test.ts` | 1–2 | Hermetic unit tests |
| `tests/tools/workflows/validate_quiz.test.ts` | 1 | Workflow tests |
| `tests/tools/workflows/generate_quiz.test.ts` | 2 | Workflow tests |

---

### Task 1: Freeze shared types (Phase 1)

**Files:**
- Create: `packages/command-and-control/src/tools/quiz/types.ts`
- Test: `packages/command-and-control/tests/tools/quiz/types.test.ts`

**Produces:** `DifficultyMix`, `QuizItem`, `QuizFinding`, `QuizValidationReport`, `LiveQuizPayload`, `WeekMapOverride`, `WeekProvenance`, `DEFAULT_DIFFICULTY_MIX`, `DEFAULT_WEEKLY_CHECK_DAY`, `QUIZ_DRAFT_SCHEMA`.

- [x] **Step 1: Write the failing test** (`types.test.ts` — schema + mix sum + saturday default)
- [x] **Step 2: Implement `types.ts` to match spec §11**
- [x] **Step 3: PASS + commit** `feat(quiz): freeze validate-first shared types`

---

### Task 2: Live Canvas quiz fetch (Phase 1)

**Files:**
- Create: `packages/command-and-control/src/tools/quiz/canvas_fetch.ts`
- Test: `packages/command-and-control/tests/tools/quiz/canvas_fetch.test.ts`

**Interfaces:**
- Consumes: `{ cfg: { canvasUrl, apiToken }, fetchFn? }`
- Produces: `fetchLiveQuiz({ courseId, quizId }, deps) → Promise<LiveQuizPayload>`
- Errors: `QuizFetchError` with codes `CANVAS_UNAUTHORIZED`, `CANVAS_NOT_FOUND`, `CANVAS_NETWORK_ERROR`, `CANVAS_HTTP_ERROR`, `CANVAS_OFF_ORIGIN_PAGINATION`

Endpoints:
- `GET {canvasUrl}/api/v1/courses/{courseId}/quizzes/{quizId}`
- `GET …/questions` paginated; refuse off-origin `Link: rel="next"`

Map Classic → `QuizItem[]`. New Quizzes / empty bodies → `items: []`, `itemsAvailable: false`, `newQuizzesLimited: true` when detectable.

- [x] **Step 1: Tests** — classic map + key letter; new quizzes limited; off-origin refuse
- [x] **Step 2: Implement + PASS + commit** `feat(quiz): live Canvas quiz + questions fetch`

---

### Task 3: Mix helpers + deterministic validate (Phase 1)

**Files:**
- Create: `src/tools/quiz/mix.ts`, `validate.ts`, `weeks_bridge.ts`
- Copy: `src/tools/shell_ready/weeks.ts`, `types.ts` (from shell worktree)
- Test: `tests/tools/quiz/mix.test.ts`, `validate.test.ts`

**Produces:**
- `normalizeMix` / `realizeMixFromItems`
- `deterministicFindings` / `validateQuizItems`
- Codes: `MISSING_KEY`, `EMPTY_STEM`, `EMPTY_CHOICE`, `EMPTY_QUIZ`, `CHOICE_COUNT`, `DUPLICATE_STEM`, `POINTS_MISMATCH`, `PUBLISH_STATE`, `SCHEDULE_INCONSISTENT`, `WEEK_MAP_MISMATCH`, `ITEMS_UNAVAILABLE`, `NEW_QUIZZES_LIMITED`, `HORIZON_SECONDARY`
- Verdict: errors → `needs-fixes`; `NEW_QUIZZES_LIMITED`/`ITEMS_UNAVAILABLE`/warnings → `needs-review`; suggestions-only → `ok`

- [x] **Step 1: Tests** for EMPTY_QUIZ, MISSING_KEY, WEEK_MAP_MISMATCH, PUBLISH_STATE, SCHEDULE_INCONSISTENT, New Quizzes verdict
- [x] **Step 2: Implement + PASS + commit** `feat(quiz): deterministic live-quiz validation`

---

### Task 4: LLM triage (Phase 1, primary pass)

**Files:**
- Create: `src/tools/quiz/prompts.ts`
- Modify: `src/tools/quiz/validate.ts` (`runQuizTriage`)
- Covered by: `tests/tools/quiz/validate.test.ts` triage describe

**Rules:** triage on for `horizonPass: 'primary'` (or omitted) when `llm` present and `llmTriage !== false`; off for `secondary` unless `llmTriage: true`. Codes: `AMBIGUOUS_KEY`, `WEAK_DISTRACTOR`, `COVERAGE_GAP`.

- [x] **Step 1: Mock LLM → AMBIGUOUS_KEY; secondary skips complete()**
- [x] **Step 2: PASS + commit** `feat(quiz): optional LLM quiz triage`

---

### Task 5: `validate_quiz` workflow (Phase 1)

**Files:**
- Create: `src/tools/workflows/validate_quiz.ts`, `src/tools/quiz/index.ts`
- Test: `tests/tools/workflows/validate_quiz.test.ts`

**Produces:**

```ts
export async function validateQuiz(
  input: ValidateQuizInput,
  deps?: ValidateQuizDeps,
): Promise<QuizValidationReport | { error: string; message?: string; fix?: string }>;
```

Source resolution: `courseId+quizId` → live; else `quizPath` XOR `quizMarkdown` → local-draft; else `QUIZ_VALIDATE_SOURCE`. Production fetch wraps `loadInstitutionConfig()`. Never gate on `weeklyCheckEnabled`. Export `validateQuizForShell` alias.

- [x] **Step 1: Tests** — missing source, live inject, local-draft parse, QuizFetchError map, scrub EXAMPLE101
- [x] **Step 2: PASS + commit** `feat(quiz): validate_quiz workflow`

---

### Task 6: Register `validate_quiz` MCP tool (Phase 1 DONE gate)

**Files:**
- Modify: `packages/command-and-control/src/index.ts`

- [x] **Step 1: ListTools + CallTool for `validate_quiz` only** (do **not** register `generate_quiz`)
- [x] **Step 2: `npx vitest run tests/tools/quiz tests/tools/workflows/validate_quiz.test.ts`**
- [x] **Step 3: Commit** `feat(quiz): register validate_quiz MCP tool`

**Phase 1 exit criteria:** `validate_quiz` callable; shell can call-out / compose; spot-check unblocked.

---

### Task 7: Draft parse + generate (Phase 2 — DO NOT START until Phase 1 green)

**Files:**
- Create: `src/tools/quiz/parse.ts`, `generate.ts`
- Extend: `prompts.ts` (generate prompts)
- Test: `tests/tools/quiz/parse.test.ts`, `generate.test.ts`

**Produces:** `parseQuizDraft(md)`, `generateQuizDraft(input, deps)` → write `week-NN/quizzes/…-draft.md` (temp+rename, `overwrite: false` default), structural pre-check via Task 3 helpers. Item types v1: `multiple_choice` + `true_false`. Schema `canvas-toolchain.quiz/v1`.

- [x] **Step 1:** Failing test — parse round-trip of draft header + Q blocks
- [x] **Step 2:** Implement `parse.ts` minimal
- [x] **Step 3:** Failing test — generate refuses empty `sources` with `{ error, fix }`
- [x] **Step 4:** Implement generate write + structural findings
- [x] **Step 5:** Implement generate (commit when requested)

---

### Task 8: `generate_quiz` workflow + register (Phase 2)

**Files:**
- Create: `src/tools/workflows/generate_quiz.ts`
- Test: `tests/tools/workflows/generate_quiz.test.ts`
- Modify: `src/index.ts` — register `generate_quiz`

Description must state: local authoring sibling; manual anytime; not required for weekly spot-check.

- [x] **Step 1–5:** TDD workflow → register → tests (commit when requested)

---

### Task 9: Shell coordination note (no quiz logic)

- Shell owns `weeks.ts`, preference persist, `check_shell_readiness`, quiz id call-outs.
- Quiz exports `validateQuiz` / `validateQuizForShell`.
- Do not fork week title regex.

- [x] **Step 1:** Copied `shell_ready/weeks.ts` + `types.ts` into this worktree for compile; quiz uses via `weeks_bridge.ts`
- [ ] **Step 2:** After shell merges, drop local copy if duplicate — prefer single shared path

---

## Plan self-review

| Spec requirement | Task |
| --- | --- |
| Live Canvas validate SoT | 2, 5, 6 |
| Validate-first / spot-check unblocked | 1–6 before 7–8 |
| Deterministic + LLM findings | 3, 4 |
| Horizon primary/secondary depth | 3, 4 |
| WEEK_MAP_MISMATCH + schedule/publish | 3 |
| Manual anytime / no weekly gate | 5, 6 copy |
| generate sibling | 7, 8 |
| Shared weeks helper (import, don’t fork) | 9 |
| Advisory / no Canvas write | Global |
| Hermetic / scrub fixtures | All tests |
| Off-origin pagination refuse | 2 |

No TBD/TODO placeholders in Phase 1 tasks.

---

## Execution note

Phase 1+2 implemented on `WT-ct-quiz-engine`. Do not merge `main` from this worktree.


## Phase 2 complete

`generate_quiz` + parse/render + hermetic tests (29 total with phase 1). Registered in `src/index.ts`. No merge main.
