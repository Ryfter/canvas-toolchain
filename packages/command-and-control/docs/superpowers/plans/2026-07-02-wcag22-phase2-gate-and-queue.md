# WCAG 2.2 Phase 2 — Gate, Acknowledgments & Review Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Phase 1's advisory conformance reports into a two-tier publishing gate with acknowledge-to-launch overrides, a persisted acknowledgment audit trail, and a per-course borderline review queue with two new C&C tools.

**Architecture:** The pure acknowledgment-evaluation logic lives in `@canvas-toolchain/shared-types` beside `computeVerdict`. Canvas Design Studio owns the `.a11y/` on-disk store (acknowledgments + review queue) and gates `publish_to_canvas`. Command & Control upgrades `scan_warnings` to the conformance engines, gates `publish_course` per file, and adds `accessibility_review_queue` + `audit_course_accessibility` workflow tools. C&C consumes CDS code via `canvas-design-mcp/dist/...` imports, exactly like the existing `scanFerpa`/`publishToCanvas` imports.

**Tech Stack:** TypeScript, vitest, existing Phase 1 conformance engines (`runConformanceCheck`), `node:fs` JSON stores. No new dependencies.

**Spec:** `packages/command-and-control/docs/superpowers/specs/2026-07-01-wcag22-conformance-gate-design.md` (§1 borderline rule, §3 gate, §5 queue, §6 reporting, §9 testing). Phase 3 items (policy anchor, WCAG 3 toggle, WAVE adapter, policy nudge) are **out of scope**.

## Global Constraints

- **Public repo — zero institution-specific data.** Examples and fixtures use `example.edu` / `example.instructure.com` only. Grep for `boisestate|BSU|Boise` before every commit; any match is a defect.
- **Error code is exactly `ACCESSIBILITY_ACK_REQUIRED`** on both publish paths (spec §3).
- **Two-tier acknowledgment semantics (spec §3, exact):** verdict `borderline` → `acknowledgeAccessibility: true` suffices. Verdict `fail` → the value must be an array naming **every** clear-failure SC; missing SCs are rejected, extra SCs are rejected, and `true` is rejected. Verdict `pass` → no acknowledgment needed (a supplied one is ignored, not an error).
- **Borderline rule (spec §1, already implemented as `isBorderlineFinding`):** with margin → `measured >= 0.85 * required`; without margin → severity `moderate`/`minor`. `serious`/`critical` without a saving margin = clear failure.
- **FERPA and Canvas-RCE validation gates are untouched**; the accessibility gate runs after both. The manual generate-and-paste workflow stays ungated — the gate lives only inside the publish tools.
- **Gate level = `DEFAULT_REQUIRED_LEVEL` (WCAG 2.1 AA)** for all of Phase 2. The institution-config policy anchor is Phase 3; do not add config plumbing for it now.
- **Advisories never gate.** Findings beyond the required level stay in `report.advisories` and never affect the gate.
- **Audit-trail durability:** `.a11y/acknowledgments.json` is append-only. A corrupt JSON file is quarantined (renamed to `<file>.corrupt-<timestamp>`), never overwritten in place.
- **Records are fail-soft:** a failure writing an acknowledgment or queue entry must never convert a Canvas publish that already succeeded into a reported failure (`console.warn` + continue, same as the breadcrumb pattern in `publish_course.ts`).
- **Cross-package rebuilds:** C&C and CDS import `@canvas-toolchain/shared-types` from `dist`, and C&C imports CDS via `canvas-design-mcp/dist/...`. After changing shared-types run `npm run build` in `packages/shared-types`; after changing CDS run `npm run build` in `packages/canvas-design-studio`; do both **before** running the downstream package's tests.
- Baseline before this plan: CDS suite 659 passed / 1 skipped, C&C suite 607 passed / 2 skipped, `tsc --noEmit` clean. Every task ends with its package(s) green.
- Work happens on branch `feat/wcag22-phase2` off `main`. Never push `HEAD:main`.

## File Structure

| File | Responsibility |
| --- | --- |
| `packages/shared-types/src/accessibility.ts` (modify) | Pure acknowledgment evaluation: `A11yAcknowledgment`, `AckEvaluation`, `clearFailureScs`, `evaluateAckAgainst`, `evaluateAcknowledgment` |
| `packages/canvas-design-studio/src/tools/a11y/records.ts` (create) | The `.a11y/` store: acknowledgment append + review-queue CRUD + worst-first sort. Single owner of the on-disk format |
| `packages/canvas-design-studio/src/tools/publish.ts` (modify) | Single-page gate + acknowledgment recording |
| `packages/canvas-design-studio/src/index.ts` (modify) | `publish_to_canvas` MCP schema: `acknowledgeAccessibility`, `courseDir` |
| `packages/command-and-control/src/tools/publish/scan_warnings.ts` (modify) | Conformance-engine warnings with `sc` + `a11yTier`; clear failures become `severity: 'block'` |
| `packages/command-and-control/src/tools/publish/manifest_types.ts` (modify) | `Warning` gains `sc?`, `a11yTier?`; `PublishCourseInput` consumers see `a11yAcknowledgments` |
| `packages/command-and-control/src/tools/publish/a11y_gate.ts` (create) | Per-file gate evaluation from preview-time warnings |
| `packages/command-and-control/src/tools/workflows/publish_course.ts` (modify) | Course gate, ack pass-through, assignment records, queue updates |
| `packages/command-and-control/src/tools/workflows/accessibility_review_queue.ts` (create) | `accessibility_review_queue` tool (list / resolve) |
| `packages/command-and-control/src/tools/workflows/audit_course_accessibility.ts` (create) | `audit_course_accessibility` tool (full-course audit + queue refresh) |
| `packages/command-and-control/src/index.ts` (modify) | Register both new tools + `publish_course` schema addition |
| `docs/accessibility.md`, package `CLAUDE.md`s, `AGENTS.md` (modify) | Documentation |

---

### Task 1: Acknowledgment evaluation in shared-types

**Files:**
- Modify: `packages/shared-types/src/accessibility.ts`
- Test: `packages/shared-types/tests/accessibility.test.ts`

**Interfaces:**
- Consumes: existing `ConformanceReport`, `AccessibilityFinding`, `isBorderlineFinding` from the same file.
- Produces (later tasks rely on these exact names):
  - `type A11yAcknowledgment = true | string[]`
  - `interface AckEvaluation { ok: boolean; tier: 'none' | 'borderline' | 'fail'; requiredScs: string[]; reason?: string }`
  - `clearFailureScs(report: ConformanceReport): string[]`
  - `evaluateAckAgainst(clearScs: string[], hasBorderline: boolean, ack: A11yAcknowledgment | boolean | undefined): AckEvaluation`
  - `evaluateAcknowledgment(report: ConformanceReport, ack: A11yAcknowledgment | boolean | undefined): AckEvaluation`

- [ ] **Step 1: Write the failing tests**

Append to `packages/shared-types/tests/accessibility.test.ts`:

```ts
import {
  evaluateAckAgainst, evaluateAcknowledgment, clearFailureScs,
  type AccessibilityFinding, type ConformanceReport, DEFAULT_REQUIRED_LEVEL,
} from '../src/accessibility.js';

function finding(over: Partial<AccessibilityFinding>): AccessibilityFinding {
  return {
    sc: '1.4.3', scName: 'Contrast (Minimum)', scVersion: '2.0', level: 'AA',
    severity: 'serious', engine: 'inhouse', message: 'low contrast', ...over,
  };
}

function report(findings: AccessibilityFinding[]): ConformanceReport {
  return {
    requiredLevel: DEFAULT_REQUIRED_LEVEL,
    verdict: findings.length === 0 ? 'pass' : 'fail',
    findings, advisories: [], criteria: [],
  };
}

describe('evaluateAckAgainst', () => {
  it('passes with tier none when nothing failed', () => {
    expect(evaluateAckAgainst([], false, undefined))
      .toEqual({ ok: true, tier: 'none', requiredScs: [] });
  });

  it('blocks borderline without acknowledgment', () => {
    const r = evaluateAckAgainst([], true, undefined);
    expect(r.ok).toBe(false);
    expect(r.tier).toBe('borderline');
    expect(r.reason).toContain('acknowledgeAccessibility: true');
  });

  it('passes borderline with true', () => {
    expect(evaluateAckAgainst([], true, true)).toEqual({ ok: true, tier: 'borderline', requiredScs: [] });
  });

  it('passes borderline with an array too', () => {
    expect(evaluateAckAgainst([], true, ['1.4.3']).ok).toBe(true);
  });

  it('rejects true for clear failures', () => {
    const r = evaluateAckAgainst(['1.4.3'], false, true);
    expect(r.ok).toBe(false);
    expect(r.tier).toBe('fail');
    expect(r.requiredScs).toEqual(['1.4.3']);
    expect(r.reason).toContain('not sufficient');
  });

  it('rejects an incomplete array (missing SC named)', () => {
    const r = evaluateAckAgainst(['1.3.1', '1.4.3'], false, ['1.4.3']);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('missing: 1.3.1');
  });

  it('rejects extra SCs (must name only what fails)', () => {
    const r = evaluateAckAgainst(['1.4.3'], false, ['1.4.3', '2.4.4']);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('2.4.4');
  });

  it('passes a complete exact array, order- and duplicate-insensitive', () => {
    const r = evaluateAckAgainst(['1.3.1', '1.4.3'], true, ['1.4.3', '1.3.1', '1.4.3']);
    expect(r).toEqual({ ok: true, tier: 'fail', requiredScs: ['1.3.1', '1.4.3'] });
  });

  it('treats runtime false (from JSON input) as no acknowledgment', () => {
    expect(evaluateAckAgainst([], true, false).ok).toBe(false);
  });
});

describe('clearFailureScs / evaluateAcknowledgment', () => {
  it('extracts unique sorted clear-failure SCs, excluding borderline findings', () => {
    const rep = report([
      finding({ sc: '1.4.3', severity: 'serious' }),
      finding({ sc: '1.3.1', scName: 'Info and Relationships', severity: 'serious' }),
      finding({ sc: '1.3.1', scName: 'Info and Relationships', severity: 'serious', message: 'second defect' }),
      finding({ sc: '2.4.4', scName: 'Link Purpose (In Context)', severity: 'moderate' }), // borderline
    ]);
    expect(clearFailureScs(rep)).toEqual(['1.3.1', '1.4.3']);
    const r = evaluateAcknowledgment(rep, ['1.3.1', '1.4.3']);
    expect(r.ok).toBe(true);
    expect(r.tier).toBe('fail');
  });

  it('a margin inside the 85% band makes a serious finding borderline, not clear', () => {
    const rep = report([finding({
      severity: 'serious',
      margin: { measured: 4.32, required: 4.5, unit: 'contrast ratio' },
    })]);
    rep.verdict = 'borderline';
    expect(clearFailureScs(rep)).toEqual([]);
    expect(evaluateAcknowledgment(rep, true).ok).toBe(true);
  });

  it('passing report needs no acknowledgment and ignores a supplied one', () => {
    const rep = report([]);
    expect(evaluateAcknowledgment(rep, undefined)).toEqual({ ok: true, tier: 'none', requiredScs: [] });
    expect(evaluateAcknowledgment(rep, true).ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run (in `packages/shared-types`): `npx vitest run tests/accessibility.test.ts`
Expected: FAIL — `evaluateAckAgainst` is not exported.

- [ ] **Step 3: Implement**

Append to `packages/shared-types/src/accessibility.ts`:

```ts
/** Professor acknowledgment: `true` for borderline-only, a named-SC array for clear failures. */
export type A11yAcknowledgment = true | string[];

export interface AckEvaluation {
  ok: boolean;
  tier: 'none' | 'borderline' | 'fail';
  /** Clear-failure SCs an array acknowledgment must name exactly (empty for none/borderline). */
  requiredScs: string[];
  reason?: string;
}

/** Unique, sorted SCs of clear (non-borderline) failures at the required level. */
export function clearFailureScs(report: ConformanceReport): string[] {
  return [...new Set(report.findings.filter(f => !isBorderlineFinding(f)).map(f => f.sc))].sort();
}

/**
 * Two-tier gate evaluation (spec §3). Clear failures demand an array naming every
 * failing SC — no more, no less; `true` covers borderline-only. `false` or any
 * non-conforming runtime value (this arrives from JSON tool input) counts as absent.
 */
export function evaluateAckAgainst(
  clearScs: string[],
  hasBorderline: boolean,
  ack: A11yAcknowledgment | boolean | undefined
): AckEvaluation {
  const given = ack === true || Array.isArray(ack) ? ack : undefined;

  if (clearScs.length > 0) {
    const required = [...new Set(clearScs)].sort();
    if (!Array.isArray(given)) {
      return {
        ok: false, tier: 'fail', requiredScs: required,
        reason: `Clear accessibility failures require a named acknowledgment listing every failing criterion: [${required.map(s => `"${s}"`).join(', ')}]. Passing true is not sufficient for clear failures.`,
      };
    }
    const names = [...new Set(given)].sort();
    const missing = required.filter(sc => !names.includes(sc));
    const extra = names.filter(sc => !required.includes(sc));
    if (missing.length > 0 || extra.length > 0) {
      const parts: string[] = [];
      if (missing.length > 0) parts.push(`missing: ${missing.join(', ')}`);
      if (extra.length > 0) parts.push(`not failing here (remove): ${extra.join(', ')}`);
      return {
        ok: false, tier: 'fail', requiredScs: required,
        reason: `The acknowledgment must name every clear-failure criterion and only those — ${parts.join('; ')}.`,
      };
    }
    return { ok: true, tier: 'fail', requiredScs: required };
  }

  if (hasBorderline) {
    if (given === undefined) {
      return {
        ok: false, tier: 'borderline', requiredScs: [],
        reason: 'Borderline accessibility findings require acknowledgment. Review them, then pass acknowledgeAccessibility: true.',
      };
    }
    return { ok: true, tier: 'borderline', requiredScs: [] };
  }

  return { ok: true, tier: 'none', requiredScs: [] };
}

/** Evaluate an acknowledgment against a conformance report's required-level findings. */
export function evaluateAcknowledgment(
  report: ConformanceReport,
  ack: A11yAcknowledgment | boolean | undefined
): AckEvaluation {
  return evaluateAckAgainst(
    clearFailureScs(report),
    report.findings.some(isBorderlineFinding),
    ack
  );
}
```

Confirm `packages/shared-types/src/index.ts` re-exports accessibility with `export * from './accessibility.js'` (Phase 1 set this up). If it enumerates names instead, add the five new exports.

- [ ] **Step 4: Run tests to verify they pass**

Run (in `packages/shared-types`): `npx vitest run` then `npx tsc --noEmit` then `npm run build`
Expected: all PASS, clean build (downstream tasks import from `dist`).

- [ ] **Step 5: Commit**

```bash
git add packages/shared-types/src/accessibility.ts packages/shared-types/tests/accessibility.test.ts packages/shared-types/src/index.ts
git commit -m "feat(shared-types): two-tier accessibility acknowledgment evaluation"
```

---

### Task 2: The `.a11y/` store in Canvas Design Studio

**Files:**
- Create: `packages/canvas-design-studio/src/tools/a11y/records.ts`
- Test: `packages/canvas-design-studio/tests/a11y/records.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks (pure `node:fs` module).
- Produces (Tasks 3, 5, 6, 7 rely on these exact names, importable by C&C as `canvas-design-mcp/dist/tools/a11y/records.js`):
  - `interface AcknowledgmentRecord { at: string; page: string; canvasUrl?: string; tier: 'borderline' | 'fail'; scIds: string[]; requiredLevel: string }`
  - `interface ReviewQueueReason { sc: string; detail: string; marginRatio?: number }`
  - `interface ReviewQueueEntry { page: string; canvasUrl?: string; reasons: ReviewQueueReason[]; lastCheckedAt: string; status: 'open' | 'reviewed-by-human'; resolvedAt?: string; note?: string }`
  - `appendAcknowledgment(courseDir: string, record: AcknowledgmentRecord): void`
  - `loadAcknowledgments(courseDir: string): AcknowledgmentRecord[]`
  - `loadReviewQueue(courseDir: string): ReviewQueueEntry[]`
  - `upsertReviewEntry(courseDir: string, entry: Omit<ReviewQueueEntry, 'status'>): void`
  - `clearReviewEntryIfClean(courseDir: string, page: string): void`
  - `resolveReviewEntry(courseDir: string, page: string, note?: string): boolean`
  - `sortWorstFirst(entries: ReviewQueueEntry[]): ReviewQueueEntry[]`

- [ ] **Step 1: Write the failing tests**

Create `packages/canvas-design-studio/tests/a11y/records.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  appendAcknowledgment, loadAcknowledgments,
  loadReviewQueue, upsertReviewEntry, clearReviewEntryIfClean, resolveReviewEntry, sortWorstFirst,
  type AcknowledgmentRecord, type ReviewQueueEntry,
} from '../../src/tools/a11y/records.js';

let courseDir: string;
beforeEach(() => { courseDir = mkdtempSync(join(tmpdir(), 'a11y-records-')); });
afterEach(() => { rmSync(courseDir, { recursive: true, force: true }); });

function ack(over: Partial<AcknowledgmentRecord> = {}): AcknowledgmentRecord {
  return {
    at: '2026-07-02T10:00:00Z', page: 'week-3-lab.html',
    canvasUrl: 'https://example.instructure.com/courses/123/pages/week-3-lab',
    tier: 'fail', scIds: ['1.4.3'], requiredLevel: 'WCAG 2.1 AA', ...over,
  };
}

describe('acknowledgments store', () => {
  it('appends records, creating .a11y/ on demand', () => {
    appendAcknowledgment(courseDir, ack());
    appendAcknowledgment(courseDir, ack({ tier: 'borderline', scIds: [] }));
    const records = loadAcknowledgments(courseDir);
    expect(records).toHaveLength(2);
    expect(records[0].scIds).toEqual(['1.4.3']);
    expect(records[1].tier).toBe('borderline');
  });

  it('returns [] when nothing was ever recorded', () => {
    expect(loadAcknowledgments(courseDir)).toEqual([]);
  });

  it('quarantines a corrupt file instead of overwriting it', () => {
    mkdirSync(join(courseDir, '.a11y'), { recursive: true });
    writeFileSync(join(courseDir, '.a11y', 'acknowledgments.json'), '{not json', 'utf-8');
    appendAcknowledgment(courseDir, ack());
    const files = readdirSync(join(courseDir, '.a11y'));
    expect(files.some(f => f.startsWith('acknowledgments.json.corrupt-'))).toBe(true);
    expect(loadAcknowledgments(courseDir)).toHaveLength(1);
    const corrupt = files.find(f => f.startsWith('acknowledgments.json.corrupt-'))!;
    expect(readFileSync(join(courseDir, '.a11y', corrupt), 'utf-8')).toBe('{not json');
  });
});

describe('review queue store', () => {
  const entry = (page: string, marginRatio?: number): Omit<ReviewQueueEntry, 'status'> => ({
    page,
    reasons: [{ sc: '1.4.3', detail: '4.32:1 measured, 4.5:1 required', ...(marginRatio !== undefined && { marginRatio }) }],
    lastCheckedAt: '2026-07-02',
  });

  it('upserts by page and reopens a reviewed entry on new findings', () => {
    upsertReviewEntry(courseDir, entry('a.html'));
    expect(resolveReviewEntry(courseDir, 'a.html', 'looks fine on screen')).toBe(true);
    expect(loadReviewQueue(courseDir)[0].status).toBe('reviewed-by-human');
    upsertReviewEntry(courseDir, entry('a.html'));
    const q = loadReviewQueue(courseDir);
    expect(q).toHaveLength(1);
    expect(q[0].status).toBe('open');
  });

  it('resolve returns false for an unknown page', () => {
    expect(resolveReviewEntry(courseDir, 'nope.html')).toBe(false);
  });

  it('clearReviewEntryIfClean removes the entry and tolerates absence', () => {
    upsertReviewEntry(courseDir, entry('a.html'));
    clearReviewEntryIfClean(courseDir, 'a.html');
    clearReviewEntryIfClean(courseDir, 'a.html');
    expect(loadReviewQueue(courseDir)).toEqual([]);
  });

  it('sortWorstFirst orders by lowest margin ratio, marginless entries after', () => {
    const entries: ReviewQueueEntry[] = [
      { ...entry('no-margin.html'), status: 'open' },
      { ...entry('close.html', 0.99), status: 'open' },
      { ...entry('worst.html', 0.86), status: 'open' },
    ];
    expect(sortWorstFirst(entries).map(e => e.page)).toEqual(['worst.html', 'close.html', 'no-margin.html']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run (in `packages/canvas-design-studio`): `npx vitest run tests/a11y/records.test.ts`
Expected: FAIL — module `src/tools/a11y/records.ts` does not exist.

- [ ] **Step 3: Implement**

Create `packages/canvas-design-studio/src/tools/a11y/records.ts`:

```ts
/**
 * Per-course-project accessibility records under <courseDir>/.a11y/:
 * acknowledgments.json (append-only audit trail) and review-queue.json
 * (the "near the edge" human-review worklist). Spec §3 + §5.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface AcknowledgmentRecord {
  at: string;                   // ISO timestamp
  page: string;                 // page title or filename
  canvasUrl?: string;
  tier: 'borderline' | 'fail';
  scIds: string[];              // empty for borderline-only acknowledgments
  requiredLevel: string;        // e.g. "WCAG 2.1 AA"
}

export interface ReviewQueueReason {
  sc: string;
  detail: string;
  /** measured/required for measurable criteria (contrast); drives worst-first sorting. */
  marginRatio?: number;
}

export interface ReviewQueueEntry {
  page: string;
  canvasUrl?: string;
  reasons: ReviewQueueReason[];
  lastCheckedAt: string;        // YYYY-MM-DD
  status: 'open' | 'reviewed-by-human';
  resolvedAt?: string;
  note?: string;
}

const A11Y_DIR = '.a11y';
const ACK_FILE = 'acknowledgments.json';
const QUEUE_FILE = 'review-queue.json';

function ensureA11yPath(courseDir: string, file: string): string {
  const dir = join(courseDir, A11Y_DIR);
  mkdirSync(dir, { recursive: true });
  return join(dir, file);
}

/** Audit files are never clobbered: a corrupt one is renamed aside and reading starts fresh. */
function readJsonArray<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf-8'));
    if (Array.isArray(parsed)) return parsed as T[];
  } catch { /* fall through to quarantine */ }
  renameSync(path, `${path}.corrupt-${Date.now()}`);
  return [];
}

function writeJsonArray(path: string, value: unknown[]): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
}

export function appendAcknowledgment(courseDir: string, record: AcknowledgmentRecord): void {
  const path = ensureA11yPath(courseDir, ACK_FILE);
  const records = readJsonArray<AcknowledgmentRecord>(path);
  records.push(record);
  writeJsonArray(path, records);
}

export function loadAcknowledgments(courseDir: string): AcknowledgmentRecord[] {
  return readJsonArray<AcknowledgmentRecord>(join(courseDir, A11Y_DIR, ACK_FILE));
}

export function loadReviewQueue(courseDir: string): ReviewQueueEntry[] {
  return readJsonArray<ReviewQueueEntry>(join(courseDir, A11Y_DIR, QUEUE_FILE));
}

function saveReviewQueue(courseDir: string, entries: ReviewQueueEntry[]): void {
  writeJsonArray(ensureA11yPath(courseDir, QUEUE_FILE), entries);
}

/** Add or refresh a page's entry. Always reopens — fresh findings supersede an old human review. */
export function upsertReviewEntry(courseDir: string, entry: Omit<ReviewQueueEntry, 'status'>): void {
  const queue = loadReviewQueue(courseDir);
  const next: ReviewQueueEntry = { ...entry, status: 'open' };
  const index = queue.findIndex(e => e.page === entry.page);
  if (index >= 0) queue[index] = next;
  else queue.push(next);
  saveReviewQueue(courseDir, queue);
}

/** Remove a page's entry after a clean re-check. No-op when absent. */
export function clearReviewEntryIfClean(courseDir: string, page: string): void {
  const queue = loadReviewQueue(courseDir);
  const next = queue.filter(e => e.page !== page);
  if (next.length !== queue.length) saveReviewQueue(courseDir, next);
}

/** Mark an entry human-reviewed. Returns false when the page has no entry. */
export function resolveReviewEntry(courseDir: string, page: string, note?: string): boolean {
  const queue = loadReviewQueue(courseDir);
  const entry = queue.find(e => e.page === page);
  if (!entry) return false;
  entry.status = 'reviewed-by-human';
  entry.resolvedAt = new Date().toISOString();
  if (note) entry.note = note;
  saveReviewQueue(courseDir, queue);
  return true;
}

/** Worst first: lowest margin ratio, marginless entries after, ties by page name. */
export function sortWorstFirst(entries: ReviewQueueEntry[]): ReviewQueueEntry[] {
  const minRatio = (e: ReviewQueueEntry): number =>
    Math.min(...e.reasons.map(r => r.marginRatio ?? Number.POSITIVE_INFINITY));
  return [...entries].sort((a, b) => (minRatio(a) - minRatio(b)) || a.page.localeCompare(b.page));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run (in `packages/canvas-design-studio`): `npx vitest run tests/a11y/records.test.ts` then `npx tsc --noEmit`
Expected: PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add packages/canvas-design-studio/src/tools/a11y/records.ts packages/canvas-design-studio/tests/a11y/records.test.ts
git commit -m "feat(cds): .a11y/ store — acknowledgment audit trail + borderline review queue"
```

---

### Task 3: Single-page gate in `publish_to_canvas`

**Files:**
- Modify: `packages/canvas-design-studio/src/tools/publish.ts`
- Modify: `packages/canvas-design-studio/src/index.ts` (publish_to_canvas schema, ~line 154)
- Test: `packages/canvas-design-studio/tests/publish.test.ts`

**Interfaces:**
- Consumes: `evaluateAcknowledgment`, `A11yAcknowledgment`, `AckEvaluation` from `@canvas-toolchain/shared-types` (Task 1); `appendAcknowledgment`, `AcknowledgmentRecord` from `./a11y/records.js` (Task 2); existing `runConformanceCheck`/`formatConformanceReport` from `./a11y/conformance.js`.
- Produces: `PublishToCanvasInput` gains `acknowledgeAccessibility?: A11yAcknowledgment` and `courseDir?: string`; `PublishSuccess` gains `acknowledgment?: AcknowledgmentRecord`; new blocked-publish error `code: 'ACCESSIBILITY_ACK_REQUIRED'` with `details: { verdict, requiredScs }`. Task 5 calls `publishToCanvas` with the two new inputs.

**Behavior change to own explicitly:** Phase 1's test asserting "publish success carries a conformance report and still publishes on failures (advisory)" is deliberately obsoleted — the advisory era ends here. Replace that test as shown below; do not weaken the gate to keep it.

- [ ] **Step 1: Write the failing tests**

In `packages/canvas-design-studio/tests/publish.test.ts`, **delete** the Phase 1 advisory test (`'publish success carries a conformance report and still publishes on failures (advisory)'`) and add, using the file's existing mock-api/config helpers (a fake `PublishApi` with `listPages: async () => []`, `createPage`/`updatePage` returning a `CanvasPage`) — follow the surrounding tests' setup exactly:

```ts
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadAcknowledgments } from '../src/tools/a11y/records.js';

// Deterministic in-house findings:
// vague link  -> 2.4.4 moderate  => borderline
// headerless table -> 1.3.1 serious => clear failure
const BORDERLINE_HTML = '<p>Course intro. <a href="https://example.edu/syllabus">click here</a></p>';
const FAIL_HTML = '<table><tr><td>Monday</td><td>Lab 1</td></tr></table>';
const CLEAN_HTML = '<p>Welcome to the course. Read the <a href="https://example.edu/syllabus">course syllabus</a> before week one.</p>';

describe('accessibility gate (two-tier, spec §3)', () => {
  it('publishes a passing page without any acknowledgment', async () => {
    const result = await publishToCanvas(
      { courseId: 1, html: CLEAN_HTML, pageTitle: 'Welcome' }, config, api);
    expect('url' in result).toBe(true);
    if ('url' in result) expect(result.acknowledgment).toBeUndefined();
  });

  it('blocks borderline without acknowledgment, with code ACCESSIBILITY_ACK_REQUIRED', async () => {
    const result = await publishToCanvas(
      { courseId: 1, html: BORDERLINE_HTML, pageTitle: 'Intro' }, config, api);
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.code).toBe('ACCESSIBILITY_ACK_REQUIRED');
      expect((result.details as { verdict: string }).verdict).toBe('borderline');
    }
  });

  it('publishes borderline with acknowledgeAccessibility: true and records it', async () => {
    const courseDir = mkdtempSync(join(tmpdir(), 'pub-ack-'));
    try {
      const result = await publishToCanvas(
        { courseId: 1, html: BORDERLINE_HTML, pageTitle: 'Intro', acknowledgeAccessibility: true, courseDir },
        config, api);
      expect('url' in result).toBe(true);
      if ('url' in result) {
        expect(result.acknowledgment?.tier).toBe('borderline');
        expect(result.acknowledgment?.scIds).toEqual([]);
      }
      const records = loadAcknowledgments(courseDir);
      expect(records).toHaveLength(1);
      expect(records[0].requiredLevel).toBe('WCAG 2.1 AA');
    } finally { rmSync(courseDir, { recursive: true, force: true }); }
  });

  it('rejects true for clear failures and lists the required SCs', async () => {
    const result = await publishToCanvas(
      { courseId: 1, html: FAIL_HTML, pageTitle: 'Schedule', acknowledgeAccessibility: true }, config, api);
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.code).toBe('ACCESSIBILITY_ACK_REQUIRED');
      expect((result.details as { requiredScs: string[] }).requiredScs.length).toBeGreaterThan(0);
    }
  });

  it('publishes clear failures only with the complete named-SC array (round-trip from details)', async () => {
    const blocked = await publishToCanvas(
      { courseId: 1, html: FAIL_HTML, pageTitle: 'Schedule' }, config, api);
    expect('error' in blocked).toBe(true);
    const requiredScs = (blocked as { details: { requiredScs: string[] } }).details.requiredScs;

    const incomplete = await publishToCanvas(
      { courseId: 1, html: FAIL_HTML, pageTitle: 'Schedule', acknowledgeAccessibility: requiredScs.slice(1) },
      config, api);
    // With exactly one required SC, slice(1) is [] which is also incomplete.
    expect('error' in incomplete).toBe(true);

    const published = await publishToCanvas(
      { courseId: 1, html: FAIL_HTML, pageTitle: 'Schedule', acknowledgeAccessibility: requiredScs },
      config, api);
    expect('url' in published).toBe(true);
    if ('url' in published) expect(published.acknowledgment?.scIds).toEqual(requiredScs);
  });

  it('acknowledgment persistence failure does not fail the publish', async () => {
    const result = await publishToCanvas(
      { courseId: 1, html: BORDERLINE_HTML, pageTitle: 'Intro', acknowledgeAccessibility: true,
        courseDir: join(tmpdir(), 'pub-ack-missing', 'definitely', 'nested', '\0bad') },
      config, api);
    // Publish already happened; a record-write failure is warned, not surfaced as an error.
    expect('url' in result).toBe(true);
  });
});
```

Note: the FERPA/validation-order tests already in the file must keep passing unchanged — the a11y gate sits after both.

- [ ] **Step 2: Run tests to verify they fail**

Run (in `packages/canvas-design-studio`): `npx vitest run tests/publish.test.ts`
Expected: FAIL — `acknowledgeAccessibility` unknown, no gate, no `acknowledgment` field.

- [ ] **Step 3: Implement the gate in `publish.ts`**

Update imports:

```ts
import { evaluateAcknowledgment, type A11yAcknowledgment, type AckEvaluation, type ConformanceReport } from '@canvas-toolchain/shared-types';
import { runConformanceCheck, formatConformanceReport } from './a11y/conformance.js';
import { appendAcknowledgment, type AcknowledgmentRecord } from './a11y/records.js';
```

Extend the input and success types:

```ts
export interface PublishToCanvasInput {
  courseId?: number;
  html: string;
  pageTitle: string;
  forcePublish?: boolean;
  skipFerpaCheck?: boolean;
  collisionAction?: CollisionAction;
  relatedPageTitle?: string;
  /** Two-tier accessibility override (spec §3): true acknowledges borderline findings;
   *  an array naming every clear-failure SC acknowledges clear failures. Recorded. */
  acknowledgeAccessibility?: A11yAcknowledgment;
  /** Course project folder; when set, acknowledgments append to <courseDir>/.a11y/acknowledgments.json. */
  courseDir?: string;
}

export interface PublishSuccess {
  url: string;
  action: 'created' | 'updated';
  pageTitle: string;
  tip: string;
  accessibilityWarnings?: AccessibilityWarning[];
  conformance?: ConformanceReport;
  /** Present when this publish went through on an acknowledgment. */
  acknowledgment?: AcknowledgmentRecord;
}
```

Directly after the existing `const conformance = await runConformanceCheck(input.html);` line, add the gate:

```ts
  const ackEval = evaluateAcknowledgment(conformance, input.acknowledgeAccessibility);
  if (!ackEval.ok) {
    return {
      error: `${ackEval.reason}\n\n${formatConformanceReport(conformance)}\n\nThe professor is the final arbiter — fix what you can, or re-run with the acknowledgment to publish anyway. Acknowledgments are recorded to the course project's .a11y/ audit trail.`,
      code: 'ACCESSIBILITY_ACK_REQUIRED',
      details: { verdict: conformance.verdict, requiredScs: ackEval.requiredScs },
    };
  }
```

Add two module-level helpers (above `publishToCanvas`):

```ts
/** Persistence is fail-soft: a record-write failure never fails a publish that already succeeded. */
function recordAcknowledgment(record: AcknowledgmentRecord, courseDir?: string): void {
  if (!courseDir) return;
  try {
    appendAcknowledgment(courseDir, record);
  } catch (e) {
    console.warn(`a11y acknowledgment record failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function publishSuccess(
  page: CanvasPage,
  action: 'created' | 'updated',
  a11yWarnings: AccessibilityWarning[],
  conformance: ConformanceReport,
  ackEval: AckEvaluation,
  input: PublishToCanvasInput,
): PublishSuccess {
  const base: PublishSuccess = {
    url: canvasPageUrl(page),
    action,
    pageTitle: page.title,
    tip: versionControlTip(),
    ...(a11yWarnings.length > 0 && { accessibilityWarnings: a11yWarnings }),
    conformance,
  };
  if (ackEval.tier === 'none') return base;
  const acknowledgment: AcknowledgmentRecord = {
    at: new Date().toISOString(),
    page: input.pageTitle,
    canvasUrl: base.url,
    tier: ackEval.tier,
    scIds: ackEval.requiredScs,
    requiredLevel: `WCAG ${conformance.requiredLevel.version} ${conformance.requiredLevel.level}`,
  };
  recordAcknowledgment(acknowledgment, input.courseDir);
  return { ...base, acknowledgment };
}
```

Replace both success-return blocks with calls to the helper — the `update` branch becomes:

```ts
      const updated = await api.updatePage(input.courseId, collision.page.url, input.html);
      return publishSuccess(updated, 'updated', a11yWarnings, conformance, ackEval, input);
```

and the create branch:

```ts
    const created = await api.createPage(input.courseId, title ?? input.pageTitle, input.html);
    return publishSuccess(created, 'created', a11yWarnings, conformance, ackEval, input);
```

- [ ] **Step 4: Update the MCP schema in `src/index.ts`**

In the `publish_to_canvas` tool definition (~line 154), extend the description with `Accessibility gate: borderline findings need acknowledgeAccessibility: true; clear failures need an array naming every failing criterion.` and add to `properties`:

```ts
            acknowledgeAccessibility: {
              description:
                'Accessibility acknowledgment. Pass true after reviewing borderline findings; pass an array naming every clear-failure criterion (e.g. ["1.4.3"]) to publish past clear failures. The professor is the final arbiter — acknowledgments are recorded.',
              oneOf: [
                { type: 'boolean' as const },
                { type: 'array' as const, items: { type: 'string' as const } },
              ],
            },
            courseDir: {
              type: 'string',
              description: 'Optional course project folder; acknowledgments are recorded to <courseDir>/.a11y/acknowledgments.json.',
            },
```

The handler needs no change (it casts `args` to `PublishToCanvasInput`).

- [ ] **Step 5: Run the full CDS suite**

Run (in `packages/canvas-design-studio`): `npx vitest run` then `npx tsc --noEmit` then `npm run build`
Expected: all PASS (the deleted advisory test replaced by the gate tests). Build required — Task 4+ imports CDS from `dist`.

- [ ] **Step 6: Commit**

```bash
git add packages/canvas-design-studio/src/tools/publish.ts packages/canvas-design-studio/src/index.ts packages/canvas-design-studio/tests/publish.test.ts
git commit -m "feat(cds): two-tier accessibility gate on publish_to_canvas with recorded acknowledgments"
```

---

### Task 4: Conformance-engine warnings in C&C `scan_warnings`

**Files:**
- Modify: `packages/command-and-control/src/tools/publish/manifest_types.ts` (Warning type)
- Modify: `packages/command-and-control/src/tools/publish/scan_warnings.ts`
- Modify: `packages/command-and-control/src/tools/workflows/preview_course_publish.ts` (await the now-async calls at lines ~212 and ~280)
- Test: `packages/command-and-control/tests/tools/publish/scan_warnings.test.ts`

**Interfaces:**
- Consumes: `runConformanceCheck` via `canvas-design-mcp/dist/tools/a11y/conformance.js`; `isBorderlineFinding` from `@canvas-toolchain/shared-types`.
- Produces (Task 5 relies on): `Warning` gains `sc?: string` and `a11yTier?: 'clear' | 'borderline'`; `scanWarnings(html: string): Promise<Warning[]>` (now async); a11y clear failures carry `severity: 'block'`, borderline stay `'warn'`; a11y `message` format is `` `${f.sc} ${f.scName} — ${f.message}` ``.

- [ ] **Step 1: Write the failing tests**

Rewrite the a11y cases in `packages/command-and-control/tests/tools/publish/scan_warnings.test.ts` (keep the FERPA/validation cases, adding `await`):

```ts
it('emits a block-severity a11y warning with sc + tier for a clear failure', async () => {
  // Headerless table -> in-house table-no-headers -> 1.3.1 serious -> clear failure
  const warnings = await scanWarnings('<table><tr><td>Monday</td><td>Lab 1</td></tr></table>');
  const a11y = warnings.filter(w => w.kind === 'a11y');
  const clear = a11y.find(w => w.sc === '1.3.1');
  expect(clear).toBeDefined();
  expect(clear!.severity).toBe('block');
  expect(clear!.a11yTier).toBe('clear');
  expect(clear!.message).toContain('1.3.1');
});

it('emits a warn-severity a11y warning with borderline tier for a moderate finding', async () => {
  // Vague link -> 2.4.4 moderate -> borderline
  const warnings = await scanWarnings('<p><a href="https://example.edu/syllabus">click here</a></p>');
  const borderline = warnings.find(w => w.kind === 'a11y' && w.sc === '2.4.4');
  expect(borderline).toBeDefined();
  expect(borderline!.severity).toBe('warn');
  expect(borderline!.a11yTier).toBe('borderline');
});

it('emits no a11y warnings for clean content', async () => {
  const warnings = await scanWarnings('<p>Read the <a href="https://example.edu/syllabus">course syllabus</a> first.</p>');
  expect(warnings.filter(w => w.kind === 'a11y')).toEqual([]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run (in `packages/command-and-control`): `npx vitest run tests/tools/publish/scan_warnings.test.ts`
Expected: FAIL — `scanWarnings` is sync, no `sc`/`a11yTier`.

- [ ] **Step 3: Implement**

In `manifest_types.ts`, extend `Warning`:

```ts
export interface Warning {
  kind: WarningKind;
  severity: WarningSeverity;
  message: string;
  line?: number;
  /** a11y warnings only: WCAG success criterion id, e.g. "1.4.3". */
  sc?: string;
  /** a11y warnings only: clear failure (gates with a named-SC acknowledgment) vs borderline (gates with true). */
  a11yTier?: 'clear' | 'borderline';
}
```

Rewrite `scan_warnings.ts`:

```ts
import { scanFerpa } from 'canvas-design-mcp/dist/tools/publish.js';
import { validateCanvasHtml } from 'canvas-design-mcp/dist/tools/validate.js';
import { runConformanceCheck } from 'canvas-design-mcp/dist/tools/a11y/conformance.js';
import { isBorderlineFinding } from '@canvas-toolchain/shared-types';
import type { Warning } from './manifest_types.js';

export async function scanWarnings(html: string): Promise<Warning[]> {
  const warnings: Warning[] = [];

  const ferpa = scanFerpa(html);
  if (ferpa) {
    warnings.push({ kind: 'ferpa', severity: 'block', message: ferpa.reason, line: ferpa.line });
  }

  const validation = validateCanvasHtml(html);
  if (!validation.valid) {
    for (const v of validation.violations) {
      warnings.push({
        kind: 'validation',
        severity: 'block',
        message: `${v.rule}: ${v.context}`,
        line: undefined,
      });
    }
  }

  // Phase 2 (spec §3): findings at the required level gate publishing — clear
  // failures block until acknowledged by named SC; borderline needs a light ack.
  const conformance = await runConformanceCheck(html);
  for (const f of conformance.findings) {
    const borderline = isBorderlineFinding(f);
    warnings.push({
      kind: 'a11y',
      severity: borderline ? 'warn' : 'block',
      message: `${f.sc} ${f.scName} — ${f.message}`,
      sc: f.sc,
      a11yTier: borderline ? 'borderline' : 'clear',
    });
  }

  return warnings;
}
```

In `preview_course_publish.ts`, change both call sites to `await scanWarnings(...)` (the enclosing function is already async). Line ~212: `const warnings = await scanWarnings(p.html);`. Line ~280: `warnings: await scanWarnings(a.html),`.

- [ ] **Step 4: Run the affected C&C suites**

Run (in `packages/command-and-control`): `npx vitest run tests/tools/publish/scan_warnings.test.ts tests/tools/workflows/preview_course_publish.test.ts tests/workflows/` then the full `npx vitest run` and `npx tsc --noEmit`.
Expected: PASS. If any preview/publish fixture asserted the old a11y message format (`check`-based) or `severity: 'warn'` for what is now a clear failure, update that fixture to the new shape — the new severities/messages are the intended behavior, not a regression.

- [ ] **Step 5: Commit**

```bash
git add packages/command-and-control/src/tools/publish/manifest_types.ts packages/command-and-control/src/tools/publish/scan_warnings.ts packages/command-and-control/src/tools/workflows/preview_course_publish.ts packages/command-and-control/tests
git commit -m "feat(cc): conformance-engine a11y warnings in scan_warnings — clear failures block"
```

---

### Task 5: Course gate + acknowledgments in `publish_course`

**Files:**
- Create: `packages/command-and-control/src/tools/publish/a11y_gate.ts`
- Modify: `packages/command-and-control/src/tools/workflows/publish_course.ts`
- Modify: `packages/command-and-control/src/index.ts` (publish_course schema)
- Test: `packages/command-and-control/tests/workflows/publish_course-a11y-gate.test.ts` (new), `packages/command-and-control/tests/tools/publish/a11y_gate.test.ts` (new)

**Interfaces:**
- Consumes: `evaluateAckAgainst`, `AckEvaluation`, `DEFAULT_REQUIRED_LEVEL` from `@canvas-toolchain/shared-types`; `Warning` (with `sc`/`a11yTier`, Task 4); `appendAcknowledgment`, `upsertReviewEntry`, `clearReviewEntryIfClean` from `canvas-design-mcp/dist/tools/a11y/records.js` (Task 2); `publishToCanvas`'s new `acknowledgeAccessibility`/`courseDir` inputs (Task 3).
- Produces: `PublishCourseInput` gains `a11yAcknowledgments?: Record<string, true | string[]>`; per-file gate failures return `FailedEntry.code: 'ACCESSIBILITY_ACK_REQUIRED'`; acknowledged publishes append records; queue entries maintained per published file. `evaluateEntryA11yGate(warnings: Warning[], ack: true | string[] | undefined): AckEvaluation`.

- [ ] **Step 1: Write the failing gate-helper tests**

Create `packages/command-and-control/tests/tools/publish/a11y_gate.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { evaluateEntryA11yGate } from '../../../src/tools/publish/a11y_gate.js';
import type { Warning } from '../../../src/tools/publish/manifest_types.js';

const clear = (sc: string): Warning =>
  ({ kind: 'a11y', severity: 'block', message: `${sc} clear failure`, sc, a11yTier: 'clear' });
const borderline = (sc: string): Warning =>
  ({ kind: 'a11y', severity: 'warn', message: `${sc} borderline`, sc, a11yTier: 'borderline' });
const ferpaBlock: Warning = { kind: 'ferpa', severity: 'block', message: 'possible student ID' };

describe('evaluateEntryA11yGate', () => {
  it('passes files with no a11y warnings (non-a11y blocks are not its business)', () => {
    expect(evaluateEntryA11yGate([ferpaBlock], undefined).ok).toBe(true);
  });

  it('legacy warnings without a11yTier do not gate (pre-Phase-2 snapshots)', () => {
    const legacy: Warning = { kind: 'a11y', severity: 'warn', message: 'old-format warning' };
    expect(evaluateEntryA11yGate([legacy], undefined).ok).toBe(true);
  });

  it('borderline-only requires true', () => {
    expect(evaluateEntryA11yGate([borderline('2.4.4')], undefined).ok).toBe(false);
    expect(evaluateEntryA11yGate([borderline('2.4.4')], true).ok).toBe(true);
  });

  it('clear failures require the exact named-SC array', () => {
    const warnings = [clear('1.3.1'), clear('1.4.3'), borderline('2.4.4')];
    expect(evaluateEntryA11yGate(warnings, true).ok).toBe(false);
    expect(evaluateEntryA11yGate(warnings, ['1.4.3']).ok).toBe(false);
    const r = evaluateEntryA11yGate(warnings, ['1.4.3', '1.3.1']);
    expect(r.ok).toBe(true);
    expect(r.tier).toBe('fail');
    expect(r.requiredScs).toEqual(['1.3.1', '1.4.3']);
  });
});
```

- [ ] **Step 2: Run to verify failure, then implement the helper**

Run (in `packages/command-and-control`): `npx vitest run tests/tools/publish/a11y_gate.test.ts` — FAIL (module missing).

Create `packages/command-and-control/src/tools/publish/a11y_gate.ts`:

```ts
import { evaluateAckAgainst, type AckEvaluation } from '@canvas-toolchain/shared-types';
import type { Warning } from './manifest_types.js';

/**
 * Per-file accessibility gate over preview-time warnings (spec §3, course path).
 * Same two-tier semantics as publish_to_canvas. Warnings without a11yTier
 * (pre-Phase-2 snapshots) do not gate.
 */
export function evaluateEntryA11yGate(
  warnings: Warning[],
  ack: true | string[] | undefined
): AckEvaluation {
  const a11y = warnings.filter(w => w.kind === 'a11y');
  const clearScs = [...new Set(a11y.filter(w => w.a11yTier === 'clear' && w.sc).map(w => w.sc as string))];
  const hasBorderline = a11y.some(w => w.a11yTier === 'borderline');
  return evaluateAckAgainst(clearScs, hasBorderline, ack);
}
```

Re-run: PASS.

- [ ] **Step 3: Write the failing publish_course integration tests**

Create `packages/command-and-control/tests/workflows/publish_course-a11y-gate.test.ts`, following the harness pattern of `tests/tools/workflows/publish_course.test.ts` (temp snapshot dir via the snapshot store, manifest with one page entry, mocked `canvas-design-mcp` publish). Cover, with manifest warnings built from the Task 1 helpers' shapes:

```ts
// Fixture warnings on the page entry:
const CLEAR_WARNING = { kind: 'a11y', severity: 'block', message: '1.3.1 Info and Relationships — table has no header cells', sc: '1.3.1', a11yTier: 'clear' } as const;
const BORDERLINE_WARNING = { kind: 'a11y', severity: 'warn', message: '2.4.4 Link Purpose — vague link text', sc: '2.4.4', a11yTier: 'borderline' } as const;

it('blocks an approved file with clear a11y failures when no acknowledgment covers it', async () => {
  // manifest entry warnings: [CLEAR_WARNING]; approvals approve the file; no a11yAcknowledgments
  const result = await publishCourse({ snapshotId, approvals: { 'week-1.html': 'approve' } }, hooks);
  expect(result.failed?.code).toBe('ACCESSIBILITY_ACK_REQUIRED');
  expect(result.phase).toBe('partial');
  expect(result.fix?.[0]).toContain('a11yAcknowledgments');
  expect(result.fix?.[0]).toContain('"1.3.1"');
});

it('blocks borderline without ack; publishes with { file: true } and writes the record + queue entry', async () => {
  // warnings: [BORDERLINE_WARNING]
  const blocked = await publishCourse({ snapshotId, approvals }, hooks);
  expect(blocked.failed?.code).toBe('ACCESSIBILITY_ACK_REQUIRED');

  const ok = await publishCourse({ snapshotId: snapshot2, approvals, a11yAcknowledgments: { 'week-1.html': true } }, hooks);
  expect(ok.phase).toBe('published');
  const acks = loadAcknowledgments(courseDir);          // from canvas-design-mcp/dist/tools/a11y/records.js
  expect(acks).toHaveLength(1);
  expect(acks[0].tier).toBe('borderline');
  const queue = loadReviewQueue(courseDir);
  expect(queue.map(q => q.page)).toContain('week-1.html');
});

it('publishes clear failures with the named-SC array and keeps FERPA blocks absolute', async () => {
  // entry A warnings: [CLEAR_WARNING] with ack ['1.3.1'] -> publishes, record tier 'fail', scIds ['1.3.1']
  // entry B warnings: [ferpa block] with an a11yAcknowledgments entry -> still BLOCKING_WARNINGS
});

it('a clean published file clears its stale review-queue entry', async () => {
  // Pre-seed queue with upsertReviewEntry(courseDir, { page: 'week-1.html', ... });
  // manifest entry has no a11y warnings; publish; expect loadReviewQueue(courseDir) to be []
});
```

Write these as full tests against the existing harness — every assertion above is required; reuse the existing test file's snapshot/manifest builders rather than inventing new ones. Note the CDS `publishToCanvas` inside `publish_course` is exercised through the existing mock; the gate under test here is C&C's own pre-gate.

- [ ] **Step 4: Run to verify failure**

Run: `npx vitest run tests/workflows/publish_course-a11y-gate.test.ts`
Expected: FAIL — `a11yAcknowledgments` unknown, no gate.

- [ ] **Step 5: Implement in `publish_course.ts`**

Add imports:

```ts
import { DEFAULT_REQUIRED_LEVEL } from '@canvas-toolchain/shared-types';
import { appendAcknowledgment, upsertReviewEntry, clearReviewEntryIfClean } from 'canvas-design-mcp/dist/tools/a11y/records.js';
import { evaluateEntryA11yGate } from '../publish/a11y_gate.js';
```

Extend the input:

```ts
export interface PublishCourseInput {
  snapshotId: string;
  approvals: ApprovalMap;
  resume?: boolean;
  gitCommit?: boolean;
  pushTag?: boolean;
  canvasBreadcrumbs?: boolean;
  /** Per-file accessibility acknowledgments (spec §3): true = borderline-only;
   *  string[] = named clear-failure SCs. Recorded to <courseDir>/.a11y/. */
  a11yAcknowledgments?: { [filename: string]: true | string[] };
}
```

Replace the block guard inside the entry loop (currently `if ('warnings' in entry && entry.warnings.some(w => w.severity === 'block')) { ... }`) with:

```ts
    const entryWarnings = 'warnings' in entry ? entry.warnings : [];
    if (entryWarnings.some(w => w.severity === 'block' && w.kind !== 'a11y')) {
      const failed: FailedEntry = {
        filename: entry.filename, type: entry.type, reason: 'blocked by severity:block warning',
        code: 'BLOCKING_WARNINGS', failedAt: new Date().toISOString(),
      };
      writeState(dir, { phase: 'partial', published, failed, lastUpdatedAt: failed.failedAt });
      return { snapshotId: input.snapshotId, phase: 'partial', published, failed };
    }
    const a11yGate = evaluateEntryA11yGate(entryWarnings, input.a11yAcknowledgments?.[entry.filename]);
    if (!a11yGate.ok) {
      const failed: FailedEntry = {
        filename: entry.filename, type: entry.type,
        reason: a11yGate.reason ?? 'accessibility acknowledgment required',
        code: 'ACCESSIBILITY_ACK_REQUIRED', failedAt: new Date().toISOString(),
      };
      writeState(dir, { phase: 'partial', published, failed, lastUpdatedAt: failed.failedAt });
      return {
        snapshotId: input.snapshotId, phase: 'partial', published, failed,
        fix: [
          a11yGate.tier === 'fail'
            ? `Fix the findings and re-run preview_course_publish, or pass a11yAcknowledgments: { "${entry.filename}": [${a11yGate.requiredScs.map(s => `"${s}"`).join(', ')}] } to publish past the named failures. The professor is the final arbiter; acknowledgments are recorded.`
            : `Fix the borderline findings and re-run preview_course_publish, or pass a11yAcknowledgments: { "${entry.filename}": true } after reviewing them.`,
        ],
      };
    }
```

In the page branch, pass the acknowledgment through to CDS (which appends the record itself for pages):

```ts
        const out = await publishToCanvas(
          { courseId: manifest.courseId, html: rewrittenHtml, pageTitle: entry.intendedTitle,
            collisionAction: entry.canvasMatch ? 'update' : 'create',
            acknowledgeAccessibility: input.a11yAcknowledgments?.[entry.filename],
            courseDir: manifest.courseDir },
          { canvasUrl: cfg.canvasUrl, apiToken: cfg.apiToken } as any, api as any,
        );
```

In the assignment branch, after `updateAssignmentDescription` succeeds, append the record directly (no `publishToCanvas` runs there):

```ts
        if (a11yGate.tier !== 'none') {
          try {
            appendAcknowledgment(manifest.courseDir, {
              at: new Date().toISOString(), page: entry.filename,
              tier: a11yGate.tier, scIds: a11yGate.requiredScs,
              requiredLevel: `WCAG ${DEFAULT_REQUIRED_LEVEL.version} ${DEFAULT_REQUIRED_LEVEL.level}`,
            });
          } catch (e) {
            console.warn(`a11y acknowledgment record failed for ${entry.filename}: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
```

Once per entry, inside the `try` block directly before the per-entry `writeState(dir, { phase: 'partial', published, lastUpdatedAt: ... })` call (this point is reached by both the page and assignment branches), maintain the review queue — fail-soft:

```ts
      try {
        const a11yWarns = entryWarnings.filter(w => w.kind === 'a11y' && w.a11yTier);
        if (a11yWarns.length > 0) {
          upsertReviewEntry(manifest.courseDir, {
            page: entry.filename,
            canvasUrl: published[published.length - 1]?.canvasUrl,
            reasons: a11yWarns.map(w => ({ sc: w.sc ?? 'unknown', detail: w.message })),
            lastCheckedAt: new Date().toISOString().slice(0, 10),
          });
        } else {
          clearReviewEntryIfClean(manifest.courseDir, entry.filename);
        }
      } catch (e) {
        console.warn(`a11y review queue update failed for ${entry.filename}: ${e instanceof Error ? e.message : String(e)}`);
      }
```

- [ ] **Step 6: Add the MCP schema property**

In `packages/command-and-control/src/index.ts`, find the `publish_course` tool definition and add to its `properties`:

```ts
          a11yAcknowledgments: {
            type: 'object' as const,
            description:
              'Per-file accessibility acknowledgments: { "<filename>": true } for borderline findings; { "<filename>": ["1.4.3"] } naming every clear-failure criterion. Recorded to the course project\'s .a11y/ audit trail.',
            additionalProperties: {
              oneOf: [
                { type: 'boolean' as const },
                { type: 'array' as const, items: { type: 'string' as const } },
              ],
            },
          },
```

- [ ] **Step 7: Run the C&C suite**

Run (in `packages/command-and-control`): `npx vitest run` then `npx tsc --noEmit`
Expected: PASS, including all pre-existing publish_course tests (their fixtures carry no `a11yTier`, so the gate passes them — the legacy-warning test in Step 1 pins this).

- [ ] **Step 8: Commit**

```bash
git add packages/command-and-control/src/tools/publish/a11y_gate.ts packages/command-and-control/src/tools/workflows/publish_course.ts packages/command-and-control/src/index.ts packages/command-and-control/tests
git commit -m "feat(cc): per-file accessibility gate + acknowledgments + review-queue upkeep in publish_course"
```

---

### Task 6: `accessibility_review_queue` tool

**Files:**
- Create: `packages/command-and-control/src/tools/workflows/accessibility_review_queue.ts`
- Modify: `packages/command-and-control/src/index.ts` (tool definition + switch case)
- Test: `packages/command-and-control/tests/workflows/accessibility_review_queue.test.ts`

**Interfaces:**
- Consumes: `loadReviewQueue`, `resolveReviewEntry`, `sortWorstFirst` from `canvas-design-mcp/dist/tools/a11y/records.js` (Task 2).
- Produces: `accessibilityReviewQueue(input: AccessibilityReviewQueueInput): Promise<AccessibilityReviewQueueResult>`; MCP tool `accessibility_review_queue`.

- [ ] **Step 1: Write the failing tests**

Create `packages/command-and-control/tests/workflows/accessibility_review_queue.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { upsertReviewEntry, loadReviewQueue } from 'canvas-design-mcp/dist/tools/a11y/records.js';
import { accessibilityReviewQueue } from '../../src/tools/workflows/accessibility_review_queue.js';

let courseDir: string;
beforeEach(() => {
  courseDir = mkdtempSync(join(tmpdir(), 'arq-'));
  upsertReviewEntry(courseDir, {
    page: 'week-3-lab.html',
    canvasUrl: 'https://example.instructure.com/courses/123/pages/week-3-lab',
    reasons: [{ sc: '1.4.3', detail: '4.32:1 measured, 4.5:1 required', marginRatio: 0.96 }],
    lastCheckedAt: '2026-07-02',
  });
  upsertReviewEntry(courseDir, {
    page: 'week-1-intro.html',
    reasons: [{ sc: '1.4.3', detail: '3.90:1 measured, 4.5:1 required', marginRatio: 0.867 }],
    lastCheckedAt: '2026-07-02',
  });
});
afterEach(() => { rmSync(courseDir, { recursive: true, force: true }); });

describe('accessibility_review_queue', () => {
  it('lists open entries worst-margin first with URL, criteria, and last-checked date', async () => {
    const result = await accessibilityReviewQueue({ courseDir });
    expect(result.open).toBe(2);
    expect(result.text.indexOf('week-1-intro.html')).toBeLessThan(result.text.indexOf('week-3-lab.html'));
    expect(result.text).toContain('https://example.instructure.com/courses/123/pages/week-3-lab');
    expect(result.text).toContain('1.4.3');
    expect(result.text).toContain('2026-07-02');
  });

  it('resolve marks an entry reviewed-by-human with the note', async () => {
    const result = await accessibilityReviewQueue({
      courseDir, action: 'resolve', page: 'week-3-lab.html', note: 'checked on screen, contrast fine',
    });
    expect(result.error).toBeUndefined();
    const entry = loadReviewQueue(courseDir).find(e => e.page === 'week-3-lab.html')!;
    expect(entry.status).toBe('reviewed-by-human');
    expect(entry.note).toBe('checked on screen, contrast fine');
    expect(result.open).toBe(1);
    expect(result.reviewed).toBe(1);
  });

  it('resolve without page or with an unknown page returns a structured error', async () => {
    const noPage = await accessibilityReviewQueue({ courseDir, action: 'resolve' });
    expect(noPage.error).toBe('PAGE_REQUIRED');
    const unknown = await accessibilityReviewQueue({ courseDir, action: 'resolve', page: 'nope.html' });
    expect(unknown.error).toBe('PAGE_NOT_IN_QUEUE');
  });

  it('missing courseDir returns COURSE_DIR_NOT_FOUND with a fix', async () => {
    const result = await accessibilityReviewQueue({ courseDir: join(courseDir, 'does-not-exist') });
    expect(result.error).toBe('COURSE_DIR_NOT_FOUND');
    expect(result.fix?.length).toBeGreaterThan(0);
  });

  it('an empty queue lists cleanly', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'arq-empty-'));
    try {
      const result = await accessibilityReviewQueue({ courseDir: empty });
      expect(result.open).toBe(0);
      expect(result.text).toContain('empty');
    } finally { rmSync(empty, { recursive: true, force: true }); }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/workflows/accessibility_review_queue.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `packages/command-and-control/src/tools/workflows/accessibility_review_queue.ts`:

```ts
import { existsSync } from 'node:fs';
import {
  loadReviewQueue, resolveReviewEntry, sortWorstFirst,
  type ReviewQueueEntry,
} from 'canvas-design-mcp/dist/tools/a11y/records.js';

export interface AccessibilityReviewQueueInput {
  courseDir: string;
  action?: 'list' | 'resolve';
  page?: string;
  note?: string;
}

export interface AccessibilityReviewQueueResult {
  courseDir: string;
  open: number;
  reviewed: number;
  text: string;
  error?: string;
  fix?: string[];
}

function formatEntry(entry: ReviewQueueEntry, index: number): string {
  const lines = [`${index + 1}. ${entry.page}${entry.canvasUrl ? ` — ${entry.canvasUrl}` : ''}`];
  for (const r of entry.reasons) {
    const pct = r.marginRatio !== undefined ? ` (${Math.round(r.marginRatio * 100)}% of threshold)` : '';
    lines.push(`   • ${r.sc}: ${r.detail}${pct}`);
  }
  lines.push(`   last checked ${entry.lastCheckedAt}`);
  return lines.join('\n');
}

/** The "near the edge" worklist (spec §5): pages a human should verify with real eyes.
 *  The professor is the final arbiter — resolving records their judgment. */
export async function accessibilityReviewQueue(
  input: AccessibilityReviewQueueInput
): Promise<AccessibilityReviewQueueResult> {
  const base = { courseDir: input.courseDir, open: 0, reviewed: 0, text: '' };
  if (!existsSync(input.courseDir)) {
    return {
      ...base, error: 'COURSE_DIR_NOT_FOUND',
      text: `Course project folder not found: ${input.courseDir}`,
      fix: ['Pass the course project folder that contains course-config.md (and the .a11y/ records).'],
    };
  }

  if (input.action === 'resolve') {
    if (!input.page) {
      return { ...base, error: 'PAGE_REQUIRED', text: 'action: "resolve" needs a page.', fix: ['Pass the page exactly as listed by action: "list".'] };
    }
    if (!resolveReviewEntry(input.courseDir, input.page, input.note)) {
      return { ...base, error: 'PAGE_NOT_IN_QUEUE', text: `No queue entry for ${input.page}.`, fix: ['Run action: "list" to see current entries.'] };
    }
  }

  const queue = loadReviewQueue(input.courseDir);
  const open = sortWorstFirst(queue.filter(e => e.status === 'open'));
  const reviewed = queue.filter(e => e.status === 'reviewed-by-human');

  const lines: string[] = [`Accessibility review queue — ${open.length} open, ${reviewed.length} reviewed`];
  if (input.action === 'resolve') lines.push(`✓ ${input.page} marked reviewed-by-human.`);
  if (open.length === 0) {
    lines.push('', 'The queue is empty — nothing is waiting on human eyes.');
  } else {
    lines.push('', 'Open the URL in your logged-in browser and double-check with human eyes', '(free deep checks: WAVE browser extension, or MS Accessibility Insights — https://accessibilityinsights.io/downloads/):', '');
    lines.push(...open.map(formatEntry));
    lines.push('', 'Mark one done: accessibility_review_queue with action: "resolve", page: "<page>", note: "<what you verified>".');
  }

  return { courseDir: input.courseDir, open: open.length, reviewed: reviewed.length, text: lines.join('\n') };
}
```

- [ ] **Step 4: Register the tool in `src/index.ts`**

Tool definition (beside the other workflow tools):

```ts
    {
      name: 'accessibility_review_queue',
      description:
        'The per-course "near the edge" accessibility worklist: pages with borderline findings, needs-human-review criteria, or acknowledged publishes. Lists open entries worst-margin first with live Canvas URLs for human-eyes verification; resolve marks a page reviewed. The professor is the final arbiter.',
      inputSchema: {
        type: 'object' as const,
        required: ['courseDir'],
        properties: {
          courseDir: { type: 'string', description: 'Course project folder (contains .a11y/).' },
          action: { type: 'string', enum: ['list', 'resolve'], description: 'Default list.' },
          page: { type: 'string', description: 'Required for resolve — the page as listed.' },
          note: { type: 'string', description: 'Optional note recorded with the resolution.' },
        },
      },
    },
```

Switch case (beside `list_modules` etc.):

```ts
      case 'accessibility_review_queue':
        result = await accessibilityReviewQueue(args as unknown as Parameters<typeof accessibilityReviewQueue>[0]);
        break;
```

plus the import at the top: `import { accessibilityReviewQueue } from './tools/workflows/accessibility_review_queue.js';`

- [ ] **Step 5: Run the suite and commit**

Run (in `packages/command-and-control`): `npx vitest run` then `npx tsc --noEmit`
Expected: PASS.

```bash
git add packages/command-and-control/src/tools/workflows/accessibility_review_queue.ts packages/command-and-control/src/index.ts packages/command-and-control/tests/workflows/accessibility_review_queue.test.ts
git commit -m "feat(cc): accessibility_review_queue tool — worst-first human-review worklist"
```

---

### Task 7: `audit_course_accessibility` tool

**Files:**
- Create: `packages/command-and-control/src/tools/workflows/audit_course_accessibility.ts`
- Modify: `packages/command-and-control/src/index.ts` (tool definition + switch case)
- Test: `packages/command-and-control/tests/workflows/audit_course_accessibility.test.ts`

**Interfaces:**
- Consumes: `runConformanceCheck` from `canvas-design-mcp/dist/tools/a11y/conformance.js`; `upsertReviewEntry`, `clearReviewEntryIfClean`, `loadReviewQueue` from `canvas-design-mcp/dist/tools/a11y/records.js`; `isBorderlineFinding` from `@canvas-toolchain/shared-types`.
- Produces: `auditCourseAccessibility(input: AuditCourseAccessibilityInput): Promise<AuditCourseAccessibilityResult>`; MCP tool `audit_course_accessibility`.

- [ ] **Step 1: Write the failing tests**

Create `packages/command-and-control/tests/workflows/audit_course_accessibility.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadReviewQueue, upsertReviewEntry } from 'canvas-design-mcp/dist/tools/a11y/records.js';
import { auditCourseAccessibility } from '../../src/tools/workflows/audit_course_accessibility.js';

const CLEAN = '<p>Read the <a href="https://example.edu/syllabus">course syllabus</a> before week one.</p>';
const BORDERLINE = '<p><a href="https://example.edu/syllabus">click here</a></p>';                 // 2.4.4 moderate
const FAIL = '<table><tr><td>Monday</td><td>Lab 1</td></tr></table>';                              // 1.3.1 serious

let courseDir: string;
beforeEach(() => {
  courseDir = mkdtempSync(join(tmpdir(), 'audit-'));
  mkdirSync(join(courseDir, 'output', 'week-01'), { recursive: true });
  writeFileSync(join(courseDir, 'output', 'week-01', 'clean.html'), CLEAN, 'utf-8');
  writeFileSync(join(courseDir, 'output', 'week-01', 'borderline.html'), BORDERLINE, 'utf-8');
  writeFileSync(join(courseDir, 'output', 'fail.html'), FAIL, 'utf-8');
});
afterEach(() => { rmSync(courseDir, { recursive: true, force: true }); });

describe('audit_course_accessibility', () => {
  it('audits every generated HTML file and reports per-verdict counts', async () => {
    const result = await auditCourseAccessibility({ courseDir });
    expect(result.pages).toBe(3);
    expect(result.pass).toBe(1);
    expect(result.borderline).toBe(1);
    expect(result.fail).toBe(1);
    expect(result.text).toContain('fail.html');
    expect(result.text).toContain('accessibility_review_queue');
  }, 30000);

  it('refreshes the review queue: failing pages enter, clean pages clear', async () => {
    upsertReviewEntry(courseDir, {
      page: 'week-01/clean.html',
      reasons: [{ sc: '1.4.3', detail: 'stale entry from an earlier check' }],
      lastCheckedAt: '2026-06-01',
    });
    await auditCourseAccessibility({ courseDir });
    const pages = loadReviewQueue(courseDir).map(e => e.page).sort();
    expect(pages).toEqual(['fail.html', 'week-01/borderline.html']);
  }, 30000);

  it('errors helpfully when there is no generated output', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'audit-empty-'));
    try {
      const result = await auditCourseAccessibility({ courseDir: empty });
      expect(result.error).toBe('NO_GENERATED_OUTPUT');
      expect(result.fix?.[0]).toContain('generate_course');
    } finally { rmSync(empty, { recursive: true, force: true }); }
  });
});
```

(The 30s timeouts cover axe-in-jsdom startup on slower machines.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/workflows/audit_course_accessibility.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `packages/command-and-control/src/tools/workflows/audit_course_accessibility.ts`:

```ts
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { runConformanceCheck } from 'canvas-design-mcp/dist/tools/a11y/conformance.js';
import { upsertReviewEntry, clearReviewEntryIfClean, loadReviewQueue } from 'canvas-design-mcp/dist/tools/a11y/records.js';
import type { ConformanceReport } from '@canvas-toolchain/shared-types';

export interface AuditCourseAccessibilityInput {
  courseDir: string;
  /** Where generated HTML lives. Defaults to <courseDir>/output (generate_course's default). */
  outputDir?: string;
}

export interface AuditCourseAccessibilityResult {
  courseDir: string;
  pages: number;
  pass: number;
  borderline: number;
  fail: number;
  queueOpen: number;
  text: string;
  error?: string;
  fix?: string[];
}

function walkHtmlFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walkHtmlFiles(p));
    else if (name.endsWith('.html')) out.push(p);
  }
  return out;
}

function queueReasons(report: ConformanceReport) {
  return report.findings.map(f => ({
    sc: f.sc,
    detail: `${f.scName}: ${f.message}`,
    ...(f.margin && { marginRatio: f.margin.measured / f.margin.required }),
  }));
}

/** The between-semesters "regular check" (spec §5): full engine stack over every
 *  generated page, one course-level summary, review queue refreshed. */
export async function auditCourseAccessibility(
  input: AuditCourseAccessibilityInput
): Promise<AuditCourseAccessibilityResult> {
  const base = { courseDir: input.courseDir, pages: 0, pass: 0, borderline: 0, fail: 0, queueOpen: 0, text: '' };
  const outDir = input.outputDir ?? join(input.courseDir, 'output');
  if (!existsSync(outDir)) {
    return {
      ...base, error: 'NO_GENERATED_OUTPUT',
      text: `No generated HTML found at ${outDir}.`,
      fix: ['Run generate_course first, or pass outputDir pointing at the generated HTML.'],
    };
  }

  const files = walkHtmlFiles(outDir);
  const counts = { pass: 0, borderline: 0, fail: 0 };
  const perPage: Array<{ page: string; verdict: ConformanceReport['verdict']; findings: number }> = [];

  for (const file of files) {
    const page = relative(outDir, file).split('\\').join('/');
    const report = await runConformanceCheck(readFileSync(file, 'utf-8'));
    counts[report.verdict] += 1;
    perPage.push({ page, verdict: report.verdict, findings: report.findings.length });
    if (report.verdict === 'pass') {
      clearReviewEntryIfClean(input.courseDir, page);
    } else {
      upsertReviewEntry(input.courseDir, {
        page,
        reasons: queueReasons(report),
        lastCheckedAt: new Date().toISOString().slice(0, 10),
      });
    }
  }

  const queueOpen = loadReviewQueue(input.courseDir).filter(e => e.status === 'open').length;
  const icon = { pass: '✓', borderline: '⚠', fail: '✗' } as const;
  const worstFirst = [...perPage].sort((a, b) =>
    (a.verdict === b.verdict ? b.findings - a.findings : a.verdict === 'fail' ? -1 : b.verdict === 'fail' ? 1 : a.verdict === 'borderline' ? -1 : 1));

  const lines = [
    `Course accessibility audit — ${files.length} page(s) against WCAG 2.1 AA (checked with WCAG 2.2 rules)`,
    `✓ pass: ${counts.pass}   ⚠ borderline: ${counts.borderline}   ✗ fail: ${counts.fail}`,
    '',
    ...worstFirst.map(p => `${icon[p.verdict]} ${p.page} — ${p.verdict}${p.findings > 0 ? ` (${p.findings} finding(s))` : ''}`),
    '',
    `Review queue: ${queueOpen} open entr${queueOpen === 1 ? 'y' : 'ies'}. Walk it with accessibility_review_queue — the professor is the final arbiter.`,
  ];

  return {
    courseDir: input.courseDir, pages: files.length,
    pass: counts.pass, borderline: counts.borderline, fail: counts.fail,
    queueOpen, text: lines.join('\n'),
  };
}
```

- [ ] **Step 4: Register the tool in `src/index.ts`**

Tool definition:

```ts
    {
      name: 'audit_course_accessibility',
      description:
        'Run the full WCAG 2.2 engine stack (in-house + axe-core) across every generated page of a course project, report per-page verdicts against the required level, and refresh the borderline review queue. The regular between-semesters check.',
      inputSchema: {
        type: 'object' as const,
        required: ['courseDir'],
        properties: {
          courseDir: { type: 'string', description: 'Course project folder.' },
          outputDir: { type: 'string', description: 'Generated-HTML folder. Defaults to <courseDir>/output.' },
        },
      },
    },
```

Switch case + import, same pattern as Task 6.

- [ ] **Step 5: Run the suite and commit**

Run (in `packages/command-and-control`): `npx vitest run` then `npx tsc --noEmit` and `npm run build`
Expected: PASS.

```bash
git add packages/command-and-control/src/tools/workflows/audit_course_accessibility.ts packages/command-and-control/src/index.ts packages/command-and-control/tests/workflows/audit_course_accessibility.test.ts
git commit -m "feat(cc): audit_course_accessibility tool — full-course WCAG audit + queue refresh"
```

---

### Task 8: Documentation

**Files:**
- Modify: `docs/accessibility.md`
- Modify: `packages/canvas-design-studio/CLAUDE.md` (the "## Accessibility checking" section from Phase 1)
- Modify: `packages/command-and-control/CLAUDE.md` (tool list under "Current Integration State")
- Modify: `AGENTS.md` (replace the Phase 1 handoff note)

- [ ] **Step 1: `docs/accessibility.md`** — add a section after the Phase 1 "Engine architecture" section:

```markdown
## The publishing gate (Phase 2, 2026-07)

Accessibility now gates both publish paths — with the professor as final arbiter.
Every gate has an acknowledgment path; every acknowledgment is recorded.

**Two tiers (evaluated against the required level, default WCAG 2.1 AA):**

| Verdict | What it takes to publish anyway |
| --- | --- |
| `pass` | Nothing — publishes normally. |
| `borderline` (only moderate/minor findings, or contrast within 85% of the threshold) | `acknowledgeAccessibility: true` after reviewing the findings. |
| `fail` (any serious/critical finding) | An array naming **every** clear-failure criterion, e.g. `acknowledgeAccessibility: ["1.4.3", "1.3.1"]`. `true` is rejected; missing or extra criteria are rejected. |

Single pages: `publish_to_canvas` (blocked calls return `ACCESSIBILITY_ACK_REQUIRED` with the
required criteria). Whole courses: `publish_course` takes `a11yAcknowledgments: { "<file>": true | ["<sc>", …] }`
per file; FERPA and Canvas-HTML validation blocks remain absolute and cannot be acknowledged away.

**The paper trail** lives in the course project under `.a11y/`:
- `acknowledgments.json` — append-only record of every acknowledged publish (when, page, tier, criteria, level).
- `review-queue.json` — the "near the edge" worklist of pages a human should verify with real eyes.

**Two new Command & Control tools:**
- `accessibility_review_queue` — list the queue worst-margin first (live Canvas URLs, criteria, margins) or mark a page `reviewed-by-human` with a note.
- `audit_course_accessibility` — run the full engine stack over every generated page, get one course-level summary, and refresh the queue. The regular between-semesters check.

The manual generate-and-paste workflow remains ungated. Institution policy anchoring
(configured required level, re-verification cadence), the WCAG 3 advisory toggle, and the
WAVE API deep-check adapter are Phase 3 (see the design spec).
```

- [ ] **Step 2: `packages/canvas-design-studio/CLAUDE.md`** — in the Accessibility checking section, add:

```markdown
Publishing gates on the conformance verdict (Phase 2): `publish_to_canvas` blocks with
`ACCESSIBILITY_ACK_REQUIRED` until the professor acknowledges — `acknowledgeAccessibility: true`
for borderline, a named-SC array for clear failures. Acknowledgments append to
`<courseDir>/.a11y/acknowledgments.json` (see `src/tools/a11y/records.ts`, which also owns the
borderline review queue store). FERPA and RCE validation gates are unchanged and run first.
```

- [ ] **Step 3: `packages/command-and-control/CLAUDE.md`** — add to the implemented-tools list:

```markdown
- `accessibility_review_queue` MCP tool — the per-course "near the edge" a11y worklist (`<courseDir>/.a11y/review-queue.json`, store owned by CDS `tools/a11y/records.ts`). `action:"list"` (default) prints open entries worst-margin first with Canvas URLs; `action:"resolve"` marks a page reviewed-by-human with an optional note. The professor is the final arbiter.
- `audit_course_accessibility` MCP tool — full WCAG 2.2 engine stack over every generated page under `<courseDir>/output`, per-page verdicts vs the required level (default WCAG 2.1 AA), refreshes the review queue. `publish_course` gates per file on a11y warnings: clear failures need `a11yAcknowledgments: { "<file>": ["<sc>", …] }`, borderline needs `{ "<file>": true }`; FERPA/validation blocks stay absolute.
```

- [ ] **Step 4: `AGENTS.md`** — replace the WCAG 2.2 Phase 1 handoff note: Phase 2 shipped (gate + acknowledgments + review queue + 2 tools); Phase 3 (policy anchor, WCAG 3 toggle, WAVE adapter) is specced but unbuilt; point at the spec and this plan.

- [ ] **Step 5: Verify and commit**

Run: grep the diff for `boisestate|BSU|Boise` (must be zero matches); then in both packages `npx vitest run` one final time.

```bash
git add docs/accessibility.md packages/canvas-design-studio/CLAUDE.md packages/command-and-control/CLAUDE.md AGENTS.md
git commit -m "docs: WCAG 2.2 Phase 2 — publishing gate, acknowledgments, review queue"
```

---

## Verification (whole branch)

1. `packages/shared-types`: `npx vitest run` + `npm run build`
2. `packages/canvas-design-studio`: `npx vitest run` + `npx tsc --noEmit` + `npm run build`
3. `packages/command-and-control`: `npx vitest run` + `npx tsc --noEmit` + `npm run build`
4. Repo root: `git grep -iE 'boisestate|\bBSU\b|Boise'` over the branch diff — zero matches
5. Spec §9 gate matrix is covered: both paths × {pass, borderline+true, borderline without ack, fail+named array, fail with incomplete array, fail with `true` only} — see Tasks 3 and 5 test lists
