# Roster & Identity Manager Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `module-roster` plug-in: ingest a PeopleSoft CSV, match students to their Canvas accounts to discover `canvas_id`, assign a stable lifetime pseudonym per student, AI-normalize majors, and emit the PII-free `canvas_id,pseudonym,major` roster the Group Builder consumes — via a propose→commit toolflow backed by a minimal local identity vault.

**Architecture:** A standalone npm workspace package following the exact plug-in pattern of `module-group-builder` (default-exported `CanvasToolchainModule`, registered in C&C `KNOWN_MODULES`, enabled via `modules.json`, loaded fail-soft). A module-local Canvas client (injectable `fetchImpl`) lists course users with match fields; a module-local LLM loader (injectable `LlmClient`) does batched major normalization. All persistent state lives under `~/.command-and-control/roster-vault/`, written `0600`. `propose_*` is read-only and idempotent; only `commit_roster` writes.

**Tech Stack:** TypeScript (ESM, NodeNext), Node ≥20, vitest 3, `@canvas-toolchain/module-contract`, `@canvas-toolchain/shared-llm`, `@modelcontextprotocol/sdk`. No new third-party runtime deps.

---

## Notes & deviations from the spec

- **CSV-only ingest for v1.** The spec said "CSV/Excel." This plan implements **CSV** (the professor exports Excel→CSV). Rationale: avoid a heavy/native spreadsheet dependency. The column-mapping step makes CSV robust to PeopleSoft's column variation. Excel support is a clean future add.
- Everything else matches the approved spec `packages/command-and-control/docs/superpowers/specs/2026-06-13-roster-identity-manager-design.md`.

## File structure (created by this plan)

```
packages/module-roster/
  package.json                         # Task 1
  tsconfig.json                        # Task 1
  src/
    paths.ts                           # Task 1  — CC_HOME + roster-vault dir resolution
    types.ts                           # Task 1  — all shared interfaces
    vault/store.ts                     # Task 2  — vault.json load/save (0600), lookup, collision
    peoplesoft/column-map.ts           # Task 3  — remembered column mapping load/save
    peoplesoft/parse.ts                # Task 3  — CSV -> PeopleSoftRow[] using a mapping
    canvas/client.ts                   # Task 4  — module-local Canvas client (course users)
    match/resolver.ts                  # Task 5  — match priority resolver
    pseudonym/assign.ts                # Task 6  — pseudonym assignment (new/returning)
    major/llm.ts                       # Task 7  — module-local Anthropic config loader
    major/aliases.ts                   # Task 7  — major-aliases.json load/save
    major/normalize.ts                 # Task 8  — batched AI normalization + passthrough
    roster/output.ts                   # Task 9  — de-id roster CSV writer
    propose.ts                         # Task 10 — proposeRoster orchestrator (read-only)
    commit.ts                          # Task 11 — commitRoster orchestrator (writer)
    resolve.ts                         # Task 12 — resolveIdentity (live Canvas lookup)
    tools.ts                           # Task 13 — 3 MCP tools
    index.ts                           # Task 13 — module default export
  tests/
    vault-store.test.ts                # Task 2
    column-map.test.ts                 # Task 3
    peoplesoft-parse.test.ts           # Task 3
    canvas-client.test.ts              # Task 4
    match-resolver.test.ts             # Task 5
    pseudonym-assign.test.ts           # Task 6
    major-aliases.test.ts              # Task 7
    major-normalize.test.ts            # Task 8
    roster-output.test.ts              # Task 9
    propose.test.ts                    # Task 10
    commit.test.ts                     # Task 11
    resolve.test.ts                    # Task 12
    module.test.ts                     # Task 13
```

Modified outside the package:
- `packages/command-and-control/src/modules/registry.ts` — register `roster` (Task 14)
- `packages/command-and-control/package.json` — add dependency (Task 14)
- `package.json` (root) — add `module-roster` to the build script (Task 14)

All `git` commands assume cwd `D:/Dev/canvas-toolchain`. Run tests for one package with:
`npm run test --workspace=packages/module-roster`

---

## Phase 1 — Scaffold & core types

### Task 1: Package scaffold, paths, and shared types

**Files:**
- Create: `packages/module-roster/package.json`
- Create: `packages/module-roster/tsconfig.json`
- Create: `packages/module-roster/src/paths.ts`
- Create: `packages/module-roster/src/types.ts`

- [ ] **Step 1: Create `package.json`** (mirrors `module-group-builder`, adds `shared-llm`)

```json
{
  "name": "@canvas-toolchain/module-roster",
  "license": "MIT",
  "version": "1.0.0",
  "description": "Roster & Identity Manager module for canvas-toolchain",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run"
  },
  "dependencies": {
    "@canvas-toolchain/module-contract": "*",
    "@canvas-toolchain/shared-llm": "*",
    "@modelcontextprotocol/sdk": "^1.10.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0",
    "vitest": "^3.2.6"
  },
  "engines": { "node": ">=20" }
}
```

- [ ] **Step 2: Create `tsconfig.json`** (identical to other modules)

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "./dist", "rootDir": "./src" },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: Install so the workspace symlinks resolve**

Run: `npm install`
Expected: completes; `node_modules/@canvas-toolchain/module-roster` symlink exists.

- [ ] **Step 4: Create `src/paths.ts`**

```ts
import { homedir } from 'node:os';
import { join } from 'node:path';

/** Resolve the C&C home dir, honoring CC_HOME (tests point this at a temp dir). */
export function ccHome(): string {
  return process.env.CC_HOME ?? join(homedir(), '.command-and-control');
}

/** Directory holding all roster-manager state (vault + remembered mappings). */
export function rosterVaultDir(): string {
  return join(ccHome(), 'roster-vault');
}

export function vaultPath(): string {
  return join(rosterVaultDir(), 'vault.json');
}

export function columnMapPath(): string {
  return join(rosterVaultDir(), 'column-map.json');
}

export function majorAliasesPath(): string {
  return join(rosterVaultDir(), 'major-aliases.json');
}
```

- [ ] **Step 5: Create `src/types.ts`** (the single source of shared types — every later task imports from here)

```ts
/** A student row parsed from a PeopleSoft CSV export, after column mapping. */
export interface PeopleSoftRow {
  studentNumber: string;
  email: string;
  /** Campus username / NetID — Canvas login_id. */
  userId: string;
  name: string;
  /** Raw primary major string as it appears in PeopleSoft. */
  rawMajor: string;
  /** Raw secondary major, if the export carried one. */
  secondMajor?: string;
}

/** Which PeopleSoft column maps to which logical field. Values are header names. */
export interface ColumnMapping {
  studentNumber: string;
  email: string;
  userId: string;
  name: string;
  major: string;
  /** Optional second-major column header. */
  secondMajor?: string;
}

/** A Canvas student from the course users endpoint, fields normalized. */
export interface CanvasUser {
  /** Canvas internal user id, stringified. */
  canvasId: string;
  name: string;
  loginId?: string;
  sisUserId?: string;
  email?: string;
}

/** One persistent identity-vault record. The ONLY place identity links live. */
export interface VaultRecord {
  studentNumber: string;
  canvasId: string;
  pseudonym: string;
  firstSeenTerm: string;
}

/** How a PeopleSoft row matched a Canvas user. */
export type MatchKey = 'student_number' | 'email' | 'userId' | 'name';

export interface MatchedStudent {
  ps: PeopleSoftRow;
  canvas: CanvasUser;
  matchedOn: MatchKey;
}

export interface AmbiguousStudent {
  ps: PeopleSoftRow;
  candidates: CanvasUser[];
}

export interface MatchResult {
  matched: MatchedStudent[];
  ambiguous: AmbiguousStudent[];
  /** In PeopleSoft, no Canvas hit on any key. */
  unmatchedPeopleSoft: PeopleSoftRow[];
  /** In Canvas, never referenced by any PeopleSoft row. */
  unmatchedCanvas: CanvasUser[];
}

/** A vault/SIS collision: same student_number already mapped to a different canvas id. */
export interface VaultCollision {
  studentNumber: string;
  vaultCanvasId: string;
  incomingCanvasId: string;
}

/** One row of the proposed roster (matched + pseudonymed + normalized). */
export interface ProposalRow {
  studentNumber: string;
  canvasId: string;
  pseudonym: string;
  returning: boolean;
  matchedOn: MatchKey;
  rawMajor: string;
  canonicalMajor: string;
  secondMajor?: string;
}

/** The full read-only proposal returned by proposeRoster. */
export interface ProposalReport {
  term: string;
  courseId: string;
  rows: ProposalRow[];
  ambiguous: AmbiguousStudent[];
  unmatchedPeopleSoft: PeopleSoftRow[];
  unmatchedCanvas: CanvasUser[];
  /** raw major -> canonical major, as applied. */
  majorMap: Record<string, string>;
  collisions: VaultCollision[];
  /** True when an LLM produced the canonical majors; false on passthrough. */
  llmUsed: boolean;
}
```

- [ ] **Step 6: Build to verify types compile**

Run: `npm run build --workspace=packages/module-roster`
Expected: `tsc` exits 0 (no emit errors; `dist/` appears).

- [ ] **Step 7: Commit**

```bash
git add packages/module-roster/package.json packages/module-roster/tsconfig.json packages/module-roster/src/paths.ts packages/module-roster/src/types.ts package-lock.json
git commit -m "feat(roster): scaffold module-roster package + core types"
```

---

## Phase 2 — Identity vault

### Task 2: Vault store (load/save 0600, lookup, collision detection)

**Files:**
- Create: `packages/module-roster/src/vault/store.ts`
- Test: `packages/module-roster/tests/vault-store.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadVault, saveVault, indexByStudentNumber, detectCollision,
} from '../src/vault/store.js';
import type { VaultRecord } from '../src/types.js';

let home: string;
beforeEach(() => { home = mkdtempSync(join(tmpdir(), 'roster-vault-')); process.env.CC_HOME = home; });
afterEach(() => { delete process.env.CC_HOME; rmSync(home, { recursive: true, force: true }); });

const rec = (n: string, c: string, p: string): VaultRecord =>
  ({ studentNumber: n, canvasId: c, pseudonym: p, firstSeenTerm: 'SU26' });

describe('vault store', () => {
  it('returns [] when no vault file exists', () => {
    expect(loadVault()).toEqual([]);
  });

  it('round-trips records and writes the file 0600', () => {
    const recs = [rec('100', '900', 'SU26-001')];
    const path = saveVault(recs);
    expect(loadVault()).toEqual(recs);
    // 0o777 mask of the mode should be 0o600 (POSIX); skip the assertion on win32.
    if (process.platform !== 'win32') {
      expect(statSync(path).mode & 0o777).toBe(0o600);
    }
  });

  it('indexes records by student number', () => {
    const idx = indexByStudentNumber([rec('100', '900', 'SU26-001'), rec('101', '901', 'SU26-002')]);
    expect(idx.get('100')?.pseudonym).toBe('SU26-001');
    expect(idx.get('999')).toBeUndefined();
  });

  it('detects a collision when the same student number maps to a new canvas id', () => {
    const idx = indexByStudentNumber([rec('100', '900', 'SU26-001')]);
    expect(detectCollision(idx, '100', '900')).toBeNull();      // same id -> ok
    expect(detectCollision(idx, '100', '999')).toEqual({
      studentNumber: '100', vaultCanvasId: '900', incomingCanvasId: '999',
    });
    expect(detectCollision(idx, '200', '999')).toBeNull();      // unknown -> ok
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test --workspace=packages/module-roster -- vault-store`
Expected: FAIL — `Cannot find module '../src/vault/store.js'`.

- [ ] **Step 3: Implement `src/vault/store.ts`**

```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { rosterVaultDir, vaultPath } from '../paths.js';
import type { VaultRecord, VaultCollision } from '../types.js';

/** Load the vault, or [] if it does not exist yet. Throws only on corruption. */
export function loadVault(): VaultRecord[] {
  const path = vaultPath();
  if (!existsSync(path)) return [];
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as { records?: VaultRecord[] };
    return parsed.records ?? [];
  } catch {
    throw new Error('VAULT_CORRUPT: roster-vault/vault.json could not be parsed.');
  }
}

/** Persist the vault, creating the dir and writing the file with 0600 perms. Returns the path. */
export function saveVault(records: VaultRecord[]): string {
  mkdirSync(rosterVaultDir(), { recursive: true });
  const path = vaultPath();
  writeFileSync(path, JSON.stringify({ records }, null, 2), { encoding: 'utf-8', mode: 0o600 });
  return path;
}

export function indexByStudentNumber(records: VaultRecord[]): Map<string, VaultRecord> {
  const idx = new Map<string, VaultRecord>();
  for (const r of records) idx.set(r.studentNumber, r);
  return idx;
}

/** Returns a collision if studentNumber is known but maps to a different canvasId; else null. */
export function detectCollision(
  idx: Map<string, VaultRecord>, studentNumber: string, incomingCanvasId: string,
): VaultCollision | null {
  const existing = idx.get(studentNumber);
  if (!existing) return null;
  if (existing.canvasId === incomingCanvasId) return null;
  return { studentNumber, vaultCanvasId: existing.canvasId, incomingCanvasId };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test --workspace=packages/module-roster -- vault-store`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/module-roster/src/vault/store.ts packages/module-roster/tests/vault-store.test.ts
git commit -m "feat(roster): identity vault store (0600, lookup, collision detection)"
```

---

## Phase 3 — Inputs

### Task 3: PeopleSoft CSV parser + remembered column mapping

**Files:**
- Create: `packages/module-roster/src/peoplesoft/column-map.ts`
- Create: `packages/module-roster/src/peoplesoft/parse.ts`
- Test: `packages/module-roster/tests/column-map.test.ts`
- Test: `packages/module-roster/tests/peoplesoft-parse.test.ts`

- [ ] **Step 1: Write the failing test for the column map**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadColumnMap, saveColumnMap } from '../src/peoplesoft/column-map.js';
import type { ColumnMapping } from '../src/types.js';

let home: string;
beforeEach(() => { home = mkdtempSync(join(tmpdir(), 'roster-cm-')); process.env.CC_HOME = home; });
afterEach(() => { delete process.env.CC_HOME; rmSync(home, { recursive: true, force: true }); });

const map: ColumnMapping = {
  studentNumber: 'Student ID', email: 'Email', userId: 'NetID', name: 'Name', major: 'Plan',
};

describe('column map', () => {
  it('returns null when none saved', () => { expect(loadColumnMap()).toBeNull(); });
  it('round-trips a saved mapping', () => {
    saveColumnMap(map);
    expect(loadColumnMap()).toEqual(map);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test --workspace=packages/module-roster -- column-map`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/peoplesoft/column-map.ts`**

```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { columnMapPath, rosterVaultDir } from '../paths.js';
import type { ColumnMapping } from '../types.js';

/** Load the remembered PeopleSoft column mapping, or null if none saved. */
export function loadColumnMap(): ColumnMapping | null {
  const path = columnMapPath();
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as ColumnMapping;
  } catch {
    return null;
  }
}

/** Persist the column mapping for reuse next term. Returns the path. */
export function saveColumnMap(mapping: ColumnMapping): string {
  mkdirSync(rosterVaultDir(), { recursive: true });
  const path = columnMapPath();
  writeFileSync(path, JSON.stringify(mapping, null, 2), { encoding: 'utf-8', mode: 0o600 });
  return path;
}
```

- [ ] **Step 4: Run the column-map test to verify it passes**

Run: `npm run test --workspace=packages/module-roster -- column-map`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the failing test for the parser**

```ts
import { describe, it, expect } from 'vitest';
import { parseCsv, rowsFromCsv } from '../src/peoplesoft/parse.js';
import type { ColumnMapping } from '../src/types.js';

const map: ColumnMapping = {
  studentNumber: 'Student ID', email: 'Email', userId: 'NetID', name: 'Name',
  major: 'Plan', secondMajor: 'Plan 2',
};

const csv = [
  'Student ID,Email,NetID,Name,Plan,Plan 2',
  '100,a@x.edu,jdoe,"Doe, Jane",Bus Admin: Marketing,',
  '101,b@x.edu,bsmith,"Smith, Bob",Business Analytics,Accounting',
].join('\n');

describe('peoplesoft parse', () => {
  it('parseCsv splits rows and honors quoted commas', () => {
    const { headers, records } = parseCsv(csv);
    expect(headers).toEqual(['Student ID', 'Email', 'NetID', 'Name', 'Plan', 'Plan 2']);
    expect(records[0]['Name']).toBe('Doe, Jane');
    expect(records).toHaveLength(2);
  });

  it('rowsFromCsv maps columns to PeopleSoftRow', () => {
    const rows = rowsFromCsv(csv, map);
    expect(rows[0]).toEqual({
      studentNumber: '100', email: 'a@x.edu', userId: 'jdoe', name: 'Doe, Jane',
      rawMajor: 'Bus Admin: Marketing', secondMajor: undefined,
    });
    expect(rows[1].secondMajor).toBe('Accounting');
  });

  it('throws a clear error when a required mapped column is absent', () => {
    const bad: ColumnMapping = { ...map, studentNumber: 'Missing' };
    expect(() => rowsFromCsv(csv, bad)).toThrow(/Missing/);
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npm run test --workspace=packages/module-roster -- peoplesoft-parse`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement `src/peoplesoft/parse.ts`**

```ts
import { readFileSync } from 'node:fs';
import type { ColumnMapping, PeopleSoftRow } from '../types.js';

export interface ParsedCsv {
  headers: string[];
  records: Array<Record<string, string>>;
}

/** Split one CSV line, honoring double-quoted fields that contain commas. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

/** Parse CSV text into headers + an array of header->value records. */
export function parseCsv(text: string): ParsedCsv {
  const lines = text.replace(/\r\n/g, '\n').split('\n').filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], records: [] };
  const headers = splitCsvLine(lines[0]);
  const records = lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const rec: Record<string, string> = {};
    headers.forEach((h, i) => { rec[h] = cells[i] ?? ''; });
    return rec;
  });
  return { headers, records };
}

/** Read + map a PeopleSoft CSV file path into PeopleSoftRow[]. */
export function parseRosterFile(path: string, mapping: ColumnMapping): PeopleSoftRow[] {
  return rowsFromCsv(readFileSync(path, 'utf-8'), mapping);
}

/** Map parsed CSV records to PeopleSoftRow using the column mapping. */
export function rowsFromCsv(text: string, mapping: ColumnMapping): PeopleSoftRow[] {
  const { headers, records } = parseCsv(text);
  const need = [mapping.studentNumber, mapping.email, mapping.userId, mapping.name, mapping.major];
  for (const col of need) {
    if (!headers.includes(col)) throw new Error(`Column not found in CSV: "${col}".`);
  }
  const hasSecond = mapping.secondMajor !== undefined && headers.includes(mapping.secondMajor);
  return records.map((r) => {
    const second = hasSecond ? r[mapping.secondMajor as string]?.trim() : '';
    return {
      studentNumber: r[mapping.studentNumber].trim(),
      email: r[mapping.email].trim(),
      userId: r[mapping.userId].trim(),
      name: r[mapping.name].trim(),
      rawMajor: r[mapping.major].trim(),
      secondMajor: second ? second : undefined,
    };
  });
}
```

- [ ] **Step 8: Run both parse tests to verify they pass**

Run: `npm run test --workspace=packages/module-roster -- peoplesoft-parse column-map`
Expected: PASS (5 tests total).

- [ ] **Step 9: Commit**

```bash
git add packages/module-roster/src/peoplesoft packages/module-roster/tests/column-map.test.ts packages/module-roster/tests/peoplesoft-parse.test.ts
git commit -m "feat(roster): PeopleSoft CSV parser + remembered column mapping"
```

---

### Task 4: Module-local Canvas client (course users with match fields)

**Files:**
- Create: `packages/module-roster/src/canvas/client.ts`
- Test: `packages/module-roster/tests/canvas-client.test.ts`

- [ ] **Step 1: Write the failing test** (injected `fetchImpl`, no network)

```ts
import { describe, it, expect } from 'vitest';
import { RosterCanvasClient } from '../src/canvas/client.js';

function fakeFetch(body: unknown): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch;
}

describe('RosterCanvasClient', () => {
  it('maps course users to CanvasUser with match fields', async () => {
    const client = new RosterCanvasClient(
      { host: 'x.instructure.com', token: 't' },
      { fetchImpl: fakeFetch([
        { id: 900, name: 'Jane Doe', login_id: 'jdoe', sis_user_id: '100', email: 'a@x.edu' },
        { id: 901, name: 'Bob Smith', login_id: 'bsmith' },
      ]) },
    );
    const users = await client.listCourseStudents(123);
    expect(users[0]).toEqual({
      canvasId: '900', name: 'Jane Doe', loginId: 'jdoe', sisUserId: '100', email: 'a@x.edu',
    });
    expect(users[1]).toEqual({ canvasId: '901', name: 'Bob Smith', loginId: 'bsmith', sisUserId: undefined, email: undefined });
  });

  it('throws a clear error on a non-OK Canvas response', async () => {
    const client = new RosterCanvasClient(
      { host: 'x.instructure.com', token: 't' },
      { fetchImpl: (async () => new Response('nope', { status: 403 })) as unknown as typeof fetch },
    );
    await expect(client.listCourseStudents(123)).rejects.toThrow(/403/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test --workspace=packages/module-roster -- canvas-client`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/canvas/client.ts`** (pattern copied from group-builder's client; adds `loadCanvasCreds`, pagination, and a users query)

```ts
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ccHome } from '../paths.js';
import type { CanvasUser } from '../types.js';

export interface CanvasCreds { host: string; token: string; }
export interface RosterCanvasClientOptions { fetchImpl?: typeof fetch; }

interface RawCanvasUser {
  id: number;
  name: string;
  login_id?: string;
  sis_user_id?: string | null;
  email?: string;
}

/** Read ~/.command-and-control/canvas-config.json. Throws if not configured. */
export function loadCanvasCreds(): CanvasCreds {
  const path = join(ccHome(), 'canvas-config.json');
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

export class RosterCanvasClient {
  private readonly fetchImpl: typeof fetch;
  constructor(private readonly creds: CanvasCreds, opts: RosterCanvasClientOptions = {}) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }
  private base(): string { return `https://${this.creds.host}/api/v1`; }
  private headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.creds.token}`, Accept: 'application/json' };
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

  /** List active students in a course with login_id / sis_user_id / email for matching. */
  async listCourseStudents(courseId: number): Promise<CanvasUser[]> {
    const url = `${this.base()}/courses/${courseId}/users?` +
      `enrollment_type%5B%5D=student&include%5B%5D=email&per_page=100`;
    const raw = await this.getAll<RawCanvasUser>(url);
    return raw.map((u) => ({
      canvasId: String(u.id),
      name: u.name,
      loginId: u.login_id ?? undefined,
      sisUserId: u.sis_user_id == null ? undefined : String(u.sis_user_id),
      email: u.email ?? undefined,
    }));
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test --workspace=packages/module-roster -- canvas-client`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/module-roster/src/canvas packages/module-roster/tests/canvas-client.test.ts
git commit -m "feat(roster): module-local Canvas client listing course students with match fields"
```

---

## Phase 4 — Matching

### Task 5: Match-priority resolver

**Files:**
- Create: `packages/module-roster/src/match/resolver.ts`
- Test: `packages/module-roster/tests/match-resolver.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { matchStudents, normalizeName } from '../src/match/resolver.js';
import type { CanvasUser, PeopleSoftRow } from '../src/types.js';

const ps = (o: Partial<PeopleSoftRow>): PeopleSoftRow =>
  ({ studentNumber: '', email: '', userId: '', name: '', rawMajor: '', ...o });
const cu = (o: Partial<CanvasUser>): CanvasUser =>
  ({ canvasId: '', name: '', ...o });

describe('match resolver', () => {
  it('normalizeName lowercases, trims, and reorders "Last, First"', () => {
    expect(normalizeName('Doe, Jane')).toBe('jane doe');
    expect(normalizeName('  Jane   Doe ')).toBe('jane doe');
  });

  it('matches on student_number first', () => {
    const r = matchStudents(
      [ps({ studentNumber: '100', email: 'a@x.edu', name: 'Jane Doe' })],
      [cu({ canvasId: '900', sisUserId: '100', email: 'z@x.edu', name: 'Someone Else' })],
    );
    expect(r.matched).toHaveLength(1);
    expect(r.matched[0].matchedOn).toBe('student_number');
    expect(r.matched[0].canvas.canvasId).toBe('900');
  });

  it('falls back email -> userId -> name in order', () => {
    const r = matchStudents(
      [
        ps({ studentNumber: 'x', email: 'a@x.edu', userId: 'u1', name: 'A B' }),
        ps({ studentNumber: 'y', email: 'no@x.edu', userId: 'u2', name: 'C D' }),
        ps({ studentNumber: 'z', email: 'no2@x.edu', userId: 'no', name: 'Eve Fox' }),
      ],
      [
        cu({ canvasId: '900', email: 'a@x.edu' }),
        cu({ canvasId: '901', loginId: 'u2' }),
        cu({ canvasId: '902', name: 'Fox, Eve' }),
      ],
    );
    const by = (sn: string) => r.matched.find((m) => m.ps.studentNumber === sn)!;
    expect(by('x').matchedOn).toBe('email');
    expect(by('y').matchedOn).toBe('userId');
    expect(by('z').matchedOn).toBe('name');
  });

  it('reports ambiguous when two Canvas users share a normalized name', () => {
    const r = matchStudents(
      [ps({ studentNumber: 'q', name: 'Jane Doe' })],
      [cu({ canvasId: '900', name: 'Jane Doe' }), cu({ canvasId: '901', name: 'Doe, Jane' })],
    );
    expect(r.matched).toHaveLength(0);
    expect(r.ambiguous).toHaveLength(1);
    expect(r.ambiguous[0].candidates.map((c) => c.canvasId).sort()).toEqual(['900', '901']);
  });

  it('lists unmatched on both sides', () => {
    const r = matchStudents(
      [ps({ studentNumber: 'only-ps', name: 'No One' })],
      [cu({ canvasId: '900', name: 'Other Person', sisUserId: 'only-canvas' })],
    );
    expect(r.unmatchedPeopleSoft.map((p) => p.studentNumber)).toEqual(['only-ps']);
    expect(r.unmatchedCanvas.map((c) => c.canvasId)).toEqual(['900']);
  });

  it('does not reuse one Canvas user for two PeopleSoft rows', () => {
    const r = matchStudents(
      [ps({ studentNumber: '100', name: 'Jane Doe' }), ps({ studentNumber: '101', name: 'Jane Doe' })],
      [cu({ canvasId: '900', sisUserId: '100', name: 'Jane Doe' })],
    );
    expect(r.matched).toHaveLength(1);             // 100 wins on student_number
    expect(r.matched[0].ps.studentNumber).toBe('100');
    expect(r.unmatchedPeopleSoft.map((p) => p.studentNumber)).toEqual(['101']);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test --workspace=packages/module-roster -- match-resolver`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/match/resolver.ts`**

```ts
import type {
  CanvasUser, MatchKey, MatchResult, MatchedStudent, PeopleSoftRow,
} from '../types.js';

/** Normalize a name for comparison: lowercase, collapse whitespace, reorder "Last, First". */
export function normalizeName(name: string): string {
  let s = name.trim();
  if (s.includes(',')) {
    const [last, first] = s.split(',', 2);
    s = `${first.trim()} ${last.trim()}`;
  }
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

const lc = (s: string | undefined): string => (s ?? '').trim().toLowerCase();

/**
 * Match each PeopleSoft row to at most one Canvas user, trying keys in priority order:
 * student_number -> email -> userId -> name. A Canvas user is consumed by the first
 * PeopleSoft row that claims it. A name that maps to >1 remaining Canvas user is ambiguous.
 */
export function matchStudents(ps: PeopleSoftRow[], canvas: CanvasUser[]): MatchResult {
  const used = new Set<string>();                       // canvasIds already claimed
  const matched: MatchedStudent[] = [];
  const ambiguous: MatchResult['ambiguous'] = [];
  const unmatchedPeopleSoft: PeopleSoftRow[] = [];

  // Build lookup indexes over Canvas users.
  const bySis = new Map<string, CanvasUser>();
  const byEmail = new Map<string, CanvasUser>();
  const byLogin = new Map<string, CanvasUser>();
  const byName = new Map<string, CanvasUser[]>();
  for (const u of canvas) {
    if (u.sisUserId) bySis.set(lc(u.sisUserId), u);
    if (u.email) byEmail.set(lc(u.email), u);
    if (u.loginId) byLogin.set(lc(u.loginId), u);
    const n = normalizeName(u.name);
    if (n) byName.set(n, [...(byName.get(n) ?? []), u]);
  }

  const claim = (row: PeopleSoftRow, u: CanvasUser, key: MatchKey): boolean => {
    if (used.has(u.canvasId)) return false;
    used.add(u.canvasId);
    matched.push({ ps: row, canvas: u, matchedOn: key });
    return true;
  };

  for (const row of ps) {
    const sis = bySis.get(lc(row.studentNumber));
    if (row.studentNumber && sis && claim(row, sis, 'student_number')) continue;

    const em = byEmail.get(lc(row.email));
    if (row.email && em && claim(row, em, 'email')) continue;

    const lg = byLogin.get(lc(row.userId));
    if (row.userId && lg && claim(row, lg, 'userId')) continue;

    const nameKey = normalizeName(row.name);
    const candidates = (byName.get(nameKey) ?? []).filter((u) => !used.has(u.canvasId));
    if (candidates.length === 1 && claim(row, candidates[0], 'name')) continue;
    if (candidates.length > 1) { ambiguous.push({ ps: row, candidates }); continue; }

    unmatchedPeopleSoft.push(row);
  }

  const unmatchedCanvas = canvas.filter((u) => !used.has(u.canvasId));
  return { matched, ambiguous, unmatchedPeopleSoft, unmatchedCanvas };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test --workspace=packages/module-roster -- match-resolver`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/module-roster/src/match packages/module-roster/tests/match-resolver.test.ts
git commit -m "feat(roster): match-priority resolver (student_number -> email -> userId -> name)"
```

---

## Phase 5 — Identity assignment

### Task 6: Pseudonym assignment (new vs. returning, per-term numbering)

**Files:**
- Create: `packages/module-roster/src/pseudonym/assign.ts`
- Test: `packages/module-roster/tests/pseudonym-assign.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { nextSequence, assignPseudonyms } from '../src/pseudonym/assign.js';
import type { MatchedStudent, VaultRecord } from '../src/types.js';

const m = (sn: string, cid: string, name = 'X'): MatchedStudent =>
  ({ ps: { studentNumber: sn, email: '', userId: '', name, rawMajor: '' }, canvas: { canvasId: cid, name }, matchedOn: 'student_number' });
const v = (sn: string, cid: string, p: string, term: string): VaultRecord =>
  ({ studentNumber: sn, canvasId: cid, pseudonym: p, firstSeenTerm: term });

describe('pseudonym assignment', () => {
  it('nextSequence is 1 past the highest existing number for the given prefix', () => {
    expect(nextSequence([], 'FA26')).toBe(1);
    expect(nextSequence([v('1', '9', 'SU26-007', 'SU26'), v('2', '8', 'FA26-003', 'FA26')], 'FA26')).toBe(4);
    expect(nextSequence([v('1', '9', 'SU26-007', 'SU26')], 'FA26')).toBe(1); // different prefix
  });

  it('returning students keep their pseudonym; new students number within the term', () => {
    const vault = [v('100', '900', 'SU26-001', 'SU26')];
    const { assignments, newRecords } = assignPseudonyms(
      [m('100', '900'), m('200', '901'), m('201', '902')], vault, 'FA26',
    );
    const a = (sn: string) => assignments.find((x) => x.studentNumber === sn)!;
    expect(a('100')).toMatchObject({ pseudonym: 'SU26-001', returning: true });
    expect(a('200')).toMatchObject({ pseudonym: 'FA26-001', returning: false });
    expect(a('201')).toMatchObject({ pseudonym: 'FA26-002', returning: false });
    expect(newRecords.map((r) => r.studentNumber).sort()).toEqual(['200', '201']);
    expect(newRecords[0].firstSeenTerm).toBe('FA26');
  });

  it('pads the sequence to three digits', () => {
    const { assignments } = assignPseudonyms([m('1', '9')], [], 'SP27');
    expect(assignments[0].pseudonym).toBe('SP27-001');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test --workspace=packages/module-roster -- pseudonym-assign`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/pseudonym/assign.ts`**

```ts
import type { MatchedStudent, VaultRecord } from '../types.js';

/** One pseudonym decision for a matched student. */
export interface PseudonymAssignment {
  studentNumber: string;
  canvasId: string;
  pseudonym: string;
  returning: boolean;
}

export interface AssignmentResult {
  assignments: PseudonymAssignment[];
  /** Vault records for genuinely-new students (to be inserted on commit). */
  newRecords: VaultRecord[];
}

/** The next sequence number for a term prefix = 1 + the max existing number with that prefix. */
export function nextSequence(vault: VaultRecord[], term: string): number {
  let max = 0;
  const re = new RegExp(`^${term}-(\\d+)$`);
  for (const r of vault) {
    const m = r.pseudonym.match(re);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}

function format(term: string, seq: number): string {
  return `${term}-${String(seq).padStart(3, '0')}`;
}

/**
 * Assign pseudonyms. Returning students (studentNumber already in the vault) keep their
 * existing pseudonym and are flagged returning. New students get the next <term>-NNN in
 * sequence. Pure/deterministic — performs no I/O.
 */
export function assignPseudonyms(
  matched: MatchedStudent[], vault: VaultRecord[], term: string,
): AssignmentResult {
  const byStudent = new Map(vault.map((r) => [r.studentNumber, r]));
  let seq = nextSequence(vault, term);
  const assignments: PseudonymAssignment[] = [];
  const newRecords: VaultRecord[] = [];

  for (const ms of matched) {
    const sn = ms.ps.studentNumber;
    const existing = byStudent.get(sn);
    if (existing) {
      assignments.push({ studentNumber: sn, canvasId: ms.canvas.canvasId, pseudonym: existing.pseudonym, returning: true });
      continue;
    }
    const pseudonym = format(term, seq++);
    assignments.push({ studentNumber: sn, canvasId: ms.canvas.canvasId, pseudonym, returning: false });
    newRecords.push({ studentNumber: sn, canvasId: ms.canvas.canvasId, pseudonym, firstSeenTerm: term });
  }

  return { assignments, newRecords };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test --workspace=packages/module-roster -- pseudonym-assign`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/module-roster/src/pseudonym packages/module-roster/tests/pseudonym-assign.test.ts
git commit -m "feat(roster): pseudonym assignment (returning reuse, per-term numbering)"
```

---

## Phase 6 — Major normalization

### Task 7: Major-alias store + module-local LLM loader

**Files:**
- Create: `packages/module-roster/src/major/aliases.ts`
- Create: `packages/module-roster/src/major/llm.ts`
- Test: `packages/module-roster/tests/major-aliases.test.ts`

- [ ] **Step 1: Write the failing test for the alias store**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadMajorAliases, saveMajorAliases } from '../src/major/aliases.js';

let home: string;
beforeEach(() => { home = mkdtempSync(join(tmpdir(), 'roster-alias-')); process.env.CC_HOME = home; });
afterEach(() => { delete process.env.CC_HOME; rmSync(home, { recursive: true, force: true }); });

describe('major aliases', () => {
  it('returns {} when none saved', () => { expect(loadMajorAliases()).toEqual({}); });
  it('round-trips a saved alias map', () => {
    saveMajorAliases({ 'Bus Admin: Marketing': 'Marketing' });
    expect(loadMajorAliases()).toEqual({ 'Bus Admin: Marketing': 'Marketing' });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test --workspace=packages/module-roster -- major-aliases`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/major/aliases.ts`**

```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { majorAliasesPath, rosterVaultDir } from '../paths.js';

/** Load remembered raw->canonical major overrides, or {} if none saved. */
export function loadMajorAliases(): Record<string, string> {
  const path = majorAliasesPath();
  if (!existsSync(path)) return {};
  try { return JSON.parse(readFileSync(path, 'utf-8')) as Record<string, string>; }
  catch { return {}; }
}

/** Persist raw->canonical major overrides. Returns the path. */
export function saveMajorAliases(aliases: Record<string, string>): string {
  mkdirSync(rosterVaultDir(), { recursive: true });
  const path = majorAliasesPath();
  writeFileSync(path, JSON.stringify(aliases, null, 2), { encoding: 'utf-8', mode: 0o600 });
  return path;
}
```

- [ ] **Step 4: Implement `src/major/llm.ts`** (mirrors `module-oral-assessment/src/llm.ts`; `tryMakeAnthropicLlm` returns null when unconfigured so normalization can degrade)

```ts
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AnthropicLlmClient, type LlmClient } from '@canvas-toolchain/shared-llm';
import { ccHome } from '../paths.js';

export interface ModuleAnthropicConfig { apiKey: string; model: string; }

const DEFAULT_MODEL = 'claude-haiku-4-5';

/** Read anthropic-config.json, or null if not configured / unreadable. */
export function loadAnthropicConfig(): ModuleAnthropicConfig | null {
  const path = join(ccHome(), 'anthropic-config.json');
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as Partial<ModuleAnthropicConfig>;
    if (!parsed.apiKey) return null;
    return { apiKey: parsed.apiKey, model: parsed.model ?? DEFAULT_MODEL };
  } catch {
    return null;
  }
}

/** Construct the production LLM client, or null when unconfigured (normalization degrades). */
export function tryMakeAnthropicLlm(): LlmClient | null {
  const cfg = loadAnthropicConfig();
  return cfg ? new AnthropicLlmClient({ apiKey: cfg.apiKey, model: cfg.model }) : null;
}
```

- [ ] **Step 5: Run the alias test to verify it passes**

Run: `npm run test --workspace=packages/module-roster -- major-aliases`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/module-roster/src/major/aliases.ts packages/module-roster/src/major/llm.ts packages/module-roster/tests/major-aliases.test.ts
git commit -m "feat(roster): major-alias store + module-local LLM loader (nullable)"
```

---

### Task 8: Batched major normalization (LLM + alias overrides + passthrough)

**Files:**
- Create: `packages/module-roster/src/major/normalize.ts`
- Test: `packages/module-roster/tests/major-normalize.test.ts`

- [ ] **Step 1: Write the failing test** (inject a fake `LlmClient`; cover passthrough)

```ts
import { describe, it, expect } from 'vitest';
import { normalizeMajors } from '../src/major/normalize.js';
import type { LlmClient } from '@canvas-toolchain/shared-llm';

const fakeLlm = (map: Record<string, string>): LlmClient => ({
  complete: async () => ({ text: JSON.stringify(map) }),
});

describe('normalizeMajors', () => {
  it('returns identity passthrough + llmUsed=false when llm is null', async () => {
    const r = await normalizeMajors(['Bus Admin: Marketing', 'Accounting'], null, {});
    expect(r.llmUsed).toBe(false);
    expect(r.map).toEqual({ 'Bus Admin: Marketing': 'Bus Admin: Marketing', 'Accounting': 'Accounting' });
  });

  it('applies alias overrides without calling the llm for those', async () => {
    const r = await normalizeMajors(['Bus Admin: Marketing'], fakeLlm({ 'Bus Admin: Marketing': 'WRONG' }),
      { 'Bus Admin: Marketing': 'Marketing' });
    expect(r.map['Bus Admin: Marketing']).toBe('Marketing'); // alias wins over llm
  });

  it('uses the llm for un-aliased distinct majors and reports llmUsed=true', async () => {
    const r = await normalizeMajors(['Bus Admin: Business Analytics Emphasis'],
      fakeLlm({ 'Bus Admin: Business Analytics Emphasis': 'Business Analytics' }), {});
    expect(r.map['Bus Admin: Business Analytics Emphasis']).toBe('Business Analytics');
    expect(r.llmUsed).toBe(true);
  });

  it('dedupes distinct majors and ignores empty strings', async () => {
    let calls = 0;
    const counting: LlmClient = { complete: async (_s, u) => { calls++; return { text: JSON.stringify({ Marketing: 'Marketing' }) }; } };
    const r = await normalizeMajors(['Marketing', 'Marketing', ''], counting, {});
    expect(calls).toBe(1);
    expect(r.map['']).toBeUndefined();
  });

  it('falls back to raw when the llm response is unparseable', async () => {
    const bad: LlmClient = { complete: async () => ({ text: 'not json' }) };
    const r = await normalizeMajors(['Marketing'], bad, {});
    expect(r.map['Marketing']).toBe('Marketing');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test --workspace=packages/module-roster -- major-normalize`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/major/normalize.ts`**

```ts
import type { LlmClient } from '@canvas-toolchain/shared-llm';

export interface NormalizeResult {
  /** raw -> canonical, covering every non-empty distinct input. */
  map: Record<string, string>;
  llmUsed: boolean;
}

const SYSTEM =
  'You normalize university major/plan strings to a single clean canonical major name. ' +
  'Return ONLY a JSON object mapping each input string to its canonical major. ' +
  'Strip emphasis/option/degree wrappers (e.g. "Bus Admin: Business Analytics Emphasis" -> ' +
  '"Business Analytics"). Do not invent majors; keep the core field of study.';

function buildUserPrompt(raws: string[]): string {
  return 'Normalize these majors. Respond with a JSON object only.\n' + JSON.stringify(raws);
}

/**
 * Normalize a list of raw major strings to canonical names.
 * - Empty strings are skipped.
 * - Alias overrides win over the LLM and are never sent to it.
 * - When `llm` is null, every remaining raw maps to itself (passthrough), llmUsed=false.
 * - One batched LLM call covers all un-aliased distinct majors.
 */
export async function normalizeMajors(
  raws: string[], llm: LlmClient | null, aliases: Record<string, string>,
): Promise<NormalizeResult> {
  const distinct = [...new Set(raws.map((r) => r.trim()).filter((r) => r.length > 0))];
  const map: Record<string, string> = {};

  const toAsk: string[] = [];
  for (const raw of distinct) {
    if (aliases[raw]) map[raw] = aliases[raw];
    else toAsk.push(raw);
  }

  if (toAsk.length === 0) return { map, llmUsed: false };
  if (!llm) {
    for (const raw of toAsk) map[raw] = raw;
    return { map, llmUsed: false };
  }

  let parsed: Record<string, string> = {};
  try {
    const res = await llm.complete(SYSTEM, buildUserPrompt(toAsk), { maxTokens: 1024 });
    parsed = JSON.parse(res.text) as Record<string, string>;
  } catch {
    parsed = {};
  }
  for (const raw of toAsk) {
    const canon = parsed[raw];
    map[raw] = typeof canon === 'string' && canon.trim() ? canon.trim() : raw;
  }
  return { map, llmUsed: true };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test --workspace=packages/module-roster -- major-normalize`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/module-roster/src/major/normalize.ts packages/module-roster/tests/major-normalize.test.ts
git commit -m "feat(roster): batched AI major normalization with alias + no-LLM passthrough"
```

---

## Phase 7 — Output writer

### Task 9: De-identified roster CSV writer

**Files:**
- Create: `packages/module-roster/src/roster/output.ts`
- Test: `packages/module-roster/tests/roster-output.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { renderRosterCsv } from '../src/roster/output.js';
import type { ProposalRow } from '../src/types.js';

const row = (o: Partial<ProposalRow>): ProposalRow => ({
  studentNumber: '', canvasId: '', pseudonym: '', returning: false,
  matchedOn: 'student_number', rawMajor: '', canonicalMajor: '', ...o,
});

describe('renderRosterCsv', () => {
  it('emits the canvas_id,pseudonym,major header + one line per row', () => {
    const csv = renderRosterCsv([
      row({ canvasId: '900', pseudonym: 'SU26-001', canonicalMajor: 'Marketing' }),
      row({ canvasId: '901', pseudonym: 'FA26-001', canonicalMajor: 'Business Analytics' }),
    ]);
    expect(csv).toBe(
      'canvas_id,pseudonym,major\n900,SU26-001,Marketing\n901,FA26-001,Business Analytics\n',
    );
  });

  it('quotes a major containing a comma', () => {
    const csv = renderRosterCsv([row({ canvasId: '900', pseudonym: 'SU26-001', canonicalMajor: 'Econ, Quantitative' })]);
    expect(csv).toContain('900,SU26-001,"Econ, Quantitative"');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test --workspace=packages/module-roster -- roster-output`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/roster/output.ts`**

```ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { ProposalRow } from '../types.js';

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Render the PII-free de-identified roster: canvas_id,pseudonym,major. */
export function renderRosterCsv(rows: ProposalRow[]): string {
  const lines = ['canvas_id,pseudonym,major'];
  for (const r of rows) {
    lines.push(`${csvCell(r.canvasId)},${csvCell(r.pseudonym)},${csvCell(r.canonicalMajor)}`);
  }
  return lines.join('\n') + '\n';
}

/** Write the roster CSV to a path, creating parent dirs. Returns the path. */
export function writeRosterCsv(path: string, rows: ProposalRow[]): string {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, renderRosterCsv(rows), 'utf-8');
  return path;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test --workspace=packages/module-roster -- roster-output`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/module-roster/src/roster packages/module-roster/tests/roster-output.test.ts
git commit -m "feat(roster): de-identified roster CSV writer"
```

---

## Phase 8 — Orchestration

### Task 10: `proposeRoster` orchestrator (read-only)

**Files:**
- Create: `packages/module-roster/src/propose.ts`
- Test: `packages/module-roster/tests/propose.test.ts`

- [ ] **Step 1: Write the failing test** (inject vault, canvas users, llm; assert NO file writes)

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { proposeRoster } from '../src/propose.js';
import { saveVault } from '../src/vault/store.js';
import { vaultPath } from '../src/paths.js';
import type { CanvasUser, PeopleSoftRow } from '../src/types.js';
import type { LlmClient } from '@canvas-toolchain/shared-llm';

let home: string;
beforeEach(() => { home = mkdtempSync(join(tmpdir(), 'roster-propose-')); process.env.CC_HOME = home; });
afterEach(() => { delete process.env.CC_HOME; rmSync(home, { recursive: true, force: true }); });

const ps = (o: Partial<PeopleSoftRow>): PeopleSoftRow =>
  ({ studentNumber: '', email: '', userId: '', name: '', rawMajor: '', ...o });
const cu = (o: Partial<CanvasUser>): CanvasUser => ({ canvasId: '', name: '', ...o });
const idLlm: LlmClient = { complete: async (_s, u) => {
  const raws = JSON.parse(u.slice(u.indexOf('['))) as string[];
  return { text: JSON.stringify(Object.fromEntries(raws.map((r) => [r, r.toUpperCase()]))) };
} };

describe('proposeRoster', () => {
  it('matches, assigns pseudonyms, normalizes majors, and writes nothing', async () => {
    saveVault([{ studentNumber: '100', canvasId: '900', pseudonym: 'SU26-001', firstSeenTerm: 'SU26' }]);
    const report = await proposeRoster({
      term: 'FA26', courseId: '123',
      peopleSoft: [ps({ studentNumber: '100', name: 'Jane Doe', rawMajor: 'marketing' }),
                   ps({ studentNumber: '200', name: 'Bob Roe', rawMajor: 'accounting' })],
      canvasUsers: [cu({ canvasId: '900', sisUserId: '100', name: 'Jane Doe' }),
                    cu({ canvasId: '901', sisUserId: '200', name: 'Bob Roe' })],
      llm: idLlm, aliases: {},
    });
    const by = (sn: string) => report.rows.find((r) => r.studentNumber === sn)!;
    expect(by('100')).toMatchObject({ pseudonym: 'SU26-001', returning: true, canonicalMajor: 'MARKETING' });
    expect(by('200')).toMatchObject({ pseudonym: 'FA26-001', returning: false });
    expect(report.llmUsed).toBe(true);
    // The proposal NEVER writes the roster, and the vault is only the pre-seeded one.
    expect(existsSync(vaultPath())).toBe(true);          // pre-seeded, unchanged
    expect(report.rows).toHaveLength(2);
  });

  it('surfaces collisions, ambiguity, and unmatched both directions', async () => {
    saveVault([{ studentNumber: '100', canvasId: '900', pseudonym: 'SU26-001', firstSeenTerm: 'SU26' }]);
    const report = await proposeRoster({
      term: 'FA26', courseId: '123',
      peopleSoft: [
        ps({ studentNumber: '100', name: 'Jane Doe' }),         // collision: now canvas 999
        ps({ studentNumber: 'z', name: 'Twin Name' }),          // ambiguous
        ps({ studentNumber: 'ghost', name: 'No Canvas' }),      // unmatched PS
      ],
      canvasUsers: [
        cu({ canvasId: '999', sisUserId: '100', name: 'Jane Doe' }),
        cu({ canvasId: '500', name: 'Twin Name' }), cu({ canvasId: '501', name: 'Twin Name' }),
        cu({ canvasId: '700', sisUserId: 'extra', name: 'Only In Canvas' }),
      ],
      llm: null, aliases: {},
    });
    expect(report.collisions[0]).toMatchObject({ studentNumber: '100', vaultCanvasId: '900', incomingCanvasId: '999' });
    expect(report.ambiguous).toHaveLength(1);
    expect(report.unmatchedPeopleSoft.map((p) => p.studentNumber)).toContain('ghost');
    expect(report.unmatchedCanvas.map((c) => c.canvasId)).toContain('700');
    expect(report.llmUsed).toBe(false);                  // passthrough
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test --workspace=packages/module-roster -- propose`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/propose.ts`**

```ts
import type { LlmClient } from '@canvas-toolchain/shared-llm';
import { loadVault, indexByStudentNumber, detectCollision } from './vault/store.js';
import { matchStudents } from './match/resolver.js';
import { assignPseudonyms } from './pseudonym/assign.js';
import { normalizeMajors } from './major/normalize.js';
import type {
  CanvasUser, PeopleSoftRow, ProposalReport, ProposalRow, VaultCollision,
} from './types.js';

export interface ProposeRosterInput {
  term: string;
  courseId: string;
  peopleSoft: PeopleSoftRow[];
  canvasUsers: CanvasUser[];
  /** LLM for major normalization, or null to passthrough. */
  llm: LlmClient | null;
  aliases: Record<string, string>;
}

/**
 * Read-only proposal: match -> assign pseudonyms (computed, not persisted) -> normalize
 * majors -> assemble report. Reads the vault but writes nothing.
 */
export async function proposeRoster(input: ProposeRosterInput): Promise<ProposalReport> {
  const vault = loadVault();
  const vaultIdx = indexByStudentNumber(vault);

  const match = matchStudents(input.peopleSoft, input.canvasUsers);
  const { assignments } = assignPseudonyms(match.matched, vault, input.term);
  const assignBySn = new Map(assignments.map((a) => [a.studentNumber, a]));

  const collisions: VaultCollision[] = [];
  for (const ms of match.matched) {
    const c = detectCollision(vaultIdx, ms.ps.studentNumber, ms.canvas.canvasId);
    if (c) collisions.push(c);
  }

  const { map: majorMap, llmUsed } = await normalizeMajors(
    match.matched.map((m) => m.ps.rawMajor), input.llm, input.aliases,
  );

  const rows: ProposalRow[] = match.matched.map((ms) => {
    const a = assignBySn.get(ms.ps.studentNumber)!;
    const raw = ms.ps.rawMajor.trim();
    return {
      studentNumber: ms.ps.studentNumber,
      canvasId: ms.canvas.canvasId,
      pseudonym: a.pseudonym,
      returning: a.returning,
      matchedOn: ms.matchedOn,
      rawMajor: raw,
      canonicalMajor: raw ? (majorMap[raw] ?? raw) : '',
      secondMajor: ms.ps.secondMajor,
    };
  });

  return {
    term: input.term,
    courseId: input.courseId,
    rows,
    ambiguous: match.ambiguous,
    unmatchedPeopleSoft: match.unmatchedPeopleSoft,
    unmatchedCanvas: match.unmatchedCanvas,
    majorMap,
    collisions,
    llmUsed,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test --workspace=packages/module-roster -- propose`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/module-roster/src/propose.ts packages/module-roster/tests/propose.test.ts
git commit -m "feat(roster): proposeRoster orchestrator (read-only, idempotent)"
```

---

### Task 11: `commitRoster` orchestrator (the only writer)

**Files:**
- Create: `packages/module-roster/src/commit.ts`
- Test: `packages/module-roster/tests/commit.test.ts`

- [ ] **Step 1: Write the failing test** (asserts roster written + vault grows; re-commit is idempotent)

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { commitRoster } from '../src/commit.js';
import { loadVault, saveVault } from '../src/vault/store.js';
import type { ProposalReport, ProposalRow } from '../src/types.js';

let home: string;
beforeEach(() => { home = mkdtempSync(join(tmpdir(), 'roster-commit-')); process.env.CC_HOME = home; });
afterEach(() => { delete process.env.CC_HOME; rmSync(home, { recursive: true, force: true }); });

const row = (o: Partial<ProposalRow>): ProposalRow => ({
  studentNumber: '', canvasId: '', pseudonym: '', returning: false,
  matchedOn: 'student_number', rawMajor: '', canonicalMajor: '', ...o,
});
const report = (rows: ProposalRow[]): ProposalReport => ({
  term: 'FA26', courseId: '123', rows, ambiguous: [], unmatchedPeopleSoft: [],
  unmatchedCanvas: [], majorMap: {}, collisions: [], llmUsed: false,
});

describe('commitRoster', () => {
  it('writes the roster CSV and inserts only new vault records', () => {
    saveVault([{ studentNumber: '100', canvasId: '900', pseudonym: 'SU26-001', firstSeenTerm: 'SU26' }]);
    const out = join(home, 'roster.csv');
    const r = commitRoster(report([
      row({ studentNumber: '100', canvasId: '900', pseudonym: 'SU26-001', returning: true, canonicalMajor: 'Marketing' }),
      row({ studentNumber: '200', canvasId: '901', pseudonym: 'FA26-001', returning: false, canonicalMajor: 'Accounting' }),
    ]), out);

    expect(existsSync(out)).toBe(true);
    expect(readFileSync(out, 'utf-8')).toContain('901,FA26-001,Accounting');
    expect(r.rowsWritten).toBe(2);
    expect(r.vaultAdded).toBe(1);
    const vault = loadVault();
    expect(vault.map((v) => v.studentNumber).sort()).toEqual(['100', '200']);
  });

  it('is safe to re-commit: returning students are not duplicated or re-numbered', () => {
    saveVault([{ studentNumber: '100', canvasId: '900', pseudonym: 'SU26-001', firstSeenTerm: 'SU26' }]);
    const out = join(home, 'roster.csv');
    const rep = report([row({ studentNumber: '100', canvasId: '900', pseudonym: 'SU26-001', returning: true })]);
    commitRoster(rep, out);
    const r2 = commitRoster(rep, out);
    expect(r2.vaultAdded).toBe(0);
    expect(loadVault()).toHaveLength(1);
  });

  it('refuses to commit when unresolved collisions are present', () => {
    const rep = report([row({ studentNumber: '100', canvasId: '999', pseudonym: 'SU26-001' })]);
    rep.collisions = [{ studentNumber: '100', vaultCanvasId: '900', incomingCanvasId: '999' }];
    expect(() => commitRoster(rep, join(home, 'roster.csv'))).toThrow(/collision/i);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test --workspace=packages/module-roster -- commit`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/commit.ts`**

```ts
import { loadVault, saveVault, indexByStudentNumber } from './vault/store.js';
import { writeRosterCsv } from './roster/output.js';
import type { ProposalReport, VaultRecord } from './types.js';

export interface CommitResult {
  rosterPath: string;
  rowsWritten: number;
  vaultAdded: number;
  vaultPathWritten: string;
}

/**
 * The only writer. Writes the de-id roster CSV and inserts new students into the vault.
 * Returning students (already in the vault) are left untouched, so re-commit is idempotent.
 * Refuses to run if the report carries unresolved collisions.
 */
export function commitRoster(report: ProposalReport, rosterPath: string): CommitResult {
  if (report.collisions.length > 0) {
    throw new Error(
      `COMMIT_BLOCKED: ${report.collisions.length} vault collision(s) must be resolved before commit ` +
      `(same student number now maps to a different Canvas id).`,
    );
  }

  const rosterPathWritten = writeRosterCsv(rosterPath, report.rows);

  const vault = loadVault();
  const idx = indexByStudentNumber(vault);
  const additions: VaultRecord[] = [];
  for (const r of report.rows) {
    if (!idx.has(r.studentNumber)) {
      additions.push({
        studentNumber: r.studentNumber,
        canvasId: r.canvasId,
        pseudonym: r.pseudonym,
        firstSeenTerm: report.term,
      });
    }
  }
  const vaultPathWritten = saveVault([...vault, ...additions]);

  return {
    rosterPath: rosterPathWritten,
    rowsWritten: report.rows.length,
    vaultAdded: additions.length,
    vaultPathWritten,
  };
}
```

Note: `additions` uses `report.term`, but a new student's pseudonym already encodes its assignment term from `proposeRoster`. `firstSeenTerm` is the commit term, which equals the pseudonym prefix for new students by construction (propose assigned them `<term>-NNN`). Returning students are skipped, so their original `firstSeenTerm` is preserved.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test --workspace=packages/module-roster -- commit`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/module-roster/src/commit.ts packages/module-roster/tests/commit.test.ts
git commit -m "feat(roster): commitRoster (only writer; idempotent; collision guard)"
```

---

### Task 12: `resolveIdentity` (live Canvas reverse-lookup)

**Files:**
- Create: `packages/module-roster/src/resolve.ts`
- Test: `packages/module-roster/tests/resolve.test.ts`

- [ ] **Step 1: Write the failing test** (inject the vault + a fake user-fetcher)

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveIdentity } from '../src/resolve.js';
import { saveVault } from '../src/vault/store.js';
import type { CanvasUser } from '../src/types.js';

let home: string;
beforeEach(() => { home = mkdtempSync(join(tmpdir(), 'roster-resolve-')); process.env.CC_HOME = home; });
afterEach(() => { delete process.env.CC_HOME; rmSync(home, { recursive: true, force: true }); });

const fetchUser = async (canvasId: string): Promise<CanvasUser | null> =>
  canvasId === '900' ? { canvasId: '900', name: 'Jane Doe', email: 'a@x.edu' } : null;

describe('resolveIdentity', () => {
  beforeEach(() => {
    saveVault([{ studentNumber: '100', canvasId: '900', pseudonym: 'SU26-001', firstSeenTerm: 'SU26' }]);
  });

  it('resolves a known pseudonym to the live Canvas name', async () => {
    const r = await resolveIdentity(['SU26-001'], fetchUser);
    expect(r[0]).toEqual({ pseudonym: 'SU26-001', canvasId: '900', name: 'Jane Doe', email: 'a@x.edu', status: 'ok' });
  });

  it('reports unknown pseudonyms', async () => {
    const r = await resolveIdentity(['NOPE-999'], fetchUser);
    expect(r[0]).toMatchObject({ pseudonym: 'NOPE-999', status: 'unknown_pseudonym' });
  });

  it('reports when Canvas can no longer find the user', async () => {
    saveVault([{ studentNumber: '101', canvasId: '404', pseudonym: 'SU26-002', firstSeenTerm: 'SU26' }]);
    const r = await resolveIdentity(['SU26-002'], fetchUser);
    expect(r[0]).toMatchObject({ pseudonym: 'SU26-002', canvasId: '404', status: 'not_in_canvas' });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test --workspace=packages/module-roster -- resolve`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/resolve.ts`**

```ts
import { loadVault } from './vault/store.js';
import type { CanvasUser } from './types.js';

export type ResolveStatus = 'ok' | 'unknown_pseudonym' | 'not_in_canvas';

export interface ResolvedIdentity {
  pseudonym: string;
  canvasId?: string;
  name?: string;
  email?: string;
  status: ResolveStatus;
}

/** A function that fetches one Canvas user by id, or null if not found. */
export type CanvasUserFetcher = (canvasId: string) => Promise<CanvasUser | null>;

/**
 * Reverse-lookup: pseudonym -> vault -> canvas id -> live Canvas user. Caches nothing.
 * `fetchUser` is injected (production wraps the Canvas client; tests inject a fake).
 */
export async function resolveIdentity(
  pseudonyms: string[], fetchUser: CanvasUserFetcher,
): Promise<ResolvedIdentity[]> {
  const vault = loadVault();
  const byPseudonym = new Map(vault.map((r) => [r.pseudonym, r]));
  const out: ResolvedIdentity[] = [];
  for (const p of pseudonyms) {
    const rec = byPseudonym.get(p);
    if (!rec) { out.push({ pseudonym: p, status: 'unknown_pseudonym' }); continue; }
    const user = await fetchUser(rec.canvasId);
    if (!user) { out.push({ pseudonym: p, canvasId: rec.canvasId, status: 'not_in_canvas' }); continue; }
    out.push({ pseudonym: p, canvasId: rec.canvasId, name: user.name, email: user.email, status: 'ok' });
  }
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test --workspace=packages/module-roster -- resolve`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/module-roster/src/resolve.ts packages/module-roster/tests/resolve.test.ts
git commit -m "feat(roster): resolveIdentity reverse-lookup (live Canvas, nothing cached)"
```

---

## Phase 9 — Tools, module export, and C&C wiring

### Task 13: Three MCP tools + module default export + contract test

**Files:**
- Create: `packages/module-roster/src/tools.ts`
- Create: `packages/module-roster/src/index.ts`
- Test: `packages/module-roster/tests/module.test.ts`

This task wires the orchestrators to MCP tools. `propose_roster` and `commit_roster` build a live `RosterCanvasClient` + `RosterCanvasClient.listCourseStudents`; `resolve_identity` builds a one-user fetcher. The LLM is `tryMakeAnthropicLlm()` (nullable). To keep the handlers testable, each delegates to a small internal runner that accepts already-fetched data — but per YAGNI we test the orchestrators (Tasks 10–12) directly and test only the module *shape* here.

- [ ] **Step 1: Write the failing test** (module contract shape + tool names)

```ts
import { describe, it, expect } from 'vitest';
import mod from '../src/index.js';
import { isCanvasToolchainModule } from '@canvas-toolchain/module-contract';

describe('module-roster', () => {
  it('default-exports a valid CanvasToolchainModule', () => {
    expect(isCanvasToolchainModule(mod)).toBe(true);
    expect(mod.id).toBe('roster');
  });

  it('exposes propose_roster, commit_roster, resolve_identity', () => {
    const names = mod.tools.map((t) => t.schema.name).sort();
    expect(names).toEqual(['commit_roster', 'propose_roster', 'resolve_identity']);
  });

  it('every tool description references that only commit_roster writes', () => {
    const propose = mod.tools.find((t) => t.schema.name === 'propose_roster')!;
    expect(propose.schema.description.toLowerCase()).toContain('writes nothing');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test --workspace=packages/module-roster -- module`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/tools.ts`**

```ts
import type { ModuleTool } from '@canvas-toolchain/module-contract';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { RosterCanvasClient, loadCanvasCreds } from './canvas/client.js';
import { parseRosterFile } from './peoplesoft/parse.js';
import { loadColumnMap, saveColumnMap } from './peoplesoft/column-map.js';
import { loadMajorAliases } from './major/aliases.js';
import { tryMakeAnthropicLlm } from './major/llm.js';
import { proposeRoster } from './propose.js';
import { commitRoster } from './commit.js';
import { resolveIdentity } from './resolve.js';
import type { ColumnMapping, ProposalReport } from './types.js';

const text = (s: string): CallToolResult => ({ content: [{ type: 'text', text: s }] });
const json = (v: unknown): CallToolResult => text(JSON.stringify(v, null, 2));

const proposeRosterTool: ModuleTool = {
  schema: {
    name: 'propose_roster',
    description:
      'Read-only proposal: ingest a PeopleSoft CSV, match students to Canvas to discover each ' +
      "canvas_id, assign stable per-student pseudonyms (returning students keep theirs), and " +
      'AI-normalize majors. Returns a review report (matched/ambiguous/unmatched/returning/' +
      'collisions/major map). WRITES NOTHING — idempotent, safe to re-run. Then call commit_roster. ' +
      'Provide the column mapping once; it is remembered for next term.',
    inputSchema: {
      type: 'object' as const,
      required: ['courseId', 'term', 'peopleSoftFile'],
      properties: {
        courseId: { type: 'string', description: 'Canvas course id to pull the roster from.' },
        term: { type: 'string', description: 'Current term code (e.g. FA26); prefixes NEW students\' pseudonyms.' },
        peopleSoftFile: { type: 'string', description: 'Path to the PeopleSoft export CSV.' },
        columnMap: {
          type: 'object' as const,
          description: 'Header names for studentNumber,email,userId,name,major[,secondMajor]. ' +
            'Omit to reuse the remembered mapping.',
          properties: {
            studentNumber: { type: 'string' }, email: { type: 'string' }, userId: { type: 'string' },
            name: { type: 'string' }, major: { type: 'string' }, secondMajor: { type: 'string' },
          },
        },
      },
    },
  },
  handler: async (args) => {
    const a = args as { courseId: string; term: string; peopleSoftFile: string; columnMap?: ColumnMapping };
    const mapping = a.columnMap ?? loadColumnMap();
    if (!mapping) return json({ error: 'No column mapping provided and none remembered. Pass columnMap once.' });
    if (a.columnMap) saveColumnMap(a.columnMap);

    const peopleSoft = parseRosterFile(a.peopleSoftFile, mapping);
    const canvas = new RosterCanvasClient(loadCanvasCreds());
    const canvasUsers = await canvas.listCourseStudents(Number(a.courseId));

    const report = await proposeRoster({
      term: a.term, courseId: a.courseId, peopleSoft, canvasUsers,
      llm: tryMakeAnthropicLlm(), aliases: loadMajorAliases(),
    });
    return json(report);
  },
};

const commitRosterTool: ModuleTool = {
  schema: {
    name: 'commit_roster',
    description:
      'Commit a reviewed proposal (from propose_roster): write the PII-free canvas_id,pseudonym,major ' +
      'roster CSV and insert new students into the identity vault. The ONLY tool that writes. ' +
      'Returning students are not re-numbered, so re-commit is safe. Refuses to run if the proposal ' +
      'still carries unresolved vault collisions.',
    inputSchema: {
      type: 'object' as const,
      required: ['proposal', 'outputPath'],
      properties: {
        proposal: { type: 'object' as const, description: 'The ProposalReport object returned by propose_roster.' },
        outputPath: { type: 'string', description: 'Path to write the de-identified roster CSV.' },
      },
    },
  },
  handler: async (args) => {
    const a = args as { proposal: ProposalReport; outputPath: string };
    return json(commitRoster(a.proposal, a.outputPath));
  },
};

const resolveIdentityTool: ModuleTool = {
  schema: {
    name: 'resolve_identity',
    description:
      'Reverse-lookup: given one or more pseudonyms, resolve each to the live Canvas name (and email ' +
      'if your token exposes it) via the vault. Caches nothing; re-fetches from Canvas each time. ' +
      'Reports unknown pseudonyms and students no longer reachable in Canvas.',
    inputSchema: {
      type: 'object' as const,
      required: ['pseudonyms'],
      properties: {
        pseudonyms: { type: 'array' as const, items: { type: 'string' }, description: 'Pseudonyms to resolve.' },
      },
    },
  },
  handler: async (args) => {
    const a = args as { pseudonyms: string[] };
    const canvas = new RosterCanvasClient(loadCanvasCreds());
    const fetchUser = async (canvasId: string) => {
      // One-off fetch: list nothing global; ask Canvas for this single user via the course-agnostic
      // users endpoint is not available, so reuse the account-scoped user fetch by id.
      const users = await canvas.listCourseStudents(0).catch(() => []);
      return users.find((u) => u.canvasId === canvasId) ?? null;
    };
    return json(await resolveIdentity(a.pseudonyms, fetchUser));
  },
};

export const rosterTools: ModuleTool[] = [proposeRosterTool, commitRosterTool, resolveIdentityTool];
```

Note on `resolve_identity`'s fetcher: a single-user lookup ideally calls `GET /api/v1/users/:id`. Add that method to `RosterCanvasClient` in this step:

- [ ] **Step 4: Add `getUserById` to `src/canvas/client.ts`** (append inside the class, after `listCourseStudents`)

```ts
  /** Fetch a single Canvas user by id, or null if not found. */
  async getUserById(canvasId: string): Promise<import('../types.js').CanvasUser | null> {
    const res = await this.fetchImpl(`${this.base()}/users/${canvasId}?include%5B%5D=email`, {
      method: 'GET', headers: this.headers(),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Canvas GET user ${canvasId} failed: ${res.status}`);
    const u = (await res.json()) as { id: number; name: string; login_id?: string; sis_user_id?: string | null; email?: string };
    return {
      canvasId: String(u.id), name: u.name, loginId: u.login_id ?? undefined,
      sisUserId: u.sis_user_id == null ? undefined : String(u.sis_user_id), email: u.email ?? undefined,
    };
  }
```

Then simplify the tool's fetcher to use it:

```ts
    const fetchUser = (canvasId: string) => canvas.getUserById(canvasId);
```

- [ ] **Step 5: Implement `src/index.ts`**

```ts
import type { CanvasToolchainModule } from '@canvas-toolchain/module-contract';
import { rosterTools } from './tools.js';

export const MODULE_ID = 'roster';

const rosterModule: CanvasToolchainModule = {
  id: MODULE_ID,
  name: 'Roster & Identity Manager',
  description:
    'Build the PII-free canvas_id,pseudonym,major roster the Group Builder consumes: ingest a ' +
    'PeopleSoft CSV, match students to Canvas, assign stable per-student pseudonyms, AI-normalize ' +
    'majors. Propose->commit; a minimal SIS-anchored vault stores only the identity link.',
  version: '1.0.0',
  handles: [],
  tools: rosterTools,
};

export default rosterModule;
export { proposeRoster } from './propose.js';
export { commitRoster } from './commit.js';
export { resolveIdentity } from './resolve.js';
```

- [ ] **Step 6: Run the module test to verify it passes**

Run: `npm run test --workspace=packages/module-roster -- module`
Expected: PASS (3 tests).

- [ ] **Step 7: Build the package**

Run: `npm run build --workspace=packages/module-roster`
Expected: `tsc` exits 0.

- [ ] **Step 8: Commit**

```bash
git add packages/module-roster/src/tools.ts packages/module-roster/src/index.ts packages/module-roster/src/canvas/client.ts packages/module-roster/tests/module.test.ts
git commit -m "feat(roster): three MCP tools + module default export + getUserById"
```

---

### Task 14: Register in Command & Control + root build order

**Files:**
- Modify: `packages/command-and-control/src/modules/registry.ts`
- Modify: `packages/command-and-control/package.json`
- Modify: `package.json` (root)

- [ ] **Step 1: Add the dependency to C&C `package.json`**

In `packages/command-and-control/package.json`, add to `"dependencies"` (alongside `@canvas-toolchain/module-group-builder`):

```json
    "@canvas-toolchain/module-roster": "*",
```

- [ ] **Step 2: Register the module in `registry.ts`**

In `packages/command-and-control/src/modules/registry.ts`, add to `KNOWN_MODULES` (after the `group-builder` line):

```ts
  roster: async () => (await import('@canvas-toolchain/module-roster')).default,
```

- [ ] **Step 3: Add to the root build script**

In root `package.json`, in the `"build"` script, insert `module-roster` immediately after `module-group-builder` and before `canvas-design-studio`:

```
&& npm run build --workspace=packages/module-roster
```

(So the order is: … `module-group-builder` → `module-roster` → `canvas-design-studio` → `command-and-control`.)

- [ ] **Step 4: Install to refresh workspace symlinks**

Run: `npm install`
Expected: completes; `@canvas-toolchain/module-roster` symlink present in C&C.

- [ ] **Step 5: Add a registry test asserting `roster` is known**

Append to `packages/command-and-control/tests` wherever module-registry is tested (find with `grep -rln "knownModuleIds\|KNOWN_MODULES" packages/command-and-control/tests`). Add a case:

```ts
import { knownModuleIds } from '../src/modules/registry.js';
it('includes the roster module', () => {
  expect(knownModuleIds()).toContain('roster');
});
```

If no such test file exists, create `packages/command-and-control/tests/registry-roster.test.ts` with the import + `describe`/`it` wrapper around the assertion above.

- [ ] **Step 6: Build the whole monorepo**

Run: `npm run build`
Expected: all workspaces compile; exit 0.

- [ ] **Step 7: Run the full suite + the C&C registry test**

Run: `npm test`
Expected: all workspaces green, including the new `roster` registry assertion and all `module-roster` tests.

- [ ] **Step 8: Commit**

```bash
git add packages/command-and-control/src/modules/registry.ts packages/command-and-control/package.json package.json package-lock.json packages/command-and-control/tests
git commit -m "feat(roster): register module-roster in C&C + root build order"
```

---

## Final verification (after all tasks)

- [ ] `npm run build` → exit 0 (root build order includes `module-roster`).
- [ ] `npm test` → all workspaces green, including ~28 new `module-roster` tests.
- [ ] `npm run test --workspace=packages/command-and-control -- smoke` (or the integration smoke task) → exit 0.
- [ ] `npm audit` → 0 vulnerabilities (no new deps were added).
- [ ] Dispatch the final adversarial whole-implementation code review (per subagent-driven-development) before finishing the branch.

## Spec coverage check (self-review)

| Spec section | Implemented by |
|---|---|
| §3 minimal vault, SIS-anchored | Task 2 (`vault/store.ts`), Task 11 (insert new only) |
| §3 lifetime pseudonym, prefix = term first seen, returning reuse | Task 6 (`pseudonym/assign.ts`) |
| §4 module shape + persistent artifacts | Task 1, Task 13, Task 14 |
| §4 Canvas client (course users w/ match fields) | Task 4 |
| §4 LLM module-local, injectable | Task 7 (`major/llm.ts`), Task 8 |
| §5.1 propose_roster (read-only, column map, match, assign, normalize) | Task 3, 5, 6, 8, 10, 13 |
| §5.2 commit_roster (only writer, collision guard, idempotent) | Task 11, 13 |
| §5.3 resolve_identity (live lookup, nothing cached) | Task 12, 13 |
| §6 AI normalization (batched, alias overrides, passthrough) | Task 8 |
| §7 edge cases (unmatched both ways, ambiguous, collision, malformed, creds) | Task 3 (malformed), 4 (creds), 5 (unmatched/ambiguous), 10 (collisions surfaced), 11 (collision guard) |
| §8 hermetic TDD with injected fakes | every test task |
| §2 non-goals (no metrics/Forms/analytics) | not implemented (correct) |
