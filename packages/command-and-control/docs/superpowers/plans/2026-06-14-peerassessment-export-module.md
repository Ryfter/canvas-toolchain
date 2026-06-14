# PeerAssessment.com Export Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `module-peerassessment`, a plug-in module that turns a Canvas group set into a PeerAssessment.com import CSV (`Team,Login ID,Email,First Name,Last Name,Student ID #`).

**Architecture:** A new workspace package `packages/module-peerassessment` following the established module pattern (default-export `CanvasToolchainModule`, registered in C&C `KNOWN_MODULES`). It reads groups + members live from Canvas, fills each output row Canvas-first, and falls back to the PeopleSoft export (bridged through the roster vault) for the Login ID / Student ID# columns a teacher token often withholds. One MCP tool `build_peerassessment_import` with a `dryRun` flag. Import-only; the only artifact is a local CSV the instructor uploads — never a Canvas or vault write.

**Tech Stack:** TypeScript (ESM/NodeNext, Node ≥20), vitest 3, `@modelcontextprotocol/sdk`, `@canvas-toolchain/module-contract`, `@canvas-toolchain/module-roster` (reused for vault + PeopleSoft parsing).

**Spec:** `packages/command-and-control/docs/superpowers/specs/2026-06-14-peerassessment-export-design.md`

---

## File Structure

```
packages/module-peerassessment/
  package.json              # workspace package, deps: module-contract, module-roster, sdk
  tsconfig.json             # extends ../../tsconfig.base.json
  src/
    types.ts                # PaCanvasUser, PaGroup, PeerAssessmentRow, ImportReport, ...
    name.ts                 # splitName("Last, First" | "First Last") -> {firstName,lastName}
    paths.ts                # ccHome(), peerAssessmentDir(), importCsvFileName(), importCsvPath()
    output.ts               # renderImportCsv(rows), writeImportCsv(path, rows) — RFC 4180
    canvas/client.ts        # PaCanvasClient: read group set + members + course students, live
    source/vault.ts         # buildVaultIndex(): canvasId -> studentNumber (roster vault)
    source/peoplesoft.ts    # loadPeopleSoftIndex(file): studentNumber -> PeopleSoftRow | null
    join/resolve.ts         # resolveRow / resolveMembers: Canvas-first + fallback field sourcing
    report.ts               # findIncomplete / findUngrouped / findDuplicateEmails
    build.ts                # buildPeerAssessmentImport(input): orchestrate -> ImportReport
    tools.ts                # build_peerassessment_import ModuleTool
    index.ts                # default export module { id:'peerassessment', tools }
  tests/                    # one test file per unit
```

Modifications to existing files:
- `packages/module-roster/src/index.ts` — re-export `loadVault`, `loadColumnMap`, `parseRosterFile` + types for reuse.
- `packages/command-and-control/src/modules/registry.ts` — add `peerassessment` to `KNOWN_MODULES`.
- `packages/command-and-control/package.json` — add the module dependency.
- `packages/command-and-control/tests/modules/registry.test.ts` — add a `peerassessment` case.
- root `package.json` — add the module to the build order (after `module-roster`).

---

### Task 1: Package scaffold + types

**Files:**
- Create: `packages/module-peerassessment/package.json`
- Create: `packages/module-peerassessment/tsconfig.json`
- Create: `packages/module-peerassessment/src/types.ts`
- Create: `packages/module-peerassessment/src/index.ts` (temporary placeholder, replaced in Task 11)
- Modify: root `package.json` (build order)

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "@canvas-toolchain/module-peerassessment",
  "license": "MIT",
  "version": "1.0.0",
  "description": "PeerAssessment.com export module for canvas-toolchain",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run"
  },
  "dependencies": {
    "@canvas-toolchain/module-contract": "*",
    "@canvas-toolchain/module-roster": "*",
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

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "./dist", "rootDir": "./src" },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: Create `src/types.ts`**

```ts
/** A Canvas user as read from a group membership or the course roster (live). */
export interface PaCanvasUser {
  /** Canvas internal user id, stringified. */
  canvasId: string;
  /** Display name, e.g. "Jane Q. Public". */
  name: string;
  /** Canvas sortable_name ("Last, First"); the preferred source for first/last split. */
  sortableName?: string;
  email?: string;
  /** Canvas login_id — only present when the token may read logins. */
  loginId?: string;
  /** Canvas sis_user_id — only present when the token may read SIS ids. */
  sisUserId?: string;
}

/** One Canvas group plus its members. */
export interface PaGroup {
  name: string;
  members: PaCanvasUser[];
}

/** One output row, 1:1 with PeerAssessment.com's import columns. */
export interface PeerAssessmentRow {
  team: string;
  loginId: string;
  email: string;
  firstName: string;
  lastName: string;
  studentId: string;
}

/** A grouped student missing one or more required import columns. */
export interface IncompleteStudent {
  name: string;
  canvasId: string;
  /** Human labels of the blank columns, e.g. ["Login ID", "Student ID #"]. */
  missing: string[];
}

/** A student enrolled in the course but in no group in the named set. */
export interface UngroupedStudent {
  name: string;
  canvasId: string;
}

/** An email shared by more than one output row (PeerAssessment keys on email). */
export interface DuplicateEmail {
  email: string;
  names: string[];
}

/** The pre-upload report returned by buildPeerAssessmentImport. */
export interface ImportReport {
  /** Path written, or null when dryRun or zero rows. */
  outputPath: string | null;
  rowsWritten: number;
  totalStudents: number;
  incomplete: IncompleteStudent[];
  ungrouped: UngroupedStudent[];
  duplicateEmails: DuplicateEmail[];
  /** Non-fatal advisories (FERPA note + sourcing caveats). */
  warnings: string[];
}
```

- [ ] **Step 4: Create placeholder `src/index.ts`** (replaced in Task 11; lets the package build now)

```ts
import type { CanvasToolchainModule } from '@canvas-toolchain/module-contract';

const peerAssessmentModule: CanvasToolchainModule = {
  id: 'peerassessment',
  name: 'PeerAssessment.com Export',
  description: 'Placeholder — replaced in Task 11.',
  version: '1.0.0',
  handles: [],
  tools: [],
};

export default peerAssessmentModule;
```

- [ ] **Step 5: Add the package to the root build order**

In root `package.json`, the `build` script currently contains:
`... && npm run build --workspace=packages/module-roster && npm run build --workspace=packages/canvas-design-studio && ...`

Insert the new module immediately after `module-roster`:

```
... && npm run build --workspace=packages/module-roster && npm run build --workspace=packages/module-peerassessment && npm run build --workspace=packages/canvas-design-studio && ...
```

- [ ] **Step 6: Install workspaces + build the package**

Run: `npm install` (sandbox: use `dangerouslyDisableSandbox: true`)
Then: `npm run build --workspace=packages/module-roster && npm run build --workspace=packages/module-peerassessment`
Expected: both build clean (module-roster must be built first because the new package depends on it).

- [ ] **Step 7: Commit**

```bash
git add packages/module-peerassessment/package.json packages/module-peerassessment/tsconfig.json packages/module-peerassessment/src/types.ts packages/module-peerassessment/src/index.ts package.json package-lock.json
git commit -m "feat(peerassessment): scaffold module-peerassessment package + types"
```

---

### Task 2: Name splitting

**Files:**
- Create: `packages/module-peerassessment/src/name.ts`
- Test: `packages/module-peerassessment/tests/name.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { splitName } from '../src/name.js';

describe('splitName', () => {
  it('splits "Last, First" (Canvas sortable_name)', () => {
    expect(splitName('Public, Jane Q.')).toEqual({ firstName: 'Jane Q.', lastName: 'Public' });
  });
  it('splits a plain "First Last" display name', () => {
    expect(splitName('Jane Public')).toEqual({ firstName: 'Jane', lastName: 'Public' });
  });
  it('treats a multi-word plain name as first...last', () => {
    expect(splitName('Jane Q Public')).toEqual({ firstName: 'Jane Q', lastName: 'Public' });
  });
  it('puts a single token in lastName with first blank', () => {
    expect(splitName('Cher')).toEqual({ firstName: '', lastName: 'Cher' });
  });
  it('returns blanks for empty input', () => {
    expect(splitName('   ')).toEqual({ firstName: '', lastName: '' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=packages/module-peerassessment -- name`
Expected: FAIL — cannot find `../src/name.js`.

- [ ] **Step 3: Write `src/name.ts`**

```ts
/**
 * Split a name into { firstName, lastName }. Prefers "Last, First" (Canvas sortable_name);
 * falls back to "First ... Last" for plain display names. Returns blanks for empty input.
 */
export function splitName(raw: string): { firstName: string; lastName: string } {
  const s = (raw ?? '').trim();
  if (!s) return { firstName: '', lastName: '' };
  if (s.includes(',')) {
    const [last, first] = s.split(',', 2);
    return { firstName: first.trim(), lastName: last.trim() };
  }
  const parts = s.split(/\s+/);
  if (parts.length === 1) return { firstName: '', lastName: parts[0] };
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=packages/module-peerassessment -- name`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/module-peerassessment/src/name.ts packages/module-peerassessment/tests/name.test.ts
git commit -m "feat(peerassessment): name splitter (Last, First / First Last)"
```

---

### Task 3: CSV output

**Files:**
- Create: `packages/module-peerassessment/src/output.ts`
- Test: `packages/module-peerassessment/tests/output.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderImportCsv, writeImportCsv } from '../src/output.js';
import type { PeerAssessmentRow } from '../src/types.js';

const rows: PeerAssessmentRow[] = [
  { team: 'Team 1', loginId: 'jpublic', email: 'jane@u.edu', firstName: 'Jane', lastName: 'Public', studentId: '900111' },
];

describe('renderImportCsv', () => {
  it('emits the exact PeerAssessment header then one row per student', () => {
    const csv = renderImportCsv(rows);
    expect(csv).toBe(
      'Team,Login ID,Email,First Name,Last Name,Student ID #\n' +
      'Team 1,jpublic,jane@u.edu,Jane,Public,900111\n',
    );
  });
  it('RFC-4180 escapes commas, quotes, and newlines', () => {
    const csv = renderImportCsv([
      { team: 'A,B', loginId: 'x', email: 'e@e', firstName: 'Jo "JJ"', lastName: 'Line\nBreak', studentId: '1' },
    ]);
    expect(csv).toContain('"A,B",x,e@e,"Jo ""JJ""","Line\nBreak",1');
  });
});

describe('writeImportCsv', () => {
  it('creates parent dirs and writes the file, returning the path', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pa-out-'));
    const path = join(dir, 'nested', 'import.csv');
    const written = writeImportCsv(path, rows);
    expect(written).toBe(path);
    expect(readFileSync(path, 'utf-8')).toBe(renderImportCsv(rows));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=packages/module-peerassessment -- output`
Expected: FAIL — cannot find `../src/output.js`.

- [ ] **Step 3: Write `src/output.ts`**

```ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { PeerAssessmentRow } from './types.js';

const HEADER = 'Team,Login ID,Email,First Name,Last Name,Student ID #';

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Render rows as the PeerAssessment.com import CSV (header + one row per student). */
export function renderImportCsv(rows: PeerAssessmentRow[]): string {
  const lines = [HEADER];
  for (const r of rows) {
    lines.push(
      [r.team, r.loginId, r.email, r.firstName, r.lastName, r.studentId].map(csvCell).join(','),
    );
  }
  return lines.join('\n') + '\n';
}

/** Write the import CSV to a path, creating parent dirs. Returns the path. */
export function writeImportCsv(path: string, rows: PeerAssessmentRow[]): string {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, renderImportCsv(rows), 'utf-8');
  return path;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=packages/module-peerassessment -- output`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/module-peerassessment/src/output.ts packages/module-peerassessment/tests/output.test.ts
git commit -m "feat(peerassessment): RFC-4180 import CSV render + write"
```

---

### Task 4: Path resolution

**Files:**
- Create: `packages/module-peerassessment/src/paths.ts`
- Test: `packages/module-peerassessment/tests/paths.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { importCsvFileName, importCsvPath, peerAssessmentDir } from '../src/paths.js';

const ORIG = process.env.CC_HOME;
beforeEach(() => { process.env.CC_HOME = join('/tmp', 'cc-home'); });
afterEach(() => { if (ORIG === undefined) delete process.env.CC_HOME; else process.env.CC_HOME = ORIG; });

describe('paths', () => {
  it('peerAssessmentDir lives under CC_HOME', () => {
    expect(peerAssessmentDir()).toBe(join('/tmp', 'cc-home', 'peerassessment'));
  });
  it('importCsvFileName encodes course + sanitized group set', () => {
    expect(importCsvFileName('123', 'Project Teams!')).toBe('peerassessment-import-123-Project-Teams-.csv');
  });
  it('importCsvPath joins the dir and file name', () => {
    expect(importCsvPath('123', 'A B')).toBe(
      join('/tmp', 'cc-home', 'peerassessment', 'peerassessment-import-123-A-B.csv'),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=packages/module-peerassessment -- paths`
Expected: FAIL — cannot find `../src/paths.js`.

- [ ] **Step 3: Write `src/paths.ts`**

```ts
import { homedir } from 'node:os';
import { join } from 'node:path';

/** Resolve the C&C home dir, honoring CC_HOME (tests point this at a temp dir). */
export function ccHome(): string {
  return process.env.CC_HOME ?? join(homedir(), '.command-and-control');
}

/** Default directory for generated PeerAssessment import files. */
export function peerAssessmentDir(): string {
  return join(ccHome(), 'peerassessment');
}

/** Sanitized output file name for a course + group set. */
export function importCsvFileName(courseId: string, groupSetName: string): string {
  const safe = groupSetName.replace(/[^A-Za-z0-9._-]+/g, '-');
  return `peerassessment-import-${courseId}-${safe}.csv`;
}

/** Default full output path under CC_HOME. */
export function importCsvPath(courseId: string, groupSetName: string): string {
  return join(peerAssessmentDir(), importCsvFileName(courseId, groupSetName));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=packages/module-peerassessment -- paths`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/module-peerassessment/src/paths.ts packages/module-peerassessment/tests/paths.test.ts
git commit -m "feat(peerassessment): output path resolution under CC_HOME"
```

---

### Task 5: Live Canvas group reader

**Files:**
- Create: `packages/module-peerassessment/src/canvas/client.ts`
- Test: `packages/module-peerassessment/tests/canvas-client.test.ts`

The client reads the named group set live: find the group category by name, list its groups, list each group's members, and (separately) list all course students for the ungrouped check. `login_id` / `sis_user_id` are returned only when the token has permission; absence is normal and handled downstream. Tests inject a fake `fetchImpl` — no network.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { PaCanvasClient } from '../src/canvas/client.js';

/** Build a fake fetch that maps URL substrings to JSON payloads (no Link paging). */
function fakeFetch(routes: Array<{ match: string; body: unknown }>): typeof fetch {
  return (async (url: string) => {
    const hit = routes.find((r) => url.includes(r.match));
    if (!hit) throw new Error(`unexpected url: ${url}`);
    return {
      ok: true,
      status: 200,
      json: async () => hit.body,
      headers: { get: () => null },
    } as unknown as Response;
  }) as unknown as typeof fetch;
}

const creds = { host: 'canvas.test', token: 't' };

describe('PaCanvasClient.readGroupSet', () => {
  it('resolves a group set name to groups with members', async () => {
    const fetchImpl = fakeFetch([
      { match: '/courses/5/group_categories', body: [{ id: 9, name: 'Project Teams' }, { id: 8, name: 'Other' }] },
      { match: '/group_categories/9/groups', body: [{ id: 21, name: 'Team 1' }] },
      { match: '/groups/21/users', body: [
        { id: 100, name: 'Jane Public', sortable_name: 'Public, Jane', login_id: 'jpublic', sis_user_id: '900111', email: 'jane@u.edu' },
      ] },
    ]);
    const client = new PaCanvasClient(creds, { fetchImpl });
    const groups = await client.readGroupSet(5, 'Project Teams');
    expect(groups).toEqual([
      { name: 'Team 1', members: [
        { canvasId: '100', name: 'Jane Public', sortableName: 'Public, Jane', loginId: 'jpublic', sisUserId: '900111', email: 'jane@u.edu' },
      ] },
    ]);
  });

  it('throws GROUP_SET_NOT_FOUND when the name is absent', async () => {
    const fetchImpl = fakeFetch([{ match: '/group_categories', body: [{ id: 8, name: 'Other' }] }]);
    const client = new PaCanvasClient(creds, { fetchImpl });
    await expect(client.readGroupSet(5, 'Project Teams')).rejects.toThrow(/GROUP_SET_NOT_FOUND/);
  });

  it('listCourseStudents normalizes users and tolerates missing login/sis', async () => {
    const fetchImpl = fakeFetch([
      { match: '/courses/5/users', body: [{ id: 100, name: 'Jane Public', sortable_name: 'Public, Jane', email: 'jane@u.edu' }] },
    ]);
    const client = new PaCanvasClient(creds, { fetchImpl });
    const students = await client.listCourseStudents(5);
    expect(students).toEqual([
      { canvasId: '100', name: 'Jane Public', sortableName: 'Public, Jane', loginId: undefined, sisUserId: undefined, email: 'jane@u.edu' },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=packages/module-peerassessment -- canvas-client`
Expected: FAIL — cannot find `../src/canvas/client.js`.

- [ ] **Step 3: Write `src/canvas/client.ts`**

```ts
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ccHome } from '../paths.js';
import type { PaCanvasUser, PaGroup } from '../types.js';

export interface CanvasCreds { host: string; token: string; }
export interface PaCanvasClientOptions { fetchImpl?: typeof fetch; }

interface RawCanvasUser {
  id: number; name: string; sortable_name?: string;
  login_id?: string; sis_user_id?: string | null; email?: string;
}
interface RawNamed { id: number; name: string; }

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

function toUser(u: RawCanvasUser): PaCanvasUser {
  return {
    canvasId: String(u.id),
    name: u.name,
    sortableName: u.sortable_name ?? undefined,
    loginId: u.login_id ?? undefined,
    sisUserId: u.sis_user_id == null ? undefined : String(u.sis_user_id),
    email: u.email ?? undefined,
  };
}

export class PaCanvasClient {
  private readonly fetchImpl: typeof fetch;
  constructor(private readonly creds: CanvasCreds, opts: PaCanvasClientOptions = {}) {
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

  /** Find a group category (set) id by exact name, or null. */
  async findGroupCategory(courseId: number, name: string): Promise<number | null> {
    const cats = await this.getAll<RawNamed>(
      `${this.base()}/courses/${courseId}/group_categories?per_page=100`);
    const hit = cats.find((c) => c.name === name);
    return hit ? hit.id : null;
  }
  /** List the groups within a category. */
  listGroups(categoryId: number): Promise<RawNamed[]> {
    return this.getAll<RawNamed>(`${this.base()}/group_categories/${categoryId}/groups?per_page=100`);
  }
  /** List the members of a group, normalized. */
  async listGroupMembers(groupId: number): Promise<PaCanvasUser[]> {
    const raw = await this.getAll<RawCanvasUser>(
      `${this.base()}/groups/${groupId}/users?include%5B%5D=email&per_page=100`);
    return raw.map(toUser);
  }
  /** List active students in the course (for the ungrouped check). */
  async listCourseStudents(courseId: number): Promise<PaCanvasUser[]> {
    const raw = await this.getAll<RawCanvasUser>(
      `${this.base()}/courses/${courseId}/users?enrollment_type%5B%5D=student&include%5B%5D=email&per_page=100`);
    return raw.map(toUser);
  }
  /** Read the named group set as PaGroup[]. Throws GROUP_SET_NOT_FOUND if absent. */
  async readGroupSet(courseId: number, groupSetName: string): Promise<PaGroup[]> {
    const catId = await this.findGroupCategory(courseId, groupSetName);
    if (catId == null) {
      throw new Error(`GROUP_SET_NOT_FOUND: no group set named "${groupSetName}" in course ${courseId}.`);
    }
    const groups = await this.listGroups(catId);
    const out: PaGroup[] = [];
    for (const g of groups) {
      out.push({ name: g.name, members: await this.listGroupMembers(g.id) });
    }
    return out;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=packages/module-peerassessment -- canvas-client`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/module-peerassessment/src/canvas/client.ts packages/module-peerassessment/tests/canvas-client.test.ts
git commit -m "feat(peerassessment): live Canvas group-set + course-student reader"
```

---

### Task 6: Roster re-exports + vault & PeopleSoft sources

The vault bridge (`canvasId -> studentNumber`) and the PeopleSoft fallback both reuse `module-roster` internals (the vault format and the PeopleSoft parser) rather than duplicating them. First expose those from the roster package, then build the index helpers here.

**Files:**
- Modify: `packages/module-roster/src/index.ts`
- Create: `packages/module-peerassessment/src/source/vault.ts`
- Create: `packages/module-peerassessment/src/source/peoplesoft.ts`
- Test: `packages/module-peerassessment/tests/sources.test.ts`

- [ ] **Step 1: Add re-exports to `packages/module-roster/src/index.ts`**

Append these lines after the existing `export { ... }` lines:

```ts
// Reused by @canvas-toolchain/module-peerassessment (vault bridge + PeopleSoft fallback).
export { loadVault } from './vault/store.js';
export { loadColumnMap } from './peoplesoft/column-map.js';
export { parseRosterFile } from './peoplesoft/parse.js';
export type { VaultRecord, ColumnMapping, PeopleSoftRow } from './types.js';
```

Then rebuild roster so the new package can resolve the exports:
Run: `npm run build --workspace=packages/module-roster`
Expected: clean build.

- [ ] **Step 2: Write the failing test**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildVaultIndex } from '../src/source/vault.js';
import { loadPeopleSoftIndex } from '../src/source/peoplesoft.js';

const ORIG = process.env.CC_HOME;
let home: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'pa-cc-'));
  process.env.CC_HOME = home;
  mkdirSync(join(home, 'roster-vault'), { recursive: true });
});
afterEach(() => { if (ORIG === undefined) delete process.env.CC_HOME; else process.env.CC_HOME = ORIG; });

describe('buildVaultIndex', () => {
  it('maps canvas_id -> student_number from the roster vault', () => {
    writeFileSync(join(home, 'roster-vault', 'vault.json'), JSON.stringify({
      records: [{ studentNumber: '900111', canvasId: '100', pseudonym: 'FA26-001', firstSeenTerm: 'FA26' }],
    }));
    const idx = buildVaultIndex();
    expect(idx.get('100')).toBe('900111');
  });
  it('returns an empty map when no vault exists', () => {
    expect(buildVaultIndex().size).toBe(0);
  });
});

describe('loadPeopleSoftIndex', () => {
  it('returns null when no file is given', () => {
    expect(loadPeopleSoftIndex(undefined)).toBeNull();
  });
  it('returns null when no column mapping is remembered', () => {
    const f = join(home, 'ps.csv');
    writeFileSync(f, 'SID,Email,NetID,Name,Major\n900111,jane@u.edu,jpublic,"Public, Jane",IT\n');
    expect(loadPeopleSoftIndex(f)).toBeNull();
  });
  it('indexes rows by studentNumber using the remembered mapping', () => {
    writeFileSync(join(home, 'roster-vault', 'column-map.json'), JSON.stringify({
      studentNumber: 'SID', email: 'Email', userId: 'NetID', name: 'Name', major: 'Major',
    }));
    const f = join(home, 'ps.csv');
    writeFileSync(f, 'SID,Email,NetID,Name,Major\n900111,jane@u.edu,jpublic,"Public, Jane",IT\n');
    const idx = loadPeopleSoftIndex(f);
    expect(idx?.get('900111')).toMatchObject({ email: 'jane@u.edu', userId: 'jpublic', name: 'Public, Jane' });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test --workspace=packages/module-peerassessment -- sources`
Expected: FAIL — cannot find `../src/source/vault.js`.

- [ ] **Step 4: Write `src/source/vault.ts`**

```ts
import { loadVault } from '@canvas-toolchain/module-roster';

/**
 * Map canvas_id -> student_number from the roster vault. This is the bridge that lets the
 * PeerAssessment builder turn a Canvas member into a PeopleSoft row for the ID columns.
 * Empty when the vault has never been committed.
 */
export function buildVaultIndex(): Map<string, string> {
  const idx = new Map<string, string>();
  for (const r of loadVault()) idx.set(r.canvasId, r.studentNumber);
  return idx;
}
```

- [ ] **Step 5: Write `src/source/peoplesoft.ts`**

```ts
import { loadColumnMap, parseRosterFile, type PeopleSoftRow } from '@canvas-toolchain/module-roster';

/**
 * Load + index the PeopleSoft export by studentNumber, reusing the column mapping the roster
 * module remembered. Returns null when no file is supplied or no mapping is remembered — the
 * caller then relies on Canvas alone and surfaces a warning.
 */
export function loadPeopleSoftIndex(peopleSoftFile?: string): Map<string, PeopleSoftRow> | null {
  if (!peopleSoftFile) return null;
  const mapping = loadColumnMap();
  if (!mapping) return null;
  const rows = parseRosterFile(peopleSoftFile, mapping);
  const idx = new Map<string, PeopleSoftRow>();
  for (const r of rows) idx.set(r.studentNumber, r);
  return idx;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm run test --workspace=packages/module-peerassessment -- sources`
Expected: PASS (5 tests).

- [ ] **Step 7: Commit**

```bash
git add packages/module-roster/src/index.ts packages/module-peerassessment/src/source/vault.ts packages/module-peerassessment/src/source/peoplesoft.ts packages/module-peerassessment/tests/sources.test.ts
git commit -m "feat(peerassessment): vault bridge + PeopleSoft index (reuse roster internals)"
```

---

### Task 7: Field-sourcing resolver

This is the core: assemble each output row Canvas-first, then fill blanks from the vault/PeopleSoft. Student ID# uses the vault's student_number directly (so it fills even without a PeopleSoft file); Login ID / email / name fall back to the PeopleSoft row.

**Files:**
- Create: `packages/module-peerassessment/src/join/resolve.ts`
- Test: `packages/module-peerassessment/tests/resolve.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { resolveRow, resolveMembers, type ResolveSources } from '../src/join/resolve.js';
import type { PaCanvasUser, PaGroup } from '../src/types.js';
import type { PeopleSoftRow } from '@canvas-toolchain/module-roster';

const ps = (over: Partial<PeopleSoftRow>): PeopleSoftRow => ({
  studentNumber: '900111', email: 'ps@u.edu', userId: 'psnetid', name: 'Public, Jane', rawMajor: 'IT', ...over,
});

describe('resolveRow', () => {
  it('prefers Canvas fields when present', () => {
    const m: PaCanvasUser = { canvasId: '100', name: 'Jane Public', sortableName: 'Public, Jane',
      email: 'canvas@u.edu', loginId: 'canvasnet', sisUserId: '900111' };
    const src: ResolveSources = { vaultIndex: new Map(), peopleSoftIndex: null };
    expect(resolveRow('Team 1', m, src)).toEqual({
      team: 'Team 1', loginId: 'canvasnet', email: 'canvas@u.edu',
      firstName: 'Jane', lastName: 'Public', studentId: '900111',
    });
  });

  it('fills Login ID / email / name from PeopleSoft when Canvas withholds them', () => {
    const m: PaCanvasUser = { canvasId: '100', name: '' };
    const src: ResolveSources = {
      vaultIndex: new Map([['100', '900111']]),
      peopleSoftIndex: new Map([['900111', ps({})]]),
    };
    expect(resolveRow('Team 1', m, src)).toEqual({
      team: 'Team 1', loginId: 'psnetid', email: 'ps@u.edu',
      firstName: 'Jane', lastName: 'Public', studentId: '900111',
    });
  });

  it('fills Student ID# from the vault even with no PeopleSoft file', () => {
    const m: PaCanvasUser = { canvasId: '100', name: 'Jane Public', sortableName: 'Public, Jane', email: 'c@u.edu', loginId: 'cnet' };
    const src: ResolveSources = { vaultIndex: new Map([['100', '900111']]), peopleSoftIndex: null };
    expect(resolveRow('Team 1', m, src).studentId).toBe('900111');
  });

  it('leaves columns blank when no source supplies them', () => {
    const m: PaCanvasUser = { canvasId: '100', name: 'Jane Public', sortableName: 'Public, Jane', email: 'c@u.edu' };
    const src: ResolveSources = { vaultIndex: new Map(), peopleSoftIndex: null };
    const row = resolveRow('Team 1', m, src);
    expect(row.loginId).toBe('');
    expect(row.studentId).toBe('');
  });
});

describe('resolveMembers', () => {
  it('flattens groups, pairing each row with its member', () => {
    const groups: PaGroup[] = [
      { name: 'Team 1', members: [{ canvasId: '100', name: 'Jane Public', sortableName: 'Public, Jane', email: 'j@u.edu', loginId: 'j', sisUserId: '1' }] },
      { name: 'Team 2', members: [{ canvasId: '200', name: 'Bob Roe', sortableName: 'Roe, Bob', email: 'b@u.edu', loginId: 'b', sisUserId: '2' }] },
    ];
    const out = resolveMembers(groups, { vaultIndex: new Map(), peopleSoftIndex: null });
    expect(out.map((r) => r.row.team)).toEqual(['Team 1', 'Team 2']);
    expect(out.map((r) => r.member.canvasId)).toEqual(['100', '200']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=packages/module-peerassessment -- resolve`
Expected: FAIL — cannot find `../src/join/resolve.js`.

- [ ] **Step 3: Write `src/join/resolve.ts`**

```ts
import { splitName } from '../name.js';
import type { PaGroup, PaCanvasUser, PeerAssessmentRow } from '../types.js';
import type { PeopleSoftRow } from '@canvas-toolchain/module-roster';

export interface ResolveSources {
  /** canvas_id -> student_number, from the roster vault. */
  vaultIndex: Map<string, string>;
  /** student_number -> PeopleSoft row, or null when unavailable. */
  peopleSoftIndex: Map<string, PeopleSoftRow> | null;
}

/** A member paired with its resolved output row (the report needs the member identity). */
export interface ResolvedMember {
  member: PaCanvasUser;
  row: PeerAssessmentRow;
}

/** Build one output row for a member: Canvas-first, then vault/PeopleSoft fallback. */
export function resolveRow(team: string, m: PaCanvasUser, src: ResolveSources): PeerAssessmentRow {
  const studentNumber = src.vaultIndex.get(m.canvasId);
  const ps = studentNumber && src.peopleSoftIndex ? src.peopleSoftIndex.get(studentNumber) : undefined;

  const email = m.email || ps?.email || '';
  const loginId = m.loginId || ps?.userId || '';
  const studentId = m.sisUserId || studentNumber || ps?.studentNumber || '';

  let { firstName, lastName } = splitName(m.sortableName || m.name || '');
  if (!firstName && !lastName && ps?.name) ({ firstName, lastName } = splitName(ps.name));

  return { team, loginId, email, firstName, lastName, studentId };
}

/** Flatten all groups into resolved rows, preserving group order then member order. */
export function resolveMembers(groups: PaGroup[], src: ResolveSources): ResolvedMember[] {
  const out: ResolvedMember[] = [];
  for (const g of groups) {
    for (const m of g.members) out.push({ member: m, row: resolveRow(g.name, m, src) });
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=packages/module-peerassessment -- resolve`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/module-peerassessment/src/join/resolve.ts packages/module-peerassessment/tests/resolve.test.ts
git commit -m "feat(peerassessment): Canvas-first field resolver with vault/PeopleSoft fallback"
```

---

### Task 8: Validation report

**Files:**
- Create: `packages/module-peerassessment/src/report.ts`
- Test: `packages/module-peerassessment/tests/report.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { findIncomplete, findUngrouped, findDuplicateEmails } from '../src/report.js';
import type { ResolvedMember } from '../src/join/resolve.js';
import type { PaCanvasUser } from '../src/types.js';

const rm = (canvasId: string, name: string, row: Partial<ResolvedMember['row']>): ResolvedMember => ({
  member: { canvasId, name },
  row: { team: 'T', loginId: 'l', email: 'e@e', firstName: 'F', lastName: 'L', studentId: 's', ...row },
});

describe('findIncomplete', () => {
  it('lists the human labels of blank required columns', () => {
    const out = findIncomplete([rm('100', 'Jane', { loginId: '', studentId: '' })]);
    expect(out).toEqual([{ name: 'Jane', canvasId: '100', missing: ['Login ID', 'Student ID #'] }]);
  });
  it('omits complete rows', () => {
    expect(findIncomplete([rm('100', 'Jane', {})])).toEqual([]);
  });
});

describe('findUngrouped', () => {
  it('returns enrolled students not present in any group', () => {
    const all: PaCanvasUser[] = [{ canvasId: '100', name: 'Jane' }, { canvasId: '200', name: 'Bob' }];
    const grouped = [rm('100', 'Jane', {})];
    expect(findUngrouped(all, grouped)).toEqual([{ name: 'Bob', canvasId: '200' }]);
  });
});

describe('findDuplicateEmails', () => {
  it('flags emails shared by more than one row, case-insensitively', () => {
    const out = findDuplicateEmails([
      rm('100', 'Jane', { email: 'dup@u.edu' }),
      rm('200', 'Bob', { email: 'DUP@u.edu' }),
      rm('300', 'Sue', { email: 'unique@u.edu' }),
    ]);
    expect(out).toEqual([{ email: 'dup@u.edu', names: ['Jane', 'Bob'] }]);
  });
  it('ignores blank emails', () => {
    expect(findDuplicateEmails([rm('100', 'Jane', { email: '' }), rm('200', 'Bob', { email: '' })])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=packages/module-peerassessment -- report`
Expected: FAIL — cannot find `../src/report.js`.

- [ ] **Step 3: Write `src/report.ts`**

```ts
import type {
  PaCanvasUser, PeerAssessmentRow, IncompleteStudent, UngroupedStudent, DuplicateEmail,
} from './types.js';
import type { ResolvedMember } from './join/resolve.js';

const REQUIRED: Array<{ key: keyof PeerAssessmentRow; label: string }> = [
  { key: 'team', label: 'Team' },
  { key: 'loginId', label: 'Login ID' },
  { key: 'email', label: 'Email' },
  { key: 'firstName', label: 'First Name' },
  { key: 'lastName', label: 'Last Name' },
  { key: 'studentId', label: 'Student ID #' },
];

/** Grouped students missing any required column after fallback, with the blank column labels. */
export function findIncomplete(resolved: ResolvedMember[]): IncompleteStudent[] {
  const out: IncompleteStudent[] = [];
  for (const { member, row } of resolved) {
    const missing = REQUIRED.filter((f) => !row[f.key].trim()).map((f) => f.label);
    if (missing.length) out.push({ name: member.name, canvasId: member.canvasId, missing });
  }
  return out;
}

/** Enrolled students who are in no group in the named set (they won't appear in the file). */
export function findUngrouped(allStudents: PaCanvasUser[], grouped: ResolvedMember[]): UngroupedStudent[] {
  const inGroup = new Set(grouped.map((r) => r.member.canvasId));
  return allStudents
    .filter((s) => !inGroup.has(s.canvasId))
    .map((s) => ({ name: s.name, canvasId: s.canvasId }));
}

/** Emails shared by more than one output row (PeerAssessment.com keys on email). */
export function findDuplicateEmails(resolved: ResolvedMember[]): DuplicateEmail[] {
  const byEmail = new Map<string, string[]>();
  for (const { member, row } of resolved) {
    const e = row.email.trim().toLowerCase();
    if (!e) continue;
    byEmail.set(e, [...(byEmail.get(e) ?? []), member.name]);
  }
  const out: DuplicateEmail[] = [];
  for (const [email, names] of byEmail) if (names.length > 1) out.push({ email, names });
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=packages/module-peerassessment -- report`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/module-peerassessment/src/report.ts packages/module-peerassessment/tests/report.test.ts
git commit -m "feat(peerassessment): pre-upload validation report"
```

---

### Task 9: Build orchestrator

Pure and dependency-injected: it takes already-fetched groups + students + sources, resolves rows, validates, writes the CSV (unless `dryRun` or zero rows), and returns the report. No network, no Canvas/vault calls here.

**Files:**
- Create: `packages/module-peerassessment/src/build.ts`
- Test: `packages/module-peerassessment/tests/build.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildPeerAssessmentImport } from '../src/build.js';
import type { PaGroup, PaCanvasUser } from '../src/types.js';

const ORIG = process.env.CC_HOME;
let home: string;
beforeEach(() => { home = mkdtempSync(join(tmpdir(), 'pa-build-')); process.env.CC_HOME = home; });
afterEach(() => { if (ORIG === undefined) delete process.env.CC_HOME; else process.env.CC_HOME = ORIG; });

const groups: PaGroup[] = [
  { name: 'Team 1', members: [
    { canvasId: '100', name: 'Jane Public', sortableName: 'Public, Jane', email: 'jane@u.edu', loginId: 'jpublic', sisUserId: '900111' },
  ] },
];
const allStudents: PaCanvasUser[] = [
  { canvasId: '100', name: 'Jane Public' },
  { canvasId: '200', name: 'Bob Roe' },
];

describe('buildPeerAssessmentImport', () => {
  it('writes the CSV and reports rows, ungrouped, and warnings', () => {
    const report = buildPeerAssessmentImport({
      courseId: '5', groupSetName: 'Project Teams', groups, allStudents,
      sources: { vaultIndex: new Map(), peopleSoftIndex: null },
    });
    expect(report.rowsWritten).toBe(1);
    expect(report.totalStudents).toBe(1);
    expect(report.ungrouped).toEqual([{ name: 'Bob Roe', canvasId: '200' }]);
    expect(report.outputPath).not.toBeNull();
    expect(existsSync(report.outputPath as string)).toBe(true);
    expect(readFileSync(report.outputPath as string, 'utf-8')).toContain('Team 1,jpublic,jane@u.edu,Jane,Public,900111');
    expect(report.warnings[0]).toMatch(/FERPA/);
    expect(report.warnings.some((w) => /No PeopleSoft export/.test(w))).toBe(true);
  });

  it('dryRun writes nothing but still reports', () => {
    const report = buildPeerAssessmentImport({
      courseId: '5', groupSetName: 'Project Teams', groups, allStudents,
      sources: { vaultIndex: new Map(), peopleSoftIndex: null }, dryRun: true,
    });
    expect(report.outputPath).toBeNull();
    expect(report.rowsWritten).toBe(0);
    expect(report.totalStudents).toBe(1);
    expect(existsSync(join(home, 'peerassessment'))).toBe(false);
  });

  it('honors a custom outputDir', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pa-custom-'));
    const report = buildPeerAssessmentImport({
      courseId: '5', groupSetName: 'P', groups, allStudents,
      sources: { vaultIndex: new Map(), peopleSoftIndex: null }, outputDir: dir,
    });
    expect(report.outputPath).toBe(join(dir, 'peerassessment-import-5-P.csv'));
    expect(readdirSync(dir)).toContain('peerassessment-import-5-P.csv');
  });

  it('writes no file when there are zero rows', () => {
    const report = buildPeerAssessmentImport({
      courseId: '5', groupSetName: 'P', groups: [], allStudents,
      sources: { vaultIndex: new Map(), peopleSoftIndex: null },
    });
    expect(report.outputPath).toBeNull();
    expect(report.rowsWritten).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=packages/module-peerassessment -- build`
Expected: FAIL — cannot find `../src/build.js`.

- [ ] **Step 3: Write `src/build.ts`**

```ts
import { join } from 'node:path';
import { writeImportCsv } from './output.js';
import { importCsvPath, importCsvFileName } from './paths.js';
import { resolveMembers, type ResolveSources } from './join/resolve.js';
import { findIncomplete, findUngrouped, findDuplicateEmails } from './report.js';
import type { PaGroup, PaCanvasUser, ImportReport } from './types.js';

const FERPA_NOTE =
  'PeerAssessment.com is BSU-approved; this file contains student PII (name, email, login, student ID). Handle per FERPA.';

export interface BuildInput {
  courseId: string;
  groupSetName: string;
  groups: PaGroup[];
  allStudents: PaCanvasUser[];
  sources: ResolveSources;
  outputDir?: string;
  dryRun?: boolean;
}

/** Orchestrate: resolve rows -> validate -> (write unless dryRun/empty) -> report. Pure: no I/O beyond the CSV write. */
export function buildPeerAssessmentImport(input: BuildInput): ImportReport {
  const resolved = resolveMembers(input.groups, input.sources);
  const rows = resolved.map((r) => r.row);

  const warnings = [FERPA_NOTE];
  if (input.sources.peopleSoftIndex == null) {
    warnings.push('No PeopleSoft export supplied; Login ID / Student ID # rely on Canvas only and may be blank.');
  }

  let outputPath: string | null = null;
  let rowsWritten = 0;
  if (!input.dryRun && rows.length > 0) {
    const path = input.outputDir
      ? join(input.outputDir, importCsvFileName(input.courseId, input.groupSetName))
      : importCsvPath(input.courseId, input.groupSetName);
    outputPath = writeImportCsv(path, rows);
    rowsWritten = rows.length;
  }

  return {
    outputPath,
    rowsWritten,
    totalStudents: resolved.length,
    incomplete: findIncomplete(resolved),
    ungrouped: findUngrouped(input.allStudents, resolved),
    duplicateEmails: findDuplicateEmails(resolved),
    warnings,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=packages/module-peerassessment -- build`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/module-peerassessment/src/build.ts packages/module-peerassessment/tests/build.test.ts
git commit -m "feat(peerassessment): build orchestrator (resolve -> validate -> write -> report)"
```

---

### Task 10: MCP tool

The tool is the thin I/O shell: load creds, read Canvas live, build the source indexes, call `buildPeerAssessmentImport`, return the report as JSON. The test asserts the tool's schema contract (the live-Canvas handler path is exercised end-to-end by the module's other unit tests + the final smoke run).

**Files:**
- Create: `packages/module-peerassessment/src/tools.ts`
- Test: `packages/module-peerassessment/tests/tools.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { peerAssessmentTools } from '../src/tools.js';

describe('peerAssessmentTools', () => {
  it('exposes exactly the build_peerassessment_import tool', () => {
    expect(peerAssessmentTools.map((t) => t.schema.name)).toEqual(['build_peerassessment_import']);
  });
  it('requires courseId and groupSetName', () => {
    const schema = peerAssessmentTools[0].schema;
    expect(schema.inputSchema.required).toEqual(['courseId', 'groupSetName']);
    expect(Object.keys(schema.inputSchema.properties as object)).toEqual(
      ['courseId', 'groupSetName', 'peopleSoftFile', 'outputDir', 'dryRun'],
    );
  });
  it('documents that it writes only a local file', () => {
    expect(peerAssessmentTools[0].schema.description).toMatch(/never to Canvas or the vault/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=packages/module-peerassessment -- tools`
Expected: FAIL — cannot find `../src/tools.js`.

- [ ] **Step 3: Write `src/tools.ts`**

```ts
import type { ModuleTool } from '@canvas-toolchain/module-contract';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { PaCanvasClient, loadCanvasCreds } from './canvas/client.js';
import { buildVaultIndex } from './source/vault.js';
import { loadPeopleSoftIndex } from './source/peoplesoft.js';
import { buildPeerAssessmentImport } from './build.js';

const text = (s: string): CallToolResult => ({ content: [{ type: 'text', text: s }] });
const json = (v: unknown): CallToolResult => text(JSON.stringify(v, null, 2));

const buildImportTool: ModuleTool = {
  schema: {
    name: 'build_peerassessment_import',
    description:
      'Build the PeerAssessment.com student/group import CSV (Team,Login ID,Email,First Name,Last Name,' +
      'Student ID #) from a Canvas group set. Reads groups + members live from Canvas; fills Login ID / ' +
      'Student ID # from your PeopleSoft export (via the roster vault) when your Canvas token withholds ' +
      'them. Returns a pre-upload report (incomplete rows, ungrouped students, duplicate emails). Pass ' +
      'dryRun:true to validate without writing. Writes only a local CSV you upload yourself — never to ' +
      'Canvas or the vault.',
    inputSchema: {
      type: 'object' as const,
      required: ['courseId', 'groupSetName'],
      properties: {
        courseId: { type: 'string', description: 'Canvas course id.' },
        groupSetName: { type: 'string', description: 'Exact name of the Canvas group set (category) to read.' },
        peopleSoftFile: { type: 'string', description: 'Path to the PeopleSoft export CSV (ID backstop). Optional.' },
        outputDir: { type: 'string', description: 'Directory for the CSV (default under CC_HOME/peerassessment).' },
        dryRun: { type: 'boolean', description: 'When true, return the report only; write no file.' },
      },
    },
  },
  handler: async (args) => {
    const a = args as {
      courseId: string; groupSetName: string; peopleSoftFile?: string; outputDir?: string; dryRun?: boolean;
    };
    const canvas = new PaCanvasClient(loadCanvasCreds());
    const groups = await canvas.readGroupSet(Number(a.courseId), a.groupSetName);
    const allStudents = await canvas.listCourseStudents(Number(a.courseId));
    const report = buildPeerAssessmentImport({
      courseId: a.courseId,
      groupSetName: a.groupSetName,
      groups,
      allStudents,
      sources: { vaultIndex: buildVaultIndex(), peopleSoftIndex: loadPeopleSoftIndex(a.peopleSoftFile) },
      outputDir: a.outputDir,
      dryRun: a.dryRun,
    });
    return json(report);
  },
};

export const peerAssessmentTools: ModuleTool[] = [buildImportTool];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=packages/module-peerassessment -- tools`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/module-peerassessment/src/tools.ts packages/module-peerassessment/tests/tools.test.ts
git commit -m "feat(peerassessment): build_peerassessment_import MCP tool"
```

---

### Task 11: Module default export

**Files:**
- Modify: `packages/module-peerassessment/src/index.ts` (replace the Task 1 placeholder)
- Test: `packages/module-peerassessment/tests/module.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { isCanvasToolchainModule } from '@canvas-toolchain/module-contract';
import mod from '../src/index.js';

describe('module-peerassessment default export', () => {
  it('satisfies the module contract', () => {
    expect(isCanvasToolchainModule(mod)).toBe(true);
  });
  it('has id "peerassessment" and exposes its tool', () => {
    expect(mod.id).toBe('peerassessment');
    expect(mod.tools.map((t) => t.schema.name)).toEqual(['build_peerassessment_import']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=packages/module-peerassessment -- module`
Expected: FAIL — placeholder has empty `tools`, so the tool-name assertion fails.

- [ ] **Step 3: Replace `src/index.ts`**

```ts
import type { CanvasToolchainModule } from '@canvas-toolchain/module-contract';
import { peerAssessmentTools } from './tools.js';

export const MODULE_ID = 'peerassessment';

const peerAssessmentModule: CanvasToolchainModule = {
  id: MODULE_ID,
  name: 'PeerAssessment.com Export',
  description:
    'Turn a Canvas group set into a PeerAssessment.com import CSV (Team,Login ID,Email,First Name,' +
    'Last Name,Student ID #). Canvas-first field sourcing with a PeopleSoft+vault fallback for the ' +
    'login/student-id columns a teacher token often withholds. Import-only; writes a local upload file.',
  version: '1.0.0',
  handles: [],
  tools: peerAssessmentTools,
};

export default peerAssessmentModule;
export { buildPeerAssessmentImport } from './build.js';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=packages/module-peerassessment -- module`
Expected: PASS (2 tests).

- [ ] **Step 5: Build the package + run the whole module suite**

Run: `npm run build --workspace=packages/module-peerassessment`
Then: `npm run test --workspace=packages/module-peerassessment`
Expected: clean build; all module tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/module-peerassessment/src/index.ts packages/module-peerassessment/tests/module.test.ts
git commit -m "feat(peerassessment): module default export"
```

---

### Task 12: Register in Command & Control

**Files:**
- Modify: `packages/command-and-control/src/modules/registry.ts`
- Modify: `packages/command-and-control/package.json`
- Modify: `packages/command-and-control/tests/modules/registry.test.ts`

- [ ] **Step 1: Add the failing registry test case**

In `packages/command-and-control/tests/modules/registry.test.ts`, add alongside the existing `knownModuleIds` cases:

```ts
  it('includes the peerassessment module', () => {
    expect(knownModuleIds()).toContain('peerassessment');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=packages/command-and-control -- registry`
Expected: FAIL — `knownModuleIds()` does not yet contain `'peerassessment'`.

- [ ] **Step 3: Register the module in `KNOWN_MODULES`**

In `packages/command-and-control/src/modules/registry.ts`, add the entry after the `roster` line:

```ts
  roster: async () => (await import('@canvas-toolchain/module-roster')).default,
  peerassessment: async () => (await import('@canvas-toolchain/module-peerassessment')).default,
};
```

- [ ] **Step 4: Add the dependency to `packages/command-and-control/package.json`**

In the `dependencies` block, after the `@canvas-toolchain/module-roster` line:

```json
    "@canvas-toolchain/module-peerassessment": "*",
```

- [ ] **Step 5: Re-link workspaces, then run the test**

Run: `npm install` (sandbox: `dangerouslyDisableSandbox: true`)
Then: `npm run build --workspace=packages/module-peerassessment && npm run test --workspace=packages/command-and-control -- registry`
Expected: PASS — the new case is green.

- [ ] **Step 6: Commit**

```bash
git add packages/command-and-control/src/modules/registry.ts packages/command-and-control/package.json packages/command-and-control/tests/modules/registry.test.ts package-lock.json
git commit -m "feat(peerassessment): register module-peerassessment in Command & Control"
```

---

### Task 13: Full monorepo verification

**Files:** none (verification only).

- [ ] **Step 1: Build the whole monorepo**

Run: `npm run build` (sandbox: `dangerouslyDisableSandbox: true`)
Expected: every workspace builds clean, in order, including `module-peerassessment` after `module-roster`.

- [ ] **Step 2: Run the whole test suite**

Run: `npm test`
Expected: all workspaces green, including the new `module-peerassessment` tests and the C&C registry test.

- [ ] **Step 3: Run the integration smoke test**

Run: `npm run smoke:integration`
Expected: exit 0 (the new module is fail-soft and not enabled by default, so it must not affect the smoke path).

- [ ] **Step 4: Confirm no security regressions**

Run: `npm audit`
Expected: 0 vulnerabilities (unchanged from baseline).

- [ ] **Step 5: Final commit (if any verification fixups were needed)**

If steps 1–4 required no changes, there is nothing to commit. If a fixup was needed, commit it:

```bash
git add -A
git commit -m "fix(peerassessment): verification fixups"
```

---

## Self-Review

**1. Spec coverage:**
- Data contract header `Team,Login ID,Email,First Name,Last Name,Student ID #` → Task 3 (`output.ts` `HEADER`), asserted in Task 3 test. ✓
- Canvas-first field sourcing + PeopleSoft/vault fallback table → Task 7 (`resolve.ts`), asserted across the Task 7 tests. ✓
- Team from live Canvas group name; members live → Task 5 (`PaCanvasClient.readGroupSet`). ✓
- Login ID / Student ID# fallback when teacher token withholds them → Task 6 (sources) + Task 7 (resolver). ✓
- Required input `courseId` + `groupSetName`; optional `peopleSoftFile`, `outputDir`, `dryRun` → Task 10 schema. ✓
- Output under `CC_HOME/peerassessment` + configurable `outputDir` → Task 4 (`paths.ts`) + Task 9 (`build.ts`). ✓
- Pre-upload report (incomplete / ungrouped / duplicate emails / FERPA note) → Task 8 + Task 9. ✓
- `dryRun` = report only, no file → Task 9 test. ✓
- One tool, no propose→commit → Task 10. ✓
- No vault writes / no new at-rest PII store → vault.ts is read-only (`loadVault`); only the CSV persists. ✓
- Registered in `KNOWN_MODULES`, fail-soft, not enabled by default → Task 12 + Task 13 smoke. ✓
- Hermetic tests (injected fetch + CC_HOME temp dirs) → Tasks 5, 6, 9. ✓
- Non-goal: no grade import / no LTI / no Canvas grade-write → nothing in the plan adds a grade-write path. ✓

**2. Placeholder scan:** No "TBD"/"handle edge cases"/"similar to Task N" — every code and test step carries complete content. The Task 1 `index.ts` is an intentional, explicitly-replaced placeholder (Task 11), not an unfilled gap. ✓

**3. Type consistency:** `PaCanvasUser`, `PaGroup`, `PeerAssessmentRow`, `ImportReport`, `IncompleteStudent`, `UngroupedStudent`, `DuplicateEmail` defined in Task 1 and used unchanged downstream. `ResolveSources`/`ResolvedMember` defined in Task 7 and consumed by Tasks 8–9. `buildPeerAssessmentImport(BuildInput)` signature defined in Task 9 and called identically in Task 10. `importCsvFileName`/`importCsvPath` defined in Task 4 and used in Task 9. Roster re-exports (`loadVault`, `loadColumnMap`, `parseRosterFile`, `PeopleSoftRow`) added in Task 6 and imported in Tasks 6–7. ✓
