# Canvas Rubric Sync (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pull a rubric from Canvas (assignment-first → course-list fallback), detect whether it changed since the last student rewrite, run a smart triage (acceptable / needs-update / needs-review), and return one reviewed report that the professor approves before it feeds the existing `draft_student_rubric`.

**Architecture:** New files under `packages/command-and-control/src/tools/rubric/`, extending the existing C&C rubric toolset. Canvas access follows C&C's established raw-`fetch` + `loadInstitutionConfig()` + injectable-`fetchFn` idiom (as in `src/discovery/canvas_scan.ts`) — NOT the CDS `CanvasApiClient` class, which C&C does not import. The LLM triage reuses the `LlmClient` interface and `AnthropicLlmClient`/`loadAnthropicConfig` exactly as `draft_student_rubric` does, with an injectable hook for tests. Read-only; nothing is written to Canvas. Propose→commit: the existing `draft_student_rubric` IS the commit step, so no new write tool is added.

**Tech Stack:** TypeScript (ESM/NodeNext), vitest 3.2.6, `@canvas-toolchain/shared-llm`, Node ≥20. No live Canvas/LLM calls in tests (injected `fetchFn` and `llm`).

**Deviation from spec:** The spec's component #1 said "add rubric methods to the existing `CanvasApiClient` (in CDS)." During planning we confirmed C&C reaches Canvas via raw `fetch` + `loadInstitutionConfig()` (e.g. `discovery/canvas_scan.ts`) and does not depend on the CDS client class. Phase 1 therefore implements rubric fetch in C&C with that idiom. Everything else in the spec is unchanged.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/tools/rubric/sync_types.ts` (create) | All Phase-1 types: `PulledRubric`, `RubricChangeReport`, `RubricTriageReport`, `ReviewReport`. |
| `src/tools/rubric/canvas_fetch.ts` (create) | `pullRubric()` — assignment-first → course-list fallback; maps Canvas JSON → `PulledRubric`. Injectable `fetchFn`. |
| `src/tools/rubric/change_detect.ts` (create) | `detectRubricChange()` — diff pulled rubric vs the `**Faculty rubric language:**` blocks in the last rendered rubric `.md`. |
| `src/tools/rubric/triage_prompts.ts` (create) | `TRIAGE_SYSTEM_PROMPT` + `buildTriageUserPrompt()`. |
| `src/tools/rubric/triage.ts` (create) | `triageRubric()` — one LLM call → verdict + flags + optional proposed revision. Injectable `llm`. |
| `src/tools/workflows/review_canvas_rubric.ts` (create) | Orchestrator: fetch → change-detect → triage → `ReviewReport`; structured errors. |
| `src/index.ts` (modify) | Register the `review_canvas_rubric` MCP tool + dispatch case. |
| `tests/tools/rubric/*.test.ts` (create) | One test file per unit above. |

---

### Task 1: Sync types

**Files:**
- Create: `packages/command-and-control/src/tools/rubric/sync_types.ts`
- Test: `packages/command-and-control/tests/tools/rubric/sync_types.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/tools/rubric/sync_types.test.ts
import { describe, it, expect } from 'vitest';
import type { PulledRubric, ReviewReport } from '../../../src/tools/rubric/sync_types.js';
import { isNeedsUpdate } from '../../../src/tools/rubric/sync_types.js';

describe('sync_types', () => {
  it('isNeedsUpdate is true only for the needs-update verdict', () => {
    const base: ReviewReport['triage'] = { verdict: 'acceptable', flags: [], rationale: 'ok' };
    expect(isNeedsUpdate(base)).toBe(false);
    expect(isNeedsUpdate({ ...base, verdict: 'needs-update', proposedFacultyRubric: 'x' })).toBe(true);
  });

  it('PulledRubric criteria carry name + points + description', () => {
    const r: PulledRubric = {
      source: { kind: 'assignment', courseId: '1', assignmentId: '2', title: 'A' },
      criteria: [{ id: 'c1', name: 'Clarity', points: 10, description: 'Be clear' }],
    };
    expect(r.criteria[0].points).toBe(10);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/command-and-control && npx vitest run tests/tools/rubric/sync_types.test.ts`
Expected: FAIL — cannot find module `sync_types.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/tools/rubric/sync_types.ts
export interface PulledRubricCriterion {
  id: string;
  name: string;
  points: number;
  description: string;
  longDescription?: string;
  ratings?: Array<{ points: number; description: string }>;
}

export interface PulledRubric {
  source: {
    kind: 'assignment' | 'course-rubric';
    courseId: string;
    assignmentId?: string;
    rubricId?: string;
    title: string;
  };
  criteria: PulledRubricCriterion[];
  /** Present when sourced from an assignment (its description). */
  assignmentBrief?: string;
  /** Present only on the list-fallback path when no single rubric was chosen. */
  choices?: Array<{ rubricId: string; title: string }>;
}

export interface RubricChangeReport {
  status: 'first-draft' | 'unchanged' | 'changed';
  added: string[];
  removed: string[];
  modified: Array<{ name: string; before: string; after: string }>;
}

export interface RubricTriageReport {
  verdict: 'acceptable' | 'needs-update' | 'needs-review';
  flags: Array<{
    criterion: string;
    issue: string;
    evidence: 'assignment-drift' | 'vague-language' | 'change-detected';
  }>;
  proposedFacultyRubric?: string;
  rationale: string;
}

export interface ReviewReport {
  source: PulledRubric['source'];
  change: RubricChangeReport;
  triage: RubricTriageReport;
}

export function isNeedsUpdate(t: RubricTriageReport): boolean {
  return t.verdict === 'needs-update';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/command-and-control && npx vitest run tests/tools/rubric/sync_types.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/command-and-control/src/tools/rubric/sync_types.ts packages/command-and-control/tests/tools/rubric/sync_types.test.ts
git commit -m "feat(rubric): sync types for Canvas rubric pull/triage"
```

---

### Task 2: Canvas rubric fetch

**Files:**
- Create: `packages/command-and-control/src/tools/rubric/canvas_fetch.ts`
- Test: `packages/command-and-control/tests/tools/rubric/canvas_fetch.test.ts`

Canvas endpoints used (GET, Bearer token):
- Assignment (carries `rubric` + `rubric_settings`): `/api/v1/courses/:courseId/assignments/:assignmentId`
- List course rubrics: `/api/v1/courses/:courseId/rubrics`
- Single rubric: `/api/v1/courses/:courseId/rubrics/:rubricId`

A Canvas rubric criterion looks like `{ id, description (the NAME), long_description, points, ratings: [{ points, description }] }`. Map `description`→`name`, `long_description`→`description`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/tools/rubric/canvas_fetch.test.ts
import { describe, it, expect } from 'vitest';
import { pullRubric } from '../../../src/tools/rubric/canvas_fetch.js';

const cfg = { canvasUrl: 'https://canvas.test', apiToken: 't' };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('pullRubric', () => {
  it('assignment-first: reads the rubric attached to the assignment', async () => {
    const fetchFn = async (url: string) => {
      expect(url).toBe('https://canvas.test/api/v1/courses/5/assignments/9');
      return jsonResponse({
        id: 9, name: 'Essay 1', description: '<p>Write an essay</p>',
        rubric: [
          { id: 'c1', description: 'Thesis', long_description: 'Clear arguable thesis', points: 10,
            ratings: [{ points: 10, description: 'Full' }] },
        ],
      });
    };
    const r = await pullRubric({ courseId: '5', assignmentId: '9' }, { cfg, fetchFn: fetchFn as typeof fetch });
    expect(r.source.kind).toBe('assignment');
    expect(r.criteria).toEqual([
      { id: 'c1', name: 'Thesis', points: 10, description: 'Clear arguable thesis',
        ratings: [{ points: 10, description: 'Full' }] },
    ]);
    expect(r.assignmentBrief).toBe('<p>Write an essay</p>');
  });

  it('falls back to the course rubric list when the assignment has no rubric', async () => {
    const fetchFn = async (url: string) => {
      if (url.endsWith('/assignments/9')) return jsonResponse({ id: 9, name: 'Essay 1', rubric: null });
      if (url.endsWith('/courses/5/rubrics')) return jsonResponse([{ id: 21, title: 'Standalone Rubric' }]);
      throw new Error(`unexpected url ${url}`);
    };
    const r = await pullRubric({ courseId: '5', assignmentId: '9' }, { cfg, fetchFn: fetchFn as typeof fetch });
    expect(r.source.kind).toBe('course-rubric');
    expect(r.choices).toEqual([{ rubricId: '21', title: 'Standalone Rubric' }]);
    expect(r.criteria).toEqual([]);
  });

  it('fetches a specific course rubric when rubricId is given', async () => {
    const fetchFn = async (url: string) => {
      expect(url).toBe('https://canvas.test/api/v1/courses/5/rubrics/21');
      return jsonResponse({
        id: 21, title: 'Standalone Rubric',
        data: [{ id: 'r1', description: 'Evidence', long_description: 'Cites sources', points: 5 }],
      });
    };
    const r = await pullRubric({ courseId: '5', rubricId: '21' }, { cfg, fetchFn: fetchFn as typeof fetch });
    expect(r.source.kind).toBe('course-rubric');
    expect(r.source.rubricId).toBe('21');
    expect(r.criteria).toEqual([
      { id: 'r1', name: 'Evidence', points: 5, description: 'Cites sources', ratings: undefined },
    ]);
  });

  it('throws a structured error when the course has zero rubrics', async () => {
    const fetchFn = async (url: string) => {
      if (url.endsWith('/assignments/9')) return jsonResponse({ id: 9, name: 'Essay 1', rubric: null });
      if (url.endsWith('/courses/5/rubrics')) return jsonResponse([]);
      throw new Error(`unexpected url ${url}`);
    };
    await expect(pullRubric({ courseId: '5', assignmentId: '9' }, { cfg, fetchFn: fetchFn as typeof fetch }))
      .rejects.toThrow(/NO_RUBRICS/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/command-and-control && npx vitest run tests/tools/rubric/canvas_fetch.test.ts`
Expected: FAIL — cannot find module `canvas_fetch.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/tools/rubric/canvas_fetch.ts
import type { PulledRubric, PulledRubricCriterion } from './sync_types.js';

export interface CanvasCfg { canvasUrl: string; apiToken: string; }
export interface PullRubricDeps { cfg: CanvasCfg; fetchFn?: typeof fetch; }
export interface PullRubricInput {
  courseId: string;
  assignmentId?: string;
  /** When set, fetch this specific course rubric (used after the list fallback). */
  rubricId?: string;
}

export class RubricFetchError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.name = 'RubricFetchError'; this.code = code; }
}

interface CanvasCriterionRaw {
  id?: string | number;
  description?: string;       // Canvas puts the criterion NAME here
  long_description?: string;
  points?: number;
  ratings?: Array<{ points?: number; description?: string }>;
}

function mapCriteria(raw: CanvasCriterionRaw[] | undefined): PulledRubricCriterion[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((c, i) => ({
    id: String(c.id ?? i + 1),
    name: String(c.description ?? `Criterion ${i + 1}`),
    points: typeof c.points === 'number' ? c.points : 0,
    description: String(c.long_description ?? ''),
    ratings: Array.isArray(c.ratings)
      ? c.ratings.map(r => ({ points: typeof r.points === 'number' ? r.points : 0, description: String(r.description ?? '') }))
      : undefined,
  }));
}

async function getJson(url: string, deps: PullRubricDeps): Promise<unknown> {
  const fetchFn = deps.fetchFn ?? fetch;
  let res: Response;
  try {
    res = await fetchFn(url, { headers: { Authorization: `Bearer ${deps.cfg.apiToken}`, Accept: 'application/json' } });
  } catch (err) {
    throw new RubricFetchError('CANVAS_NETWORK_ERROR', `Canvas unreachable at ${url}.`);
  }
  if (!res.ok) {
    if (res.status === 401) throw new RubricFetchError('CANVAS_UNAUTHORIZED', 'Canvas rejected the API token. Re-run setup_canvas.');
    if (res.status === 404) throw new RubricFetchError('CANVAS_NOT_FOUND', `Canvas returned 404 for ${url}.`);
    throw new RubricFetchError('CANVAS_HTTP_ERROR', `Canvas returned HTTP ${res.status} for ${url}.`);
  }
  return res.json();
}

export async function pullRubric(input: PullRubricInput, deps: PullRubricDeps): Promise<PulledRubric> {
  const base = `${deps.cfg.canvasUrl.replace(/\/+$/, '')}/api/v1/courses/${input.courseId}`;

  // Specific course rubric requested (post-list selection).
  if (input.rubricId) {
    const body = await getJson(`${base}/rubrics/${input.rubricId}`, deps) as { id?: number; title?: string; data?: CanvasCriterionRaw[] };
    return {
      source: { kind: 'course-rubric', courseId: input.courseId, rubricId: input.rubricId, title: String(body.title ?? 'Rubric') },
      criteria: mapCriteria(body.data),
    };
  }

  // Assignment-first.
  if (input.assignmentId) {
    const a = await getJson(`${base}/assignments/${input.assignmentId}`, deps) as
      { id?: number; name?: string; description?: string; rubric?: CanvasCriterionRaw[] | null };
    if (Array.isArray(a.rubric) && a.rubric.length > 0) {
      return {
        source: { kind: 'assignment', courseId: input.courseId, assignmentId: input.assignmentId, title: String(a.name ?? 'Assignment') },
        criteria: mapCriteria(a.rubric),
        assignmentBrief: a.description ?? undefined,
      };
    }
  }

  // List fallback.
  const list = await getJson(`${base}/rubrics`, deps) as Array<{ id?: number; title?: string }>;
  if (!Array.isArray(list) || list.length === 0) {
    throw new RubricFetchError('NO_RUBRICS', `Course ${input.courseId} has no rubrics and the assignment has none attached.`);
  }
  return {
    source: { kind: 'course-rubric', courseId: input.courseId, title: 'Course rubrics' },
    criteria: [],
    choices: list.map(r => ({ rubricId: String(r.id), title: String(r.title ?? 'Rubric') })),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/command-and-control && npx vitest run tests/tools/rubric/canvas_fetch.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/command-and-control/src/tools/rubric/canvas_fetch.ts packages/command-and-control/tests/tools/rubric/canvas_fetch.test.ts
git commit -m "feat(rubric): pull rubric from Canvas (assignment-first, list fallback)"
```

---

### Task 3: Change detection

**Files:**
- Create: `packages/command-and-control/src/tools/rubric/change_detect.ts`
- Test: `packages/command-and-control/tests/tools/rubric/change_detect.test.ts`

The last rendered rubric `.md` (from `render_md.ts`) contains, per criterion:
`## Criterion N: <name> — <pts> pts` then a `**Faculty rubric language:**` block with the original text. Change detection parses those `name → faculty text` pairs and diffs them against the freshly-pulled criteria (keyed by name; pulled "faculty text" = `description`).

- [ ] **Step 1: Write the failing test**

```ts
// tests/tools/rubric/change_detect.test.ts
import { describe, it, expect } from 'vitest';
import { detectRubricChange, parseFacultyBlocks } from '../../../src/tools/rubric/change_detect.js';
import type { PulledRubric } from '../../../src/tools/rubric/sync_types.js';

const pulled: PulledRubric = {
  source: { kind: 'assignment', courseId: '1', assignmentId: '2', title: 'A' },
  criteria: [
    { id: 'c1', name: 'Thesis', points: 10, description: 'Clear arguable thesis with a roadmap' },
    { id: 'c2', name: 'Evidence', points: 10, description: 'Cites at least three sources' },
  ],
};

const priorMd = `---
title: "Rubric"
---

## Criterion 1: Thesis — 10 pts

**For students:**
Say what you argue.

**Worked example:**
"This paper argues X because Y."

**Faculty rubric language:**
Clear arguable thesis with a roadmap

## Criterion 2: Evidence — 10 pts

**Faculty rubric language:**
Cites at least two sources
`;

describe('change_detect', () => {
  it('parses faculty blocks into name->text pairs', () => {
    expect(parseFacultyBlocks(priorMd)).toEqual({
      Thesis: 'Clear arguable thesis with a roadmap',
      Evidence: 'Cites at least two sources',
    });
  });

  it('reports first-draft when there is no prior markdown', () => {
    expect(detectRubricChange(pulled, undefined).status).toBe('first-draft');
  });

  it('reports unchanged when faculty text matches', () => {
    const onlyThesis: PulledRubric = { ...pulled, criteria: [pulled.criteria[0]] };
    const md = `## Criterion 1: Thesis — 10 pts\n\n**Faculty rubric language:**\nClear arguable thesis with a roadmap\n`;
    expect(detectRubricChange(onlyThesis, md).status).toBe('unchanged');
  });

  it('flags modified + added criteria', () => {
    const report = detectRubricChange(pulled, priorMd);
    expect(report.status).toBe('changed');
    expect(report.modified).toEqual([
      { name: 'Evidence', before: 'Cites at least two sources', after: 'Cites at least three sources' },
    ]);
    expect(report.added).toEqual([]);
    expect(report.removed).toEqual([]);
  });

  it('flags a removed criterion present in prior but not pulled', () => {
    const md = priorMd + `\n## Criterion 3: Style — 5 pts\n\n**Faculty rubric language:**\nUses APA\n`;
    const report = detectRubricChange(pulled, md);
    expect(report.removed).toEqual(['Style']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/command-and-control && npx vitest run tests/tools/rubric/change_detect.test.ts`
Expected: FAIL — cannot find module `change_detect.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/tools/rubric/change_detect.ts
import type { PulledRubric, RubricChangeReport } from './sync_types.js';

/** Parse `## Criterion N: <name> — <pts> pts` + `**Faculty rubric language:**`
 *  blocks from a previously rendered rubric markdown into { name: facultyText }. */
export function parseFacultyBlocks(md: string): Record<string, string> {
  const out: Record<string, string> = {};
  // Split on criterion headers, keeping the name.
  const headerRe = /^##\s+Criterion\s+\S+:\s+(.+?)\s+—\s+\d+\s+pts\s*$/gm;
  const matches = [...md.matchAll(headerRe)];
  for (let i = 0; i < matches.length; i += 1) {
    const name = matches[i][1].trim();
    const start = matches[i].index ?? 0;
    const end = i + 1 < matches.length ? (matches[i + 1].index ?? md.length) : md.length;
    const section = md.slice(start, end);
    const fac = section.match(/\*\*Faculty rubric language:\*\*\s*\n([\s\S]*?)(?:\n\s*\n|\n##|$)/);
    if (fac) out[name] = fac[1].trim();
  }
  return out;
}

export function detectRubricChange(pulled: PulledRubric, priorMd?: string): RubricChangeReport {
  if (!priorMd || priorMd.trim() === '') {
    return { status: 'first-draft', added: [], removed: [], modified: [] };
  }
  const prior = parseFacultyBlocks(priorMd);
  const pulledByName = new Map(pulled.criteria.map(c => [c.name, c.description.trim()]));

  const added: string[] = [];
  const modified: RubricChangeReport['modified'] = [];
  for (const [name, after] of pulledByName) {
    if (!(name in prior)) { added.push(name); continue; }
    if (prior[name].trim() !== after) modified.push({ name, before: prior[name].trim(), after });
  }
  const removed = Object.keys(prior).filter(name => !pulledByName.has(name));

  const status = added.length === 0 && removed.length === 0 && modified.length === 0 ? 'unchanged' : 'changed';
  return { status, added, removed, modified };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/command-and-control && npx vitest run tests/tools/rubric/change_detect.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/command-and-control/src/tools/rubric/change_detect.ts packages/command-and-control/tests/tools/rubric/change_detect.test.ts
git commit -m "feat(rubric): change detection vs last rendered rubric"
```

---

### Task 4: Triage prompts

**Files:**
- Create: `packages/command-and-control/src/tools/rubric/triage_prompts.ts`
- Test: `packages/command-and-control/tests/tools/rubric/triage_prompts.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/tools/rubric/triage_prompts.test.ts
import { describe, it, expect } from 'vitest';
import { TRIAGE_SYSTEM_PROMPT, buildTriageUserPrompt } from '../../../src/tools/rubric/triage_prompts.js';
import type { PulledRubric, RubricChangeReport } from '../../../src/tools/rubric/sync_types.js';

const pulled: PulledRubric = {
  source: { kind: 'assignment', courseId: '1', assignmentId: '2', title: 'Essay' },
  criteria: [{ id: 'c1', name: 'Thesis', points: 10, description: 'Clear arguable thesis' }],
};
const change: RubricChangeReport = { status: 'changed', added: [], removed: [], modified: [{ name: 'Thesis', before: 'old', after: 'Clear arguable thesis' }] };

describe('triage_prompts', () => {
  it('system prompt demands strict JSON and the three verdicts', () => {
    expect(TRIAGE_SYSTEM_PROMPT).toMatch(/acceptable/);
    expect(TRIAGE_SYSTEM_PROMPT).toMatch(/needs-update/);
    expect(TRIAGE_SYSTEM_PROMPT).toMatch(/needs-review/);
    expect(TRIAGE_SYSTEM_PROMPT).toMatch(/JSON/);
  });

  it('user prompt embeds rubric, change summary, and the assignment signal', () => {
    const p = buildTriageUserPrompt({ pulled, change, assignmentSignal: 'Assignment now asks for 5 sources.' });
    expect(p).toContain('Thesis');
    expect(p).toContain('Clear arguable thesis');
    expect(p).toContain('Assignment now asks for 5 sources.');
    expect(p).toMatch(/CHANGE SINCE LAST REWRITE/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/command-and-control && npx vitest run tests/tools/rubric/triage_prompts.test.ts`
Expected: FAIL — cannot find module `triage_prompts.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/tools/rubric/triage_prompts.ts
import type { PulledRubric, RubricChangeReport } from './sync_types.js';

export const TRIAGE_SYSTEM_PROMPT = `You are helping a college instructor decide whether a rubric pulled from Canvas still fits the assignment before it is rewritten for students.

Weigh three things:
1. Does each criterion still match what the assignment asks students to do? (assignment drift)
2. Is any criterion vague or written only to justify a grade rather than guide work? (vague language)
3. Did the official rubric change since the last student rewrite? (change detected)

Return ONE verdict:
- "acceptable" — the rubric is fine to rewrite as-is.
- "needs-update" — the faculty rubric itself should be revised first; you MUST include "proposedFacultyRubric" with a concrete revised rubric.
- "needs-review" — the instructor should eyeball specific criteria, but no rewrite of the faculty rubric is required.

Return ONLY a valid JSON object — no prose, no markdown fence — of the shape:

{
  "verdict": "acceptable" | "needs-update" | "needs-review",
  "flags": [ { "criterion": "name", "issue": "one sentence", "evidence": "assignment-drift" | "vague-language" | "change-detected" } ],
  "proposedFacultyRubric": "revised rubric text (ONLY when verdict is needs-update)",
  "rationale": "2-3 sentence summary of the call"
}`;

export interface TriageUserPromptInput {
  pulled: PulledRubric;
  change: RubricChangeReport;
  /** Resolved assignment-change signal: the current assignment brief, or a
   *  semester-diff summary. Empty string when none is available. */
  assignmentSignal: string;
}

export function buildTriageUserPrompt(input: TriageUserPromptInput): string {
  const { pulled, change, assignmentSignal } = input;
  const parts: string[] = [];

  parts.push('RUBRIC (pulled from Canvas):');
  parts.push('---');
  for (const c of pulled.criteria) {
    parts.push(`Criterion: ${c.name} (${c.points} pts)`);
    parts.push(c.description || '(no description)');
    parts.push('');
  }
  parts.push('---');

  parts.push('\nCHANGE SINCE LAST REWRITE:');
  if (change.status === 'first-draft') parts.push('No prior student rewrite exists.');
  else if (change.status === 'unchanged') parts.push('No change from the last rewrite.');
  else {
    if (change.added.length) parts.push(`Added: ${change.added.join(', ')}`);
    if (change.removed.length) parts.push(`Removed: ${change.removed.join(', ')}`);
    for (const m of change.modified) parts.push(`Modified "${m.name}": "${m.before}" -> "${m.after}"`);
  }

  parts.push('\nASSIGNMENT SIGNAL (what the assignment currently asks / how it changed):');
  parts.push(assignmentSignal.trim() || '(none provided)');

  parts.push('\nReturn the JSON object now. No prose, no markdown fence — just the JSON object starting with `{`.');
  return parts.join('\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/command-and-control && npx vitest run tests/tools/rubric/triage_prompts.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/command-and-control/src/tools/rubric/triage_prompts.ts packages/command-and-control/tests/tools/rubric/triage_prompts.test.ts
git commit -m "feat(rubric): triage prompts (verdict + flags + proposed revision)"
```

---

### Task 5: Triage (LLM call + parse)

**Files:**
- Create: `packages/command-and-control/src/tools/rubric/triage.ts`
- Test: `packages/command-and-control/tests/tools/rubric/triage.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/tools/rubric/triage.test.ts
import { describe, it, expect } from 'vitest';
import { triageRubric } from '../../../src/tools/rubric/triage.js';
import type { LlmClient } from '@canvas-toolchain/shared-llm';
import type { PulledRubric, RubricChangeReport } from '../../../src/tools/rubric/sync_types.js';

const pulled: PulledRubric = {
  source: { kind: 'assignment', courseId: '1', assignmentId: '2', title: 'Essay' },
  criteria: [{ id: 'c1', name: 'Thesis', points: 10, description: 'Clear arguable thesis' }],
};
const change: RubricChangeReport = { status: 'unchanged', added: [], removed: [], modified: [] };

function mockLlm(text: string): LlmClient {
  return { complete: async () => ({ text }) };
}

describe('triageRubric', () => {
  it('parses an acceptable verdict', async () => {
    const llm = mockLlm('{"verdict":"acceptable","flags":[],"rationale":"fine"}');
    const r = await triageRubric({ pulled, change, assignmentSignal: '' }, { llm });
    expect(r.verdict).toBe('acceptable');
    expect(r.flags).toEqual([]);
  });

  it('strips code fences and keeps the proposed rubric on needs-update', async () => {
    const llm = mockLlm('```json\n{"verdict":"needs-update","flags":[{"criterion":"Thesis","issue":"vague","evidence":"vague-language"}],"proposedFacultyRubric":"Thesis (10): a clear, arguable claim.","rationale":"tighten"}\n```');
    const r = await triageRubric({ pulled, change, assignmentSignal: '' }, { llm });
    expect(r.verdict).toBe('needs-update');
    expect(r.proposedFacultyRubric).toContain('clear, arguable');
    expect(r.flags[0].evidence).toBe('vague-language');
  });

  it('throws when the LLM returns non-JSON', async () => {
    const llm = mockLlm('I think it is fine!');
    await expect(triageRubric({ pulled, change, assignmentSignal: '' }, { llm })).rejects.toThrow(/valid JSON/);
  });

  it('throws when verdict is not one of the three allowed values', async () => {
    const llm = mockLlm('{"verdict":"maybe","flags":[],"rationale":"x"}');
    await expect(triageRubric({ pulled, change, assignmentSignal: '' }, { llm })).rejects.toThrow(/verdict/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/command-and-control && npx vitest run tests/tools/rubric/triage.test.ts`
Expected: FAIL — cannot find module `triage.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/tools/rubric/triage.ts
import type { LlmClient } from '@canvas-toolchain/shared-llm';
import { AnthropicLlmClient } from '@canvas-toolchain/shared-llm';
import { loadAnthropicConfig } from '../setup_anthropic.js';
import type { PulledRubric, RubricChangeReport, RubricTriageReport } from './sync_types.js';
import { TRIAGE_SYSTEM_PROMPT, buildTriageUserPrompt } from './triage_prompts.js';

export interface TriageInput {
  pulled: PulledRubric;
  change: RubricChangeReport;
  assignmentSignal: string;
}
export interface TriageDeps { llm?: LlmClient; }

const VERDICTS = new Set(['acceptable', 'needs-update', 'needs-review']);
const EVIDENCE = new Set(['assignment-drift', 'vague-language', 'change-detected']);

function parseTriageJson(raw: string): RubricTriageReport {
  let t = raw.trim();
  if (t.startsWith('```')) t = t.replace(/^```(?:json)?\s*\n/, '').replace(/\n?```\s*$/, '').trim();

  let parsed: unknown;
  try { parsed = JSON.parse(t); }
  catch { throw new Error(`Triage LLM did not return valid JSON. First 200 chars: ${t.slice(0, 200)}`); }

  const o = parsed as Record<string, unknown>;
  if (!VERDICTS.has(String(o.verdict))) {
    throw new Error(`Triage verdict must be acceptable|needs-update|needs-review, got: ${String(o.verdict)}`);
  }
  const flagsRaw = Array.isArray(o.flags) ? o.flags : [];
  const flags = flagsRaw.map(f => {
    const fo = f as Record<string, unknown>;
    const evidence = EVIDENCE.has(String(fo.evidence)) ? String(fo.evidence) : 'vague-language';
    return { criterion: String(fo.criterion ?? ''), issue: String(fo.issue ?? ''), evidence } as RubricTriageReport['flags'][number];
  });

  const report: RubricTriageReport = {
    verdict: o.verdict as RubricTriageReport['verdict'],
    flags,
    rationale: String(o.rationale ?? ''),
  };
  if (report.verdict === 'needs-update' && typeof o.proposedFacultyRubric === 'string') {
    report.proposedFacultyRubric = o.proposedFacultyRubric;
  }
  return report;
}

export async function triageRubric(input: TriageInput, deps: TriageDeps = {}): Promise<RubricTriageReport> {
  const llm = deps.llm ?? new AnthropicLlmClient(loadAnthropicConfig());
  const userPrompt = buildTriageUserPrompt(input);
  const response = await llm.complete(TRIAGE_SYSTEM_PROMPT, userPrompt, { maxTokens: 4096 });
  return parseTriageJson(response.text);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/command-and-control && npx vitest run tests/tools/rubric/triage.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/command-and-control/src/tools/rubric/triage.ts packages/command-and-control/tests/tools/rubric/triage.test.ts
git commit -m "feat(rubric): LLM triage with strict JSON verdict parsing"
```

---

### Task 6: Orchestrator workflow

**Files:**
- Create: `packages/command-and-control/src/tools/workflows/review_canvas_rubric.ts`
- Test: `packages/command-and-control/tests/tools/workflows/review_canvas_rubric.test.ts`

The orchestrator resolves the assignment signal for Phase 1 from the pulled `assignmentBrief` (CI `diff_semesters` wiring is a Phase-2 enhancement). It reads the optional prior rendered `.md` from disk for change detection.

- [ ] **Step 1: Write the failing test**

```ts
// tests/tools/workflows/review_canvas_rubric.test.ts
import { describe, it, expect } from 'vitest';
import { reviewCanvasRubric } from '../../../src/tools/workflows/review_canvas_rubric.js';
import type { PulledRubric } from '../../../src/tools/rubric/sync_types.js';

const pulled: PulledRubric = {
  source: { kind: 'assignment', courseId: '1', assignmentId: '2', title: 'Essay' },
  criteria: [{ id: 'c1', name: 'Thesis', points: 10, description: 'Clear arguable thesis' }],
  assignmentBrief: 'Write a 5-page argumentative essay.',
};

describe('reviewCanvasRubric', () => {
  it('wires fetch -> change-detect -> triage into one report', async () => {
    const report = await reviewCanvasRubric(
      { courseId: '1', assignmentId: '2' },
      {
        pull: async () => pulled,
        readPriorMd: () => undefined,
        llm: { complete: async () => ({ text: '{"verdict":"acceptable","flags":[],"rationale":"fits"}' }) },
      },
    );
    expect(report.source.kind).toBe('assignment');
    expect(report.change.status).toBe('first-draft');
    expect(report.triage.verdict).toBe('acceptable');
  });

  it('returns the pick-list (no triage) when fetch yields choices', async () => {
    const choices: PulledRubric = { source: { kind: 'course-rubric', courseId: '1', title: 'Course rubrics' }, criteria: [], choices: [{ rubricId: '7', title: 'R' }] };
    const report = await reviewCanvasRubric(
      { courseId: '1' },
      { pull: async () => choices, readPriorMd: () => undefined, llm: { complete: async () => ({ text: '{}' }) } },
    );
    expect(report.source.kind).toBe('course-rubric');
    expect(report.choices).toEqual([{ rubricId: '7', title: 'R' }]);
    expect(report.triage).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/command-and-control && npx vitest run tests/tools/workflows/review_canvas_rubric.test.ts`
Expected: FAIL — cannot find module `review_canvas_rubric.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/tools/workflows/review_canvas_rubric.ts
import { readFileSync, existsSync } from 'node:fs';
import type { LlmClient } from '@canvas-toolchain/shared-llm';
import type { PulledRubric, ReviewReport } from '../rubric/sync_types.js';
import { pullRubric, type PullRubricInput } from '../rubric/canvas_fetch.js';
import { loadInstitutionConfig } from '../publish/canvas_config_bridge.js';
import { detectRubricChange } from '../rubric/change_detect.js';
import { triageRubric } from '../rubric/triage.js';

export interface ReviewCanvasRubricInput {
  courseId: string;
  assignmentId?: string;
  rubricId?: string;
  /** Path to the last rendered rubric .md, for change detection. */
  priorRenderedPath?: string;
  /** Overrides the pulled assignment description as the triage signal. */
  assignmentBrief?: string;
}

/** Injectable seams for tests. Production defaults wire real Canvas + LLM. */
export interface ReviewCanvasRubricDeps {
  pull?: (input: PullRubricInput) => Promise<PulledRubric>;
  readPriorMd?: (path?: string) => string | undefined;
  llm?: LlmClient;
}

/** Pick-list path returns source+choices with no change/triage. */
export type ReviewCanvasRubricResult = ReviewReport | (Pick<ReviewReport, 'source'> & { choices: NonNullable<PulledRubric['choices']>; change?: undefined; triage?: undefined });

function defaultReadPriorMd(path?: string): string | undefined {
  if (!path || !existsSync(path)) return undefined;
  return readFileSync(path, 'utf-8');
}

export async function reviewCanvasRubric(
  input: ReviewCanvasRubricInput,
  deps: ReviewCanvasRubricDeps = {},
): Promise<ReviewCanvasRubricResult> {
  const pull = deps.pull ?? ((i: PullRubricInput) => {
    const cfg = loadInstitutionConfig();
    return pullRubric(i, { cfg });
  });

  const pulled = await pull({ courseId: input.courseId, assignmentId: input.assignmentId, rubricId: input.rubricId });

  // List-fallback: hand back the pick-list, no triage.
  if (pulled.choices && pulled.criteria.length === 0) {
    return { source: pulled.source, choices: pulled.choices };
  }

  const priorMd = (deps.readPriorMd ?? defaultReadPriorMd)(input.priorRenderedPath);
  const change = detectRubricChange(pulled, priorMd);
  const assignmentSignal = input.assignmentBrief ?? pulled.assignmentBrief ?? '';
  const triage = await triageRubric({ pulled, change, assignmentSignal }, { llm: deps.llm });

  return { source: pulled.source, change, triage };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/command-and-control && npx vitest run tests/tools/workflows/review_canvas_rubric.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/command-and-control/src/tools/workflows/review_canvas_rubric.ts packages/command-and-control/tests/tools/workflows/review_canvas_rubric.test.ts
git commit -m "feat(rubric): review_canvas_rubric orchestrator (fetch+change+triage)"
```

---

### Task 7: Register the MCP tool

**Files:**
- Modify: `packages/command-and-control/src/index.ts` (add import near the other workflow imports ~line 78; add the tool schema in the tools array near the `draft_student_rubric` entry ~line 609; add the dispatch case near ~line 875)

- [ ] **Step 1: Add the import** (next to `import { draftStudentRubric } ...`)

```ts
import { reviewCanvasRubric, type ReviewCanvasRubricInput } from './tools/workflows/review_canvas_rubric.js';
```

- [ ] **Step 2: Add the tool schema** (immediately AFTER the `draft_student_rubric` schema object, before `brainstorm_interactive`)

```ts
    {
      name: 'review_canvas_rubric',
      description: 'Pull a rubric from Canvas (the assignment\'s attached rubric first; falls back to the course rubric list), detect whether it changed since your last student rewrite, and run a smart triage (acceptable / needs-update / needs-review) with specific flagged criteria. Read-only — writes nothing. When the verdict is needs-update it proposes a revised faculty rubric for your approval; feed the approved rubric to draft_student_rubric. Run setup_canvas and setup_anthropic first.',
      inputSchema: {
        type: 'object' as const,
        required: ['courseId'],
        properties: {
          courseId:          { type: 'string', description: 'Canvas course id.' },
          assignmentId:      { type: 'string', description: 'Assignment id. When set, pulls the rubric attached to that assignment; if none is attached, falls back to the course rubric list.' },
          rubricId:          { type: 'string', description: 'Specific course rubric id — use after a list fallback to fetch the chosen rubric.' },
          priorRenderedPath: { type: 'string', description: 'Absolute path to your last rendered rubric .md, used to detect what changed since the last rewrite.' },
          assignmentBrief:   { type: 'string', description: 'Optional: overrides the pulled assignment description as the triage\'s assignment signal.' },
        },
      },
    },
```

- [ ] **Step 3: Add the dispatch case** (next to `case 'draft_student_rubric':`)

```ts
      case 'review_canvas_rubric':
        result = await reviewCanvasRubric(args as unknown as ReviewCanvasRubricInput);
        break;
```

- [ ] **Step 4: Build + run the full C&C suite**

Run: `cd packages/command-and-control && npm run build && npx vitest run`
Expected: build exits 0; all tests pass including the four new rubric files.

- [ ] **Step 5: Commit**

```bash
git add packages/command-and-control/src/index.ts
git commit -m "feat(rubric): register review_canvas_rubric MCP tool"
```

---

### Task 8: Whole-monorepo verification

**Files:** none (verification only)

- [ ] **Step 1: Build the whole monorepo**

Run (repo root): `npm run build`
Expected: all workspaces build, exit 0.

- [ ] **Step 2: Run the whole test suite**

Run (repo root): `npm test`
Expected: all workspaces green; the four new `tests/tools/rubric/*` + `review_canvas_rubric` files included.

- [ ] **Step 3: Audit**

Run (repo root): `npm audit`
Expected: 0 vulnerabilities (unchanged from baseline).

- [ ] **Step 4: Commit any incidental fixes**

```bash
git add -A
git commit -m "chore(rubric): monorepo build + test green for Canvas rubric sync"
```

(Skip if nothing changed.)

---

## Self-Review

**Spec coverage:**
- Pull assignment-first → list fallback → Task 2 ✓
- Change detection vs last rewrite (facultyFacing blocks) → Task 3 ✓
- Smart triage verdict + flags + proposed revision → Tasks 4–5 ✓
- Orchestrator returning one ReviewReport; reuse drafter unchanged → Task 6 ✓ (no change to `draft_student_rubric`)
- Propose→commit (drafter IS commit) → Task 6 returns a report; no write tool added ✓
- Error handling (401/404/no-rubrics/no-prior/bad-JSON) → Tasks 2, 3, 5 ✓
- MCP registration → Task 7 ✓
- Phase 2 (student-question mine) → intentionally NOT in this plan ✓

**Placeholder scan:** none — every code step is complete.

**Type consistency:** `PulledRubric`, `RubricChangeReport`, `RubricTriageReport`, `ReviewReport` defined in Task 1 and used verbatim in Tasks 2–6. `pullRubric(input, deps)`, `detectRubricChange(pulled, priorMd?)`, `triageRubric(input, deps)`, `reviewCanvasRubric(input, deps)` signatures are consistent across tasks and tests. Canvas criterion mapping (`description`→`name`, `long_description`→`description`) is identical in Task 2 impl and Task 3 expectations.

**Known follow-ups (not blockers):**
- Phase 2: CI `diff_semesters` as the assignment signal + prior-semester student-question mining (gated on a data spike).
- The `loadInstitutionConfig()` bridge returns `{ canvasUrl, apiToken }` — matches `CanvasCfg`. Verify at Task 6 that the bridge throws a clear `CANVAS_NOT_CONFIGURED` when setup_canvas hasn't run (existing behavior).
