# Group Creator / Maintainer Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an opt-in `group-builder` module that forms student teams from Canvas data + a thin roster file, using six strategies and a semester-long no-repeat-pairing memory, output as a file (always) and optionally a Canvas Group Set.

**Architecture:** A new `@canvas-toolchain/module-group-builder` package: a PII-free data layer (minimal local Canvas client + roster-file merge), six pluggable strategies, a seeded score-and-optimize engine with a pairing-history store, a heuristic major→bucket proposer, and three MCP tools (`create_groups`, `record_groups`, `propose_major_buckets`). No external vendor / no provider seam. Registered into C&C like `module-video`/`module-oral-assessment`.

**Tech Stack:** TypeScript (ESM, Node ≥20), `@canvas-toolchain/module-contract`, `@modelcontextprotocol/sdk`, vitest 3. No LLM. Canvas via a small local client; injected/stubbed in tests.

Spec: [`../specs/2026-06-12-group-creator-module-design.md`](../specs/2026-06-12-group-creator-module-design.md). Issue: #101.

**Reference implementation to copy boilerplate from:** the just-shipped `packages/module-oral-assessment` (package.json, tsconfig.json, module default export, ModuleTool shape, C&C registration). Canvas idiom reference: `packages/canvas-design-studio/src/canvas-api.ts` (`paginatedGet`/`request`, Link-header pagination, Bearer auth). C&C Canvas config: `packages/command-and-control/src/tools/setup_canvas.ts` (`loadCanvasConfig` → `~/.command-and-control/canvas-config.json`, fields `host`/`token`).

---

## File structure

**New package `packages/module-group-builder/`:**
- `package.json`, `tsconfig.json` — copy `module-oral-assessment`, rename.
- `src/types.ts` — `StudentRecord`, `StrategyId`, `GroupSpec`/`ResolvedGroupSpec`, `Grouping`, `Diagnostics`.
- `src/rng.ts` — seeded RNG (`makeRng`) + `shuffle`.
- `src/data/roster.ts` — parse the `canvas_id,pseudonym,major,...` CSV.
- `src/data/canvas-client.ts` — minimal local Canvas client (config loader + the new endpoints), injectable.
- `src/data/merge.ts` — merge Canvas data + roster → `StudentRecord[]`.
- `src/buckets/heuristic.ts` — major→bucket keyword classifier.
- `src/buckets/store.ts` — per-course `major-buckets.json` read/write.
- `src/spec.ts` — resolve `GroupSpec` → group count + target sizes.
- `src/strategies/*.ts` — one per strategy + `index.ts` registry.
- `src/engine/penalties.ts` — repeat-pairing + size-imbalance penalties.
- `src/engine/optimize.ts` — the score-and-optimize loop + diagnostics.
- `src/history/store.ts` — pairing-history read/append.
- `src/output/file.ts` — CSV + markdown writers.
- `src/output/canvas-push.ts` — create Canvas Group Set (injectable client).
- `src/tools.ts` — the three ModuleTools.
- `src/index.ts` — module default export.
- `tests/*.test.ts` — one suite per unit.

**Command & Control:**
- `src/modules/registry.ts` — add `group-builder` to `KNOWN_MODULES`.
- `package.json` — add the dependency.
- root `package.json` — add to the build-order list.

---

## PHASE 1 — Scaffold, core types, seeded RNG

### Task 1: Package scaffold

**Files:** Create `packages/module-group-builder/package.json`, `packages/module-group-builder/tsconfig.json`.

- [ ] **Step 1:** Copy `packages/module-oral-assessment/package.json` to the new path and change `"name"` to `"@canvas-toolchain/module-group-builder"` and `"description"` to `"Group Creator/Maintainer module for canvas-toolchain"`. Keep the same `dependencies` block BUT it does **not** need `@canvas-toolchain/shared-llm` (no LLM) — remove that line; keep `@canvas-toolchain/module-contract`, `@modelcontextprotocol/sdk`, and the devDeps (`typescript`, `vitest`, `@types/node`).
- [ ] **Step 2:** Copy `packages/module-oral-assessment/tsconfig.json` verbatim to the new path (it's path-relative-identical: extends `../../tsconfig.base.json`, outDir `./dist`, rootDir `./src`).
- [ ] **Step 3:** Run `npm install` (repo root) to link the workspace.
Expected: completes; `node_modules/@canvas-toolchain/module-group-builder` symlink exists.
- [ ] **Step 4:** Commit.
```bash
git add packages/module-group-builder/package.json packages/module-group-builder/tsconfig.json
git commit -m "feat(group-builder): scaffold module package"
```

### Task 2: Core types

**Files:** Create `src/types.ts`; Test `tests/types.test.ts`.

- [ ] **Step 1: Write the failing test**
```typescript
import { describe, it, expect } from 'vitest';
import type { StudentRecord, Grouping, StrategyId } from '../src/types.js';

describe('core types', () => {
  it('a StudentRecord is structurally usable', () => {
    const r: StudentRecord = { canvasId: '101', pseudonym: 'SU26-001', major: 'IT Management', metrics: { overallGrade: 91 } };
    expect(r.metrics.overallGrade).toBe(91);
  });
  it('a Grouping is an array of canvasId arrays', () => {
    const g: Grouping = [['101', '102'], ['103']];
    expect(g[0]).toContain('101');
  });
  it('StrategyId admits the six strategies', () => {
    const ids: StrategyId[] = ['random', 'alphabetical', 'weighted', 'heterogeneous', 'homogeneous', 'major-diversity'];
    expect(ids).toHaveLength(6);
  });
});
```
- [ ] **Step 2: Run — see it fail** (`npm test --workspace=packages/module-group-builder -- types`): cannot find `../src/types.js`.
- [ ] **Step 3: Write `src/types.ts`**
```typescript
export interface StudentRecord {
  canvasId: string;
  pseudonym: string;
  major?: string;
  majorBucket?: string;
  metrics: Record<string, number>; // overallGrade, attendance, assignmentsCompleted, priorReview, ...
}

export type StrategyId =
  | 'random' | 'alphabetical' | 'weighted' | 'heterogeneous' | 'homogeneous' | 'major-diversity';

/** A grouping is an ordered list of groups; each group is a list of canvasId. */
export type Grouping = string[][];

export interface GroupSpec {
  groupSize?: number;   // target members per group
  groupCount?: number;  // OR target number of groups (exactly one of the two)
}

export interface ResolvedGroupSpec {
  groupCount: number;
  /** target size per group index; sizes differ by at most one */
  targetSizes: number[];
}

export interface Diagnostics {
  strategy: StrategyId;
  groupCount: number;
  sizes: number[];
  repeatPairs: Array<[string, string]>; // canvasId pairs that recurred from history
  unmappedMajors?: string[];
  missingPseudonyms?: string[];          // canvasIds with no roster pseudonym
  seed: number;
}
```
- [ ] **Step 4: Run — see it pass.**
- [ ] **Step 5: Commit** `feat(group-builder): core types`.

### Task 3: Seeded RNG + shuffle

**Files:** Create `src/rng.ts`; Test `tests/rng.test.ts`.

- [ ] **Step 1: Write the failing test**
```typescript
import { describe, it, expect } from 'vitest';
import { makeRng, shuffle } from '../src/rng.js';

describe('seeded rng', () => {
  it('is deterministic for a given seed', () => {
    const a = makeRng(42); const b = makeRng(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
  it('shuffle is a permutation and reproducible by seed', () => {
    const input = [1, 2, 3, 4, 5];
    const s1 = shuffle(input, makeRng(7));
    const s2 = shuffle(input, makeRng(7));
    expect(s1).toEqual(s2);
    expect([...s1].sort()).toEqual([1, 2, 3, 4, 5]);
    expect(input).toEqual([1, 2, 3, 4, 5]); // does not mutate input
  });
});
```
- [ ] **Step 2: Run — see it fail.**
- [ ] **Step 3: Write `src/rng.ts`**
```typescript
/** mulberry32 — small, fast, seeded PRNG returning [0,1). */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates using the supplied rng. Returns a new array; does not mutate input. */
export function shuffle<T>(arr: readonly T[], rng: () => number): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
```
- [ ] **Step 4: Run — see it pass.**
- [ ] **Step 5: Commit** `feat(group-builder): seeded RNG + shuffle`.

### Task 4: Group-spec resolver

**Files:** Create `src/spec.ts`; Test `tests/spec.test.ts`.

- [ ] **Step 1: Write the failing test**
```typescript
import { describe, it, expect } from 'vitest';
import { resolveGroupSpec } from '../src/spec.js';

describe('resolveGroupSpec', () => {
  it('groupSize=4 over 10 students -> 3 groups sized 4,3,3', () => {
    const r = resolveGroupSpec({ groupSize: 4 }, 10);
    expect(r.groupCount).toBe(3);
    expect(r.targetSizes).toEqual([4, 3, 3]);
  });
  it('groupCount=3 over 10 -> sizes 4,3,3', () => {
    expect(resolveGroupSpec({ groupCount: 3 }, 10).targetSizes).toEqual([4, 3, 3]);
  });
  it('rejects when neither or both provided', () => {
    expect(() => resolveGroupSpec({}, 10)).toThrow(/exactly one/i);
    expect(() => resolveGroupSpec({ groupSize: 4, groupCount: 3 }, 10)).toThrow(/exactly one/i);
  });
  it('rejects zero students', () => {
    expect(() => resolveGroupSpec({ groupSize: 4 }, 0)).toThrow(/no students/i);
  });
});
```
- [ ] **Step 2: Run — see it fail.**
- [ ] **Step 3: Write `src/spec.ts`**
```typescript
import type { GroupSpec, ResolvedGroupSpec } from './types.js';

export function resolveGroupSpec(spec: GroupSpec, studentCount: number): ResolvedGroupSpec {
  if (studentCount <= 0) throw new Error('Cannot form groups: no students.');
  const hasSize = typeof spec.groupSize === 'number';
  const hasCount = typeof spec.groupCount === 'number';
  if (hasSize === hasCount) throw new Error('Provide exactly one of groupSize or groupCount.');

  const groupCount = hasCount
    ? (spec.groupCount as number)
    : Math.max(1, Math.ceil(studentCount / (spec.groupSize as number)));
  if (groupCount > studentCount) throw new Error('More groups requested than students.');

  const base = Math.floor(studentCount / groupCount);
  const extra = studentCount % groupCount;
  const targetSizes = Array.from({ length: groupCount }, (_, i) => base + (i < extra ? 1 : 0));
  return { groupCount, targetSizes };
}
```
- [ ] **Step 4: Run — see it pass.**
- [ ] **Step 5: Commit** `feat(group-builder): group-spec resolver`.

---

## PHASE 2 — Data layer

### Task 5: Roster CSV parser

**Files:** Create `src/data/roster.ts`; Test `tests/data/roster.test.ts`.

- [ ] **Step 1: Write the failing test**
```typescript
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseRosterFile } from '../../src/data/roster.js';

let dir: string;
afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

describe('parseRosterFile', () => {
  it('parses canvas_id,pseudonym,major + extra numeric metric columns', () => {
    dir = mkdtempSync(join(tmpdir(), 'gb-roster-'));
    const p = join(dir, 'roster.csv');
    writeFileSync(p, 'canvas_id,pseudonym,major,priorReview\n101,SU26-001,IT Management,4.2\n102,SU26-002,Marketing,3.8\n');
    const rows = parseRosterFile(p);
    expect(rows).toEqual([
      { canvasId: '101', pseudonym: 'SU26-001', major: 'IT Management', metrics: { priorReview: 4.2 } },
      { canvasId: '102', pseudonym: 'SU26-002', major: 'Marketing', metrics: { priorReview: 3.8 } },
    ]);
  });
  it('throws when canvas_id or pseudonym column is missing', () => {
    dir = mkdtempSync(join(tmpdir(), 'gb-roster-'));
    const p = join(dir, 'bad.csv');
    writeFileSync(p, 'name,major\nAda,IT\n');
    expect(() => parseRosterFile(p)).toThrow(/canvas_id.*pseudonym/i);
  });
});
```
- [ ] **Step 2: Run — see it fail.**
- [ ] **Step 3: Write `src/data/roster.ts`**
```typescript
import { readFileSync } from 'node:fs';

export interface RosterRow {
  canvasId: string;
  pseudonym: string;
  major?: string;
  metrics: Record<string, number>;
}

const RESERVED = new Set(['canvas_id', 'pseudonym', 'major']);

/** Parse a simple comma-separated roster. Required headers: canvas_id, pseudonym.
 *  Optional: major. Any other numeric column becomes a metric. */
export function parseRosterFile(path: string): RosterRow[] {
  const text = readFileSync(path, 'utf-8').replace(/\r\n/g, '\n').trim();
  const lines = text.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const headers = lines[0].split(',').map((h) => h.trim());
  if (!headers.includes('canvas_id') || !headers.includes('pseudonym')) {
    throw new Error('Roster file must have canvas_id and pseudonym columns.');
  }
  return lines.slice(1).map((line) => {
    const cells = line.split(',').map((c) => c.trim());
    const row: RosterRow = { canvasId: '', pseudonym: '', metrics: {} };
    headers.forEach((h, i) => {
      const v = cells[i] ?? '';
      if (h === 'canvas_id') row.canvasId = v;
      else if (h === 'pseudonym') row.pseudonym = v;
      else if (h === 'major') { if (v) row.major = v; }
      else if (!RESERVED.has(h)) {
        const n = Number(v);
        if (v !== '' && Number.isFinite(n)) row.metrics[h] = n;
      }
    });
    return row;
  });
}
```
- [ ] **Step 4: Run — see it pass.**
- [ ] **Step 5: Commit** `feat(group-builder): roster CSV parser`.

### Task 6: Minimal Canvas client

**Files:** Create `src/data/canvas-client.ts`; Test `tests/data/canvas-client.test.ts`.

This wraps `fetch`; tests stub `fetch` (no network). It reads `~/.command-and-control/canvas-config.json` (`host`, `token`).

- [ ] **Step 1: Write the failing test**
```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import { CanvasClient } from '../../src/data/canvas-client.js';

afterEach(() => { vi.restoreAllMocks(); });

function jsonResponse(body: unknown, link?: string): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: link ? { 'content-type': 'application/json', link } : { 'content-type': 'application/json' },
  });
}

describe('CanvasClient', () => {
  it('listStudentEnrollments follows Link-header pagination and Bearer-auths', async () => {
    const calls: string[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(url);
      const auth = (init?.headers as Record<string, string>).Authorization;
      expect(auth).toBe('Bearer tok');
      if (url.includes('page=2')) return jsonResponse([{ user_id: 2, grades: { current_score: 80 } }]);
      return jsonResponse(
        [{ user_id: 1, grades: { current_score: 91 } }],
        '<https://x.instructure.com/api/v1/courses/5/enrollments?page=2>; rel="next"',
      );
    });
    const c = new CanvasClient({ host: 'x.instructure.com', token: 'tok' }, { fetchImpl: fetchMock as unknown as typeof fetch });
    const rows = await c.listStudentEnrollments(5);
    expect(rows.map((r) => r.user_id)).toEqual([1, 2]);
    expect(calls[0]).toContain('/api/v1/courses/5/enrollments');
    expect(calls[0]).toContain('type%5B%5D=StudentEnrollment');
  });

  it('createGroupCategory POSTs the name', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.method).toBe('POST');
      expect(JSON.parse(String(init?.body))).toEqual({ name: 'Week 3 Teams' });
      return jsonResponse({ id: 77, name: 'Week 3 Teams' });
    });
    const c = new CanvasClient({ host: 'x.instructure.com', token: 'tok' }, { fetchImpl: fetchMock as unknown as typeof fetch });
    expect(await c.createGroupCategory(5, 'Week 3 Teams')).toEqual({ id: 77, name: 'Week 3 Teams' });
  });
});
```
- [ ] **Step 2: Run — see it fail.**
- [ ] **Step 3: Write `src/data/canvas-client.ts`**
```typescript
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface CanvasCreds { host: string; token: string; }

export interface EnrollmentRow {
  user_id: number;
  grades?: { current_score?: number | null };
}
export interface SubmissionRow { user_id: number; assignment_id: number; workflow_state: string; }
export interface GroupCategory { id: number; name: string; }
export interface CanvasGroup { id: number; name: string; }

export interface CanvasClientOptions { fetchImpl?: typeof fetch; }

export function loadCanvasCreds(): CanvasCreds {
  const path = join(process.env.CC_HOME ?? join(homedir(), '.command-and-control'), 'canvas-config.json');
  if (!existsSync(path)) throw new Error('CANVAS_NOT_CONFIGURED: Run setup_canvas with your Canvas host and token.');
  let cfg: Partial<CanvasCreds>;
  try { cfg = JSON.parse(readFileSync(path, 'utf-8')) as Partial<CanvasCreds>; }
  catch { throw new Error('CANVAS_NOT_CONFIGURED: canvas-config.json is corrupt. Re-run setup_canvas.'); }
  if (!cfg.host || !cfg.token) throw new Error('CANVAS_NOT_CONFIGURED: canvas-config.json missing host/token.');
  return { host: cfg.host, token: cfg.token };
}

function parseNextLink(link: string | null): string | undefined {
  if (!link) return undefined;
  for (const part of link.split(',')) {
    const m = part.match(/<([^>]+)>;\s*rel="next"/);
    if (m) return m[1];
  }
  return undefined;
}

export class CanvasClient {
  private readonly fetchImpl: typeof fetch;
  constructor(private readonly creds: CanvasCreds, opts: CanvasClientOptions = {}) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }
  private base(): string { return `https://${this.creds.host}/api/v1`; }
  private headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.creds.token}`, 'Content-Type': 'application/json', Accept: 'application/json' };
  }
  private async getAll<T>(url: string): Promise<T[]> {
    const out: T[] = [];
    let next: string | undefined = url;
    while (next) {
      const res = await this.fetchImpl(next, { method: 'GET', headers: this.headers() });
      if (!res.ok) throw new Error(`Canvas GET ${next} failed: ${res.status}`);
      out.push(...((await res.json()) as T[]));
      next = parseNextLink(res.headers.get('link'));
    }
    return out;
  }
  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await this.fetchImpl(`${this.base()}/${path}`, { method: 'POST', headers: this.headers(), body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`Canvas POST ${path} failed: ${res.status}`);
    return (await res.json()) as T;
  }

  /** Active student enrollments incl. current_score. */
  listStudentEnrollments(courseId: number): Promise<EnrollmentRow[]> {
    const url = `${this.base()}/courses/${courseId}/enrollments?` +
      `type%5B%5D=StudentEnrollment&state%5B%5D=active&per_page=100`;
    return this.getAll<EnrollmentRow>(url);
  }
  /** Submissions for a set of assignment ids across all students. */
  listSubmissions(courseId: number, assignmentIds: number[]): Promise<SubmissionRow[]> {
    if (assignmentIds.length === 0) return Promise.resolve([]);
    const q = assignmentIds.map((id) => `assignment_ids%5B%5D=${id}`).join('&');
    const url = `${this.base()}/courses/${courseId}/students/submissions?student_ids%5B%5D=all&${q}&per_page=100`;
    return this.getAll<SubmissionRow>(url);
  }
  createGroupCategory(courseId: number, name: string): Promise<GroupCategory> {
    return this.post<GroupCategory>(`courses/${courseId}/group_categories`, { name });
  }
  createGroup(categoryId: number, name: string): Promise<CanvasGroup> {
    return this.post<CanvasGroup>(`group_categories/${categoryId}/groups`, { name });
  }
  addGroupMember(groupId: number, canvasUserId: number): Promise<unknown> {
    return this.post(`groups/${groupId}/memberships`, { user_id: canvasUserId });
  }
}
```
- [ ] **Step 4: Run — see it pass.**
- [ ] **Step 5: Commit** `feat(group-builder): minimal local Canvas client`.

### Task 7: Build StudentRecords (merge Canvas + roster)

**Files:** Create `src/data/merge.ts`; Test `tests/data/merge.test.ts`.

- [ ] **Step 1: Write the failing test**
```typescript
import { describe, it, expect } from 'vitest';
import { buildStudentRecords } from '../../src/data/merge.js';

describe('buildStudentRecords', () => {
  it('keys by canvasId, pulls overallGrade + assignmentsCompleted, merges roster pseudonym/major/metrics', () => {
    const enrollments = [
      { user_id: 1, grades: { current_score: 91 } },
      { user_id: 2, grades: { current_score: 80 } },
    ];
    const submissions = [
      { user_id: 1, assignment_id: 10, workflow_state: 'graded' },
      { user_id: 1, assignment_id: 11, workflow_state: 'submitted' },
      { user_id: 2, assignment_id: 10, workflow_state: 'unsubmitted' },
    ];
    const roster = [
      { canvasId: '1', pseudonym: 'SU26-001', major: 'IT Management', metrics: { priorReview: 4.2 } },
    ];
    const { records, diagnostics } = buildStudentRecords({ enrollments, submissions, roster });
    const s1 = records.find((r) => r.canvasId === '1')!;
    expect(s1.pseudonym).toBe('SU26-001');
    expect(s1.major).toBe('IT Management');
    expect(s1.metrics.overallGrade).toBe(91);
    expect(s1.metrics.assignmentsCompleted).toBe(2); // graded + submitted count as completed
    expect(s1.metrics.priorReview).toBe(4.2);
    const s2 = records.find((r) => r.canvasId === '2')!;
    expect(s2.metrics.assignmentsCompleted).toBe(0); // unsubmitted not counted
    expect(diagnostics.missingPseudonyms).toContain('2'); // not in roster
  });
});
```
- [ ] **Step 2: Run — see it fail.**
- [ ] **Step 3: Write `src/data/merge.ts`**
```typescript
import type { StudentRecord } from '../types.js';
import type { EnrollmentRow, SubmissionRow } from './canvas-client.js';
import type { RosterRow } from './roster.js';

const COMPLETED = new Set(['graded', 'submitted', 'pending_review']);

export interface MergeInput {
  enrollments: EnrollmentRow[];
  submissions?: SubmissionRow[];
  roster: RosterRow[];
}

export function buildStudentRecords(input: MergeInput): { records: StudentRecord[]; diagnostics: { missingPseudonyms: string[] } } {
  const rosterByCanvas = new Map(input.roster.map((r) => [r.canvasId, r]));
  const completedByUser = new Map<number, number>();
  for (const s of input.submissions ?? []) {
    if (COMPLETED.has(s.workflow_state)) completedByUser.set(s.user_id, (completedByUser.get(s.user_id) ?? 0) + 1);
  }
  const missingPseudonyms: string[] = [];
  const records: StudentRecord[] = input.enrollments.map((e) => {
    const canvasId = String(e.user_id);
    const r = rosterByCanvas.get(canvasId);
    if (!r) missingPseudonyms.push(canvasId);
    const metrics: Record<string, number> = { ...(r?.metrics ?? {}) };
    if (typeof e.grades?.current_score === 'number') metrics.overallGrade = e.grades.current_score;
    metrics.assignmentsCompleted = completedByUser.get(e.user_id) ?? 0;
    const rec: StudentRecord = { canvasId, pseudonym: r?.pseudonym ?? '', metrics };
    if (r?.major) rec.major = r.major;
    return rec;
  });
  return { records, diagnostics: { missingPseudonyms } };
}
```
- [ ] **Step 4: Run — see it pass.**
- [ ] **Step 5: Commit** `feat(group-builder): merge Canvas + roster into StudentRecords`.

---

## PHASE 3 — Major buckets

### Task 8: Major→bucket heuristic

**Files:** Create `src/buckets/heuristic.ts`; Test `tests/buckets/heuristic.test.ts`.

- [ ] **Step 1: Write the failing test**
```typescript
import { describe, it, expect } from 'vitest';
import { proposeMajorBuckets, bucketForMajor } from '../../src/buckets/heuristic.js';

describe('major bucket heuristic (Kevin\'s seed rules)', () => {
  it('classifies known majors', () => {
    expect(bucketForMajor('IT Management')).toBe('technical');
    expect(bucketForMajor('Business Analytics')).toBe('technical');
    expect(bucketForMajor('Information Systems')).toBe('technical');
    expect(bucketForMajor('Accounting')).toBe('quantitative');
    expect(bucketForMajor('Finance')).toBe('quantitative');
    expect(bucketForMajor('Economics')).toBe('quantitative');
    expect(bucketForMajor('Marketing')).toBe('creative');
    expect(bucketForMajor('General Business')).toBe('business');
    expect(bucketForMajor('Underwater Basket Weaving')).toBe('other');
  });
  it('proposeMajorBuckets returns a map + the "other" list over distinct majors', () => {
    const { map, other } = proposeMajorBuckets(['IT Management', 'Marketing', 'Philosophy', 'Marketing']);
    expect(map).toEqual({ 'IT Management': 'technical', Marketing: 'creative', Philosophy: 'other' });
    expect(other).toEqual(['Philosophy']);
  });
});
```
- [ ] **Step 2: Run — see it fail.**
- [ ] **Step 3: Write `src/buckets/heuristic.ts`**
```typescript
export type Bucket = 'technical' | 'quantitative' | 'creative' | 'business' | 'other';

const RULES: Array<{ bucket: Bucket; patterns: RegExp[] }> = [
  { bucket: 'technical', patterns: [/\bit\b/i, /information (systems|technology)/i, /\banalytics\b/i, /data\b/i, /computer/i] },
  { bucket: 'quantitative', patterns: [/account/i, /financ/i, /econ/i, /statistic/i] },
  { bucket: 'creative', patterns: [/market/i, /communicat/i, /design/i, /media/i, /art/i] },
  { bucket: 'business', patterns: [/general business/i, /\bmanagement\b/i, /\bbusiness\b/i, /entrepreneur/i] },
];

export function bucketForMajor(major: string): Bucket {
  for (const rule of RULES) {
    if (rule.patterns.some((p) => p.test(major))) return rule.bucket;
  }
  return 'other';
}

export function proposeMajorBuckets(majors: string[]): { map: Record<string, Bucket>; other: string[] } {
  const distinct = [...new Set(majors.map((m) => m.trim()).filter(Boolean))];
  const map: Record<string, Bucket> = {};
  const other: string[] = [];
  for (const m of distinct) {
    const b = bucketForMajor(m);
    map[m] = b;
    if (b === 'other') other.push(m);
  }
  return { map, other };
}
```
> Note: `business` rule lists `/\bbusiness\b/` after `general business`; since both map to `business` order doesn't matter here, but keep `technical`/`quantitative`/`creative` ahead of the broad `business` catch so "Business Analytics" resolves to technical (the `analytics` pattern under technical is checked first because technical is the first rule). The test for "Business Analytics"→technical guards this ordering.
- [ ] **Step 4: Run — see it pass.**
- [ ] **Step 5: Commit** `feat(group-builder): major->bucket heuristic`.

### Task 9: Major-buckets store (per-course persistence)

**Files:** Create `src/buckets/store.ts`; Test `tests/buckets/store.test.ts`.

- [ ] **Step 1: Write the failing test**
```typescript
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadMajorBuckets, saveMajorBuckets } from '../../src/buckets/store.js';

let home: string;
const saved = process.env.CC_HOME;
afterEach(() => { if (home) rmSync(home, { recursive: true, force: true }); if (saved === undefined) delete process.env.CC_HOME; else process.env.CC_HOME = saved; });

describe('major-buckets store', () => {
  it('round-trips per course; returns undefined when absent', () => {
    home = mkdtempSync(join(tmpdir(), 'gb-buckets-'));
    process.env.CC_HOME = home;
    expect(loadMajorBuckets('5')).toBeUndefined();
    saveMajorBuckets('5', { 'IT Management': 'technical', Marketing: 'creative' });
    expect(loadMajorBuckets('5')).toEqual({ 'IT Management': 'technical', Marketing: 'creative' });
  });
});
```
- [ ] **Step 2: Run — see it fail.**
- [ ] **Step 3: Write `src/buckets/store.ts`**
```typescript
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Bucket } from './heuristic.js';

function courseDir(courseId: string): string {
  return join(process.env.CC_HOME ?? join(homedir(), '.command-and-control'), 'groups', courseId);
}
function bucketsPath(courseId: string): string { return join(courseDir(courseId), 'major-buckets.json'); }

export function loadMajorBuckets(courseId: string): Record<string, Bucket> | undefined {
  const p = bucketsPath(courseId);
  if (!existsSync(p)) return undefined;
  try { return JSON.parse(readFileSync(p, 'utf-8')) as Record<string, Bucket>; }
  catch { return undefined; }
}

export function saveMajorBuckets(courseId: string, map: Record<string, Bucket>): string {
  const dir = courseDir(courseId);
  mkdirSync(dir, { recursive: true });
  const p = bucketsPath(courseId);
  const tmp = `${p}.tmp`;
  writeFileSync(tmp, JSON.stringify(map, null, 2), { encoding: 'utf-8', mode: 0o600 });
  renameSync(tmp, p);
  return p;
}
```
- [ ] **Step 4: Run — see it pass.**
- [ ] **Step 5: Commit** `feat(group-builder): per-course major-buckets store`.

---

## PHASE 4 — Strategies

Each strategy file exports a `Strategy` object `{ id, generateCandidate(records, spec, rng, opts), misfit(grouping, records, opts) }`. First, the shared interface.

### Task 10: Strategy interface + chunk helper

**Files:** Create `src/strategies/types.ts`; Test `tests/strategies/types.test.ts`.

- [ ] **Step 1: Write the failing test**
```typescript
import { describe, it, expect } from 'vitest';
import { chunkBySizes } from '../../src/strategies/types.js';

describe('chunkBySizes', () => {
  it('splits an ordered id list into groups of the target sizes', () => {
    expect(chunkBySizes(['a', 'b', 'c', 'd', 'e'], [2, 2, 1])).toEqual([['a', 'b'], ['c', 'd'], ['e']]);
  });
});
```
- [ ] **Step 2: Run — see it fail.**
- [ ] **Step 3: Write `src/strategies/types.ts`**
```typescript
import type { Grouping, ResolvedGroupSpec, StudentRecord } from '../types.js';

export interface StrategyOpts {
  metric?: string;                         // for heterogeneous/homogeneous (default overallGrade)
  weights?: Record<string, number>;        // for weighted
  weightedMode?: 'balance' | 'cluster';    // default 'balance'
  majorBuckets?: Record<string, string>;   // for major-diversity
}

export interface Strategy {
  id: string;
  generateCandidate(records: StudentRecord[], spec: ResolvedGroupSpec, rng: () => number, opts: StrategyOpts): Grouping;
  /** 0 = perfect fit to the strategy's intent; larger = worse. */
  misfit(grouping: Grouping, records: StudentRecord[], opts: StrategyOpts): number;
}

/** Split an ordered id list into consecutive groups of the given sizes. */
export function chunkBySizes(ids: string[], sizes: number[]): Grouping {
  const out: Grouping = [];
  let i = 0;
  for (const s of sizes) { out.push(ids.slice(i, i + s)); i += s; }
  return out;
}
```
- [ ] **Step 4: Run — see it pass.**
- [ ] **Step 5: Commit** `feat(group-builder): strategy interface + chunk helper`.

### Task 11: Random + alphabetical strategies

**Files:** Create `src/strategies/random.ts`, `src/strategies/alphabetical.ts`; Test `tests/strategies/simple.test.ts`.

- [ ] **Step 1: Write the failing test**
```typescript
import { describe, it, expect } from 'vitest';
import { randomStrategy } from '../../src/strategies/random.js';
import { alphabeticalStrategy } from '../../src/strategies/alphabetical.js';
import { makeRng } from '../../src/rng.js';
import type { StudentRecord } from '../../src/types.js';

const recs: StudentRecord[] = ['001', '002', '003', '004', '005'].map((p, i) => ({
  canvasId: String(i + 1), pseudonym: `SU26-${p}`, metrics: {},
}));
const spec = { groupCount: 2, targetSizes: [3, 2] };

describe('simple strategies', () => {
  it('random produces correctly-sized groups covering everyone, reproducible by seed', () => {
    const g1 = randomStrategy.generateCandidate(recs, spec, makeRng(1), {});
    const g2 = randomStrategy.generateCandidate(recs, spec, makeRng(1), {});
    expect(g1).toEqual(g2);
    expect(g1.map((x) => x.length)).toEqual([3, 2]);
    expect(g1.flat().sort()).toEqual(['1', '2', '3', '4', '5']);
  });
  it('alphabetical orders by pseudonym then chunks', () => {
    const g = alphabeticalStrategy.generateCandidate(recs, spec, makeRng(1), {});
    expect(g).toEqual([['1', '2', '3'], ['4', '5']]); // pseudonyms already in order
    expect(alphabeticalStrategy.misfit(g, recs, {})).toBe(0);
  });
});
```
- [ ] **Step 2: Run — see it fail.**
- [ ] **Step 3: Write the two files**

`src/strategies/random.ts`:
```typescript
import type { Strategy } from './types.js';
import { chunkBySizes } from './types.js';
import { shuffle } from '../rng.js';

export const randomStrategy: Strategy = {
  id: 'random',
  generateCandidate(records, spec, rng) {
    const ids = shuffle(records.map((r) => r.canvasId), rng);
    return chunkBySizes(ids, spec.targetSizes);
  },
  misfit() { return 0; }, // any assignment is equally valid
};
```

`src/strategies/alphabetical.ts`:
```typescript
import type { Strategy } from './types.js';
import { chunkBySizes } from './types.js';

export const alphabeticalStrategy: Strategy = {
  id: 'alphabetical',
  generateCandidate(records, spec) {
    const ids = [...records].sort((a, b) => a.pseudonym.localeCompare(b.pseudonym)).map((r) => r.canvasId);
    return chunkBySizes(ids, spec.targetSizes);
  },
  misfit() { return 0; }, // deterministic single layout
};
```
- [ ] **Step 4: Run — see it pass.**
- [ ] **Step 5: Commit** `feat(group-builder): random + alphabetical strategies`.

### Task 12: Heterogeneous + homogeneous (performance) strategies

**Files:** Create `src/strategies/performance.ts`; Test `tests/strategies/performance.test.ts`.

- [ ] **Step 1: Write the failing test**
```typescript
import { describe, it, expect } from 'vitest';
import { heterogeneousStrategy, homogeneousStrategy } from '../../src/strategies/performance.js';
import { makeRng } from '../../src/rng.js';
import type { StudentRecord } from '../../src/types.js';

const recs: StudentRecord[] = [
  { canvasId: '1', pseudonym: 'A', metrics: { overallGrade: 95 } },
  { canvasId: '2', pseudonym: 'B', metrics: { overallGrade: 85 } },
  { canvasId: '3', pseudonym: 'C', metrics: { overallGrade: 75 } },
  { canvasId: '4', pseudonym: 'D', metrics: { overallGrade: 65 } },
];
const spec = { groupCount: 2, targetSizes: [2, 2] };

describe('performance strategies', () => {
  it('heterogeneous spreads high+low together (snake draft by grade)', () => {
    const g = heterogeneousStrategy.generateCandidate(recs, spec, makeRng(1), {});
    // sorted desc: 1(95),2(85),3(75),4(65); snake into 2 groups -> [1,4],[2,3]
    const sizes = g.map((x) => x.length);
    expect(sizes).toEqual([2, 2]);
    // each group should contain one of the top-2 and one of the bottom-2
    for (const grp of g) {
      const grades = grp.map((id) => recs.find((r) => r.canvasId === id)!.metrics.overallGrade);
      expect(Math.max(...grades) - Math.min(...grades)).toBeGreaterThanOrEqual(10);
    }
  });
  it('homogeneous clusters similar performers', () => {
    const g = homogeneousStrategy.generateCandidate(recs, spec, makeRng(1), {});
    expect(g).toEqual([['1', '2'], ['3', '4']]); // top pair, bottom pair
  });
});
```
- [ ] **Step 2: Run — see it fail.**
- [ ] **Step 3: Write `src/strategies/performance.ts`**
```typescript
import type { Strategy, StrategyOpts } from './types.js';
import { chunkBySizes } from './types.js';
import type { Grouping, StudentRecord } from '../types.js';

function metricOf(r: StudentRecord, opts: StrategyOpts): number {
  return r.metrics[opts.metric ?? 'overallGrade'] ?? 0;
}
function sortedDesc(records: StudentRecord[], opts: StrategyOpts): StudentRecord[] {
  return [...records].sort((a, b) => metricOf(b, opts) - metricOf(a, opts));
}

/** Snake-draft sorted students across groups so each group spans the range. */
export const heterogeneousStrategy: Strategy = {
  id: 'heterogeneous',
  generateCandidate(records, spec, _rng, opts) {
    const ordered = sortedDesc(records, opts);
    const groups: string[][] = Array.from({ length: spec.groupCount }, () => []);
    let dir = 1, g = 0;
    for (const r of ordered) {
      groups[g].push(r.canvasId);
      if (dir === 1 && g === spec.groupCount - 1) dir = -1;
      else if (dir === -1 && g === 0) dir = 1;
      else g += dir;
    }
    return groups;
  },
  misfit(grouping, records, opts) {
    // lower variance of per-group mean => better spread => lower misfit
    return groupMeanVariance(grouping, records, opts);
  },
};

export const homogeneousStrategy: Strategy = {
  id: 'homogeneous',
  generateCandidate(records, spec, _rng, opts) {
    const ids = sortedDesc(records, opts).map((r) => r.canvasId);
    return chunkBySizes(ids, spec.targetSizes);
  },
  misfit(grouping, records, opts) {
    // higher within-group similarity => lower misfit; use negative of between-group spread
    return -groupMeanVariance(grouping, records, opts);
  },
};

function groupMeanVariance(grouping: Grouping, records: StudentRecord[], opts: StrategyOpts): number {
  const byId = new Map(records.map((r) => [r.canvasId, r] as const));
  const means = grouping.map((grp) => {
    if (grp.length === 0) return 0;
    return grp.reduce((s, id) => s + metricOf(byId.get(id)!, opts), 0) / grp.length;
  });
  const overall = means.reduce((s, m) => s + m, 0) / (means.length || 1);
  return means.reduce((s, m) => s + (m - overall) ** 2, 0) / (means.length || 1);
}
```
- [ ] **Step 4: Run — see it pass.**
- [ ] **Step 5: Commit** `feat(group-builder): heterogeneous + homogeneous strategies`.

### Task 13: Weighted strategy

**Files:** Create `src/strategies/weighted.ts`; Test `tests/strategies/weighted.test.ts`.

The weighted strategy computes a composite score per student from `opts.weights` over metric names (missing metrics drop out and remaining weights renormalize), then **balances** that composite across groups by default (delegating to the heterogeneous snake-draft on the composite), or clusters when `weightedMode === 'cluster'`.

- [ ] **Step 1: Write the failing test**
```typescript
import { describe, it, expect } from 'vitest';
import { weightedStrategy, compositeScore } from '../../src/strategies/weighted.js';
import { makeRng } from '../../src/rng.js';
import type { StudentRecord } from '../../src/types.js';

describe('weighted strategy', () => {
  it('compositeScore renormalizes when a weighted metric is missing', () => {
    const r: StudentRecord = { canvasId: '1', pseudonym: 'A', metrics: { overallGrade: 80 } }; // no priorReview
    const score = compositeScore(r, { priorReview: 0.5, overallGrade: 0.5 });
    expect(score).toBeCloseTo(80); // priorReview drops; overallGrade weight renormalizes to 1.0
  });
  it('balances composite across groups by default', () => {
    const recs: StudentRecord[] = [
      { canvasId: '1', pseudonym: 'A', metrics: { overallGrade: 100 } },
      { canvasId: '2', pseudonym: 'B', metrics: { overallGrade: 90 } },
      { canvasId: '3', pseudonym: 'C', metrics: { overallGrade: 60 } },
      { canvasId: '4', pseudonym: 'D', metrics: { overallGrade: 50 } },
    ];
    const g = weightedStrategy.generateCandidate(recs, { groupCount: 2, targetSizes: [2, 2] }, makeRng(1), { weights: { overallGrade: 1 } });
    for (const grp of g) {
      const sum = grp.reduce((s, id) => s + recs.find((r) => r.canvasId === id)!.metrics.overallGrade, 0);
      expect(sum).toBe(150); // 100+50 and 90+60 — balanced
    }
  });
});
```
- [ ] **Step 2: Run — see it fail.**
- [ ] **Step 3: Write `src/strategies/weighted.ts`**
```typescript
import type { Strategy, StrategyOpts } from './types.js';
import type { StudentRecord } from '../types.js';
import { heterogeneousStrategy, homogeneousStrategy } from './performance.js';

const DEFAULT_WEIGHTS: Record<string, number> = {
  priorReview: 0.4, attendance: 0.3, assignmentsCompleted: 0.2, overallGrade: 0.1,
};

export function compositeScore(r: StudentRecord, weights: Record<string, number>): number {
  const present = Object.entries(weights).filter(([k]) => typeof r.metrics[k] === 'number');
  const total = present.reduce((s, [, w]) => s + w, 0);
  if (total === 0) return 0;
  return present.reduce((s, [k, w]) => s + (w / total) * (r.metrics[k] as number), 0);
}

export const weightedStrategy: Strategy = {
  id: 'weighted',
  generateCandidate(records, spec, rng, opts) {
    const weights = opts.weights ?? DEFAULT_WEIGHTS;
    const scored: StudentRecord[] = records.map((r) => ({ ...r, metrics: { ...r.metrics, __composite: compositeScore(r, weights) } }));
    const inner = opts.weightedMode === 'cluster' ? homogeneousStrategy : heterogeneousStrategy;
    return inner.generateCandidate(scored, spec, rng, { metric: '__composite' });
  },
  misfit(grouping, records, opts) {
    const weights = opts.weights ?? DEFAULT_WEIGHTS;
    const scored: StudentRecord[] = records.map((r) => ({ ...r, metrics: { ...r.metrics, __composite: compositeScore(r, weights) } }));
    const inner = opts.weightedMode === 'cluster' ? homogeneousStrategy : heterogeneousStrategy;
    return inner.misfit(grouping, scored, { metric: '__composite' });
  },
};
```
- [ ] **Step 4: Run — see it pass.**
- [ ] **Step 5: Commit** `feat(group-builder): weighted-by-accomplishment strategy`.

### Task 14: Major-diversity strategy + registry

**Files:** Create `src/strategies/major-diversity.ts`, `src/strategies/index.ts`; Test `tests/strategies/major-diversity.test.ts`, `tests/strategies/registry.test.ts`.

- [ ] **Step 1: Write the failing tests**

`tests/strategies/major-diversity.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { majorDiversityStrategy } from '../../src/strategies/major-diversity.js';
import { makeRng } from '../../src/rng.js';
import type { StudentRecord } from '../../src/types.js';

const recs: StudentRecord[] = [
  { canvasId: '1', pseudonym: 'A', major: 'IT Management', metrics: {} },
  { canvasId: '2', pseudonym: 'B', major: 'Marketing', metrics: {} },
  { canvasId: '3', pseudonym: 'C', major: 'Accounting', metrics: {} },
  { canvasId: '4', pseudonym: 'D', major: 'IT Management', metrics: {} },
];
const buckets = { 'IT Management': 'technical', Marketing: 'creative', Accounting: 'quantitative' };

describe('major-diversity strategy', () => {
  it('spreads buckets so each group mixes types', () => {
    const g = majorDiversityStrategy.generateCandidate(recs, { groupCount: 2, targetSizes: [2, 2] }, makeRng(1), { majorBuckets: buckets });
    expect(g.map((x) => x.length)).toEqual([2, 2]);
    // the two technical students (1,4) should not both land in the same group
    const grpOf = (id: string) => g.findIndex((grp) => grp.includes(id));
    expect(grpOf('1')).not.toBe(grpOf('4'));
  });
});
```

`tests/strategies/registry.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { getStrategy, STRATEGY_IDS } from '../../src/strategies/index.js';

describe('strategy registry', () => {
  it('resolves all six ids', () => {
    expect(STRATEGY_IDS).toEqual(['random', 'alphabetical', 'weighted', 'heterogeneous', 'homogeneous', 'major-diversity']);
    for (const id of STRATEGY_IDS) expect(getStrategy(id).id).toBe(id);
  });
  it('throws on unknown id', () => {
    expect(() => getStrategy('nope' as never)).toThrow(/unknown strategy/i);
  });
});
```
- [ ] **Step 2: Run — see them fail.**
- [ ] **Step 3: Write the files**

`src/strategies/major-diversity.ts`:
```typescript
import type { Strategy, StrategyOpts } from './types.js';
import type { Grouping, StudentRecord } from '../types.js';
import { shuffle } from '../rng.js';

function bucketOf(r: StudentRecord, opts: StrategyOpts): string {
  const map = opts.majorBuckets ?? {};
  return (r.major && map[r.major]) || 'other';
}

export const majorDiversityStrategy: Strategy = {
  id: 'major-diversity',
  generateCandidate(records, spec, rng, opts) {
    // Bucket -> shuffled queue of ids; round-robin deal one bucket at a time across groups.
    const byBucket = new Map<string, string[]>();
    for (const r of shuffle(records, rng)) {
      const b = bucketOf(r, opts);
      (byBucket.get(b) ?? byBucket.set(b, []).get(b)!).push(r.canvasId);
    }
    const groups: string[][] = Array.from({ length: spec.groupCount }, () => []);
    let g = 0;
    // deal bucket by bucket so same-bucket members spread across distinct groups first
    for (const queue of byBucket.values()) {
      for (const id of queue) { groups[g % spec.groupCount].push(id); g++; }
    }
    return rebalance(groups, spec.targetSizes);
  },
  misfit(grouping, records, opts) {
    // fewer same-bucket collisions within a group => lower misfit
    const byId = new Map(records.map((r) => [r.canvasId, r] as const));
    let collisions = 0;
    for (const grp of grouping) {
      const seen = new Map<string, number>();
      for (const id of grp) {
        const b = bucketOf(byId.get(id)!, opts);
        const c = (seen.get(b) ?? 0); collisions += c; seen.set(b, c + 1);
      }
    }
    return collisions;
  },
};

/** Move members between groups so sizes match targetSizes (greedy). */
function rebalance(groups: Grouping, targetSizes: number[]): Grouping {
  const flat = groups.flat();
  const out: Grouping = [];
  let i = 0;
  for (const s of targetSizes) { out.push(flat.slice(i, i + s)); i += s; }
  return out;
}
```
> Note: the round-robin deal already distributes same-bucket members across distinct groups; the final `rebalance` re-chunks to exact sizes preserving the deal order, so same-bucket spreading is largely retained and the optimizer (Phase 5) picks the lowest-collision candidate across shuffles.

`src/strategies/index.ts`:
```typescript
import type { Strategy } from './types.js';
import { randomStrategy } from './random.js';
import { alphabeticalStrategy } from './alphabetical.js';
import { weightedStrategy } from './weighted.js';
import { heterogeneousStrategy, homogeneousStrategy } from './performance.js';
import { majorDiversityStrategy } from './major-diversity.js';
import type { StrategyId } from '../types.js';

const REGISTRY: Record<StrategyId, Strategy> = {
  random: randomStrategy,
  alphabetical: alphabeticalStrategy,
  weighted: weightedStrategy,
  heterogeneous: heterogeneousStrategy,
  homogeneous: homogeneousStrategy,
  'major-diversity': majorDiversityStrategy,
};

export const STRATEGY_IDS: StrategyId[] = ['random', 'alphabetical', 'weighted', 'heterogeneous', 'homogeneous', 'major-diversity'];

export function getStrategy(id: StrategyId): Strategy {
  const s = REGISTRY[id];
  if (!s) throw new Error(`Unknown strategy: '${id}'`);
  return s;
}
```
- [ ] **Step 4: Run — see them pass.**
- [ ] **Step 5: Commit** `feat(group-builder): major-diversity strategy + registry`.

---

## PHASE 5 — Engine (penalties + optimizer) + history

### Task 15: Pairing-history store

**Files:** Create `src/history/store.ts`; Test `tests/history/store.test.ts`.

- [ ] **Step 1: Write the failing test**
```typescript
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadHistory, appendGrouping, pairKey } from '../../src/history/store.js';

let home: string; const saved = process.env.CC_HOME;
afterEach(() => { if (home) rmSync(home, { recursive: true, force: true }); if (saved === undefined) delete process.env.CC_HOME; else process.env.CC_HOME = saved; });

describe('pairing-history store', () => {
  it('starts empty, records pairs from a committed grouping', () => {
    home = mkdtempSync(join(tmpdir(), 'gb-hist-')); process.env.CC_HOME = home;
    expect(loadHistory('5').pairCounts).toEqual({});
    appendGrouping('5', [['1', '2', '3'], ['4', '5']]);
    const h = loadHistory('5');
    expect(h.pairCounts[pairKey('1', '2')]).toBe(1);
    expect(h.pairCounts[pairKey('2', '3')]).toBe(1);
    expect(h.pairCounts[pairKey('4', '5')]).toBe(1);
    expect(h.pairCounts[pairKey('1', '4')]).toBeUndefined();
    appendGrouping('5', [['1', '2'], ['3', '4', '5']]);
    expect(loadHistory('5').pairCounts[pairKey('1', '2')]).toBe(2);
  });
});
```
- [ ] **Step 2: Run — see it fail.**
- [ ] **Step 3: Write `src/history/store.ts`**
```typescript
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Grouping } from '../types.js';

export interface History { pairCounts: Record<string, number>; }

function dir(courseId: string): string {
  return join(process.env.CC_HOME ?? join(homedir(), '.command-and-control'), 'groups', courseId);
}
function histPath(courseId: string): string { return join(dir(courseId), 'pairing-history.json'); }

export function pairKey(a: string, b: string): string { return a < b ? `${a}|${b}` : `${b}|${a}`; }

export function loadHistory(courseId: string): History {
  const p = histPath(courseId);
  if (!existsSync(p)) return { pairCounts: {} };
  try { const h = JSON.parse(readFileSync(p, 'utf-8')) as History; return h.pairCounts ? h : { pairCounts: {} }; }
  catch { return { pairCounts: {} }; }
}

export function appendGrouping(courseId: string, grouping: Grouping): string {
  const h = loadHistory(courseId);
  for (const grp of grouping) {
    for (let i = 0; i < grp.length; i++) {
      for (let j = i + 1; j < grp.length; j++) {
        const k = pairKey(grp[i], grp[j]);
        h.pairCounts[k] = (h.pairCounts[k] ?? 0) + 1;
      }
    }
  }
  mkdirSync(dir(courseId), { recursive: true });
  const p = histPath(courseId);
  const tmp = `${p}.tmp`;
  writeFileSync(tmp, JSON.stringify(h, null, 2), { encoding: 'utf-8', mode: 0o600 });
  renameSync(tmp, p);
  return p;
}
```
- [ ] **Step 4: Run — see it pass.**
- [ ] **Step 5: Commit** `feat(group-builder): pairing-history store`.

### Task 16: Penalties

**Files:** Create `src/engine/penalties.ts`; Test `tests/engine/penalties.test.ts`.

- [ ] **Step 1: Write the failing test**
```typescript
import { describe, it, expect } from 'vitest';
import { repeatPairingPenalty, sizeImbalancePenalty, repeatPairs } from '../../src/engine/penalties.js';
import { pairKey } from '../../src/history/store.js';

describe('penalties', () => {
  it('repeatPairingPenalty sums history counts for pairs present in the candidate', () => {
    const history = { pairCounts: { [pairKey('1', '2')]: 2, [pairKey('3', '4')]: 1 } };
    const grouping = [['1', '2'], ['3', '5']]; // 1-2 repeats (2), 3-5 new
    expect(repeatPairingPenalty(grouping, history)).toBe(2);
    expect(repeatPairs(grouping, history)).toEqual([['1', '2']]);
  });
  it('sizeImbalancePenalty is 0 when sizes match targets', () => {
    expect(sizeImbalancePenalty([['1', '2'], ['3']], [2, 1])).toBe(0);
    expect(sizeImbalancePenalty([['1'], ['2', '3']], [2, 1])).toBeGreaterThan(0);
  });
});
```
- [ ] **Step 2: Run — see it fail.**
- [ ] **Step 3: Write `src/engine/penalties.ts`**
```typescript
import type { Grouping } from '../types.js';
import type { History } from '../history/store.js';
import { pairKey } from '../history/store.js';

export function repeatPairingPenalty(grouping: Grouping, history: History): number {
  let p = 0;
  for (const grp of grouping) {
    for (let i = 0; i < grp.length; i++)
      for (let j = i + 1; j < grp.length; j++)
        p += history.pairCounts[pairKey(grp[i], grp[j])] ?? 0;
  }
  return p;
}

export function repeatPairs(grouping: Grouping, history: History): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const grp of grouping)
    for (let i = 0; i < grp.length; i++)
      for (let j = i + 1; j < grp.length; j++)
        if ((history.pairCounts[pairKey(grp[i], grp[j])] ?? 0) > 0) out.push([grp[i], grp[j]]);
  return out;
}

export function sizeImbalancePenalty(grouping: Grouping, targetSizes: number[]): number {
  const sorted = [...targetSizes].sort((a, b) => b - a);
  const actual = grouping.map((g) => g.length).sort((a, b) => b - a);
  let p = 0;
  for (let i = 0; i < Math.max(sorted.length, actual.length); i++) p += Math.abs((sorted[i] ?? 0) - (actual[i] ?? 0));
  return p;
}
```
- [ ] **Step 4: Run — see it pass.**
- [ ] **Step 5: Commit** `feat(group-builder): engine penalties`.

### Task 17: Score-and-optimize loop

**Files:** Create `src/engine/optimize.ts`; Test `tests/engine/optimize.test.ts`.

- [ ] **Step 1: Write the failing test**
```typescript
import { describe, it, expect } from 'vitest';
import { optimize } from '../../src/engine/optimize.js';
import { getStrategy } from '../../src/strategies/index.js';
import type { StudentRecord } from '../../src/types.js';
import { pairKey } from '../../src/history/store.js';

const recs: StudentRecord[] = ['1', '2', '3', '4'].map((id) => ({ canvasId: id, pseudonym: `S${id}`, metrics: {} }));

describe('optimize', () => {
  it('is reproducible for a fixed seed', () => {
    const a = optimize({ records: recs, spec: { groupCount: 2, targetSizes: [2, 2] }, strategy: getStrategy('random'), history: { pairCounts: {} }, opts: {}, seed: 9, iterations: 50 });
    const b = optimize({ records: recs, spec: { groupCount: 2, targetSizes: [2, 2] }, strategy: getStrategy('random'), history: { pairCounts: {} }, opts: {}, seed: 9, iterations: 50 });
    expect(a.grouping).toEqual(b.grouping);
  });
  it('avoids a known repeat pairing when an alternative exists', () => {
    const history = { pairCounts: { [pairKey('1', '2')]: 5, [pairKey('3', '4')]: 5 } };
    const { grouping, diagnostics } = optimize({ records: recs, spec: { groupCount: 2, targetSizes: [2, 2] }, strategy: getStrategy('random'), history, opts: {}, seed: 3, iterations: 200 });
    const grpOf = (id: string) => grouping.findIndex((g) => g.includes(id));
    expect(grpOf('1')).not.toBe(grpOf('2')); // optimizer split the penalized pair
    expect(diagnostics.repeatPairs).toEqual([]);
  });
});
```
- [ ] **Step 2: Run — see it fail.**
- [ ] **Step 3: Write `src/engine/optimize.ts`**
```typescript
import type { Diagnostics, Grouping, ResolvedGroupSpec, StudentRecord } from '../types.js';
import type { Strategy, StrategyOpts } from '../strategies/types.js';
import type { History } from '../history/store.js';
import { makeRng } from '../rng.js';
import { repeatPairingPenalty, repeatPairs, sizeImbalancePenalty } from './penalties.js';

export interface OptimizeInput {
  records: StudentRecord[];
  spec: ResolvedGroupSpec;
  strategy: Strategy;
  history: History;
  opts: StrategyOpts;
  seed: number;
  iterations?: number;
  weights?: { fit?: number; repeat?: number; size?: number };
}

const DEFAULT_ITERS = 300;
const W = { fit: 1, repeat: 10, size: 5 };

export function optimize(input: OptimizeInput): { grouping: Grouping; diagnostics: Diagnostics } {
  const rng = makeRng(input.seed);
  const iters = input.strategy.id === 'alphabetical' ? 1 : (input.iterations ?? DEFAULT_ITERS);
  const w = { ...W, ...input.weights };

  let best: Grouping | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let i = 0; i < iters; i++) {
    const cand = input.strategy.generateCandidate(input.records, input.spec, rng, input.opts);
    const score =
      w.fit * input.strategy.misfit(cand, input.records, input.opts) +
      w.repeat * repeatPairingPenalty(cand, input.history) +
      w.size * sizeImbalancePenalty(cand, input.spec.targetSizes);
    if (score < bestScore) { bestScore = score; best = cand; }
  }
  const grouping = best ?? [];
  const diagnostics: Diagnostics = {
    strategy: input.strategy.id as Diagnostics['strategy'],
    groupCount: grouping.length,
    sizes: grouping.map((g) => g.length),
    repeatPairs: repeatPairs(grouping, input.history),
    seed: input.seed,
  };
  return { grouping, diagnostics };
}
```
- [ ] **Step 4: Run — see it pass.**
- [ ] **Step 5: Commit** `feat(group-builder): score-and-optimize engine`.

---

## PHASE 6 — Output

### Task 18: File writers (CSV + markdown)

**Files:** Create `src/output/file.ts`; Test `tests/output/file.test.ts`.

- [ ] **Step 1: Write the failing test**
```typescript
import { describe, it, expect } from 'vitest';
import { renderGroupsCsv, renderGroupsMarkdown } from '../../src/output/file.js';
import type { StudentRecord } from '../../src/types.js';

const recs: StudentRecord[] = [
  { canvasId: '1', pseudonym: 'SU26-001', metrics: {} },
  { canvasId: '2', pseudonym: 'SU26-002', metrics: {} },
  { canvasId: '3', pseudonym: 'SU26-003', metrics: {} },
];
const grouping = [['1', '2'], ['3']];

describe('output writers', () => {
  it('CSV has header + group,pseudonym,canvas_id rows', () => {
    const csv = renderGroupsCsv(grouping, recs);
    expect(csv.split('\n')[0]).toBe('group,pseudonym,canvas_id');
    expect(csv).toContain('1,SU26-001,1');
    expect(csv).toContain('2,SU26-003,3');
  });
  it('markdown lists groups with member pseudonyms', () => {
    const md = renderGroupsMarkdown(grouping, recs, { strategy: 'random', groupCount: 2, sizes: [2, 1], repeatPairs: [], seed: 7 });
    expect(md).toContain('## Group 1');
    expect(md).toContain('SU26-001');
    expect(md).toContain('Strategy: random');
  });
});
```
- [ ] **Step 2: Run — see it fail.**
- [ ] **Step 3: Write `src/output/file.ts`**
```typescript
import type { Diagnostics, Grouping, StudentRecord } from '../types.js';

function pseudo(byId: Map<string, StudentRecord>, id: string): string { return byId.get(id)?.pseudonym || `(no-pseudonym:${id})`; }

export function renderGroupsCsv(grouping: Grouping, records: StudentRecord[]): string {
  const byId = new Map(records.map((r) => [r.canvasId, r] as const));
  const lines = ['group,pseudonym,canvas_id'];
  grouping.forEach((grp, gi) => grp.forEach((id) => lines.push(`${gi + 1},${pseudo(byId, id)},${id}`)));
  return lines.join('\n') + '\n';
}

export function renderGroupsMarkdown(grouping: Grouping, records: StudentRecord[], d: Diagnostics): string {
  const byId = new Map(records.map((r) => [r.canvasId, r] as const));
  const out: string[] = [`# Groups — ${d.strategy}`, '', `Strategy: ${d.strategy} · ${d.groupCount} groups · seed ${d.seed}`, ''];
  grouping.forEach((grp, gi) => {
    out.push(`## Group ${gi + 1}`);
    grp.forEach((id) => out.push(`- ${pseudo(byId, id)} (canvas ${id})`));
    out.push('');
  });
  if (d.repeatPairs.length > 0) {
    out.push('## Unavoidable repeat pairings', '');
    d.repeatPairs.forEach(([a, b]) => out.push(`- ${pseudo(byId, a)} + ${pseudo(byId, b)}`));
    out.push('');
  }
  return out.join('\n');
}
```
- [ ] **Step 4: Run — see it pass.**
- [ ] **Step 5: Commit** `feat(group-builder): CSV + markdown output writers`.

### Task 19: Canvas Group Set push

**Files:** Create `src/output/canvas-push.ts`; Test `tests/output/canvas-push.test.ts`.

- [ ] **Step 1: Write the failing test** (uses a fake client — no network)
```typescript
import { describe, it, expect } from 'vitest';
import { pushGroupsToCanvas } from '../../src/output/canvas-push.js';

describe('pushGroupsToCanvas', () => {
  it('creates a category, a group per group, and adds members by canvas id', async () => {
    const calls: string[] = [];
    const fake = {
      async createGroupCategory(courseId: number, name: string) { calls.push(`cat ${courseId} ${name}`); return { id: 50, name }; },
      async createGroup(categoryId: number, name: string) { calls.push(`grp ${categoryId} ${name}`); return { id: 100 + calls.length, name }; },
      async addGroupMember(groupId: number, userId: number) { calls.push(`mem ${groupId} ${userId}`); return {}; },
    };
    const res = await pushGroupsToCanvas(fake as never, 5, 'Week 3 Teams', [['1', '2'], ['3']]);
    expect(res.categoryId).toBe(50);
    expect(calls[0]).toBe('cat 5 Week 3 Teams');
    expect(calls.filter((c) => c.startsWith('grp'))).toHaveLength(2);
    expect(calls.filter((c) => c.startsWith('mem'))).toHaveLength(3);
  });
});
```
- [ ] **Step 2: Run — see it fail.**
- [ ] **Step 3: Write `src/output/canvas-push.ts`**
```typescript
import type { Grouping } from '../types.js';
import type { CanvasClient } from '../data/canvas-client.js';

export interface PushResult { categoryId: number; groupIds: number[]; }

/** Create a Canvas Group Set (category) + a group per group + memberships. */
export async function pushGroupsToCanvas(
  client: Pick<CanvasClient, 'createGroupCategory' | 'createGroup' | 'addGroupMember'>,
  courseId: number,
  categoryName: string,
  grouping: Grouping,
): Promise<PushResult> {
  const cat = await client.createGroupCategory(courseId, categoryName);
  const groupIds: number[] = [];
  for (let i = 0; i < grouping.length; i++) {
    const grp = await client.createGroup(cat.id, `Group ${i + 1}`);
    groupIds.push(grp.id);
    for (const canvasId of grouping[i]) await client.addGroupMember(grp.id, Number(canvasId));
  }
  return { categoryId: cat.id, groupIds };
}
```
- [ ] **Step 4: Run — see it pass.**
- [ ] **Step 5: Commit** `feat(group-builder): Canvas Group Set push`.

---

## PHASE 7 — Tools + module export

### Task 20: `propose_major_buckets` tool

**Files:** Create `src/tools.ts` (start it here with the simplest tool); Test `tests/tools/propose-buckets.test.ts`.

Build the roster-only tool first (no Canvas), then add the others in Task 21.

- [ ] **Step 1: Write the failing test**
```typescript
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { groupBuilderTools } from '../../src/tools.js';

let dir: string;
afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

describe('propose_major_buckets tool', () => {
  it('returns a draft map + other[] from a roster file', async () => {
    dir = mkdtempSync(join(tmpdir(), 'gb-tool-'));
    const roster = join(dir, 'roster.csv');
    writeFileSync(roster, 'canvas_id,pseudonym,major\n1,SU26-001,IT Management\n2,SU26-002,Philosophy\n');
    const tool = groupBuilderTools.find((t) => t.schema.name === 'propose_major_buckets')!;
    const res = await tool.handler({ courseId: '5', rosterFile: roster });
    const payload = JSON.parse((res.content[0] as { text: string }).text);
    expect(payload.map).toEqual({ 'IT Management': 'technical', Philosophy: 'other' });
    expect(payload.other).toEqual(['Philosophy']);
  });
});
```
- [ ] **Step 2: Run — see it fail.**
- [ ] **Step 3: Write `src/tools.ts`** (first tool only)
```typescript
import type { ModuleTool } from '@canvas-toolchain/module-contract';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { parseRosterFile } from './data/roster.js';
import { proposeMajorBuckets } from './buckets/heuristic.js';

const text = (s: string): CallToolResult => ({ content: [{ type: 'text', text: s }] });

const proposeBucketsTool: ModuleTool = {
  schema: {
    name: 'propose_major_buckets',
    description:
      'Propose a major→archetype-bucket map (technical/quantitative/creative/business/other) ' +
      'from the distinct majors in the roster file, for the professor to review/edit before using ' +
      'the major-diversity grouping strategy. Heuristic, no LLM.',
    inputSchema: {
      type: 'object' as const,
      required: ['courseId', 'rosterFile'],
      properties: {
        courseId: { type: 'string', description: 'Canvas course id (for saving the reviewed map).' },
        rosterFile: { type: 'string', description: 'Path to the canvas_id,pseudonym,major CSV.' },
      },
    },
  },
  handler: async (args) => {
    const { rosterFile } = args as { courseId: string; rosterFile: string };
    const rows = parseRosterFile(rosterFile);
    const majors = rows.map((r) => r.major ?? '').filter(Boolean);
    const { map, other } = proposeMajorBuckets(majors);
    return text(JSON.stringify({ map, other, note: 'Review/edit, then pass as majorBuckets to create_groups (or save to major-buckets.json).' }, null, 2));
  },
};

export const groupBuilderTools: ModuleTool[] = [proposeBucketsTool];
```
- [ ] **Step 4: Run — see it pass.**
- [ ] **Step 5: Commit** `feat(group-builder): propose_major_buckets tool`.

### Task 21: `create_groups` + `record_groups` tools

**Files:** Modify `src/tools.ts`; create `src/run.ts` (the orchestration the tool calls, so it's unit-testable with an injected client); Test `tests/tools/create-record.test.ts`.

- [ ] **Step 1: Write the failing test**
```typescript
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createGroups } from '../../src/run.js';
import { loadHistory } from '../../src/history/store.js';

let home: string; const saved = process.env.CC_HOME;
afterEach(() => { if (home) rmSync(home, { recursive: true, force: true }); if (saved === undefined) delete process.env.CC_HOME; else process.env.CC_HOME = saved; });

function fakeClient() {
  return {
    async listStudentEnrollments() { return [
      { user_id: 1, grades: { current_score: 95 } }, { user_id: 2, grades: { current_score: 60 } },
      { user_id: 3, grades: { current_score: 80 } }, { user_id: 4, grades: { current_score: 70 } },
    ]; },
    async listSubmissions() { return []; },
    async createGroupCategory() { throw new Error('should not push'); },
    async createGroup() { throw new Error('no'); },
    async addGroupMember() { throw new Error('no'); },
  };
}

describe('createGroups orchestration', () => {
  it('writes a CSV + markdown, returns diagnostics, does NOT mutate history', async () => {
    home = mkdtempSync(join(tmpdir(), 'gb-run-')); process.env.CC_HOME = home;
    const roster = join(home, 'roster.csv');
    writeFileSync(roster, 'canvas_id,pseudonym,major\n1,SU26-001,IT\n2,SU26-002,Marketing\n3,SU26-003,Accounting\n4,SU26-004,Finance\n');
    const out = join(home, 'out');
    const res = await createGroups({ courseId: '5', strategy: 'heterogeneous', groupCount: 2, rosterFile: roster, outputDir: out, seed: 1 }, { client: fakeClient() as never });
    expect(existsSync(res.csvPath)).toBe(true);
    expect(existsSync(res.markdownPath)).toBe(true);
    expect(res.diagnostics.groupCount).toBe(2);
    expect(readFileSync(res.csvPath, 'utf-8')).toContain('group,pseudonym,canvas_id');
    expect(loadHistory('5').pairCounts).toEqual({}); // preview-safe
  });
});
```
- [ ] **Step 2: Run — see it fail.**
- [ ] **Step 3: Write `src/run.ts`** then wire two tools into `src/tools.ts`.

`src/run.ts`:
```typescript
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Diagnostics, Grouping, StrategyId } from './types.js';
import { CanvasClient } from './data/canvas-client.js';
import { loadCanvasCreds } from './data/canvas-client.js';
import { parseRosterFile } from './data/roster.js';
import { buildStudentRecords } from './data/merge.js';
import { getStrategy } from './strategies/index.js';
import type { StrategyOpts } from './strategies/types.js';
import { resolveGroupSpec } from './spec.js';
import { loadHistory, appendGrouping } from './history/store.js';
import { optimize } from './engine/optimize.js';
import { renderGroupsCsv, renderGroupsMarkdown } from './output/file.js';
import { pushGroupsToCanvas } from './output/canvas-push.js';
import { loadMajorBuckets } from './buckets/store.js';

export interface CreateGroupsInput {
  courseId: string;
  strategy: StrategyId;
  groupSize?: number;
  groupCount?: number;
  rosterFile?: string;
  assignmentIds?: number[];   // for assignmentsCompleted
  metric?: string;
  weights?: Record<string, number>;
  weightedMode?: 'balance' | 'cluster';
  majorBuckets?: Record<string, string>;
  seed?: number;
  outputDir?: string;
  pushToCanvas?: boolean;
  canvasCategoryName?: string;
}
export interface CreateGroupsResult { grouping: Grouping; diagnostics: Diagnostics; csvPath: string; markdownPath: string; canvasPush?: { categoryId: number; groupIds: number[] }; }

export interface RunDeps { client?: { listStudentEnrollments: CanvasClient['listStudentEnrollments']; listSubmissions: CanvasClient['listSubmissions']; createGroupCategory: CanvasClient['createGroupCategory']; createGroup: CanvasClient['createGroup']; addGroupMember: CanvasClient['addGroupMember'] }; }

export async function createGroups(input: CreateGroupsInput, deps: RunDeps = {}): Promise<CreateGroupsResult> {
  const courseIdNum = Number(input.courseId);
  const client = deps.client ?? new CanvasClient(loadCanvasCreds());
  const enrollments = await client.listStudentEnrollments(courseIdNum);
  const submissions = input.assignmentIds?.length ? await client.listSubmissions(courseIdNum, input.assignmentIds) : [];
  const roster = input.rosterFile ? parseRosterFile(input.rosterFile) : [];
  const { records } = buildStudentRecords({ enrollments, submissions, roster });

  const spec = resolveGroupSpec({ groupSize: input.groupSize, groupCount: input.groupCount }, records.length);
  const opts: StrategyOpts = {
    metric: input.metric,
    weights: input.weights,
    weightedMode: input.weightedMode,
    majorBuckets: input.majorBuckets ?? loadMajorBuckets(input.courseId),
  };
  const { grouping, diagnostics } = optimize({
    records, spec, strategy: getStrategy(input.strategy), history: loadHistory(input.courseId),
    opts, seed: input.seed ?? 1,
  });

  const outDir = input.outputDir ?? join(process.env.CC_HOME ?? '.', 'groups', input.courseId, 'output');
  mkdirSync(outDir, { recursive: true });
  const csvPath = join(outDir, `groups-${input.strategy}.csv`);
  const markdownPath = join(outDir, `groups-${input.strategy}.md`);
  writeFileSync(csvPath, renderGroupsCsv(grouping, records), 'utf-8');
  writeFileSync(markdownPath, renderGroupsMarkdown(grouping, records, diagnostics), 'utf-8');

  const result: CreateGroupsResult = { grouping, diagnostics, csvPath, markdownPath };
  if (input.pushToCanvas) {
    result.canvasPush = await pushGroupsToCanvas(client, courseIdNum, input.canvasCategoryName ?? `${input.strategy} groups`, grouping);
  }
  return result; // NOTE: never appends history — that's record_groups
}

export function recordGroups(courseId: string, grouping: Grouping): string {
  return appendGrouping(courseId, grouping);
}
```

Then add to `src/tools.ts` (`create_groups` calls `createGroups`; `record_groups` calls `recordGroups` with a grouping passed as `string[][]`), appending both to `groupBuilderTools`. Schemas:
```typescript
// create_groups: required [courseId, strategy]; one of groupSize|groupCount; optional rosterFile,
//   assignmentIds[], metric, weights(obj), weightedMode, majorBuckets(obj), seed, outputDir,
//   pushToCanvas(bool), canvasCategoryName. Handler: JSON.stringify(await createGroups(args)).
// record_groups: required [courseId, grouping(array of array of string)]. Handler: recordGroups(...) -> text(path).
```
Write the full ModuleTool objects mirroring `proposeBucketsTool`'s shape (schema + async handler returning `text(JSON.stringify(...))`).
- [ ] **Step 4: Run — see it pass.**
- [ ] **Step 5: Commit** `feat(group-builder): create_groups + record_groups tools`.

### Task 22: Module default export

**Files:** Create `src/index.ts`; Test `tests/module.test.ts`.

- [ ] **Step 1: Write the failing test**
```typescript
import { describe, it, expect } from 'vitest';
import { isCanvasToolchainModule } from '@canvas-toolchain/module-contract';
import mod from '../src/index.js';

describe('group-builder module', () => {
  it('satisfies the contract', () => { expect(isCanvasToolchainModule(mod)).toBe(true); });
  it('id, name, and the three tools', () => {
    expect(mod.id).toBe('group-builder');
    const names = mod.tools.map((t) => t.schema.name);
    expect(names).toEqual(expect.arrayContaining(['create_groups', 'record_groups', 'propose_major_buckets']));
  });
});
```
- [ ] **Step 2: Run — see it fail.**
- [ ] **Step 3: Write `src/index.ts`**
```typescript
import type { CanvasToolchainModule } from '@canvas-toolchain/module-contract';
import { groupBuilderTools } from './tools.js';

export const MODULE_ID = 'group-builder';

const groupBuilderModule: CanvasToolchainModule = {
  id: MODULE_ID,
  name: 'Group Creator/Maintainer',
  description:
    'Form student teams from Canvas data + a thin roster file, with six strategies and a ' +
    'semester-long no-repeat-pairing memory. PII-free (keyed by Canvas ID + pseudonym).',
  version: '1.0.0',
  handles: [],
  tools: groupBuilderTools,
};

export default groupBuilderModule;
export { createGroups, recordGroups } from './run.js';
```
- [ ] **Step 4: Run — see it pass.** Then `npm run build --workspace=packages/module-group-builder` (clean) and the FULL package suite `npm test --workspace=packages/module-group-builder` (all green).
- [ ] **Step 5: Commit** `feat(group-builder): module default export`.

---

## PHASE 8 — C&C registration + verification

### Task 23: Register in Command & Control

**Files:** Modify `packages/command-and-control/package.json`, `packages/command-and-control/src/modules/registry.ts`, root `package.json`; extend `packages/command-and-control/tests/modules/registry.test.ts`.

- [ ] **Step 1: Write the failing test** — add to the registry test:
```typescript
it('group-builder is a known module', () => {
  expect(knownModuleIds()).toContain('group-builder');
});
```
- [ ] **Step 2: Run — see it fail** (`npm test --workspace=packages/command-and-control -- registry`).
- [ ] **Step 3:** Add `"@canvas-toolchain/module-group-builder": "*"` to C&C `package.json` deps; add to `KNOWN_MODULES` in `registry.ts`:
```typescript
  'group-builder': async () => (await import('@canvas-toolchain/module-group-builder')).default,
```
Add `module-group-builder` to the root `package.json` build-order list (after `module-oral-assessment`, before `command-and-control`).
- [ ] **Step 4:** `npm install` then run the test — see it pass.
- [ ] **Step 5: Commit** `feat(group-builder): register module in C&C`.

### Task 24: Whole-repo verification

**Files:** none.

- [ ] **Step 1:** `npm run build` (root) — all packages compile incl. `module-group-builder`.
- [ ] **Step 2:** `npm test` (root) — full suite green, zero regressions; report totals.
- [ ] **Step 3:** `npm run smoke:integration --workspace=packages/command-and-control` — exit 0.
- [ ] **Step 4: Commit** any build-script fix if needed (`build: include module-group-builder in root build`).

---

## Self-review (reconciled against the spec)

- **§3 strategies (6)** → Tasks 11–14. ✓  **§4 identity/PII-free + hybrid data** → Tasks 5–7 (canvasId key, pseudonym from roster, grades/assignments from Canvas, never name/email). ✓
- **§5.3 weighted balance default + cluster option** → Task 13. ✓  **§5.6 propose buckets + review + persist** → Tasks 8, 9, 20. ✓
- **§6 soft no-repeat + history + size** → Tasks 15, 16, 4. ✓  **§7 score-and-optimize seeded** → Task 17. ✓
- **§8 three tools (preview vs commit)** → Tasks 20, 21 (createGroups never writes history; recordGroups does). ✓
- **§9 file always + optional Canvas push** → Tasks 18, 19, 21. ✓  **§10 package layout, no provider seam, injected Canvas client** → all phases. ✓
- **§12 hermetic tests** → every Canvas/LLM/network path injected or stubbed; seeded RNG. ✓

**Open confirmations for the implementer (resolve while coding, not blockers):**
1. `module-contract` `ModuleTool`/`CallToolResult` exact exports (copy from `module-oral-assessment/src/tools.ts`).
2. Root `package.json` build-script enumeration (Task 23/24).
3. Whether `assignmentsCompleted` should count only `graded` vs `graded`+`submitted` (Task 7 uses graded+submitted+pending_review — confirm matches Kevin's intent; adjustable in the `COMPLETED` set).
4. `inputSchema` for object-valued params (`weights`, `majorBuckets`) — declare as `{ type: 'object' as const }` with `additionalProperties` per the SDK's accepted JSON-schema subset; mirror an existing object-param tool if one exists.
