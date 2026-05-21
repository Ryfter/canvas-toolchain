# `analyze_course` + Trajectory Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire CI's full analysis pipeline (ingest + diff + currency + verdicts) into `analyze_course`, add an append-only trajectory log per course, surface trajectory data as advisory verdict annotations, and rewrite C&C's `analyze_course` workflow to layer in external signals (RSS, web search, transcripts) without polluting the trajectory entry.

**Architecture:** Two new CI primitives (`analyzeCourse` high-level tool, `getCourseTrajectory` read tool) backed by a `trajectory.ts` KB module that owns `history.jsonl`. Trajectory data influences verdict *rationale only* — `currencyClass` and verdict letter stay deterministic. C&C's workflow orchestrates external-signal merging after CI's analysis writes the trajectory entry.

**Tech Stack:** TypeScript (Node 18+, ESM), Vitest, MCP SDK 1.x. Two repos: `D:\Dev\Curriculum-Intelligence` (the bulk) and `D:\Dev\Command-and-Control-MCP` (workflow rewrite).

**Spec:** `docs/superpowers/specs/2026-05-20-analyze-course-and-trajectory-log-design.md` (same repo).

---

## Reality check before starting

Before any task, the implementer must verify against the actual codebase:

1. **`diffSemesters` signature** uses `leftSemesterId` and `rightSemesterId` (NOT `semesterA`/`semesterB`). Returns a `DiffSemestersResult` with `modules`, `assignments`, `pages`, `resources` (each with their own added/removed shape). There is NO top-level `added`/`dropped`/`renamed`. Read `src/tools/diff_semesters.ts` before using.

2. **`recommendForTopic` signature** takes `{ courseId, semesterId, topic, currencyClass, lastTaughtSemesterId, newsHits, includeDetails? }` and returns `{ topic, verdict, rationale, details? }`. Note `lastTaughtSemesterId` (not `lastTaughtSemester`) and absence of `semestersSince` from input (it's computed inside). Read `src/tools/recommend_for_topic.ts` before using.

3. **`scoreTopicCurrency`** has overloaded sync/async return. Read `src/tools/score_topic_currency.ts` before using.

4. **`TopicMap` shape** has no `topics` field. Fields are `course`, `modules`, `assignments`, `pages`, `discussions`, `quizzes`, `resourceLinks`. The trajectory unit is `assignments` (always) plus optional LLM-extracted concepts. Read `src/types.ts` for the full shape.

If anything in the code samples below conflicts with the actual source, **trust the source**. Adjust the implementation; surface the conflict in your task report.

---

## Task 1: Trajectory types

**Files:**
- Modify: `D:\Dev\Curriculum-Intelligence\src\types.ts`

- [ ] **Step 1: Add the types**

Note: `Verdict` already exists in `src/tools/recommend_for_topic.ts`. Re-export it from `types.ts` or import where needed; do not duplicate the literal union.

```typescript
// Append to src/types.ts:
import type { Verdict } from './tools/recommend_for_topic.js'; // re-export for convenience
export type { Verdict };

// If a circular-import issue arises, instead inline the union and remove its definition
// from recommend_for_topic.ts (have that file import from types.ts).

export type TrajectoryFlag =
  | 'new'             // first time we've seen this topic
  | 'stable'          // unchanged over 2-3 runs (not yet 4)
  | 'stabilising'     // changed once over last 3 runs
  | 'unstable'        // changed >=2 times in last 4 runs
  | 'true-evergreen'; // KEEP for last 4+ consecutive runs

export interface PerTopicTrajectory {
  /** Either an assignment.name verbatim, or an LLM-extracted concept name. */
  topic: string;
  verdict: Verdict;
  currencyClass: 'evergreen' | 'current' | 'dated';
  newsHitCount: number;
  trajectoryFlag: TrajectoryFlag;
  verdictPrior: Verdict | null;
  verdictHistory: Verdict[];               // chronological, last up to 4
  /** Only present on perConcept entries. */
  relatedAssignments?: string[];
}

/**
 * Mirrors the SemesterDiff shape from diff_semesters.ts.
 * baselineSemester is the prior semester being compared against.
 */
export interface TrajectoryDiff {
  baselineSemester: SemesterId;
  modules: {
    added: { name: string; position: number }[];
    removed: { name: string; position: number }[];
    common: { leftName: string; rightName: string }[];
  };
  assignments: {
    added: { name: string; pointsPossible: number | null }[];
    removed: { name: string; pointsPossible: number | null }[];
    reusedVerbatim: { name: string; pointsPossible: number | null }[];
    rewritten: { name: string; leftExcerpt: string; rightExcerpt: string }[];
  };
  pages: {
    added: { url: string; title: string }[];
    removed: { url: string; title: string }[];
    commonCount: number;
  };
  resources: {
    added: string[];
    removed: string[];
  };
}

export interface TrajectoryEntry {
  schemaVersion: 1;
  timestamp: string;
  courseId: CourseId;
  semesterId: SemesterId;
  priorSemesters: {
    sameSeason: SemesterId | null;
    mostRecent: SemesterId | null;
  };
  assignmentCount: number;
  verdicts: Record<Verdict, number>;       // counts across perAssignment only
  perAssignment: PerTopicTrajectory[];     // always populated
  perConcept?: PerTopicTrajectory[];       // optional, only when concept extraction ran
  diff: {
    sameSeason: TrajectoryDiff | null;
    mostRecent: TrajectoryDiff | null;
  };
}
```

- [ ] **Step 2: Verify build**

Run: `cd D:\Dev\Curriculum-Intelligence && npm run build`
Expected: clean compile, no errors.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: add trajectory log types"
```

---

## Task 2: Trajectory flag computation

**Files:**
- Create: `D:\Dev\Curriculum-Intelligence\src\kb\trajectory.ts`
- Create: `D:\Dev\Curriculum-Intelligence\tests\kb\trajectory.test.ts`

- [ ] **Step 1: Write failing tests for `computeTrajectoryFlag`**

```typescript
// tests/kb/trajectory.test.ts
import { describe, expect, test } from 'vitest';
import { computeTrajectoryFlag } from '../../src/kb/trajectory.js';
import type { Verdict } from '../../src/types.js';

describe('computeTrajectoryFlag', () => {
  test('new — single verdict on record', () => {
    expect(computeTrajectoryFlag(['KEEP'])).toBe('new');
  });

  test('true-evergreen — 4+ consecutive KEEP', () => {
    expect(computeTrajectoryFlag(['KEEP', 'KEEP', 'KEEP', 'KEEP'])).toBe('true-evergreen');
    expect(computeTrajectoryFlag(['KEEP', 'KEEP', 'KEEP', 'KEEP', 'KEEP'])).toBe('true-evergreen');
  });

  test('stable — unchanged over 2-3 runs, not yet 4', () => {
    expect(computeTrajectoryFlag(['KEEP', 'KEEP'])).toBe('stable');
    expect(computeTrajectoryFlag(['UPDATE', 'UPDATE', 'UPDATE'])).toBe('stable');
  });

  test('stable — 4+ unchanged but not KEEP (not true-evergreen)', () => {
    expect(computeTrajectoryFlag(['UPDATE', 'UPDATE', 'UPDATE', 'UPDATE'])).toBe('stable');
  });

  test('stabilising — changed once over last 3 runs', () => {
    expect(computeTrajectoryFlag(['KEEP', 'UPDATE', 'UPDATE'])).toBe('stabilising');
    expect(computeTrajectoryFlag(['UPDATE', 'KEEP', 'KEEP'])).toBe('stabilising');
  });

  test('unstable — changed >=2 times in last 4 runs', () => {
    expect(computeTrajectoryFlag(['KEEP', 'UPDATE', 'KEEP', 'UPDATE'])).toBe('unstable');
    expect(computeTrajectoryFlag(['KEEP', 'UPDATE', 'KEEP'])).toBe('unstable');
  });

  test('considers only last 4 verdicts for unstable detection', () => {
    // 5 old changes ignored, last 4 are stable KEEPs
    const history: Verdict[] = ['UPDATE', 'KEEP', 'UPDATE', 'KEEP', 'KEEP', 'KEEP', 'KEEP', 'KEEP'];
    expect(computeTrajectoryFlag(history)).toBe('true-evergreen');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd D:\Dev\Curriculum-Intelligence && npx vitest run tests/kb/trajectory.test.ts`
Expected: FAIL — module `../../src/kb/trajectory.js` does not exist.

- [ ] **Step 3: Implement `computeTrajectoryFlag`**

```typescript
// src/kb/trajectory.ts
import type { TrajectoryFlag, Verdict } from '../types.js';

/**
 * Compute the trajectory flag for a topic given its chronological verdict history.
 * History is ordered oldest → newest. The most recent verdict (last element) is the current run.
 *
 * Flag rules (checked in this order — first match wins):
 *   - 1 verdict           → 'new'
 *   - last 4+ all KEEP    → 'true-evergreen'
 *   - last 4 with 2+ changes between adjacent pairs → 'unstable'
 *   - last 3 with exactly 1 change between adjacent pairs → 'stabilising'
 *   - last >=2 unchanged (and not true-evergreen) → 'stable'
 *   - fallback when <3 verdicts but a change is present → 'unstable'
 */
export function computeTrajectoryFlag(history: Verdict[]): TrajectoryFlag {
  if (history.length === 0) {
    throw new Error('computeTrajectoryFlag called with empty history');
  }
  if (history.length === 1) return 'new';

  const last4 = history.slice(-4);
  if (last4.length >= 4 && last4.every((v) => v === 'KEEP')) {
    return 'true-evergreen';
  }

  const changesInLast4 = countAdjacentChanges(last4);
  if (changesInLast4 >= 2) return 'unstable';

  const last3 = history.slice(-3);
  if (last3.length === 3 && countAdjacentChanges(last3) === 1) return 'stabilising';

  if (changesInLast4 === 0) return 'stable';
  return 'unstable';
}

function countAdjacentChanges(verdicts: Verdict[]): number {
  let n = 0;
  for (let i = 1; i < verdicts.length; i++) {
    if (verdicts[i] !== verdicts[i - 1]) n++;
  }
  return n;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/kb/trajectory.test.ts`
Expected: all 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/kb/trajectory.ts tests/kb/trajectory.test.ts
git commit -m "feat: trajectory flag computation"
```

---

## Task 3: Trajectory aggregate computations

**Files:**
- Modify: `D:\Dev\Curriculum-Intelligence\src\kb\trajectory.ts`
- Modify: `D:\Dev\Curriculum-Intelligence\tests\kb\trajectory.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `tests/kb/trajectory.test.ts`:

```typescript
import {
  computeChurnRate, identifyUnstableTopics, identifyTrueEvergreens,
} from '../../src/kb/trajectory.js';
import type { TrajectoryEntry, PerTopicTrajectory } from '../../src/types.js';

function makeEntry(semester: string, perAssignment: PerTopicTrajectory[]): TrajectoryEntry {
  return {
    schemaVersion: 1,
    timestamp: `2026-01-01T00:00:00.000Z`,
    courseId: 'TEST',
    semesterId: semester,
    priorSemesters: { sameSeason: null, mostRecent: null },
    assignmentCount: perAssignment.length,
    verdicts: { KEEP: 0, UPDATE: 0, DROP: 0, ADD: 0 },
    perAssignment,
    diff: { sameSeason: null, mostRecent: null },
  };
}

function pt(topic: string, history: Verdict[]): PerTopicTrajectory {
  return {
    topic, verdict: history[history.length - 1], currencyClass: 'current',
    newsHitCount: 0, trajectoryFlag: 'new', verdictPrior: null,
    verdictHistory: history,
  };
}

describe('computeChurnRate', () => {
  test('zero churn when verdicts unchanged across runs', () => {
    const entries = [
      makeEntry('S25', [pt('A', ['KEEP']), pt('B', ['KEEP'])]),
      makeEntry('F25', [pt('A', ['KEEP', 'KEEP']), pt('B', ['KEEP', 'KEEP'])]),
      makeEntry('S26', [pt('A', ['KEEP', 'KEEP', 'KEEP']), pt('B', ['KEEP', 'KEEP', 'KEEP'])]),
    ];
    expect(computeChurnRate(entries)).toBe(0);
  });

  test('half churn when half the topics change verdict each run', () => {
    const entries = [
      makeEntry('S25', [pt('A', ['KEEP']), pt('B', ['KEEP'])]),
      makeEntry('F25', [pt('A', ['KEEP', 'UPDATE']), pt('B', ['KEEP', 'KEEP'])]),
    ];
    // 1 of 2 topics changed = 0.5 churn between S25 and F25; averaged = 0.5
    expect(computeChurnRate(entries)).toBe(0.5);
  });

  test('zero churn when only one entry exists', () => {
    const entries = [makeEntry('S25', [pt('A', ['KEEP'])])];
    expect(computeChurnRate(entries)).toBe(0);
  });
});

describe('identifyUnstableTopics', () => {
  test('returns topics with >=2 verdict changes in last 4 runs', () => {
    const entries = [
      makeEntry('S26', [
        pt('Stable', ['KEEP', 'KEEP', 'KEEP', 'KEEP']),
        pt('Unstable', ['KEEP', 'UPDATE', 'KEEP', 'UPDATE']),
      ]),
    ];
    expect(identifyUnstableTopics(entries)).toEqual(['Unstable']);
  });
});

describe('identifyTrueEvergreens', () => {
  test('returns topics with KEEP across last 4+ consecutive runs', () => {
    const entries = [
      makeEntry('S26', [
        pt('Ever', ['KEEP', 'KEEP', 'KEEP', 'KEEP']),
        pt('Recent', ['UPDATE', 'KEEP', 'KEEP']),
      ]),
    ];
    expect(identifyTrueEvergreens(entries)).toEqual(['Ever']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/kb/trajectory.test.ts`
Expected: FAIL — functions don't exist yet.

- [ ] **Step 3: Implement**

Append to `src/kb/trajectory.ts`:

```typescript
import type { TrajectoryEntry, PerTopicTrajectory } from '../types.js';

/**
 * Compute the average fraction of topics whose verdict changes between adjacent runs.
 * Returns 0 for fewer than 2 entries.
 */
export function computeChurnRate(entries: TrajectoryEntry[]): number {
  if (entries.length < 2) return 0;

  const churnPerTransition: number[] = [];
  for (let i = 1; i < entries.length; i++) {
    const prev = entries[i - 1];
    const curr = entries[i];
    const prevByTopic = new Map(prev.perAssignment.map((t) => [t.topic, t.verdict]));
    let changed = 0;
    let comparable = 0;
    for (const t of curr.perAssignment) {
      const before = prevByTopic.get(t.topic);
      if (before === undefined) continue;
      comparable++;
      if (before !== t.verdict) changed++;
    }
    if (comparable > 0) churnPerTransition.push(changed / comparable);
  }

  if (churnPerTransition.length === 0) return 0;
  return churnPerTransition.reduce((a, b) => a + b, 0) / churnPerTransition.length;
}

/** Topics whose verdict flipped >=2 times in the last 4 runs. Operates on perAssignment. */
export function identifyUnstableTopics(entries: TrajectoryEntry[]): string[] {
  if (entries.length === 0) return [];
  const latest = entries[entries.length - 1];
  return latest.perAssignment
    .filter((t) => t.trajectoryFlag === 'unstable')
    .map((t) => t.topic);
}

/** Topics in true-evergreen state in the most recent entry. Operates on perAssignment. */
export function identifyTrueEvergreens(entries: TrajectoryEntry[]): string[] {
  if (entries.length === 0) return [];
  const latest = entries[entries.length - 1];
  return latest.perAssignment
    .filter((t) => t.trajectoryFlag === 'true-evergreen')
    .map((t) => t.topic);
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/kb/trajectory.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/kb/trajectory.ts tests/kb/trajectory.test.ts
git commit -m "feat: trajectory aggregate computations (churn, unstable, evergreen)"
```

---

## Task 4: Trajectory JSONL read/write

**Files:**
- Modify: `D:\Dev\Curriculum-Intelligence\src\kb\trajectory.ts`
- Modify: `D:\Dev\Curriculum-Intelligence\tests\kb\trajectory.test.ts`

- [ ] **Step 1: Write failing tests for `appendEntry` and `readEntries`**

Add to test file:

```typescript
import { afterEach, beforeEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appendEntry, readEntries, getHistoryPath } from '../../src/kb/trajectory.js';
import { setupCourse } from '../../src/tools/setup_course.js';

let tmpHome: string;
beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'ci-traj-'));
  process.env.CURRICULUM_INTELLIGENCE_HOME = tmpHome;
  setupCourse({ id: 'TRJ101', title: 'Trajectory Test' });
});
afterEach(() => {
  delete process.env.CURRICULUM_INTELLIGENCE_HOME;
  rmSync(tmpHome, { recursive: true, force: true });
});

describe('trajectory log read/write', () => {
  test('round-trip — append then read', () => {
    const entry = makeEntry('S26', [pt('A', ['KEEP'])]);
    entry.courseId = 'TRJ101';
    appendEntry(entry);
    const read = readEntries('TRJ101');
    expect(read).toHaveLength(1);
    expect(read[0].semesterId).toBe('S26');
  });

  test('multiple appends preserve order', () => {
    const e1 = makeEntry('S25', [pt('A', ['KEEP'])]); e1.courseId = 'TRJ101';
    const e2 = makeEntry('F25', [pt('A', ['KEEP', 'KEEP'])]); e2.courseId = 'TRJ101';
    const e3 = makeEntry('S26', [pt('A', ['KEEP', 'KEEP', 'KEEP'])]); e3.courseId = 'TRJ101';
    appendEntry(e1); appendEntry(e2); appendEntry(e3);
    const read = readEntries('TRJ101');
    expect(read.map((e) => e.semesterId)).toEqual(['S25', 'F25', 'S26']);
  });

  test('readEntries respects lookback', () => {
    for (const s of ['S24', 'F24', 'S25', 'F25', 'S26']) {
      const e = makeEntry(s, [pt('A', ['KEEP'])]); e.courseId = 'TRJ101';
      appendEntry(e);
    }
    expect(readEntries('TRJ101', 2).map((e) => e.semesterId)).toEqual(['F25', 'S26']);
  });

  test('readEntries on empty/missing course returns []', () => {
    expect(readEntries('NEVER_EXISTED')).toEqual([]);
  });

  test('getHistoryPath returns the expected location', () => {
    const p = getHistoryPath('TRJ101');
    expect(p.endsWith(join('courses', 'TRJ101', 'history.jsonl'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test — verify failure**

Run: `npx vitest run tests/kb/trajectory.test.ts`
Expected: FAIL on the new tests (functions not yet exported).

- [ ] **Step 3: Implement**

Append to `src/kb/trajectory.ts`:

```typescript
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { getCoursePath } from './course_state.js';
import type { CourseId } from '../types.js';

export function getHistoryPath(courseId: CourseId): string {
  return join(getCoursePath(courseId), 'history.jsonl');
}

export function appendEntry(entry: TrajectoryEntry): void {
  const path = getHistoryPath(entry.courseId);
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, JSON.stringify(entry) + '\n', 'utf-8');
}

export function readEntries(courseId: CourseId, lookback?: number): TrajectoryEntry[] {
  const path = getHistoryPath(courseId);
  if (!existsSync(path)) return [];
  const content = readFileSync(path, 'utf-8');
  const entries: TrajectoryEntry[] = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    entries.push(JSON.parse(trimmed) as TrajectoryEntry);
  }
  if (lookback !== undefined && lookback > 0) {
    return entries.slice(-lookback);
  }
  return entries;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/kb/trajectory.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/kb/trajectory.ts tests/kb/trajectory.test.ts
git commit -m "feat: trajectory log JSONL read/write"
```

---

## Task 5: Trajectory annotation in `recommend_for_topic`

**Files:**
- Modify: `D:\Dev\Curriculum-Intelligence\src\tools\recommend_for_topic.ts`
- Modify: `D:\Dev\Curriculum-Intelligence\tests\tools\currency_and_verdict.test.ts`

- [ ] **Step 1: Read the current implementation to find the rationale-building site**

Run: `cd D:\Dev\Curriculum-Intelligence && cat src/tools/recommend_for_topic.ts`
Note the shape of `RecommendForTopicInput` and where `rationale` is composed.

- [ ] **Step 2: Write failing tests**

Add to `tests/tools/currency_and_verdict.test.ts` (the existing verdict tests file). Note the *actual* `RecommendForTopicInput` shape: requires `courseId`, `semesterId`, `lastTaughtSemesterId` (string or null). No `semestersSince` in input — it's computed inside.

```typescript
import { recommendForTopic } from '../../src/tools/recommend_for_topic.js';

const baseInput = {
  courseId: 'TRJ',
  semesterId: 'Spring2026',
  topic: 'Prompt engineering',
  currencyClass: 'current' as const,
  lastTaughtSemesterId: 'Fall2025',
  newsHits: 3,
};

describe('recommend_for_topic trajectory annotation', () => {
  test('appends unstable note to rationale when trajectoryFlag=unstable', () => {
    const result = recommendForTopic({
      ...baseInput,
      trajectoryFlag: 'unstable',
      verdictHistory: ['KEEP', 'UPDATE', 'KEEP', 'UPDATE'],
    });
    expect(result.rationale).toMatch(/flip|unstable|review/i);
  });

  test('appends evergreen note to rationale when trajectoryFlag=true-evergreen', () => {
    const result = recommendForTopic({
      ...baseInput,
      topic: 'Calculus fundamentals',
      currencyClass: 'evergreen',
      newsHits: 0,
      trajectoryFlag: 'true-evergreen',
      verdictHistory: ['KEEP', 'KEEP', 'KEEP', 'KEEP'],
    });
    expect(result.rationale).toMatch(/evergreen|stable|consecutive/i);
  });

  test('verdict letter unchanged by trajectoryFlag', () => {
    const noFlag = recommendForTopic({ ...baseInput });
    const unstableFlag = recommendForTopic({ ...baseInput, trajectoryFlag: 'unstable' });
    const evergreenFlag = recommendForTopic({ ...baseInput, trajectoryFlag: 'true-evergreen' });
    expect(noFlag.verdict).toBe(unstableFlag.verdict);
    expect(noFlag.verdict).toBe(evergreenFlag.verdict);
  });

  test('no annotation when trajectoryFlag absent', () => {
    const result = recommendForTopic({ ...baseInput });
    expect(result.rationale).not.toMatch(/flip|consecutive/i);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/tools/currency_and_verdict.test.ts`
Expected: FAIL — `trajectoryFlag` isn't accepted yet.

- [ ] **Step 4: Implement — extend input interface and rationale composition**

Edit `src/tools/recommend_for_topic.ts`. Add the trajectory imports at the top, extend the input interface, and append annotation to the rationale after `buildRationale` runs:

```typescript
import type { TrajectoryFlag } from '../types.js';

export interface RecommendForTopicInput {
  courseId: CourseId;
  semesterId: SemesterId;
  topic: string;
  currencyClass: CurrencyClass;
  lastTaughtSemesterId: string | null;
  newsHits: number;
  includeDetails?: boolean;
  trajectoryFlag?: TrajectoryFlag;
  verdictHistory?: Verdict[];
}

function trajectoryAnnotation(flag: TrajectoryFlag | undefined, history: Verdict[] | undefined): string {
  if (!flag || flag === 'new' || flag === 'stable' || flag === 'stabilising') return '';
  if (flag === 'unstable') {
    const pattern = history ? history.slice(-4).join('→') : '';
    return ` Trajectory note: this topic has flipped (${pattern}) over the last ${history?.length ?? 'few'} semesters — consider a structural review rather than another incremental update.`;
  }
  if (flag === 'true-evergreen') {
    return ` Trajectory note: KEEP for ${history?.length ?? '4+'} consecutive semesters — strong evergreen signal.`;
  }
  return '';
}

// In the body of recommendForTopic, after rationale is composed:
const annotated = rationale + trajectoryAnnotation(input.trajectoryFlag, input.verdictHistory);

const result: RecommendForTopicResult = { topic: input.topic, verdict, rationale: annotated };
```

Note: the verdict letter is computed entirely from `currencyClass`, `lastTaughtSemesterId`, `newsHits`, and `semestersSince`. Trajectory inputs are never read by `computeVerdict`. This is what keeps the rule "advisory only."

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/tools/currency_and_verdict.test.ts`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/tools/recommend_for_topic.ts tests/tools/currency_and_verdict.test.ts
git commit -m "feat: trajectory annotation in recommend_for_topic (advisory only)"
```

---

## Task 6: CI `analyzeCourse` high-level tool (assignment-level)

This task implements the always-on path: iterate over `topicMap.assignments`, score each, generate verdicts, build per-assignment trajectory rows. Concept extraction is a separate optional Task 6.5.

**Files:**
- Create: `D:\Dev\Curriculum-Intelligence\src\tools\analyze_course.ts`
- Create: `D:\Dev\Curriculum-Intelligence\tests\tools\analyze_course.test.ts`
- Modify: `D:\Dev\Curriculum-Intelligence\src\kb\trajectory.ts` (add `findSameSeasonPrior`, `findMostRecentPrior`)

- [ ] **Step 1: Add prior-semester helpers to trajectory.ts**

Append to `src/kb/trajectory.ts`:

```typescript
/** Pick the same-season prior semester (e.g., Fall2025 for Fall2026 input), if any. */
export function findSameSeasonPrior(currentSemesterId: string, allSemesters: string[]): string | null {
  const seasonMatch = currentSemesterId.match(/^([A-Za-z]+)(\d{4})$/);
  if (!seasonMatch) return null;
  const [, season, yearStr] = seasonMatch;
  const currentYear = parseInt(yearStr, 10);
  for (let y = currentYear - 1; y >= currentYear - 10; y--) {
    const candidate = `${season}${y}`;
    if (allSemesters.includes(candidate)) return candidate;
  }
  return null;
}

/** Pick the most recently registered semester strictly before `currentSemesterId`. */
export function findMostRecentPrior(
  currentSemesterId: string,
  registeredSemesters: { id: string; registeredAt: string }[],
): string | null {
  const sorted = [...registeredSemesters]
    .filter((s) => s.id !== currentSemesterId)
    .sort((a, b) => b.registeredAt.localeCompare(a.registeredAt));
  return sorted[0]?.id ?? null;
}
```

Quick unit test for these (add to `tests/kb/trajectory.test.ts`):

```typescript
import { findSameSeasonPrior, findMostRecentPrior } from '../../src/kb/trajectory.js';

describe('prior-semester helpers', () => {
  test('findSameSeasonPrior finds Fall2025 for Fall2026', () => {
    expect(findSameSeasonPrior('Fall2026', ['Spring2025', 'Fall2025', 'Spring2026'])).toBe('Fall2025');
  });
  test('findSameSeasonPrior returns null when no match', () => {
    expect(findSameSeasonPrior('Fall2026', ['Spring2025', 'Spring2026'])).toBeNull();
  });
  test('findMostRecentPrior sorts by registeredAt desc', () => {
    const sems = [
      { id: 'Spring2025', registeredAt: '2025-01-15T00:00:00Z' },
      { id: 'Fall2025', registeredAt: '2025-08-15T00:00:00Z' },
      { id: 'Spring2026', registeredAt: '2026-01-15T00:00:00Z' },
    ];
    expect(findMostRecentPrior('Spring2026', sems)).toBe('Fall2025');
  });
});
```

- [ ] **Step 2: Write failing tests for `analyzeCourse`**

Note the fixture path: `tests/fixtures/canvas-archive-tiny` already exists (used by `export_course_folder.test.ts`).

```typescript
// tests/tools/analyze_course.test.ts
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupCourse } from '../../src/tools/setup_course.js';
import { analyzeCourse } from '../../src/tools/analyze_course.js';
import { getHistoryPath, readEntries } from '../../src/kb/trajectory.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIX_ARCHIVE = join(__dirname, '..', 'fixtures', 'canvas-archive-tiny');

let tmpHome: string;
beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'ci-ac-'));
  process.env.CURRICULUM_INTELLIGENCE_HOME = tmpHome;
  setupCourse({ id: 'AC101', title: 'Analyze Test' });
});
afterEach(() => {
  delete process.env.CURRICULUM_INTELLIGENCE_HOME;
  rmSync(tmpHome, { recursive: true, force: true });
});

describe('CI analyzeCourse', () => {
  test('returns a report and appends one trajectory entry', async () => {
    const result = await analyzeCourse({
      courseId: 'AC101', semesterId: 'Spring2026', archivePath: FIX_ARCHIVE,
    });
    expect(result.semesterId).toBe('Spring2026');
    expect(result.perAssignment).toBeInstanceOf(Array);
    expect(result.perConcept).toBeUndefined(); // concept extraction not requested
    expect(result.trajectoryEntry.semesterId).toBe('Spring2026');
    expect(existsSync(getHistoryPath('AC101'))).toBe(true);

    const entries = readEntries('AC101');
    expect(entries).toHaveLength(1);
    expect(entries[0].semesterId).toBe('Spring2026');
  });

  test('perAssignment topic strings match the archive assignment names', async () => {
    const result = await analyzeCourse({
      courseId: 'AC101', semesterId: 'Spring2026', archivePath: FIX_ARCHIVE,
    });
    // Every perAssignment entry's topic must be non-empty and not look like a module/page key
    for (const row of result.perAssignment) {
      expect(typeof row.topic).toBe('string');
      expect(row.topic.length).toBeGreaterThan(0);
    }
  });

  test('second analyze on a different semester appends a second entry', async () => {
    await analyzeCourse({ courseId: 'AC101', semesterId: 'Fall2025', archivePath: FIX_ARCHIVE });
    await analyzeCourse({ courseId: 'AC101', semesterId: 'Spring2026', archivePath: FIX_ARCHIVE });
    const entries = readEntries('AC101');
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.semesterId)).toEqual(['Fall2025', 'Spring2026']);
  });

  test('priorSemesters is null on first run', async () => {
    const result = await analyzeCourse({
      courseId: 'AC101', semesterId: 'Spring2026', archivePath: FIX_ARCHIVE,
    });
    expect(result.trajectoryEntry.priorSemesters.sameSeason).toBeNull();
    expect(result.trajectoryEntry.priorSemesters.mostRecent).toBeNull();
  });

  test('priorSemesters resolved on subsequent runs', async () => {
    await analyzeCourse({ courseId: 'AC101', semesterId: 'Spring2025', archivePath: FIX_ARCHIVE });
    await analyzeCourse({ courseId: 'AC101', semesterId: 'Fall2025', archivePath: FIX_ARCHIVE });
    const result = await analyzeCourse({
      courseId: 'AC101', semesterId: 'Spring2026', archivePath: FIX_ARCHIVE,
    });
    expect(result.trajectoryEntry.priorSemesters.sameSeason).toBe('Spring2025');
    expect(result.trajectoryEntry.priorSemesters.mostRecent).toBe('Fall2025');
  });

  test('verdict counts cover all four verdict types', async () => {
    const result = await analyzeCourse({
      courseId: 'AC101', semesterId: 'Spring2026', archivePath: FIX_ARCHIVE,
    });
    const v = result.trajectoryEntry.verdicts;
    expect(typeof v.KEEP).toBe('number');
    expect(typeof v.UPDATE).toBe('number');
    expect(typeof v.DROP).toBe('number');
    expect(typeof v.ADD).toBe('number');
  });

  test('diff is null on first run for each course', async () => {
    const result = await analyzeCourse({
      courseId: 'AC101', semesterId: 'Spring2026', archivePath: FIX_ARCHIVE,
    });
    expect(result.trajectoryEntry.diff.sameSeason).toBeNull();
    expect(result.trajectoryEntry.diff.mostRecent).toBeNull();
  });
});
```

- [ ] **Step 3: Run tests — verify failure**

Run: `npx vitest run tests/tools/analyze_course.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 4: Implement `analyzeCourse`**

Use the actual signatures of `diffSemesters` (`leftSemesterId`/`rightSemesterId`) and `recommendForTopic` (`lastTaughtSemesterId`, no `semestersSince` in input). Iterate over `topicMap.assignments`, using `assignment.name` as the topic string.

```typescript
// src/tools/analyze_course.ts
import { ingestCanvasArchive } from './ingest_canvas_archive.js';
import { diffSemesters, type DiffSemestersResult } from './diff_semesters.js';
import { scoreTopicCurrency } from './score_topic_currency.js';
import { recommendForTopic } from './recommend_for_topic.js';
import { loadCourseConfig } from '../kb/course_state.js';
import { loadTopicMap } from '../kb/topic_map.js';
import {
  appendEntry, computeTrajectoryFlag, findMostRecentPrior, findSameSeasonPrior,
  getHistoryPath, readEntries,
} from '../kb/trajectory.js';
import type {
  CourseId, PerTopicTrajectory, SemesterId, TrajectoryDiff, TrajectoryEntry, Verdict,
} from '../types.js';

export interface AnalyzeCourseInput {
  courseId: CourseId;
  semesterId: SemesterId;
  archivePath: string;
  semanticVerify?: boolean;
}

export interface AnalyzeCourseReport {
  courseId: CourseId;
  semesterId: SemesterId;
  ingest: ReturnType<typeof ingestCanvasArchive>;
  diffs: {
    sameSeason: DiffSemestersResult | null;
    mostRecent: DiffSemestersResult | null;
  };
  perAssignment: PerTopicTrajectory[];
  perConcept?: PerTopicTrajectory[]; // populated by Task 6.5 only
  trajectoryEntry: TrajectoryEntry;
  historyPath: string;
}

export async function analyzeCourse(input: AnalyzeCourseInput): Promise<AnalyzeCourseReport> {
  const { courseId, semesterId, archivePath } = input;

  // 1. Ingest
  const ingest = ingestCanvasArchive({ courseId, semesterId, archivePath });

  // 2. Resolve prior semesters from course config
  const config = loadCourseConfig(courseId);
  const allSemesters = config.semesters.map((s) => s.id);
  const sameSeason = findSameSeasonPrior(semesterId, allSemesters);
  const mostRecent = findMostRecentPrior(semesterId, config.semesters);

  // 3. Diff against each baseline that exists and is different from semesterId
  const diffs: AnalyzeCourseReport['diffs'] = { sameSeason: null, mostRecent: null };
  if (sameSeason && sameSeason !== semesterId) {
    diffs.sameSeason = diffSemesters({
      courseId,
      leftSemesterId: sameSeason,
      rightSemesterId: semesterId,
    });
  }
  if (mostRecent && mostRecent !== semesterId && mostRecent !== sameSeason) {
    diffs.mostRecent = diffSemesters({
      courseId,
      leftSemesterId: mostRecent,
      rightSemesterId: semesterId,
    });
  }

  // 4. Score + verdict per assignment
  const topicMap = loadTopicMap(courseId, semesterId);
  const priorEntries = readEntries(courseId);

  const perAssignment: PerTopicTrajectory[] = [];
  const verdictCounts: Record<Verdict, number> = { KEEP: 0, UPDATE: 0, DROP: 0, ADD: 0 };

  for (const assignment of topicMap.assignments) {
    const topic = assignment.name;
    const lastTaughtSemesterId = lookupLastTaught(topic, priorEntries);

    // Currency scoring. Archive-only: newsHits = 0. C&C layer will merge external signals separately.
    const score = scoreTopicCurrency({
      topic,
      courseId,
      semesterId,
      lastTaughtSemesterId,
      newsHits: 0,
      ...(input.semanticVerify === true ? { semanticVerify: true as const } : {}),
    });
    const scoreResult = score instanceof Promise ? await score : score;

    const priorVerdicts = buildVerdictHistory(topic, priorEntries);

    // First pass: get the provisional verdict (no trajectory yet).
    const provisional = recommendForTopic({
      courseId,
      semesterId,
      topic,
      currencyClass: scoreResult.currencyClass,
      lastTaughtSemesterId,
      newsHits: 0,
    });

    const fullHistory: Verdict[] = [...priorVerdicts, provisional.verdict];
    const flag = computeTrajectoryFlag(fullHistory);

    // Second pass: include trajectory annotation.
    const annotated = recommendForTopic({
      courseId,
      semesterId,
      topic,
      currencyClass: scoreResult.currencyClass,
      lastTaughtSemesterId,
      newsHits: 0,
      trajectoryFlag: flag,
      verdictHistory: fullHistory,
    });

    verdictCounts[annotated.verdict]++;
    perAssignment.push({
      topic,
      verdict: annotated.verdict,
      currencyClass: scoreResult.currencyClass,
      newsHitCount: 0,
      trajectoryFlag: flag,
      verdictPrior: priorVerdicts.length > 0 ? priorVerdicts[priorVerdicts.length - 1] : null,
      verdictHistory: fullHistory.slice(-4),
    });
  }

  // 5. Build trajectory entry
  const entry: TrajectoryEntry = {
    schemaVersion: 1,
    timestamp: new Date().toISOString(),
    courseId,
    semesterId,
    priorSemesters: { sameSeason, mostRecent },
    assignmentCount: perAssignment.length,
    verdicts: verdictCounts,
    perAssignment,
    diff: {
      sameSeason: diffToTrajectoryDiff(diffs.sameSeason, sameSeason),
      mostRecent: diffToTrajectoryDiff(diffs.mostRecent, mostRecent),
    },
  };

  appendEntry(entry);

  return {
    courseId,
    semesterId,
    ingest,
    diffs,
    perAssignment,
    trajectoryEntry: entry,
    historyPath: getHistoryPath(courseId),
  };
}

function buildVerdictHistory(topic: string, priorEntries: TrajectoryEntry[]): Verdict[] {
  const verdicts: Verdict[] = [];
  for (const entry of priorEntries) {
    const found = entry.perAssignment.find((t) => t.topic === topic);
    if (found) verdicts.push(found.verdict);
  }
  return verdicts;
}

function lookupLastTaught(topic: string, priorEntries: TrajectoryEntry[]): string | null {
  for (let i = priorEntries.length - 1; i >= 0; i--) {
    const found = priorEntries[i].perAssignment.find((t) => t.topic === topic);
    if (found) return priorEntries[i].semesterId;
  }
  return null;
}

function diffToTrajectoryDiff(
  diff: DiffSemestersResult | null,
  baseline: SemesterId | null,
): TrajectoryDiff | null {
  if (!diff || !baseline) return null;
  return {
    baselineSemester: baseline,
    modules: diff.modules,
    assignments: diff.assignments,
    pages: diff.pages,
    resources: diff.resources,
  };
}
```

**Implementation note on `scoreTopicCurrency`:** the function has overloaded sync/async signatures. The spread `...(input.semanticVerify === true ? { semanticVerify: true as const } : {})` is the cleanest way to pass it conditionally without TypeScript narrowing trouble. Read the actual signature in `src/tools/score_topic_currency.ts` before adapting — if the input shape differs from what's shown here, adjust the call site.

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/tools/analyze_course.test.ts tests/kb/trajectory.test.ts`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/tools/analyze_course.ts tests/tools/analyze_course.test.ts src/kb/trajectory.ts tests/kb/trajectory.test.ts
git commit -m "feat: CI analyze_course with assignment-level trajectory"
```

---

## Task 6.5: Optional concept extraction

**Files:**
- Create: `D:\Dev\Curriculum-Intelligence\src\tools\extract_course_concepts.ts`
- Create: `D:\Dev\Curriculum-Intelligence\tests\tools\extract_course_concepts.test.ts`
- Modify: `D:\Dev\Curriculum-Intelligence\src\tools\analyze_course.ts`
- Modify: `D:\Dev\Curriculum-Intelligence\tests\tools\analyze_course.test.ts`

- [ ] **Step 1: Write failing tests for `extractCourseConcepts`**

```typescript
// tests/tools/extract_course_concepts.test.ts
import { describe, expect, test } from 'vitest';
import { extractCourseConcepts } from '../../src/tools/extract_course_concepts.js';
import type { LlmClient } from '../../src/llm/client.js';

const MOCK_LLM_RESPONSE = JSON.stringify({
  concepts: [
    { name: 'Prompt engineering', relatedAssignments: ['Assignment 1', 'Assignment 3'] },
    { name: 'Agent tool use', relatedAssignments: ['Assignment 2'] },
  ],
});

function mockClient(response: string): LlmClient {
  return { complete: async () => response };
}

describe('extractCourseConcepts', () => {
  test('returns concepts parsed from LLM JSON response', async () => {
    const result = await extractCourseConcepts({
      assignments: [{ name: 'Assignment 1' }, { name: 'Assignment 2' }, { name: 'Assignment 3' }],
      modules: [{ name: 'Module 1' }],
      llmClient: mockClient(MOCK_LLM_RESPONSE),
    });
    expect(result.concepts).toHaveLength(2);
    expect(result.concepts[0].name).toBe('Prompt engineering');
    expect(result.concepts[0].relatedAssignments).toEqual(['Assignment 1', 'Assignment 3']);
  });

  test('handles markdown-fenced response', async () => {
    const fenced = '```json\n' + MOCK_LLM_RESPONSE + '\n```';
    const result = await extractCourseConcepts({
      assignments: [{ name: 'A' }], modules: [],
      llmClient: mockClient(fenced),
    });
    expect(result.concepts).toHaveLength(2);
  });

  test('returns empty list on unparseable response', async () => {
    const result = await extractCourseConcepts({
      assignments: [{ name: 'A' }], modules: [],
      llmClient: mockClient('Sorry, I cannot help.'),
    });
    expect(result.concepts).toEqual([]);
  });
});
```

- [ ] **Step 2: Implement `extractCourseConcepts`**

```typescript
// src/tools/extract_course_concepts.ts
import type { LlmClient } from '../llm/client.js';

export interface ConceptExtractionInput {
  assignments: { name: string }[];
  modules: { name: string }[];
  llmClient: LlmClient;
}

export interface ExtractedConcept {
  name: string;
  relatedAssignments: string[];
}

export interface ConceptExtractionResult {
  concepts: ExtractedConcept[];
}

function buildPrompt(input: ConceptExtractionInput): string {
  const assignmentList = input.assignments.map((a) => `- ${a.name}`).join('\n');
  const moduleList = input.modules.map((m) => `- ${m.name}`).join('\n');
  return (
    `Identify 5-15 cross-cutting conceptual themes ("concepts") taught in this course.\n` +
    `Each concept should span 1-3 assignments and represent a coherent topic the professor would think of as a unit (e.g., "Prompt engineering", "Agent tool use", "Evaluation methods").\n\n` +
    `Assignments:\n${assignmentList}\n\nModules:\n${moduleList}\n\n` +
    `Return JSON only, no commentary:\n` +
    `{\n  "concepts": [\n    { "name": "Concept Name", "relatedAssignments": ["Assignment 1", "Assignment 3"] }\n  ]\n}\n`
  );
}

function parseResponse(raw: string): ConceptExtractionResult {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  try {
    const parsed = JSON.parse(cleaned) as { concepts?: unknown[] };
    const concepts = (parsed.concepts ?? []).filter(
      (c): c is ExtractedConcept =>
        typeof c === 'object' && c !== null && 'name' in c && 'relatedAssignments' in c
        && typeof (c as { name: unknown }).name === 'string'
        && Array.isArray((c as { relatedAssignments: unknown }).relatedAssignments),
    );
    return { concepts };
  } catch {
    return { concepts: [] };
  }
}

export async function extractCourseConcepts(input: ConceptExtractionInput): Promise<ConceptExtractionResult> {
  const raw = await input.llmClient.complete(buildPrompt(input), { maxTokens: 1024 });
  return parseResponse(raw);
}
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/tools/extract_course_concepts.test.ts`
Expected: all pass.

- [ ] **Step 4: Add `extractConcepts` + `llmClient` to `analyzeCourse`**

Modify `src/tools/analyze_course.ts`:

```typescript
// Extend input
import type { LlmClient } from '../llm/client.js';
import { extractCourseConcepts } from './extract_course_concepts.js';

export interface AnalyzeCourseInput {
  courseId: CourseId;
  semesterId: SemesterId;
  archivePath: string;
  semanticVerify?: boolean;
  extractConcepts?: boolean;
  llmClient?: LlmClient;
}

// In the function body, after perAssignment is built and before building the entry:
let perConcept: PerTopicTrajectory[] | undefined;
if (input.extractConcepts && input.llmClient) {
  try {
    const extraction = await extractCourseConcepts({
      assignments: topicMap.assignments.map((a) => ({ name: a.name })),
      modules: topicMap.modules.map((m) => ({ name: m.name })),
      llmClient: input.llmClient,
    });
    perConcept = extraction.concepts.map((c) => {
      // Each concept inherits the most-uncertain verdict among its related assignments.
      const related = perAssignment.filter((p) => c.relatedAssignments.includes(p.topic));
      const verdict = pickMostUncertainVerdict(related);
      const priorVerdicts = buildConceptVerdictHistory(c.name, priorEntries);
      const fullHistory: Verdict[] = [...priorVerdicts, verdict];
      return {
        topic: c.name,
        verdict,
        currencyClass: related[0]?.currencyClass ?? 'current',
        newsHitCount: 0,
        trajectoryFlag: computeTrajectoryFlag(fullHistory),
        verdictPrior: priorVerdicts.length > 0 ? priorVerdicts[priorVerdicts.length - 1] : null,
        verdictHistory: fullHistory.slice(-4),
        relatedAssignments: c.relatedAssignments,
      };
    });
  } catch (err) {
    process.stderr.write(`[analyze_course] concept extraction failed: ${err instanceof Error ? err.message : String(err)}\n`);
  }
}

// In the trajectory entry, conditionally include perConcept:
const entry: TrajectoryEntry = {
  // ...existing fields...
  ...(perConcept ? { perConcept } : {}),
};

// And add helpers:
function pickMostUncertainVerdict(assignments: PerTopicTrajectory[]): Verdict {
  const rank: Record<Verdict, number> = { UPDATE: 0, ADD: 1, DROP: 2, KEEP: 3 };
  if (assignments.length === 0) return 'KEEP';
  return [...assignments].sort((a, b) => rank[a.verdict] - rank[b.verdict])[0].verdict;
}

function buildConceptVerdictHistory(name: string, priorEntries: TrajectoryEntry[]): Verdict[] {
  const verdicts: Verdict[] = [];
  for (const entry of priorEntries) {
    const found = entry.perConcept?.find((t) => t.topic === name);
    if (found) verdicts.push(found.verdict);
  }
  return verdicts;
}
```

- [ ] **Step 5: Add a test for concept extraction in analyze_course**

Append to `tests/tools/analyze_course.test.ts`:

```typescript
import type { LlmClient } from '../../src/llm/client.js';

function mockLlm(response: string): LlmClient {
  return { complete: async () => response };
}

const CONCEPT_RESPONSE = JSON.stringify({
  concepts: [{ name: 'Test Concept', relatedAssignments: [] }],
});

test('perConcept populated when extractConcepts=true and llmClient provided', async () => {
  const result = await analyzeCourse({
    courseId: 'AC101', semesterId: 'Spring2026', archivePath: FIX_ARCHIVE,
    extractConcepts: true, llmClient: mockLlm(CONCEPT_RESPONSE),
  });
  expect(result.perConcept).toBeDefined();
  expect(result.perConcept!.length).toBeGreaterThan(0);
  expect(result.trajectoryEntry.perConcept).toBeDefined();
});

test('perConcept omitted when extractConcepts=true but llmClient missing', async () => {
  const result = await analyzeCourse({
    courseId: 'AC101', semesterId: 'Spring2026', archivePath: FIX_ARCHIVE,
    extractConcepts: true,
  });
  expect(result.perConcept).toBeUndefined();
  expect(result.trajectoryEntry.perConcept).toBeUndefined();
});

test('concept extraction failures degrade silently', async () => {
  const failingClient: LlmClient = { complete: async () => { throw new Error('rate limit'); } };
  const result = await analyzeCourse({
    courseId: 'AC101', semesterId: 'Spring2026', archivePath: FIX_ARCHIVE,
    extractConcepts: true, llmClient: failingClient,
  });
  expect(result.perConcept).toBeUndefined();
  expect(result.perAssignment.length).toBeGreaterThan(0);
});
```

- [ ] **Step 6: Run tests + commit**

```bash
npx vitest run tests/tools/analyze_course.test.ts tests/tools/extract_course_concepts.test.ts
git add src/tools/extract_course_concepts.ts tests/tools/extract_course_concepts.test.ts src/tools/analyze_course.ts tests/tools/analyze_course.test.ts
git commit -m "feat: optional LLM-driven concept extraction in analyze_course"
```

---

## Task 7: `get_course_trajectory` tool

**Files:**
- Create: `D:\Dev\Curriculum-Intelligence\src\tools\get_course_trajectory.ts`
- Create: `D:\Dev\Curriculum-Intelligence\tests\tools\get_course_trajectory.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/tools/get_course_trajectory.test.ts
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupCourse } from '../../src/tools/setup_course.js';
import { analyzeCourse } from '../../src/tools/analyze_course.js';
import { getCourseTrajectory } from '../../src/tools/get_course_trajectory.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIX_ARCHIVE = join(__dirname, '..', 'fixtures', 'canvas-archive-tiny');

let tmpHome: string;
beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'ci-trj-'));
  process.env.CURRICULUM_INTELLIGENCE_HOME = tmpHome;
  setupCourse({ id: 'TRJ', title: 'Trajectory Read Test' });
});
afterEach(() => {
  delete process.env.CURRICULUM_INTELLIGENCE_HOME;
  rmSync(tmpHome, { recursive: true, force: true });
});

describe('getCourseTrajectory', () => {
  test('empty course returns semesterCount 0 with empty arrays', async () => {
    const r = await getCourseTrajectory({ courseId: 'TRJ' });
    expect(r.semesterCount).toBe(0);
    expect(r.unstableTopics).toEqual([]);
    expect(r.trueEvergreens).toEqual([]);
  });

  test('after 3 runs returns trajectory data', async () => {
    for (const s of ['Spring2025', 'Fall2025', 'Spring2026']) {
      await analyzeCourse({ courseId: 'TRJ', semesterId: s, archivePath: FIX_ARCHIVE });
    }
    const r = await getCourseTrajectory({ courseId: 'TRJ' });
    expect(r.semesterCount).toBe(3);
    expect(typeof r.churnRate).toBe('number');
  });

  test('summary granularity omits rawEntries and timelines', async () => {
    for (const s of ['Spring2025', 'Fall2025']) {
      await analyzeCourse({ courseId: 'TRJ', semesterId: s, archivePath: FIX_ARCHIVE });
    }
    const r = await getCourseTrajectory({ courseId: 'TRJ', granularity: 'summary' });
    expect(r.rawEntries).toBeUndefined();
    expect(r.topicTimelines).toBeUndefined();
  });

  test('granular returns rawEntries', async () => {
    await analyzeCourse({ courseId: 'TRJ', semesterId: 'Spring2025', archivePath: FIX_ARCHIVE });
    const r = await getCourseTrajectory({ courseId: 'TRJ', granularity: 'granular' });
    expect(r.rawEntries).toHaveLength(1);
  });

  test('lookback limits how many entries are read', async () => {
    for (const s of ['S24', 'F24', 'S25', 'F25', 'S26']) {
      await analyzeCourse({ courseId: 'TRJ', semesterId: s, archivePath: FIX_ARCHIVE });
    }
    const r = await getCourseTrajectory({ courseId: 'TRJ', granularity: 'granular', lookback: 2 });
    expect(r.rawEntries).toHaveLength(2);
    expect(r.rawEntries![1].semesterId).toBe('S26');
  });
});
```

- [ ] **Step 2: Run test — verify failure**

Run: `npx vitest run tests/tools/get_course_trajectory.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

```typescript
// src/tools/get_course_trajectory.ts
import {
  computeChurnRate, identifyTrueEvergreens, identifyUnstableTopics, readEntries,
} from '../kb/trajectory.js';
import type { CourseId, TrajectoryEntry, Verdict } from '../types.js';

export interface GetCourseTrajectoryInput {
  courseId: CourseId;
  granularity?: 'summary' | 'standard' | 'granular';
  lookback?: number;
}

export interface VerdictCountSnapshot {
  semesterId: string;
  counts: Record<Verdict, number>;
}

export interface PerTopicTimeline {
  topic: string;
  verdicts: { semesterId: string; verdict: Verdict }[];
}

export interface CourseTrajectoryResult {
  courseId: CourseId;
  semesterCount: number;
  churnRate: number;
  unstableTopics: string[];
  trueEvergreens: string[];
  verdictCountsOverTime: VerdictCountSnapshot[];
  topicTimelines?: PerTopicTimeline[];
  rawEntries?: TrajectoryEntry[];
}

export async function getCourseTrajectory(input: GetCourseTrajectoryInput): Promise<CourseTrajectoryResult> {
  const { courseId, granularity = 'standard', lookback } = input;
  const entries = readEntries(courseId, lookback);

  const result: CourseTrajectoryResult = {
    courseId,
    semesterCount: entries.length,
    churnRate: computeChurnRate(entries),
    unstableTopics: identifyUnstableTopics(entries),
    trueEvergreens: identifyTrueEvergreens(entries),
    verdictCountsOverTime: entries.map((e) => ({ semesterId: e.semesterId, counts: e.verdicts })),
  };

  if (granularity === 'standard' || granularity === 'granular') {
    result.topicTimelines = buildTopicTimelines(entries);
  }

  if (granularity === 'granular') {
    result.rawEntries = entries;
  }

  return result;
}

function buildTopicTimelines(entries: TrajectoryEntry[]): PerTopicTimeline[] {
  const byTopic = new Map<string, { semesterId: string; verdict: Verdict }[]>();
  for (const entry of entries) {
    for (const t of entry.perAssignment) {
      const arr = byTopic.get(t.topic) ?? [];
      arr.push({ semesterId: entry.semesterId, verdict: t.verdict });
      byTopic.set(t.topic, arr);
    }
  }
  return Array.from(byTopic.entries()).map(([topic, verdicts]) => ({ topic, verdicts }));
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/tools/get_course_trajectory.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/tools/get_course_trajectory.ts tests/tools/get_course_trajectory.test.ts
git commit -m "feat: get_course_trajectory tool with summary/standard/granular granularity"
```

---

## Task 8: Register new CI MCP tools

**Files:**
- Modify: `D:\Dev\Curriculum-Intelligence\src\index.ts`

- [ ] **Step 1: Add imports**

Near the top, alongside existing tool imports:

```typescript
import { analyzeCourse as ciAnalyzeCourseFull } from './tools/analyze_course.js';
import { getCourseTrajectory } from './tools/get_course_trajectory.js';
```

- [ ] **Step 2: Add tool definitions to the tools list**

Inside the `tools: [...]` array in the `ListToolsRequestSchema` handler:

```typescript
{
  name: 'analyze_course',
  description:
    'Run the full CI analysis pipeline: ingest the archive, diff against same-season and most-recent prior semesters, score currency per assignment, generate verdicts (KEEP/UPDATE/DROP/ADD), and append an entry to the course trajectory log. Returns a structured report including the trajectory snapshot. Set extractConcepts: true to additionally derive LLM-extracted concepts spanning multiple assignments.',
  inputSchema: {
    type: 'object' as const,
    required: ['courseId', 'semesterId', 'archivePath'],
    properties: {
      courseId: { type: 'string' },
      semesterId: { type: 'string' },
      archivePath: { type: 'string', description: 'Absolute path to the Canvas export folder.' },
      semanticVerify: { type: 'boolean', description: 'Run the optional LLM verification pass on currency scoring.' },
      extractConcepts: { type: 'boolean', description: 'When true and an LLM client is configured (ANTHROPIC_API_KEY or OLLAMA_BASE_URL+OLLAMA_MODEL), additionally derive concepts.' },
    },
  },
},
{
  name: 'get_course_trajectory',
  description:
    'Read the course trajectory log and return analysis: churn rate across semesters, currently unstable topics (verdict flipping), true evergreens (KEEP for 4+ consecutive runs), and per-topic verdict timelines.',
  inputSchema: {
    type: 'object' as const,
    required: ['courseId'],
    properties: {
      courseId: { type: 'string' },
      granularity: { type: 'string', enum: ['summary', 'standard', 'granular'], description: 'Defaults to "standard".' },
      lookback: { type: 'number', description: 'Number of most-recent entries to consider.' },
    },
  },
},
```

- [ ] **Step 3: Add handler branches**

In the `CallToolRequestSchema` switch (after similar `if (name === '...')` blocks):

```typescript
if (name === 'analyze_course') {
  const raw = args as Record<string, unknown>;
  const extractConcepts = raw.extractConcepts === true;
  const result = await ciAnalyzeCourseFull({
    courseId: raw.courseId as string,
    semesterId: raw.semesterId as string,
    archivePath: raw.archivePath as string,
    semanticVerify: raw.semanticVerify === true,
    extractConcepts,
    ...(extractConcepts ? { llmClient: getLlmClient() } : {}),
  });
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
}

if (name === 'get_course_trajectory') {
  const raw = args as Record<string, unknown>;
  const result = await getCourseTrajectory({
    courseId: raw.courseId as string,
    granularity: raw.granularity as 'summary' | 'standard' | 'granular' | undefined,
    lookback: typeof raw.lookback === 'number' ? raw.lookback : undefined,
  });
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
}
```

- [ ] **Step 4: Build verify**

Run: `npm run build`
Expected: clean compile.

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: all tests pass (163 prior + new tests from Tasks 2-7).

- [ ] **Step 6: Commit**

```bash
git add src/index.ts
git commit -m "feat: expose analyze_course and get_course_trajectory via MCP"
```

---

## Task 9: C&C `analyze_course` workflow rewrite

**Files:**
- Modify: `D:\Dev\Command-and-Control-MCP\src\tools\workflows\analyze_course.ts`
- Modify: `D:\Dev\Command-and-Control-MCP\tests\tools\workflows\analyze_course.test.ts`

- [ ] **Step 1: Rebuild CI first so C&C's `file:` dependency picks up new exports**

```bash
cd D:\Dev\Curriculum-Intelligence
npm run build
cd D:\Dev\Command-and-Control-MCP
npm install
```

- [ ] **Step 2: Write failing tests**

Replace `tests/tools/workflows/analyze_course.test.ts` contents with:

```typescript
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupCourse } from 'curriculum-intelligence-mcp/dist/tools/setup_course.js';
import { analyzeCourse } from '../../../src/tools/workflows/analyze_course.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIX_ARCHIVE = join(__dirname, '..', '..', 'fixtures', 'canvas-archive-tiny');

let tmpHome: string;
beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'cc-ac-'));
  process.env.CURRICULUM_INTELLIGENCE_HOME = tmpHome;
  setupCourse({ id: 'WAC', title: 'Workflow Analyze Test' });
});
afterEach(() => {
  delete process.env.CURRICULUM_INTELLIGENCE_HOME;
  rmSync(tmpHome, { recursive: true, force: true });
  delete process.env.BRAVE_SEARCH_API_KEY;
});

describe('C&C analyzeCourse workflow', () => {
  test('returns CI analysis report with perAssignment and trajectoryEntry', async () => {
    const r = await analyzeCourse({
      courseId: 'WAC', semesterId: 'Spring2026', archivePath: FIX_ARCHIVE,
    });
    expect(r.perAssignment).toBeInstanceOf(Array);
    expect(r.trajectoryEntry).toBeDefined();
    expect(r.augmentations).toBeDefined();
  });

  test('augmentations.newsFeed absent when no feeds configured', async () => {
    const r = await analyzeCourse({
      courseId: 'WAC', semesterId: 'Spring2026', archivePath: FIX_ARCHIVE,
    });
    expect(r.augmentations.newsFeed).toBeUndefined();
  });

  test('augmentations.searchScans absent when BRAVE_SEARCH_API_KEY unset', async () => {
    delete process.env.BRAVE_SEARCH_API_KEY;
    const r = await analyzeCourse({
      courseId: 'WAC', semesterId: 'Spring2026', archivePath: FIX_ARCHIVE,
    });
    expect(r.augmentations.searchScans).toBeUndefined();
  });

  test('trajectory entry does not contain external signal data', async () => {
    process.env.BRAVE_SEARCH_API_KEY = 'fake-key-not-used-because-mocked';
    const r = await analyzeCourse({
      courseId: 'WAC', semesterId: 'Spring2026', archivePath: FIX_ARCHIVE,
    });
    // The trajectory entry schema (TrajectoryEntry) intentionally has no externalSignals
    // field — verify by checking JSON output.
    const json = JSON.stringify(r.trajectoryEntry);
    expect(json).not.toMatch(/externalSignals/);
    expect(json).not.toMatch(/searchScans/);
    expect(json).not.toMatch(/newsFeed/);
  });
});
```

- [ ] **Step 3: Run test — verify failure**

Run: `cd D:\Dev\Command-and-Control-MCP && npx vitest run tests/tools/workflows/analyze_course.test.ts`
Expected: FAIL — current implementation returns `{ ingest, status }` only; new fields not present.

- [ ] **Step 4: Implement the rewritten workflow**

```typescript
// src/tools/workflows/analyze_course.ts
import { analyzeCourse as ciAnalyzeCourse } from 'curriculum-intelligence-mcp/dist/tools/analyze_course.js';
import { fetchNewsFeed } from 'curriculum-intelligence-mcp/dist/tools/fetch_news_feed.js';
import { scanRecentDevelopments } from 'curriculum-intelligence-mcp/dist/tools/scan_recent_developments.js';
import { ingestTranscripts } from 'curriculum-intelligence-mcp/dist/tools/ingest_transcripts.js';
import { mapTranscriptsToWeeks } from 'curriculum-intelligence-mcp/dist/tools/map_transcripts_to_weeks.js';
import { AnthropicAdapter } from 'curriculum-intelligence-mcp/dist/llm/anthropic_adapter.js';
import { BraveSearchAdapter } from 'curriculum-intelligence-mcp/dist/search/brave_search_adapter.js';

export interface AnalyzeCourseInput {
  courseId: string;
  semesterId: string;
  archivePath: string;
  /** Optional: directory containing .vtt/.srt/.md transcript files. */
  transcriptsPath?: string;
  /** Optional: RSS feed URLs to fetch for currency signal. */
  feedUrls?: string[];
  semanticVerify?: boolean;
}

type CiReport = Awaited<ReturnType<typeof ciAnalyzeCourse>>;

export interface AnalyzeCourseResult extends CiReport {
  augmentations: {
    newsFeed?: Awaited<ReturnType<typeof fetchNewsFeed>>;
    searchScans?: Awaited<ReturnType<typeof scanRecentDevelopments>>[];
    transcripts?: Awaited<ReturnType<typeof ingestTranscripts>>;
    weekMap?: Awaited<ReturnType<typeof mapTranscriptsToWeeks>>;
  };
  status: 'complete';
}

function pickMostUncertain(perAssignment: CiReport['perAssignment'], n: number): CiReport['perAssignment'] {
  // Prefer UPDATE > ADD > DROP > KEEP, then take top N
  const rank: Record<string, number> = { UPDATE: 0, ADD: 1, DROP: 2, KEEP: 3 };
  return [...perAssignment]
    .sort((a, b) => (rank[a.verdict] ?? 9) - (rank[b.verdict] ?? 9))
    .slice(0, n);
}

export async function analyzeCourse(input: AnalyzeCourseInput): Promise<AnalyzeCourseResult> {
  const { courseId, semesterId, archivePath, transcriptsPath, feedUrls, semanticVerify } = input;

  // 1. CI's full analysis (writes trajectory entry).
  const ciReport = await ciAnalyzeCourse({
    courseId, semesterId, archivePath,
    ...(semanticVerify !== undefined ? { semanticVerify } : {}),
  });

  const augmentations: AnalyzeCourseResult['augmentations'] = {};

  // 2. RSS feeds, if provided.
  if (feedUrls && feedUrls.length > 0) {
    augmentations.newsFeed = await fetchNewsFeed({ courseId, feedUrls });
  }

  // 3. Web search for the most uncertain assignments.
  const braveKey = process.env.BRAVE_SEARCH_API_KEY;
  if (braveKey) {
    const uncertain = pickMostUncertain(ciReport.perAssignment, 3);
    const llmClient = new AnthropicAdapter();
    const searchClient = new BraveSearchAdapter(braveKey);
    augmentations.searchScans = await Promise.all(
      uncertain.map((v) =>
        scanRecentDevelopments({ courseId, topicArea: v.topic, llmClient, searchClient }),
      ),
    );
  }

  // 4. Transcripts, if a path was provided.
  if (transcriptsPath) {
    augmentations.transcripts = ingestTranscripts({ courseId, semesterId, transcriptsPath });
    augmentations.weekMap = mapTranscriptsToWeeks({ courseId, semesterId });
  }

  return { ...ciReport, augmentations, status: 'complete' };
}
```

- [ ] **Step 5: Run tests**

```bash
npm run build
npx vitest run tests/tools/workflows/analyze_course.test.ts
```
Expected: all tests pass.

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: all 27+ tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/tools/workflows/analyze_course.ts tests/tools/workflows/analyze_course.test.ts
git commit -m "feat: real analyze_course workflow with external signal augmentations"
```

---

## Task 10: Documentation

**Files:**
- Modify: `D:\Dev\Curriculum-Intelligence\DECISIONS.md`
- Modify: `D:\Dev\Command-and-Control-MCP\docs\integration-contracts.md`

- [ ] **Step 1: Append decision entry to CI DECISIONS.md**

```markdown
---

## Trajectory log for analyze_course

**Decision:** CI maintains an append-only `history.jsonl` per course recording each analyze_course run. Trajectory data is advisory only — `currencyClass` and verdict letter stay deterministic. External signals (RSS, web search, transcripts) are merged at the C&C layer and do not appear in the trajectory entry.

**Why:** Per-semester verdicts alone don't reveal pedagogical patterns. A topic that flips KEEP→UPDATE→KEEP repeatedly is a structural problem; one that holds KEEP for four consecutive semesters has earned evergreen status. The history log makes these patterns visible without changing the deterministic core. Keeping external signals out of the entry means two runs of analyze_course on the same archive produce identical trajectory entries regardless of whether RSS or Brave keys were available — apples-to-apples comparison across time.

**Storage:** Always written at full granularity. Granularity becomes a *display* choice via `getCourseTrajectory`'s `granularity` param. Storage is small (few KB per semester).

**Diff baseline:** Both same-season (Fall→Fall) and most-recent (Fall→Spring) when both exist. Captures pedagogical year-over-year evolution and last-touched changes.

**Trajectory flags:** new / stable / stabilising / unstable / true-evergreen. Flag annotates the verdict's `rationale` field; it does not change the verdict.
```

- [ ] **Step 2: Add workflow note to C&C integration-contracts.md**

After the existing "Implemented since integration-hardening" bullet list, add:

```markdown
- Real `analyze_course` workflow. C&C calls CI's `analyzeCourse` which ingests the archive, diffs against prior semesters (same-season + most-recent), scores currency, generates verdicts, and writes a trajectory entry. C&C then augments the report with RSS news, web search scans (when `BRAVE_SEARCH_API_KEY` is set), and transcript ingestion (when `transcriptsPath` is supplied). The trajectory entry is archive-only and immutable; external signals appear in `result.augmentations` but never modify the trajectory entry.
```

- [ ] **Step 3: Commit both docs**

```bash
cd D:\Dev\Curriculum-Intelligence
git add DECISIONS.md
git commit -m "docs: record analyze_course + trajectory log decision"

cd D:\Dev\Command-and-Control-MCP
git add docs/integration-contracts.md
git commit -m "docs: document real analyze_course workflow with augmentations"
```

---

## Task 11: Final verification + push

- [ ] **Step 1: Full build + test in CI**

```bash
cd D:\Dev\Curriculum-Intelligence
npm run build
npm test
```
Expected: clean build, all tests pass.

- [ ] **Step 2: Full build + test in C&C**

```bash
cd D:\Dev\Command-and-Control-MCP
npm install   # refresh file: dep
npm run build
npm test
```
Expected: clean build, all tests pass.

- [ ] **Step 3: Push both repos**

```bash
cd D:\Dev\Curriculum-Intelligence
git push

cd D:\Dev\Command-and-Control-MCP
git push
```

---

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| `recommendForTopic` signature changes break existing callers | Trajectory fields are optional. Existing calls compile and behave identically (no flag → no annotation). |
| Trajectory log corruption from concurrent writes | Single-writer assumption (one analyze_course at a time per course). If concurrent runs become a real concern, add a file lock or move to SQLite. Out of scope for now. |
| Schema evolution | `schemaVersion: 1` on every entry. Future migrations read all versions; new fields are added without breaking old readers. |
| C&C `file:` dep stale after CI rebuild | Task 9 step 1 makes the rebuild explicit. CI builds before C&C installs. |
| Diff returns inconsistent field shapes (added/dropped/renamed may be undefined) | `diffToTrajectoryDiff` defaults each array to `[]`. |

---

## Done = all checked

When every checkbox above is ticked, both repos are green, both pushed, the trajectory log is functional, and `analyze_course` is no longer a one-liner.
