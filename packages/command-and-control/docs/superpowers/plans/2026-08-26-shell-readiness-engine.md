# Shell Readiness Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship C&C workflow tools `check_shell_readiness` + `setup_spot_check` that advisory-QC a live Canvas course shell for primary (+2 weeks) and secondary (+1 week) Mon–Sun windows, with Hybrid week-map resolution, opt-in weekly preference, and Shape A `quizCallouts`.

**Architecture:** New `src/tools/shell_ready/` library (types, weeks, preference, fetch, packs, format) + workflows mirroring `review_canvas_rubric` / `rubric/canvas_fetch.ts`. Canvas via `loadInstitutionConfig()` + injectable `fetchFn`. Hermetic vitest. Refuse off-origin `Link: rel="next"` (#124). Shape A quiz callouts only — no `validate_quiz` internals.

**Tech Stack:** TypeScript ESM (NodeNext), vitest, Node ≥20, `CC_HOME` / `getCcHomePath()`, atomic 0o600 JSON writes (same idiom as `setup_canvas.ts`).

**Spec:** [`../specs/2026-08-26-shell-readiness-engine-design.md`](../specs/2026-08-26-shell-readiness-engine-design.md) (Approved).

## Global Constraints

- Institution scrub: fixtures use `example.instructure.com` / `canvas.example.edu` only — never real school hosts/tokens.
- Bearer token only on Canvas origin; refuse off-origin `Link: rel="next"` (throw `CANVAS_PAGINATION_OFF_HOST`).
- Presence-only in `get_cc_status.spotCheck`; never echo tokens/hosts/file contents.
- Manual `check_shell_readiness` never requires `weeklyCheckEnabled`.
- No merge to main / no npm publish from this worktree.
- Disjoint from quiz engine (`WT-ct-quiz-engine`).
- Advisory v1: `blocking` is severity priority, not a hard stop.
- Commit on branch `WT-ct-shell-ready` only.

## File Structure

| File | Responsibility |
| --- | --- |
| `src/tools/shell_ready/types.ts` | Spec contracts + `WEEK_TITLE_RE` |
| `src/tools/shell_ready/weeks.ts` | `resolveCourseWeeks`, `resolveSpotCheckWeeks` (shared with quiz orch later) |
| `src/tools/shell_ready/spot_check_preference.ts` | load/save `~/.command-and-control/spot-check.json` |
| `src/tools/shell_ready/fetch_graph.ts` | Live Canvas shell graph (injectable fetch, same-origin pagination) |
| `src/tools/shell_ready/packs/structure.ts` | Ghost / unpublished / empty |
| `src/tools/shell_ready/packs/schedule.ts` | Missing due / unlock-lock |
| `src/tools/shell_ready/packs/mismatch.ts` | Map ↔ Canvas date window mismatches + orphans |
| `src/tools/shell_ready/packs/links.ts` | Dead-link findings (budgeted) |
| `src/tools/shell_ready/packs/instructions.ts` | Placeholder / empty heuristics |
| `src/tools/shell_ready/probe_links.ts` | Anonymous off-origin HEAD/GET probes (no Bearer) |
| `src/tools/shell_ready/format_report.ts` | Markdown `text` + summary counts |
| `src/tools/shell_ready/quiz_callouts.ts` | Collect quiz ids in band → callouts |
| `src/tools/workflows/setup_spot_check.ts` | MCP setup tool |
| `src/tools/workflows/check_shell_readiness.ts` | Orchestrator |
| `src/tools/get_cc_status.ts` | Add `spotCheck` field |
| `src/index.ts` | Register + dispatch |
| `tests/tools/shell_ready/*.test.ts` | Hermetic unit tests |
| `tests/tools/workflows/check_shell_readiness.test.ts` | Orchestrator tests |
| `tests/tools/workflows/setup_spot_check.test.ts` | Setup tool tests |

---

### Task 1: Types + weeks resolver (TDD)

**Files:**
- Create: `packages/command-and-control/src/tools/shell_ready/types.ts`
- Create: `packages/command-and-control/src/tools/shell_ready/weeks.ts`
- Test: `packages/command-and-control/tests/tools/shell_ready/weeks.test.ts`

**Interfaces:**
- Produces: `resolveCourseWeeks`, `resolveSpotCheckWeeks`, `CourseWeekResolved`, `ShellResolvedWeek`, all report types from spec.

- [ ] **Step 1: Write the failing test**

```ts
// tests/tools/shell_ready/weeks.test.ts
import { describe, it, expect } from 'vitest';
import { resolveCourseWeeks, resolveSpotCheckWeeks } from '../../../src/tools/shell_ready/weeks.js';

describe('resolveCourseWeeks', () => {
  const termStartMonday = '2026-08-24';

  it('infers week indices from Week N titles', () => {
    const { weeks, summary } = resolveCourseWeeks({
      termStartMonday,
      modules: [
        { id: 10, name: 'Week 1 — Intro' },
        { id: 20, name: 'Week 02' },
        { id: 30, name: 'Resources' },
      ],
    });
    expect(summary.method).toBe('hybrid');
    expect(weeks.find(w => w.index === 1)?.moduleIds).toEqual([10]);
    expect(weeks.find(w => w.index === 1)?.monday).toBe('2026-08-24');
    expect(weeks.find(w => w.index === 1)?.sunday).toBe('2026-08-30');
    expect(weeks.find(w => w.index === 2)?.moduleIds).toEqual([20]);
  });

  it('lets overrides win over inference for that index', () => {
    const { weeks } = resolveCourseWeeks({
      termStartMonday,
      modules: [{ id: 10, name: 'Week 2 — Old' }, { id: 99, name: 'Special' }],
      overrides: [{ index: 2, moduleIds: [99], label: 'Override week' }],
    });
    const w2 = weeks.find(w => w.index === 2)!;
    expect(w2.moduleIds).toEqual([99]);
    expect(w2.provenance).toBe('override');
  });
});

describe('resolveSpotCheckWeeks', () => {
  it('maps Saturday in week 1 to secondary=2 primary=3', () => {
    const termStartMonday = '2026-08-24';
    const { weeks } = resolveCourseWeeks({
      termStartMonday,
      modules: [
        { id: 1, name: 'Week 1' },
        { id: 2, name: 'Week 2' },
        { id: 3, name: 'Week 3' },
      ],
    });
    const spot = resolveSpotCheckWeeks({
      termStartMonday,
      asOfDate: '2026-08-29',
      courseWeeks: weeks,
    });
    expect(spot.currentWeekIndex).toBe(1);
    expect(spot.secondaryWeek.index).toBe(2);
    expect(spot.secondaryWeek.depth).toBe('lighter');
    expect(spot.primaryWeek.index).toBe(3);
    expect(spot.primaryWeek.depth).toBe('thorough');
    expect(spot.primaryWeek.monday).toBe('2026-09-07');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/command-and-control && npx vitest run tests/tools/shell_ready/weeks.test.ts`
Expected: FAIL — cannot find module `weeks.js`.

- [ ] **Step 3: Write minimal implementation**

Implement `types.ts` (all types from spec § Input/output contracts) and `weeks.ts`:
- `WEEK_TITLE_RE = /week\s*0*(\d+)/i`
- Date-only UTC arithmetic for Mon–Sun bounds
- `resolveCourseWeeks`: infer from titles, then apply overrides (replace entire week)
- `resolveSpotCheckWeeks`: current = week containing `asOfDate`; secondary = +1; primary = +2; empty `moduleIds` when week unknown (do not invent modules)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/tools/shell_ready/weeks.test.ts` → PASS

- [ ] **Step 5: Commit**

```bash
git add packages/command-and-control/src/tools/shell_ready/types.ts \
  packages/command-and-control/src/tools/shell_ready/weeks.ts \
  packages/command-and-control/tests/tools/shell_ready/weeks.test.ts \
  packages/command-and-control/docs/superpowers/specs/2026-08-26-shell-readiness-engine-design.md \
  packages/command-and-control/docs/superpowers/plans/2026-08-26-shell-readiness-engine.md
git commit -m "$(cat <<'EOF'
feat(shell-ready): Hybrid week resolver + types

Shared resolveCourseWeeks / resolveSpotCheckWeeks for shell and quiz orch.
EOF
)"
```

---

### Task 2: Spot-check preference + setup_spot_check + get_cc_status.spotCheck

**Files:**
- Create: `packages/command-and-control/src/tools/shell_ready/spot_check_preference.ts`
- Create: `packages/command-and-control/src/tools/workflows/setup_spot_check.ts`
- Modify: `packages/command-and-control/src/tools/get_cc_status.ts`
- Test: `packages/command-and-control/tests/tools/shell_ready/spot_check_preference.test.ts`
- Test: `packages/command-and-control/tests/tools/workflows/setup_spot_check.test.ts`
- Modify: `packages/command-and-control/tests/tools/get_cc_status.test.ts`

**Interfaces:**
- Consumes: `SpotCheckPreference`, `ShellWeekday`, `SetupSpotCheckInput` from types
- Produces: `loadSpotCheckPreference()`, `saveSpotCheckPreference()`, `setupSpotCheck()`, `GetCcStatusResult.spotCheck`

- [ ] **Step 1: Write failing preference tests**

```ts
// tests/tools/shell_ready/spot_check_preference.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadSpotCheckPreference,
  saveSpotCheckPreference,
} from '../../../src/tools/shell_ready/spot_check_preference.js';

let tmpHome: string;
beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'cc-spot-'));
  process.env.CC_HOME = tmpHome;
});
afterEach(() => {
  delete process.env.CC_HOME;
  rmSync(tmpHome, { recursive: true, force: true });
});

describe('spot_check_preference', () => {
  it('returns null when file absent', () => {
    expect(loadSpotCheckPreference()).toBeNull();
  });

  it('saves enabled saturday by default and loads back', () => {
    const saved = saveSpotCheckPreference({
      weeklyCheckEnabled: true,
      weeklyCheckDay: 'saturday',
    });
    expect(saved.weeklyCheckEnabled).toBe(true);
    expect(saved.weeklyCheckDay).toBe('saturday');
    expect(saved.updatedAt).toMatch(/^\d{4}-/);
    expect(loadSpotCheckPreference()).toEqual(saved);
    const mode = statSync(join(tmpHome, 'spot-check.json')).mode & 0o777;
    expect(mode).toBe(0o600);
  });
});
```

- [ ] **Step 2: Run — expect FAIL (module missing)**

- [ ] **Step 3: Implement preference**

```ts
// src/tools/shell_ready/spot_check_preference.ts
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getCcHomePath } from '../../kb/config.js';
import type { SpotCheckPreference, ShellWeekday } from './types.js';

const WEEKDAYS = new Set<ShellWeekday>([
  'monday','tuesday','wednesday','thursday','friday','saturday','sunday',
]);

export function spotCheckPreferencePath(): string {
  return join(getCcHomePath(), 'spot-check.json');
}

export function loadSpotCheckPreference(): SpotCheckPreference | null {
  const p = spotCheckPreferencePath();
  if (!existsSync(p)) return null;
  const raw = JSON.parse(readFileSync(p, 'utf-8')) as Partial<SpotCheckPreference>;
  if (typeof raw.weeklyCheckEnabled !== 'boolean') return null;
  const day = raw.weeklyCheckDay;
  if (!day || !WEEKDAYS.has(day)) return null;
  return {
    weeklyCheckEnabled: raw.weeklyCheckEnabled,
    weeklyCheckDay: day,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date(0).toISOString(),
  };
}

export function saveSpotCheckPreference(
  pref: Omit<SpotCheckPreference, 'updatedAt'>,
): SpotCheckPreference {
  const home = getCcHomePath();
  mkdirSync(home, { recursive: true });
  const full: SpotCheckPreference = {
    weeklyCheckEnabled: pref.weeklyCheckEnabled,
    weeklyCheckDay: pref.weeklyCheckDay,
    updatedAt: new Date().toISOString(),
  };
  const p = spotCheckPreferencePath();
  const tmp = `${p}.tmp`;
  writeFileSync(tmp, JSON.stringify(full, null, 2), { encoding: 'utf-8', mode: 0o600 });
  renameSync(tmp, p);
  return full;
}
```

- [ ] **Step 4: setup_spot_check workflow + tests**

```ts
// src/tools/workflows/setup_spot_check.ts
import type { SetupSpotCheckInput, SpotCheckPreference, ShellWeekday } from '../shell_ready/types.js';
import { saveSpotCheckPreference } from '../shell_ready/spot_check_preference.js';

export interface SetupSpotCheckResult {
  preference: SpotCheckPreference;
  prompt: string;
  message: string;
}

const PROMPT =
  'Recommended: enable a weekly shell spot-check on Saturday (two days before the new week\'s Monday). ' +
  'Weeks are Monday–Sunday. Manual check_shell_readiness still works anytime without enabling weekly.';

export function setupSpotCheck(input: SetupSpotCheckInput): SetupSpotCheckResult {
  const day: ShellWeekday =
    input.day ?? (input.enabled ? 'saturday' : 'saturday');
  const preference = saveSpotCheckPreference({
    weeklyCheckEnabled: input.enabled,
    weeklyCheckDay: day,
  });
  return {
    preference,
    prompt: PROMPT,
    message: input.enabled
      ? `Weekly spot-check enabled for ${preference.weeklyCheckDay}. Manual check_shell_readiness still works anytime.`
      : `Weekly spot-check disabled. Manual check_shell_readiness still works anytime.`,
  };
}
```

- [ ] **Step 5: Extend get_cc_status**

Add to `GetCcStatusResult`:

```ts
spotCheck: {
  configured: boolean;
  enabled: boolean;
  day: ShellWeekday | null;
};
```

In `getCcStatus()`:

```ts
const pref = loadSpotCheckPreference();
// ...
spotCheck: {
  configured: pref !== null,
  enabled: pref?.weeklyCheckEnabled ?? false,
  day: pref?.weeklyCheckDay ?? null,
},
```

Test: after saving preference, `spotCheck.configured === true`; `JSON.stringify(status)` must not contain secrets (extend existing assertion file — spot-check has no secrets but assert `day` is weekday string only).

- [ ] **Step 6: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(shell-ready): spot-check preference + setup_spot_check

Persist opt-in weekly day in spot-check.json; echo presence-only via get_cc_status.
EOF
)"
```

---

### Task 3: Canvas shell graph fetch + structure/schedule/mismatch packs

**Files:**
- Create: `src/tools/shell_ready/fetch_graph.ts`
- Create: `src/tools/shell_ready/packs/structure.ts`
- Create: `src/tools/shell_ready/packs/schedule.ts`
- Create: `src/tools/shell_ready/packs/mismatch.ts`
- Tests under `tests/tools/shell_ready/`

**Interfaces:**
- Consumes: `CanvasCfg` shape `{ canvasUrl, apiToken }` from `loadInstitutionConfig`
- Produces: `ShellGraph`, `fetchShellGraph()`, pack runners returning `ShellFinding[]`

**ShellGraph shape (minimal):**

```ts
export interface ShellGraphItem {
  id: number;
  title: string;
  type: string; // Assignment | Quiz | Page | Discussion | File | SubHeader | ExternalUrl | …
  published?: boolean;
  html_url?: string;
  content_id?: number;
  // enriched from assignment/quiz/page fetch when available:
  due_at?: string | null;
  unlock_at?: string | null;
  lock_at?: string | null;
  body?: string | null;
  points_possible?: number | null;
  graded?: boolean;
}
export interface ShellGraphModule {
  id: number;
  name: string;
  published?: boolean;
  items: ShellGraphItem[];
}
export interface ShellGraph {
  courseId: number;
  courseName: string;
  modules: ShellGraphModule[];
  frontPage?: { url?: string; title?: string } | null;
}
```

- [ ] **Step 1: Failing fetch tests** — injectable `fetchFn`; modules+items; refuse off-origin next Link; same-origin pagination concatenates.

Pattern (copy from `snapshot/fetch_snapshot.ts` `assertSameOrigin`):

```ts
function assertSameOrigin(nextUrl: string, expectedOrigin: string): string {
  let next: URL;
  try { next = new URL(nextUrl); }
  catch {
    throw new Error('CANVAS_PAGINATION_OFF_HOST: unparseable Link next');
  }
  if (next.origin !== expectedOrigin) {
    throw new Error(`CANVAS_PAGINATION_OFF_HOST: refusing ${next.origin}`);
  }
  return next.toString();
}
```

Endpoints (GET, Bearer):
- `/api/v1/courses/:id`
- `/api/v1/courses/:id/modules?include[]=items&per_page=100`
- For graded enrichment (assignments): `/api/v1/courses/:id/assignments?per_page=100` (map by id onto items)
- Optional front page: `/api/v1/courses/:id/front_page` (404 → null)

- [ ] **Step 2: Implement fetch_graph.ts**

- [ ] **Step 3: Pack tests + impl**

| Pack | Key findings |
| --- | --- |
| structure | ghost unpublished item → `blocking`; empty module → `warning`; no front page → `warning` (global, attach to primary) |
| schedule | graded item missing `due_at` → `blocking`; clear unlock/lock issues → `warning` (lighter: missing due + clear unlock/lock only) |
| mismatch | due/unlock/lock date outside Mon–Sun for mapped module → `warning`; dated-in-window orphan not on map → `suggestion` |

Each pack: `(ctx: { week: ShellResolvedWeek; graph: ShellGraph; depth }) => ShellFinding[]`

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(shell-ready): fetch shell graph + structure/schedule/mismatch packs

Same-origin Link pagination; advisory findings for primary/secondary weeks.
EOF
)"
```

---

### Task 4: Minimal check_shell_readiness + quizCallouts + MCP registration

**Priority slice:** even before packs are deep, orchestrator must return a full `ShellReadinessReport` with primary/secondary weeks, empty `findings`/`quizCallouts` arrays, preference echo, and markdown `text`.

**Files:**
- Create: `src/tools/shell_ready/format_report.ts`
- Create: `src/tools/shell_ready/quiz_callouts.ts`
- Create: `src/tools/workflows/check_shell_readiness.ts`
- Modify: `src/index.ts`
- Test: `tests/tools/workflows/check_shell_readiness.test.ts`

**Interfaces:**
- Consumes: weeks, preference, fetchShellGraph, packs
- Produces: `checkShellReadiness(input, deps?)` → `CheckShellReadinessResult`

- [ ] **Step 1: Failing orchestrator test**

```ts
it('manual run returns primary/secondary weeks with empty findings when packs empty', async () => {
  const result = await checkShellReadiness(
    {
      courseId: '42',
      asOfDate: '2026-08-29',
      termStartMonday: '2026-08-24',
      packs: [], // no packs
    },
    {
      fetchGraph: async () => ({
        courseId: 42,
        courseName: 'Example Course',
        modules: [
          { id: 1, name: 'Week 1', items: [] },
          { id: 2, name: 'Week 2', items: [] },
          { id: 3, name: 'Week 3', items: [] },
        ],
      }),
      loadPreference: () => null,
    },
  );
  expect('error' in result).toBe(false);
  if ('error' in result || 'preview' in result) return;
  expect(result.primaryWeek.index).toBe(3);
  expect(result.secondaryWeek.index).toBe(2);
  expect(result.findings).toEqual([]);
  expect(result.quizCallouts).toEqual([]);
  expect(result.trigger).toBe('manual');
  expect(result.preference.configured).toBe(false);
  expect(result.source).toBe('live-canvas');
});

it('missing termStartMonday returns structured error', async () => {
  const result = await checkShellReadiness(
    { courseId: '42', asOfDate: '2026-08-29' },
    { fetchGraph: async () => ({ courseId: 42, courseName: 'X', modules: [] }), loadPreference: () => null },
  );
  expect('error' in result && result.error).toBe('TERM_START_REQUIRED');
});
```

- [ ] **Step 2: Implement orchestrator**

```ts
export interface CheckShellReadinessDeps {
  fetchGraph?: (courseId: string) => Promise<ShellGraph>;
  loadPreference?: () => SpotCheckPreference | null;
  // packs injectable later
}

export async function checkShellReadiness(
  input: CheckShellReadinessInput,
  deps: CheckShellReadinessDeps = {},
): Promise<CheckShellReadinessResult> {
  // 1. preference echo
  // 2. termStartMonday from input (courseDir front matter later)
  // 3. fetch graph
  // 4. resolveCourseWeeks + resolveSpotCheckWeeks
  // 5. run packs (default all; empty list = skip)
  // 6. quizCallouts from Quiz items in primary/secondary modules
  // 7. format text + summary
}
```

Default `fetchGraph`: `loadInstitutionConfig()` → `fetchShellGraph`.

Cadence note: if preference enabled and `asOfDate` weekday ≠ `weeklyCheckDay`, set `cadenceNote`.

- [ ] **Step 3: quiz_callouts.ts**

For each of primary/secondary, collect item `type === 'Quiz'` content ids (or item ids) in scoped modules → `{ weekRole, weekIndex, quizIds, hint: 'Run validate_quiz (validate-first) for these quiz ids.' }`. Always return array (may be empty entries omitted or empty quizIds — prefer omit empty; report field always present as `[]` if none).

- [ ] **Step 4: Register in `src/index.ts`**

Add tool defs after `review_canvas_rubric`:
- `check_shell_readiness` — description covers manual anytime, `setup_spot_check`, Hybrid weeks, live Canvas
- `setup_spot_check` — `enabled` required, `day` optional

Dispatch cases calling `checkShellReadiness` / `setupSpotCheck`.

- [ ] **Step 5: Run tests + build**

```bash
npx vitest run tests/tools/shell_ready tests/tools/workflows/check_shell_readiness.test.ts tests/tools/workflows/setup_spot_check.test.ts tests/tools/get_cc_status.test.ts
npm run build --workspace=packages/command-and-control
```

- [ ] **Step 6: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(shell-ready): check_shell_readiness workflow + MCP registration

Minimal report with week framing; packs deepen findings; Shape A quizCallouts.
EOF
)"
```

---

### Task 5: Links + instructions packs (deepen)

**Files:** `probe_links.ts`, `packs/links.ts`, `packs/instructions.ts`, tests

- Primary link budget default 100; secondary 25
- Probes: no Bearer header; 404 → `warning`
- Instructions: placeholders (`TODO`, `TBD`, lorem) + empty body; LLM path deferred (confirm gate) — secondary never LLM
- Commit separately

---

### Task 6: courseDir week fields + polish

- Read `termStartMonday` / `weekMapOverrides` from `course-config.md` front matter when `courseDir` set
- Merge: tool args > course-config > inference
- Pin: courseDir without week fields ≡ omit `courseDir`
- Off-day cadenceNote test
- Serialization scrub: no Bearer/token in report JSON

---

### Task 7: Overnight fold

Append status to:
- `~/.baton/overnight/report-canvas-toolchain.md`
- `~/.baton/overnight/swarm/out/ct-orch-shell-ready.md`

List files created, tests run, commit SHAs, remaining work.

---

## Out of scope

- `validate_quiz` / `generate_quiz` (sibling)
- OS/cron installer nudge
- Soft-gate publish
- Shape B internal validate compose
- Course-scoped preference

## Spec coverage self-check

| Spec requirement | Task |
| --- | --- |
| Hybrid weeks + provenance | 1 |
| primary +2 / secondary +1 | 1, 4 |
| spot-check.json + setup + status | 2 |
| live Canvas fetch + off-origin refuse | 3 |
| structure/schedule/mismatch | 3 |
| links/instructions budgets | 5 |
| check_shell_readiness + quizCallouts + index | 4 |
| courseDir week fields | 6 |
| Manual without weekly enable | 4 |
| Advisory / no auto-write Canvas | all |
