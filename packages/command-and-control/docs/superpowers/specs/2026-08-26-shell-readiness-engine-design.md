# Course Shell Readiness Engine — Design

**Date:** 2026-08-26
**Status:** **Implemented on branch `WT-ct-shell-ready`** (plan + code; not merged to main). Spec was Approved for planning 2026-08-26 ~02:14; plan executed same day.
**Approved decisions:** **A** (C&C workflow) · **B** (live Canvas) · horizon **C+D** · week-map **Hybrid C** · quiz **validate-first C** · fire **opt-in weekly day + manual anytime**.
**Job:** `mj-e07ae1c4209a` · worktree `WT-ct-shell-ready` · claim **disjoint from quiz engine**
**Packages:** `packages/command-and-control` only.
**Related but distinct:** [#151](https://github.com/Ryfter/canvas-toolchain/issues/151) setup readiness — different question.

---

## Governing principles

1. **Professor is the final arbiter** — v1 advisory; gates only with later justification; never on generate-and-paste.
2. **Live Canvas is the validation content source (B)** — what students see. Local CDS `course/` / `output/` / archive are **not** scraped for publish/body/link findings. `courseDir` may only (a) supply `termStartMonday` / `weekMapOverrides` from course-config, and (b) enable a11y/publish **nudges** in report text.
3. **Professor week map frames the horizon (C)** — Mon–Sun “unlocked weekly” modules (Kevin’s pattern and the common case).
4. **Canvas dates cross-check the map (D)** — `due_at`, unlock/available_from, lock/available_until; flag map↔schedule mismatches.
5. **Opt-in weekly spot-check + manual anytime** — recommend a weekly day (default **Saturday**); professor chooses day and enables via prompt/setup. MCP tools always run on demand with `asOfDate`. Thorough = week beginning in ~2 weeks; lighter = week beginning in ~1 week. Not a full-course audit. OS/cron nudge is a fast-follow — not a v1 blocker.

---

## Locked decisions

| Choice | Locked value |
| --- | --- |
| **A** | C&C workflow MCP tool `check_shell_readiness` — not channel module, not CI surface |
| **B** | Live Canvas API first via `loadInstitutionConfig()` |
| **C** (horizon) | Professor **week map** (Mon–Sun) is **primary framing** for which modules/items are in scope |
| **D** (horizon) | Canvas dates are the **cross-check**; include anything dated into the week windows; flag mismatches |
| **C — Hybrid** (week map establishment) | **Default:** infer weeks from Canvas module titles (`Week 1`, …) + `termStartMonday`. **Overrides:** explicit week→modules/date-range in course config / tool input; **overrides win**. Report **provenance** per week (`inferred` \| `override`). |
| Week boundary | **Monday–Sunday** |
| Fire / cadence | **Opt-in weekly day + manual anytime.** Recommend **Saturday**; professor may choose any day (`weeklyCheckDay`). Persist `weeklyCheckEnabled` + `weeklyCheckDay`. Manual `check_shell_readiness` **always** works without enabling weekly. |
| Primary week | Week whose **Monday starts in ~2 weeks** — **thorough** |
| Secondary week | Week whose **Monday starts in ~1 week** — **lighter** |
| Shared week resolver | **`src/tools/shell_ready/weeks.ts`** — `resolveCourseWeeks` + `resolveSpotCheckWeeks`; quiz orch **must** import (lift to `src/lib/course_weeks.ts` only if a third caller appears) |
| Quiz content logic | **Out of claim** — sibling `validate_quiz` / `generate_quiz` (**validate-first**) |
| Quiz composition (v1) | **Shape A — agent call-out only.** Shell emits `quizCallouts`; does not call `validate_quiz` internally. Shape B deferred. |
| Preference store | **`~/.command-and-control/spot-check.json`** only (0o600, atomic). Not in `config.json`. `get_cc_status`: `{ configured, enabled, day }` presence-only. |
| Setup affordance | Dedicated MCP tool **`setup_spot_check`** (not a `setup_cc` mode). |
| OS/cron installer nudge | **Fast-follow** — out of v1 plan scope |
| Advisory v1 | Yes — `blocking` is priority, not a hard stop |

### Rejected

- Day-offset bands without week identity (`primaryDays`/`secondaryDays` alone).
- Canvas-date-only horizon with no professor week framing.
- Overrides-only map (no inference happy path); inference-only with no override escape hatch.
- Local folder as readiness truth; full-course audit every run.
- **Hard-requiring** weekly enablement before manual runs.
- Blocking v1 on installer cron / OS schedulers.

---

## Problem

Professors run unlocked **Week N** modules on a **Mon–Sun** rhythm. They need a recurring spot-check (recommended **Saturday**, their choice of day) plus the ability to run the same check **any time**: *is the week that starts in two Mondays ready on live Canvas? Is next Monday’s week still OK on a light second look? Do Canvas due/unlock/lock dates match that week map?* Existing tools check local HTML, thin snapshots, or install status — not this.

---

## Goals

1. Resolve **primaryWeek** + **secondaryWeek** from Hybrid week map + `asOfDate`.
2. Thorough + lighter packs on those weeks’ modules (map-first), plus Canvas-dated orphans in those Mon–Sun windows.
3. Flag **week-map ↔ Canvas schedule mismatches**.
4. One advisory report; live Canvas content; cadence preference + manual path first-class.
5. Emit **`quizCallouts`** so agents run **`validate_quiz` first** (quiz family) for in-band quizzes; never block on `generate_quiz`.

## Non-goals (YAGNI)

- Full-course audit; local CDS as truth; **owning** quiz generate/validate logic; auto-publish/date writes; channel module; **v1 OS/cron**; soft-gate same release; student PII.
- Blocking the weekly shell spot-check on `generate_quiz` shipping.
- Requiring `weeklyCheckEnabled` before manual tool use.

---

## Architecture

```text
Manual anytime  OR  opt-in weekly day (agent prompt / calendar; cron = fast-follow)
        │
        ▼
 check_shell_readiness          ← always callable; ignores weeklyCheckEnabled for permission
        │
        ├── loadInstitutionConfig()
        ├── loadSpotCheckPreference()      ← weeklyCheckEnabled + weeklyCheckDay (echo only)
        ├── fetchShellGraph(courseId)
        ├── resolveCourseWeeks(...)        ← Hybrid C
        ├── resolveSpotCheckWeeks(asOfDate)
        │     → primaryWeek (+2), secondaryWeek (+1)   [Mon–Sun math; not gated on fire day]
        ├── packs @ depth(week) + mismatch
        └── ShellReadinessReport { trigger: manual|weekly-suggested, preference, … }

 setup_spot_check / prompt path
        └── write weeklyCheckEnabled + weeklyCheckDay (default saturday)
 get_cc_status
        └── spotCheck: { configured, enabled, day }  // presence-only
```

**Layout (explicit):**

```text
packages/command-and-control/src/tools/
  shell_ready/
    weeks.ts                 # SHARED: resolveCourseWeeks, resolveSpotCheckWeeks
    spot_check_preference.ts # load/save ~/.command-and-control/spot-check.json
    types.ts
    fetch_graph.ts
    probe_links.ts
    packs/{structure,schedule,links,instructions,mismatch}.ts
    format_report.ts
  workflows/
    check_shell_readiness.ts
    setup_spot_check.ts
```

**`weeks.ts` contract (shared with quiz orch):**

```ts
resolveCourseWeeks(input: {
  termStartMonday: string;
  modules: Array<{ id: number; name: string }>;
  overrides?: ShellWeekMapOverride[];
}): { weeks: Array<{ index; monday; sunday; moduleIds; provenance }>; summary: ShellWeekResolutionSummary }

resolveSpotCheckWeeks(input: {
  termStartMonday: string;
  asOfDate: string;  // YYYY-MM-DD
  courseWeeks: ReturnType<typeof resolveCourseWeeks>['weeks'];
}): { currentWeekIndex: number; primaryWeek: ShellResolvedWeek; secondaryWeek: ShellResolvedWeek }
```

**`spot_check_preference.ts` contract:**

```ts
loadSpotCheckPreference(): SpotCheckPreference | null  // null = not configured
saveSpotCheckPreference(pref: Omit<SpotCheckPreference, 'updatedAt'>): SpotCheckPreference
// path: join(CC_HOME or ~/.command-and-control, 'spot-check.json'); mode 0o600; tmp+rename
```

| Peer | Rule |
| --- | --- |
| Live Canvas | Content + dates; module titles for inference |
| `termStartMonday` / `weekMapOverrides` | Hybrid C framing |
| Spot-check preference | Opt-in weekly day; **never** required for manual runs |
| `courseDir` | course-config week fields + nudges |
| Quiz engine | `validate_quiz` on weekly ritual (when enabled) + manual anytime; generate unchanged |

---

## Horizon anchor C+D (first-class)

### Week model

- A **course week** is **Monday → Sunday** (date-only `YYYY-MM-DD` in v1 tests).
- **Week 1** Monday = **`termStartMonday`** (required unless recoverable from course config).
- Week index `N` Monday = `termStartMonday + (N-1)*7 days`.

### Week map establishment — **Hybrid C** (locked)

| Layer | Behavior |
| --- | --- |
| **Default (happy path)** | Infer `moduleId → weekIndex` from live Canvas module titles matching `(?i)week\s*0*(\d+)` (e.g. `Week 1`, `Week 01`, `week 3 — Intro`). Date window for index `N` still comes from `termStartMonday`. |
| **Overrides** | Professor supplies `weekMapOverrides` (tool input and/or course config). Per week index: optional `moduleIds`, optional explicit `monday`/`sunday` (rare; default remains term-start arithmetic). |
| **Precedence** | For a given week index: **override wins** entirely over inference for that index’s module set (and date range if provided). Unmentioned indices stay inferred. |
| **Provenance** | Every resolved week carries `provenance: 'inferred' | 'override'`. v1: an override **replaces** that index’s entire `moduleIds` list (no mixed per-module provenance). |
| **Failure** | No `termStartMonday` → structured error + fix. Zero modules for primary/secondary after resolve → warning + empty scope (do not invent weeks). |

**Course-config week fields** (optional, via `courseDir`): `termStartMonday` + `weekMapOverrides` in `course-config.md` front matter only — no sidecar file in v1.

```yaml
termStartMonday: '2026-08-24'
weekMapOverrides:
  - index: 5
    label: Midterm week
    moduleIds: [101, 102]
```

Merge order: **tool args > course-config > title inference**.

If `courseDir` omits week fields, findings match a run without `courseDir` (test pin). If it has overrides, findings may differ — intentional.

### When the spot check fires — **opt-in weekly + manual anytime** (locked)

| Path | Behavior |
| --- | --- |
| **Manual** | Professor (or agent) calls `check_shell_readiness` **anytime**. No preference required. Honors `asOfDate` (default today). |
| **Weekly (opt-in)** | After prompt/setup, preference stores `weeklyCheckEnabled: true` + `weeklyCheckDay` (default **`saturday`**; professor may pick any weekday). Agents/docs say: on that day, run shell (+ `validate_quiz` call-out). |
| **Recommend** | Prompt copy **recommends Saturday** (“two days before the new week’s Monday”). |
| **OS/cron** | Fast-follow — preference + prompt + manual path ship in this design; installer launchd/Task Scheduler is **not** a v1 gate. |

**Week math (unchanged):** from `asOfDate`, `currentWeekIndex`; **secondary** = +1; **primary** = +2. Preferred fire day does **not** change which weeks are primary/secondary — it only drives the weekly reminder ritual.

**Example:** `asOfDate` = Saturday (or any day) while students are in **Week 1** → secondaryWeek=2 (lighter), primaryWeek=3 (thorough).

If weekly is enabled and `asOfDate`’s weekday ≠ `weeklyCheckDay`, report may set `cadenceNote` (“weekly preference is Saturday; this run is manual/off-day”) — never refuse the run.

### Preference persistence

```ts
// ~/.command-and-control/spot-check.json  (0o600, atomic write)
{
  "weeklyCheckEnabled": false,
  "weeklyCheckDay": "saturday",   // monday…sunday
  "updatedAt": "2026-08-26T12:00:00.000Z"
}
```

- **Global only in v1** — no course-scoped preference overlay (YAGNI).
- **No secrets.** `get_cc_status` → `{ configured, enabled, day }` only.
- **`setup_spot_check`** (dedicated tool):
  1. Returns prompt text recommending Saturday + Mon–Sun model.
  2. Writes `enabled` + `day` (default `saturday` when enabling and `day` omitted).
  3. Confirms manual `check_shell_readiness` still works anytime.
- Agent/tutorial: when Canvas is configured and preference file absent, prompt once to call `setup_spot_check`.

### Selection algorithm

1. Load preference (echo in report); load `termStartMonday` + overrides.
2. `fetchShellGraph` — titles for inference.
3. `resolveCourseWeeks` → map + provenance.
4. `currentWeekIndex` from `asOfDate`; secondary +1, primary +2.
5. Map-first scope + date-union orphans + mismatch pack.
6. Emit quiz id call-outs for `validate_quiz`.

Canvas dates: `due_at`, unlock/available_from, lock/available_until.

### Depth rules

| Pack | primaryWeek (thorough) | secondaryWeek (lighter) |
| --- | --- | --- |
| structure | full | ghost / unpublished / empty body; skip naming suggestions |
| schedule + **mismatch** | full | missing due + unlock/lock + clear mismatches |
| links | budget 100 | budget 25 |
| instructions heuristics | yes | placeholders + empty only |
| instructions LLM | opt-in + confirm | **never** |

---

## Source of truth split

| Concern | Authority |
| --- | --- |
| Mon–Sun window for week N | `termStartMonday` arithmetic (unless override supplies explicit monday/sunday) |
| Which modules belong to week N | **Hybrid:** title inference default; **`weekMapOverrides` win** per index |
| What students see | **Live Canvas** |
| Schedule vs intent | Canvas dates × resolved week window |

---

## Check packs (severity)

| Check | Severity |
| --- | --- |
| Ghost item | `blocking` |
| Graded item in scoped week missing `due_at` | `blocking` |
| Week map (inferred or override) vs due/unlock/lock outside Mon–Sun | `warning` |
| Dated in window but not on resolved map (orphan) | `suggestion` |
| Empty module / empty body / unpublished in scoped week | `warning` |
| No front page | `warning` (global) |
| Dead links | `warning` |
| Naming drift / failed title inference with empty overrides | `suggestion` (primary only) |
| Forced `moduleIds` conflict with override set | `warning` |

No auto-publish / date writes.

---

## Input / output contracts

```ts
export type ShellFindingSeverity = 'blocking' | 'warning' | 'suggestion';
export type ShellFindingPack = 'structure' | 'schedule' | 'links' | 'instructions' | 'mismatch';
export type ShellWeekRole = 'primary' | 'secondary';
export type ShellCheckDepth = 'thorough' | 'lighter';
export type ShellWeekday =
  | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
export type ShellWeekProvenance = 'inferred' | 'override';
export type ShellRunTrigger = 'manual' | 'weekly-suggested';

export interface SpotCheckPreference {
  weeklyCheckEnabled: boolean;
  weeklyCheckDay: ShellWeekday;  // default 'saturday' when enabling
  updatedAt: string;             // ISO
}

export interface ShellWeekMapOverride {
  index: number;
  label?: string;
  moduleIds?: number[];
  monday?: string;
  sunday?: string;
}

export interface CheckShellReadinessInput {
  courseId: string;
  /** YYYY-MM-DD. Default: today. Manual anytime. */
  asOfDate?: string;
  termStartMonday?: string;
  weekMapOverrides?: ShellWeekMapOverride[];
  packs?: ShellFindingPack[];
  senseCheck?: 'heuristics' | 'llm';
  confirm?: boolean;
  courseDir?: string;
  linkProbeBudget?: number;
  secondaryLinkProbeBudget?: number;
  moduleIds?: number[];
  forceWeekRole?: ShellWeekRole;
  /**
   * Optional: mark this invocation as the weekly ritual (agent sets when
   * following preference). Does not gate execution. Default: manual.
   */
  trigger?: ShellRunTrigger;
}

export interface SetupSpotCheckInput {
  enabled: boolean;
  /** Default saturday when enabling if omitted. */
  day?: ShellWeekday;
}

export interface ShellResolvedWeek {
  role: ShellWeekRole;
  depth: ShellCheckDepth;
  index: number;
  label: string;
  monday: string;
  sunday: string;
  moduleIds: number[];
  provenance: ShellWeekProvenance;
}

export interface ShellWeekResolutionSummary {
  termStartMonday: string;
  method: 'hybrid';
  inferredWeekCount: number;
  overrideWeekCount: number;
  inferencePattern: string;
  notes?: string[];
}

export interface ShellFinding {
  id: string;
  pack: ShellFindingPack;
  severity: ShellFindingSeverity;
  message: string;
  weekRole: ShellWeekRole;
  depth: ShellCheckDepth;
  weekIndex?: number;
  weekProvenance?: ShellWeekProvenance;
  moduleId?: number;
  moduleName?: string;
  itemId?: number;
  itemTitle?: string;
  url?: string;
  canvasDates?: {
    due_at?: string | null;
    unlock_at?: string | null;
    lock_at?: string | null;
  };
  confidence?: 'high' | 'low';
}

export interface ShellReadinessReport {
  courseId: number;
  courseName: string;
  source: 'live-canvas';
  framing: 'professor-week-map-hybrid';
  trigger: ShellRunTrigger;
  asOfDate: string;
  preference: {
    configured: boolean;
    enabled: boolean;
    day: ShellWeekday | null;
  };
  cadenceNote?: string;
  weekResolution: ShellWeekResolutionSummary;
  primaryWeek: ShellResolvedWeek;
  secondaryWeek: ShellResolvedWeek;
  /** Always present (may be empty). Agents run validate_quiz on these ids (validate-first). */
  quizCallouts: Array<{
    weekRole: ShellWeekRole;
    weekIndex: number;
    quizIds: number[];
    hint: string;
  }>;
  summary: {
    primary: { modules: number; items: number; blocking: number; warning: number; suggestion: number };
    secondary: { modules: number; items: number; blocking: number; warning: number; suggestion: number };
    mismatches: number;
    linksProbed: number;
    packsRun: ShellFindingPack[];
  };
  findings: ShellFinding[];
  text: string;
}

export type CheckShellReadinessResult =
  | ShellReadinessReport
  | { preview: true; message: string; fix: string[] }
  | { error: string; message: string; fix: string[] };
```

### Markdown outline

```markdown
## Shell readiness ({trigger}): {courseName}
asOfDate {asOfDate} · framing: hybrid week map · source: live Canvas
Weekly preference: {enabled|disabled} · day: {day|—} · {cadenceNote?}
Week resolution: … · termStartMonday …

### Primary week (thorough) — …
### Secondary week (lighter) — …
### Map ↔ Canvas mismatches
### Quizzes (call-out) — run validate_quiz (validate-first)
```

---

## MCP registration (`src/index.ts`)

### `check_shell_readiness`

Register with description covering: manual anytime; opt-in weekly via `setup_spot_check` (recommends Saturday); Hybrid weeks; primary/secondary depth; live Canvas; no weekly enablement required. `inputSchema` per `CheckShellReadinessInput` above (`courseId` required).

### `setup_spot_check`

Register per `SetupSpotCheckInput` (`enabled` required; `day` optional, default saturday when enabling). Persists `spot-check.json`. Does not install OS cron.

### `get_cc_status`

Add `spotCheck: { configured, enabled, day }` presence-only; extend existing no-secrets assertion.

CallTool cases + injectable preference deps for tests.

---

## Quiz tool family — composition (validate-first **C**, explicit)

Sibling claim owns quiz tools. **Sequencing locked:**

1. **`validate_quiz`** — ship/plan **first**; usable on weekly ritual and manual.
2. **`generate_quiz`** — same family, **after** validate in the quiz implementation plan; must not gate shell.

### What shell does (v1 = Shape A only)

1. Shell packs: quiz *items* → publish/due/unlock only.
2. Always populate **`quizCallouts`** for quizzes in primary/secondary weeks.
3. Weekly ritual (preference on): agent runs `check_shell_readiness` then **`validate_quiz`** for those ids (validate-first).
4. Manual: same; generate/validate never require weekly enablement.
5. Shell **does not** import or invoke quiz validation internals in v1 (Shape B deferred).

### Quiz orch must

- Import **`resolveCourseWeeks` / `resolveSpotCheckWeeks`** from `shell_ready/weeks.ts` when targeting a week.
- Read spot-check preference only to know the ritual day — never refuse manual `validate_quiz` / `generate_quiz`.
- Plan order: **validate_quiz → generate_quiz**.

---

## Test plan

1. Title inference + override precedence + provenance.
2. asOfDate in Week 1 → primaryWeek 3 / secondaryWeek 2 (any weekday).
3. Manual run succeeds when preference missing or `weeklyCheckEnabled: false`.
4. `setup_spot_check` default saturday; custom day; `get_cc_status.spotCheck` presence-only; file 0o600.
5. Off-day run with weekly enabled → `cadenceNote`; full report.
6. Missing `termStartMonday` → error/fix.
7. Mismatch / orphan / dual link budgets / secondary no LLM.
8. `courseDir` without week fields ≡ omit; with overrides changes scope.
9. `quizCallouts` always array; shell packs have zero quiz-rule imports.
10. Status/report serialization: no tokens/Bearer/API keys.

---

## Implementation sketch (next: writing-plans — not this turn)

1. `spot_check_preference.ts` + `setup_spot_check` + `get_cc_status.spotCheck`.
2. `weeks.ts` (+ hermetic tests) — shared helper before packs.
3. `check_shell_readiness` fetch + packs + `quizCallouts` + report.
4. Docs / tutorial prompt for Saturday opt-in.
5. OS/cron = separate fast-follow issue.

---

## Approval

- [x] Kevin approved design shape 2026-08-26 ~02:14.
- [x] Spec self-review complete → status **Approved for planning**.
- [ ] Next: `writing-plans` → `docs/superpowers/plans/2026-08-26-shell-readiness-engine.md`
- [ ] Then implement (not before plan).

---

## Self-review (this pass)

- [x] No TBD/TODO placeholders left unresolved.
- [x] Ambiguities fixed: preference path = `spot-check.json` only; setup = dedicated tool; composition = Shape A; `quizCallouts` required array; dead-link severity = warning; no mixed module provenance.
- [x] `weeks.ts` + preference persistence contracts explicit.
- [x] Quiz validate-first sequencing explicit for sibling orch.
- [x] Opt-in weekly + manual anytime locked.
- [x] YAGNI: no cron, no course-scoped preference, no Shape B, no sidecar week file, no soft-gate.