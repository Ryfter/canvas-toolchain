# Quiz generate + validate engine — design

- **Job:** `mj-e07ae1c4209a` · claim `ct-orch-quiz-engine` · worktree `WT-ct-quiz-engine`
- **Date:** 2026-08-26
- **Status:** **Approved for planning** (Kevin Maestro, 2026-08-26 ~02:14). Self-reviewed. Next: implementation plan — **do not deep-implement until plan executes**.
- **Decisions locked:** **A** (C&C workflows) + **B** (live Canvas validate) + horizon **C+D** + week-map **Hybrid C** + quiz **validate-first C** + fire **opt-in weekly day + manual anytime** (recommend Saturday, changeable).
- **Disjoint from:** shell readiness (`2026-08-26-shell-readiness-engine-design.md`) — shell owns `weeks.ts` preference persistence + `check_shell_readiness`; this claim owns `validate_quiz` / `generate_quiz`.
- **Author:** Orchestrator `ct-orch-quiz-engine` (Composer)
- **Plan:** `packages/command-and-control/docs/superpowers/plans/2026-08-26-quiz-validation-engine.md` (validate-first: Tasks 1–6 before generate)

---

## 0. Architecture decisions (LOCKED)

### Decision A — C&C workflow MCP tools

Same pattern as `review_canvas_rubric`:

- Domain logic: `packages/command-and-control/src/tools/quiz/`
- Workflows: `src/tools/workflows/{generate,validate}_quiz.ts`
- Registry: C&C `src/index.ts` ListTools + CallTool — **always-on**, not module-gated
- Production: `resolveActiveLlmClient()` + `loadInstitutionConfig()` (`canvas_config_bridge.ts`)
- Injectable `deps` for hermetic tests

**Rejected:** channel modules; CI-owned professor surface; CDS-only engine.

### Decision B — Live Canvas API first (validation SoT)

Kevin 2026-08-26: **Source of truth for validation = what is actually on Canvas for students**, not the local authoring folder.

| Concern | Source of truth |
| --- | --- |
| **Validate** (spot-check / readiness) | **Live Canvas** via C&C Canvas client + institution config |
| **Generate** (authoring) | Local CDS / materials / archive may inform generation; drafts are local until the professor puts them on Canvas |
| Local archive / CDS course folder | May seed generate or supply coverage hints; **must not** be treated as “what students see” for validate |

**Implication:** `validate_quiz` live path requires `courseId` + `quizId` (caller/shell supplies ids). A local-draft path is allowed only as an **authoring pre-check** and is clearly labeled `source: 'local-draft'` — it is not a readiness/spot-check result.

### Decision C+D — Horizon anchor (Kevin 2026-08-26)

Shared with shell readiness (shell **owns** the spot-check tool; quiz **respects** the same calendar):

1. **Professor week map is primary framing.** Modules are “unlocked weekly” Mon–Sunday (Kevin’s pattern and most professors). Example: currently in Week 1; Week 2 starts at the next Monday boundary. Weeks are viewed **Monday–Sunday**.
2. **Canvas dates are the cross-check.** Include anything with a date in the horizon: `due_at`, unlock/`available_from`, lock/`available_until` (assignments, quizzes, discussions, modules/items as applicable). Flag mismatches between week-map intent and Canvas schedule (`WEEK_MAP_MISMATCH` / schedule findings — shell leads; quiz may echo on a quiz’s own dates).
3. **When the spot check fires — opt-in weekly day + manual anytime** (Kevin 2026-08-26; shell owns preference UX):
   - **Prompt** the professor to allow a weekly readiness/quiz spot-check on a chosen day.
   - **Recommend Saturday** as default `weeklyCheckDay`; professor may change (e.g. Sunday).
   - **Manual always works** — `check_shell_readiness` / `validate_quiz` / `generate_quiz` run anytime with `asOfDate`; weekly enablement is never required.
   - Persist `weeklyCheckEnabled` + `weeklyCheckDay` in C&C local config (global `~/.command-and-control/` and/or course-scoped — shell spec owns exact file); presence-only in status tools; no secrets.
   - v1 ships preference + prompt/setup + manual path. OS/cron nudge is a **fast-follow** — do not block this design on installer cron.
   - Horizon math unchanged: thorough = week beginning in ~2 weeks; lighter = week beginning in ~1 week.

Shell tool inputs (sibling): `courseId`, optional `asOfDate`, `termStartMonday`, optional `weekMapOverrides`; report `primaryWeek` + `secondaryWeek` + provenance + preference echo. Cadence day lives in persisted preference (not a hard per-run `fireDay` gate).

### Decision Hybrid C — Week map establishment (Kevin 2026-08-26)

| | Rule |
| --- | --- |
| **Default (happy path)** | Infer weeks from live Canvas module titles (`Week 1`, `Week 2`, `Week 01`, …) plus `termStartMonday` → Mon–Sun windows (`Week N` Monday = `termStartMonday + (N-1)*7`) |
| **Overrides** | Professor supplies explicit week → date-range and/or moduleIds in course config (`course-config.md`) and/or C&C tool args (`weekMapOverrides`) when titles don’t match or inference is wrong |
| **Precedence** | Tool arg overrides > course-config overrides > inference. **Overrides win** for listed week indices |
| **Provenance** | Every resolved week in reports must state `inferred` \| `override` |

**Shared helper (do not fork):** Shell owns v1 `resolveCourseWeeks` / `resolveSpotCheckWeeks` in `src/tools/shell_ready/weeks.ts` (sibling claim). Quiz **must call the same helper** when targeting a week (generate aiming at primaryWeek, or validate needing `weekStartMonday` / module membership). If a third caller appears, lift to `src/lib/course_weeks.ts` without changing the contract — note only; quiz does not reimplement title regex or override merge.

### Decision Priority C — Validate-first tool family (Kevin 2026-08-26)

One C&C tool family: **`validate_quiz` + `generate_quiz`** (shared types under `src/tools/quiz/`).

| | Lock |
| --- | --- |
| **v1 ship order** | **Validate first** — so the live-Canvas spot-check (manual or opt-in weekly) is useful immediately for horizon weeks’ quizzes |
| **Generate** | Same family; lands **right after** validate in the **same implementation plan** — must **not** block weekly or manual spot-check |
| **Shell composition** | When weekly ritual runs (or manual shell check), shell may call out / compose `validate_quiz` for quizzes in `primaryWeek` / `secondaryWeek`; shell **does not own** quiz logic |
| **Manual quiz tools** | `validate_quiz` / `generate_quiz` always callable without `weeklyCheckEnabled` |
| **Shared types** | OK |

---

## 1. Goal

**Priority order (Priority C):**

1. **`validate_quiz` (ship first)** — Live Canvas advisory report (errors, ambiguous keys, difficulty balance, coverage, publish/due/lock vs week map). Participates in **opt-in weekly** shell ritual when enabled; **manual anytime** unchanged.
2. **`generate_quiz` (same family, lands next)** — Local materials → draft with mix knobs. Manual anytime; not on the weekly critical path.

Professor is the arbiter. No publish gate in v1. No parallel quiz-API write path.

---

## 2. What already exists (do NOT rebuild)

| Layer | Today | Gap |
| --- | --- | --- |
| **CDS** | `reading-quiz` / `weekly-quiz` landing pages | Not question banks |
| **CI / Backup** | `QuizInfo` metadata only in archive manifests | Archive is **not** validate SoT (Decision B) |
| **C&C publish** | Skips quiz pageTypes | Unchanged — no invent quiz publish |
| **C&C rubric idiom** | `loadInstitutionConfig` + injectible Canvas fetch | **Reuse for live quiz pull** |
| **Classic Quizzes API** | `GET .../quizzes`, `.../quizzes/:id`, `.../quizzes/:id/questions` | Wire via existing client; map stems/answers when present |
| **New Quizzes** | Different surface; item API may be limited | v1: detect + report `NEW_QUIZZES_LIMITED` rather than fake full item QC |

---

## 3. Non-goals (YAGNI)

- Writing/updating quizzes on Canvas (create/update API)
- QTI / Common Cartridge export
- Treating local CDS/archive as readiness SoT
- Continuous full-course quiz audit every run (use rolling horizon — §5)
- Discovering quiz ids without an explicit `quizId` (v1: caller/shell passes ids; no course-wide quiz crawl inside `validate_quiz`)
- Adaptive testing / IRT / grading submissions
- Shared npm package with shell readiness (import shell’s `weeks.ts` / future lift — coordination by contract only)
- Channel module / CI professor tools
- Installer OS/cron / launchd (fast-follow; preference + manual path only in v1)
- Requiring `weeklyCheckEnabled` before any quiz tool run

---

## 4. Locked design decisions

| Id | Decision |
| --- | --- |
| **D-A** | C&C workflow MCP tools |
| **D-B** | Validate SoT = live Canvas; generate may use local materials |
| **D1** | Generate writes local draft under `courseDir` (temp+rename; `overwrite: false` default) |
| **D2** | Tool family: `validate_quiz` + `generate_quiz` (shared types) |
| **D2a** | **Validate-first** (Priority C) — spot-check must not wait on generate |
| **D3** | Validate is advisory; does not gate `publish_course` |
| **D4** | Explicit `DifficultyMix` knobs (§8) |
| **D5** | Generate inputs = path-based local materials (§7) |
| **D6** | Hermetic tests; inject LLM + Canvas fetch |
| **D7** | Generate artifact = markdown-first (`schema: canvas-toolchain.quiz/v1`) |
| **D8** | Generate item types v1 = `multiple_choice` + `true_false` |
| **D9** | Do not auto-edit CDS quiz landing pages |
| **D10** | `generate_quiz` ends with cheap **structural** pre-check on the draft |
| **D11** | Spot-check cadence/horizon owned by **shell**; quiz respects C+D + Hybrid C (§5) |
| **D-C+D** | Professor Mon–Sun week map primary; Canvas due/unlock/lock cross-check; horizon weeks |
| **D-Hybrid-C** | Infer weeks from module titles + `termStartMonday`; `weekMapOverrides` win; report provenance; shared `resolveCourseWeeks` |
| **D-Priority-C** | Validate-first; generate sibling in same plan; shell composes/calls out validate only |
| **D-Fire** | Opt-in `weeklyCheckEnabled` + `weeklyCheckDay` (default saturday); manual tools always work; cron = fast-follow |

---

## 5. Spot-check cadence + horizon (shell owns preference; quiz aligns)

### 5.0 Opt-in weekly day + manual anytime (LOCKED)

| | Rule |
| --- | --- |
| **Manual** | Always — professor/agent runs MCP tools anytime (`asOfDate` optional, default today). No preference required. |
| **Weekly (opt-in)** | Prompt/setup records `weeklyCheckEnabled: true` + `weeklyCheckDay` (default **`saturday`**; any weekday allowed). On that day, agent/docs suggest shell (+ `validate_quiz` call-out). |
| **Setup affordance** | Shell owns `setup_spot_check` (or equivalent) + presence-only echo via `get_cc_status` / shell report `preference` — see sibling spec |
| **Persist** | C&C local config only; never secrets; status tools report presence/values of day+enabled only |
| **OS/cron** | Fast-follow — not a v1 gate for this design |
| **Quiz** | `validate_quiz` participates when weekly runs; manual `validate_quiz` / `generate_quiz` unchanged |

### 5.1 Shared calendar model (do not contradict)

| | Rule |
| --- | --- |
| **Week framing** | Hybrid C: title inference + `termStartMonday`, overrides win |
| **Cross-check** | Live Canvas `due_at` / unlock / lock vs that week’s Mon–Sun window; flag mismatches |
| **Recommended weekly day** | **Saturday** (professor may choose another `weeklyCheckDay`) |
| **primaryWeek** | Week that **begins in ~2 weeks** — thorough (`currentWeekIndex + 2` when `asOfDate` falls in “current” week) |
| **secondaryWeek** | Week that **begins in ~1 week** — lighter (`currentWeekIndex + 1`) |
| **Provenance** | Each week: `inferred` \| `override` |
| **Out of window** | Not in this run’s report |

Example (`asOfDate` = Saturday while students are in Week 1): **secondaryWeek = 2**, **primaryWeek = 3**.

### 5.2 How quiz plugs into spot-check (validate-first)

```text
Manual anytime  OR  opt-in weekly day (agent prompt; cron = fast-follow)
        │
        ▼
 check_shell_readiness (sibling) — always callable
  → resolveCourseWeeks → primaryWeek / secondaryWeek (+ provenance)
  → echo preference { weeklyCheckEnabled, weeklyCheckDay } (never gates)
  → shell packs: quiz *items* as structure/schedule only
  → composition OR call-out:
       validate_quiz({ courseId, quizId, weekNumber, weekStartMonday,
                       weekProvenance, horizonPass, asOfDate })
  → shell never imports quiz rules; never waits on generate_quiz
  → never refuses because weeklyCheckEnabled is false
```

| Mode | Behavior |
| --- | --- |
| **Agent orchestration (default v1)** | Shell lists in-band quiz ids → agent calls `validate_quiz` (manual or on preferred day) |
| **Opt-in compose (later)** | `includeQuizValidation: true` thin-delegates to `validateQuiz` |
| **Direct quiz** | Professor runs `validate_quiz` / `generate_quiz` anytime with no shell |

- **Shell owns:** preference file + setup/prompt, week math, module tree, call-out ids.
- **Quiz owns:** item-level QC inside `validate_quiz`.
- **`generate_quiz`:** authoring anytime; not on weekly critical path.

### 5.3 Targeting a week (validate then generate)

| Tool | Resolution |
| --- | --- |
| **`validate_quiz` (first)** | Spot-check path: shell/agent passes quizzes in `primaryWeek` / `secondaryWeek`. Cross-check dates vs Mon–Sun → `WEEK_MAP_MISMATCH`. Echo `weekProvenance`. Depth: primary full+LLM; secondary lighter. Ad hoc `{ courseId, quizId }` OK. |
| **`generate_quiz` (sibling, after)** | Prefer explicit `week: N`. Optional Hybrid C resolve for primaryWeek materials. Same `resolveCourseWeeks` — no second inference algorithm. Not on the **weekly** critical path. |
| **Independent use** | Both usable without shell; week targeting imports shared helper. |

---

## 6. Package layout + implementation order (Priority C)

```text
packages/command-and-control/src/tools/quiz/
  types.ts                 # shared (ship with validate)
  canvas_fetch.ts          # live quiz + questions  ← validate path
  validate.ts
  prompts.ts               # triage prompts first; generate prompts in phase 2
  parse.ts                 # needed for local-draft pre-check; also generate
  mix.ts                   # difficulty balance checks (validate) + knobs (generate)
  generate.ts              # PHASE 2 — same plan, after validate green
packages/command-and-control/src/tools/workflows/
  validate_quiz.ts         # PHASE 1 — register first
  generate_quiz.ts         # PHASE 2 — register when generate lands
```

**Plan phases (single plan doc, ordered tasks):**

1. Types + `canvas_fetch` + deterministic validate + LLM triage + `validate_quiz` workflow + `index.ts` registration + tests.
2. Wire shell call-out / optional compose (shell worktree; quiz exports stable `validateQuiz`).
3. `generate_quiz` (mix knobs, local write, structural pre-check) — same plan, does not delay phase 1 merge readiness for spot-check.

---

## 7. Generate inputs (local materials — Decision B allows)

Professor passes local paths. Canvas optional for **meta targets only** during generate (counts/points/title) — not validate SoT.

| Kind | Role |
| --- | --- |
| Books / readings / slides / enriched lectures | Grounding for stems |
| Landing page (optional) | Title / topics hints |
| `courseId` / `quizId` (optional) | Live meta targets via `loadInstitutionConfig` |

≥1 readable source or `{ error, fix }`. Size-cap text. No PII/tokens in logs.

---

## 8. Difficulty mix knobs (generate)

```ts
interface DifficultyMix {
  easy: number;    // default 0.4
  medium: number;  // default 0.4
  hard: number;    // default 0.2
}
```

Defaults: `questionCount` 10 (max 25), `types: ['multiple_choice']`, `optionsPerMcq: 4`, `requireCitation: true`. Mix must sum ≈ 1.0.

---

## 9. Generate path

```text
generate_quiz
  → local sources (+ optional live meta)
  → LLM → draft markdown under week-NN/quizzes/
  → structural pre-check on draft
  → GenerateQuizResult
```

Draft format unchanged (`schema: canvas-toolchain.quiz/v1`). Professor (or later tooling) enters items into Canvas; **readiness validate then reads Canvas**, not this file.

---

## 10. Validate path (live Canvas first)

```text
validate_quiz
  → if courseId + quizId:
       loadInstitutionConfig → canvas_fetch quiz + questions  // Decision B
  → else if quizPath | quizMarkdown:
       parse local draft; set source: 'local-draft'           // authoring pre-check only
  else refuse QUIZ_VALIDATE_SOURCE
  → deterministic checks (depth by horizonPass)
  → LLM triage if primary (or llmTriage true) and items available
  → QuizValidationReport (advisory)
```

v1 does **not** auto-discover quiz ids from the course; the shell (or professor) supplies `quizId`.

### 10.1 Live fetch

Reuse C&C/CDS Canvas client patterns (rubric sync):

- `GET /api/v1/courses/:courseId/quizzes/:quizId`
- `GET /api/v1/courses/:courseId/quizzes/:quizId/questions` (paginated; refuse off-origin `Link: rel="next"`)
- Map Classic Quiz questions → internal `QuizItem[]` (stem, types, answers, points)
- Shell/publish fields when present: `published`, `due_at`, `lock_at`, `unlock_at`, `question_count`, `points_possible`

If the quiz is New Quizzes / item bodies unavailable: return verdict `needs-review` with finding `NEW_QUIZZES_LIMITED` / `ITEMS_UNAVAILABLE` and still report available shell fields (published/due/lock). Do not invent stems.

### 10.2 Findings

| Code | Severity | Notes |
| --- | --- | --- |
| `MISSING_KEY` | error | Live answer missing / invalid |
| `DUPLICATE_STEM` | error | Near-identical stems |
| `CHOICE_COUNT` | error / warning | MCQ shape issues |
| `EMPTY_STEM` / `EMPTY_CHOICE` | error | |
| `EMPTY_QUIZ` | error | published (or due soon) with 0 questions |
| `POINTS_MISMATCH` | warning | quiz points vs sum of items |
| `AMBIGUOUS_KEY` / `WEAK_DISTRACTOR` | warning | LLM; **primary** pass default |
| `PUBLISH_STATE` | warning | due soon but unpublished / locked oddly |
| `SCHEDULE_INCONSISTENT` | warning | due/unlock/lock nonsensical vs each other |
| `WEEK_MAP_MISMATCH` | warning | quiz due/unlock/lock outside professor Mon–Sun week window (when week map provided) |
| `ITEMS_UNAVAILABLE` | suggestion / needs-review | API cannot return bodies |
| `NEW_QUIZZES_LIMITED` | suggestion | New Quizzes — limited QC |
| `HORIZON_SECONDARY` | (label) | Report marks lighter pass |

Local-draft-only extras (`SOURCE_UNCITED`, `MIX_DRIFT`, `COVERAGE_GAP`) apply when `source: 'local-draft'`.

### 10.3 Depth by horizon pass

| `horizonPass` | Maps to | Deterministic | LLM triage |
| --- | --- | --- | --- |
| `primary` (default) | `primaryWeek` (week beginning in ~2 weeks) | full + week-map date cross-check | default on if LLM configured |
| `secondary` | `secondaryWeek` (week beginning in ~1 week) | publish/due/lock + empty/count/points + light week-map check | default **off** |
| omitted | ad hoc / explicit `quizId` | treat as primary depth | |

### 10.4 Verdict (advisory)

`ok` | `needs-fixes` | `needs-review` — professor decides. Nothing blocks `publish_course`.

---

## 11. MCP tool contracts

Register **`validate_quiz` first** in `index.ts`. Add **`generate_quiz`** in phase 2 of the same plan.

**Week override / provenance** — same contract as shell `ShellWeekMapOverride` / `ShellWeekProvenance`; quiz imports shared `resolveCourseWeeks` (do not fork):

```ts
export type WeekProvenance = 'inferred' | 'override';

export interface WeekMapOverride {
  index: number;        // 1-based Week N
  label?: string;
  moduleIds?: number[];
  monday?: string;      // YYYY-MM-DD
  sunday?: string;
}
```

### 11.1 `validate_quiz` (phase 1 — spot-check critical path)

```ts
export interface ValidateQuizInput {
  /** Live Canvas — preferred / spot-check path (Decision B). */
  courseId?: string;
  quizId?: string;

  /** Authoring pre-check only — not readiness SoT. */
  quizPath?: string;
  quizMarkdown?: string;

  /**
   * Horizon C+D + Hybrid C (shell Saturday spot-check may set these).
   * Prefer resolving via shared resolveCourseWeeks rather than hand-rolling Mondays.
   */
  asOfDate?: string;
  weekNumber?: number;
  weekStartMonday?: string;
  weekProvenance?: 'inferred' | 'override';
  horizonPass?: 'primary' | 'secondary';
  /** When quiz must resolve a week itself (no shell): same Hybrid C inputs. */
  termStartMonday?: string;
  weekMapOverrides?: WeekMapOverride[];
  courseDir?: string;            // may load overrides from course-config.md

  llmTriage?: boolean;
  expectedMix?: DifficultyMix;
}

export interface ValidateQuizDeps {
  llm?: LlmClient;
  readFile?: (path: string) => string;
  /** Production: loadInstitutionConfig + Canvas client. */
  fetchLiveQuiz?: (args: {
    courseId: string;
    quizId: string;
  }) => Promise<LiveQuizPayload>;
}

export interface LiveQuizPayload {
  meta: QuizMeta & {
    published?: boolean;
    dueAt?: string | null;
    lockAt?: string | null;
    unlockAt?: string | null;
    quizType?: string;           // classic vs new when detectable
  };
  items: QuizItem[];             // empty if unavailable
  itemsAvailable: boolean;
}

export interface QuizValidationReport {
  source: 'canvas' | 'local-draft';
  courseId?: string;
  quizId?: string;
  path?: string;
  horizonPass?: 'primary' | 'secondary';
  asOfDate?: string;
  weekNumber?: number;
  weekStartMonday?: string;
  weekProvenance?: 'inferred' | 'override';
  verdict: 'ok' | 'needs-fixes' | 'needs-review';
  findings: QuizFinding[];
  realizedMix?: DifficultyMix;
  summary: string;
}
```

**Source resolution**

1. If `courseId` + `quizId` → live Canvas (`source: 'canvas'`). Requires `setup_canvas`.
2. Else if `quizPath` XOR `quizMarkdown` → `source: 'local-draft'` (authoring pre-check).
3. Else → `{ error: 'QUIZ_VALIDATE_SOURCE', fix }`.

Spot-check / readiness conversations must use (1).

### 11.2 `generate_quiz` (phase 2 — same plan, after validate)

```ts
export interface GenerateQuizInput {
  courseDir: string;
  week: number;
  sources: string[];
  title?: string;
  pageType?: 'weekly-quiz' | 'reading-quiz';
  difficultyMix?: DifficultyMix;
  questionCount?: number;
  types?: Array<'multiple_choice' | 'true_false'>;
  outputPath?: string;
  overwrite?: boolean;
  landingPagePath?: string;
  courseId?: string;       // optional live meta; also for resolveCourseWeeks
  quizId?: string;
  bloomHint?: string;
  /** Hybrid C — when resolving primaryWeek instead of hard-coding week. */
  termStartMonday?: string;
  weekMapOverrides?: WeekMapOverride[];
}

export interface GenerateQuizDeps {
  llm?: LlmClient;
  readFile?: (path: string) => string;
  writeFileAtomic?: (path: string, body: string) => void;
  fetchQuizMeta?: (args: { courseId: string; quizId?: string }) => Promise<QuizMeta | null>;
}

export interface GenerateQuizResult {
  path: string;
  questionCount: number;
  realizedMix: DifficultyMix;
  structuralFindings: QuizFinding[];
  warnings: string[];
  summary: string;
}
```

---

## 12. Registry wiring (`src/index.ts`)

Same as Decision A:

- Import workflow functions + Input types
- ListTools descriptors — register **`validate_quiz` in phase 1**; add **`generate_quiz` in phase 2**
- CallTool cases
- **Not** in `KNOWN_MODULES` / catalog / CI index

`validate_quiz` description must state: reads **live Canvas** by default (`courseId`+`quizId`); runnable **anytime** (manual); also usable from opt-in weekly shell ritual (call-out or compose); local draft path is authoring-only; advisory; run `setup_canvas` first for live mode. Does **not** require `weeklyCheckEnabled`.

`generate_quiz` description must state: local authoring sibling; manual anytime; not required for weekly spot-check.

---

## 13. Canvas + config idioms

| Concern | Pattern |
| --- | --- |
| Creds | `loadInstitutionConfig()` → `{ canvasUrl, apiToken }` |
| HTTP | Existing C&C/CDS client; extend with quiz + questions methods; refuse off-origin pagination |
| Validate | **Required** live pull when spot-checking |
| Generate | Local-first; Canvas meta optional |
| Secrets | Never echo token/host secrets in results |
| Missing config | Live validate without setup → `{ error, fix: 'Run setup_canvas' }` |

---

## 14. Advisory vs gate

v1 advisory only. Future gate only if quiz write/publish lands and professors ask. Shell may list quiz module issues; quiz engine does not absorb shell scope.

---

## 15. Test plan

**Phase 1 (validate — required for spot-check):**

| Case | Asserts |
| --- | --- |
| Live validate happy path | mock `fetchLiveQuiz` → findings; `source: 'canvas'` |
| Empty live quiz | `EMPTY_QUIZ` |
| Items unavailable | `ITEMS_UNAVAILABLE`; no invented stems |
| Ambiguous key / mix drift / coverage | triage + deterministic codes |
| Secondary pass | no LLM by default |
| Week-map mismatch | `WEEK_MAP_MISMATCH` |
| Config missing | fix hint; no token leak |
| Scrub | `EXAMPLE101` / `example.instructure.com` only |

**Phase 2 (generate — same plan, after phase 1 green):**

| Case | Asserts |
| --- | --- |
| Generate write | atomic; no overwrite without flag |
| Empty sources | `{ error, fix }` |
| Structural on generate | findings on draft |
| Local-draft validate path | `source: 'local-draft'` |

---

## 16. Relation to shell readiness (disjoint + validate-first composition)

| Concern | Quiz (this claim) | Shell (sibling) |
| --- | --- | --- |
| Spot-check usefulness (manual + opt-in weekly) | **`validate_quiz` phase 1** | owns ritual + preference UX |
| `weeklyCheckEnabled` / `weeklyCheckDay` | does not gate quiz tools | owns persist + setup/prompt |
| Quiz item quality rules | **owns** | never reimplements |
| `generate_quiz` | sibling phase 2; manual anytime | must not block shell |
| Shared week helper / types | imports | owns v1 `weeks.ts` |

---

## 17. Next steps

1. ~~Kevin approved design (2026-08-26 ~02:14)~~
2. ~~Spec self-review → Status: Approved for planning~~
3. Execute plan `…/plans/2026-08-26-quiz-validation-engine.md` — **Phase 1 validate_quiz first**
4. No deep impl outside the plan; no merge `main` / npm publish; no installer cron in v1

---

## 18. Approval checklist (quiz claim)

- [x] C&C workflow tools (A); not modules / not CI professor surface
- [x] Validate SoT = live Canvas (B); generate local materials
- [x] Horizon C+D + Hybrid C week map; shared `resolveCourseWeeks` (shell-owned `weeks.ts`)
- [x] Validate-first Priority C; generate sibling same plan — sequencing explicit in §1, §6, §11, §17
- [x] Opt-in weekly day + manual anytime; Saturday recommended default; preference shell-owned
- [x] `validate_quiz` participates on weekly ritual; manual generate/validate unchanged
- [x] Advisory only; YAGNI publish/QTI/cron/auto-discover
- [x] Kevin Maestro sign-off (2026-08-26 ~02:14)
- [x] Spec self-review (no TBD/TODO; ambiguities fixed)
