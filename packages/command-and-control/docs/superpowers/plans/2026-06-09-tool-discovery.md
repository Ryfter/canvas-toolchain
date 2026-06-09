# Post-Install Tool Discovery Implementation Plan (#76)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add active post-install tool discovery — scan the Canvas instance + self-report, match findings against module `handles[]`, offer to enable modules, and produce an accretive institution profile (the #77 payload).

**Architecture:** Two new core C&C tools (`discover_tools` read-only, `save_institution_profile` write) over four small discovery modules (`catalog`, `canvas_scan`, `match`, `profile`) + a YAML catalog data file. Reuses `set_module_enabled`/`list_modules` (#94) and `loadInstitutionConfig()` for Canvas access. Graceful cascade: account → per-course → self-report.

**Tech Stack:** TypeScript (NodeNext ESM), vitest, `js-yaml` (already a dependency — verify in Task 1), direct `fetch` Canvas calls mirroring `tools/publish/breadcrumbs.ts`.

**Spec:** `packages/command-and-control/docs/superpowers/specs/2026-06-09-tool-discovery-design.md`

**Conventions:** Atomic writes use tmp+rename, `mode: 0o600` (mirror `set_active_llm_provider.ts`). Result shape `{ ok: true, … } | { ok: false, error, message, fix }`. Tests override config dir via `CC_HOME` and courses via the same mechanism `set_courses_root`/dashboard tests use. Commit messages end with:
`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## Task 1: Catalog data file + loader

**Files:**
- Create: `packages/command-and-control/data/known-tools.yaml`
- Create: `packages/command-and-control/src/discovery/catalog.ts`
- Test: `packages/command-and-control/tests/discovery/catalog.test.ts`

**Dependency:** C&C does NOT yet depend on a YAML parser. The codebase convention is the **`yaml`** package (`parse`/`stringify`), used throughout CDS (`packages/canvas-design-studio/src/tools/showcase/catalog.ts` is the canonical loader to mirror). Add it to C&C as the first step of this task:

```bash
# add yaml to packages/command-and-control/package.json dependencies, matching CDS's "^2.9.0"
npm install yaml@^2.9.0 --workspace packages/command-and-control --save-exact=false
```

If `npm install` is undesirable in this environment, hand-edit `packages/command-and-control/package.json` to add `"yaml": "^2.9.0"` under `dependencies` (it already resolves via the monorepo, but it MUST be declared). Then proceed. All YAML in this plan uses `import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'`.

**Asset shipping:** `data/known-tools.yaml` lives at the package root (NOT under `src`, NOT copied into `dist`). The compiled loader resolves it via `new URL('../../data/known-tools.yaml', import.meta.url)` — from `dist/discovery/catalog.js` that is two levels up to the package root, then into `data/`. This mirrors CDS exactly (`build: tsc`, no copy step). C&C's `package.json` has no `files` field, so npm includes `data/` by default.

- [ ] **Step 1: Create the catalog data file** `packages/command-and-control/data/known-tools.yaml`:

```yaml
# Known ed-tech tools for post-install discovery (#76).
# Adding a tool is a content PR — no code change.
# identifiers: lowercased names/domains as they appear in Canvas external_tools.
# module: the module handles[] id this tool maps to, or null (no module yet).
tools:
  - id: panopto
    name: Panopto
    identifiers: [panopto, hosted.panopto.com]
    module: video
  - id: zoom
    name: Zoom
    identifiers: [zoom, zoom.us]
    module: null
  - id: teams
    name: Microsoft Teams
    identifiers: [teams, microsoft teams, teams.microsoft.com]
    module: null
  - id: google-meet
    name: Google Meet
    identifiers: [meet, google meet, meet.google.com]
    module: null
  - id: youtube
    name: YouTube
    identifiers: [youtube, youtube.com]
    module: null
  - id: echo360
    name: Echo360
    identifiers: [echo360, echo 360, echo360.org]
    module: null
  - id: kaltura
    name: Kaltura
    identifiers: [kaltura, kaltura.com]
    module: null
  - id: iclicker
    name: iClicker
    identifiers: [iclicker, i>clicker, iclicker.com]
    module: null
  - id: google-forms
    name: Google Forms
    identifiers: [google forms, forms.google.com, docs.google.com/forms]
    module: null
  - id: turnitin
    name: Turnitin
    identifiers: [turnitin, turnitin.com, turnitinuk.com]
    module: null
  - id: gradescope
    name: Gradescope
    identifiers: [gradescope, gradescope.com]
    module: null
```

- [ ] **Step 2: Write the failing test** `packages/command-and-control/tests/discovery/catalog.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { loadCatalog, matchIdentifier } from '../../src/discovery/catalog.js';

describe('loadCatalog', () => {
  it('loads entries indexed by id', () => {
    const cat = loadCatalog();
    expect(cat.byId.get('panopto')?.module).toBe('video');
    expect(cat.byId.get('zoom')?.module).toBeNull();
  });

  it('exposes the full pick-list', () => {
    const cat = loadCatalog();
    expect(cat.all.length).toBeGreaterThanOrEqual(10);
    expect(cat.all.every((t) => typeof t.id === 'string' && typeof t.name === 'string')).toBe(true);
  });
});

describe('matchIdentifier', () => {
  it('matches a Canvas tool name/domain to a catalog entry (case-insensitive, substring)', () => {
    const cat = loadCatalog();
    expect(matchIdentifier(cat, 'BSU Hosted Panopto')?.id).toBe('panopto');
    expect(matchIdentifier(cat, 'zoom.us')?.id).toBe('zoom');
  });

  it('returns undefined for an unknown tool', () => {
    const cat = loadCatalog();
    expect(matchIdentifier(cat, 'Acme Whiteboard')).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run test — confirm FAIL**

Run: `npm test --workspace packages/command-and-control -- discovery/catalog`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement** `packages/command-and-control/src/discovery/catalog.ts`:

```ts
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

export interface CatalogEntry {
  id: string;
  name: string;
  identifiers: string[];
  module: string | null;
}

export interface Catalog {
  all: CatalogEntry[];
  byId: Map<string, CatalogEntry>;
}

/** Resolve data/known-tools.yaml relative to this compiled file (dist/discovery → ../../data). */
function catalogPath(): string {
  return fileURLToPath(new URL('../../data/known-tools.yaml', import.meta.url));
}

export function loadCatalog(path: string = catalogPath()): Catalog {
  if (!existsSync(path)) {
    throw new Error(`KNOWN_TOOLS_NOT_FOUND: known-tools.yaml not present at ${path}`);
  }
  const parsed = (parseYaml(readFileSync(path, 'utf-8')) ?? {}) as { tools?: CatalogEntry[] };
  const all = (parsed.tools ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    identifiers: (t.identifiers ?? []).map((s) => s.toLowerCase()),
    module: t.module ?? null,
  }));
  const byId = new Map(all.map((t) => [t.id, t]));
  return { all, byId };
}

/** Case-insensitive substring match of a raw Canvas tool name/domain against catalog identifiers. */
export function matchIdentifier(catalog: Catalog, raw: string): CatalogEntry | undefined {
  const needle = raw.toLowerCase();
  return catalog.all.find((t) => t.identifiers.some((idf) => needle.includes(idf) || idf.includes(needle)));
}
```

NOTE: confirm `tsconfig` for this package emits to `dist/` such that `dist/discovery/catalog.js` resolves `../../data/known-tools.yaml`. The data dir is NOT compiled by tsc — verify it is copied/available at runtime. If the package has a build step that copies non-TS assets, ensure `data/**` is included; if not, add a copy step (check `package.json` build script). If unclear, read `packages/command-and-control/package.json` and how `canvas-capabilities.yaml` ships, and mirror it. Record what you did.

- [ ] **Step 5: Run test — confirm PASS**, then build: `npm run build --workspace packages/command-and-control`.

- [ ] **Step 6: Commit**

```bash
git add packages/command-and-control/data/known-tools.yaml packages/command-and-control/src/discovery/catalog.ts packages/command-and-control/tests/discovery/catalog.test.ts
git commit -m "feat(discovery): known-tools catalog + loader (#76)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Canvas scan cascade

**Files:**
- Create: `packages/command-and-control/src/discovery/canvas_scan.ts`
- Test: `packages/command-and-control/tests/discovery/canvas_scan.test.ts`

The scan is injected a `fetch`-like function and an institution config so it is fully testable without network.

- [ ] **Step 1: Write the failing test** `packages/command-and-control/tests/discovery/canvas_scan.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { scanCanvasTools } from '../../src/discovery/canvas_scan.js';

const cfg = { canvasUrl: 'https://x.instructure.com', apiToken: 't' };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('scanCanvasTools', () => {
  it('returns account tier when account external_tools succeeds', async () => {
    const fetchFn = async (url: string) => {
      if (url.includes('/accounts/self/external_tools')) return jsonResponse([{ name: 'BSU Panopto' }, { name: 'Zoom' }]);
      throw new Error('should not reach per-course');
    };
    const res = await scanCanvasTools(cfg, fetchFn as unknown as typeof fetch);
    expect(res.tier).toBe('account');
    expect(res.tools.map((t) => t.rawName)).toContain('BSU Panopto');
    expect(res.gaps).toEqual([]);
  });

  it('falls back to per-course on account 403, unioning tools with course attribution', async () => {
    const fetchFn = async (url: string) => {
      if (url.includes('/accounts/self/external_tools')) return jsonResponse({ errors: 'forbidden' }, 403);
      if (url.includes('/courses?')) return jsonResponse([{ id: 11, name: 'ITM 370' }, { id: 12, name: 'ITM 310' }]);
      if (url.includes('/courses/11/external_tools')) return jsonResponse([{ name: 'Panopto' }]);
      if (url.includes('/courses/12/external_tools')) return jsonResponse([{ name: 'Panopto' }, { name: 'Gradescope' }]);
      throw new Error(`unexpected url ${url}`);
    };
    const res = await scanCanvasTools(cfg, fetchFn as unknown as typeof fetch);
    expect(res.tier).toBe('course');
    const panopto = res.tools.find((t) => t.rawName === 'Panopto')!;
    expect(panopto.courses?.sort()).toEqual(['ITM 310', 'ITM 370']);
    expect(res.gaps.some((g) => /account/i.test(g))).toBe(true);
  });

  it('returns self-report tier when there is no token', async () => {
    const res = await scanCanvasTools({ canvasUrl: '', apiToken: '' }, (async () => {
      throw new Error('no network');
    }) as unknown as typeof fetch);
    expect(res.tier).toBe('self-report');
    expect(res.tools).toEqual([]);
  });

  it('keeps successful courses and notes a gap when one course read fails', async () => {
    const fetchFn = async (url: string) => {
      if (url.includes('/accounts/self/external_tools')) return jsonResponse({}, 403);
      if (url.includes('/courses?')) return jsonResponse([{ id: 11, name: 'A' }, { id: 12, name: 'B' }]);
      if (url.includes('/courses/11/external_tools')) return jsonResponse([{ name: 'Panopto' }]);
      if (url.includes('/courses/12/external_tools')) return jsonResponse({}, 500);
      throw new Error(`unexpected url ${url}`);
    };
    const res = await scanCanvasTools(cfg, fetchFn as unknown as typeof fetch);
    expect(res.tools.map((t) => t.rawName)).toEqual(['Panopto']);
    expect(res.gaps.some((g) => /B/.test(g))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test — confirm FAIL.**

Run: `npm test --workspace packages/command-and-control -- discovery/canvas_scan`

- [ ] **Step 3: Implement** `packages/command-and-control/src/discovery/canvas_scan.ts`:

```ts
export interface InstitutionConfigLike {
  canvasUrl: string;
  apiToken: string;
}

export interface DetectedTool {
  rawName: string;
  courses?: string[]; // course names this tool was found in (per-course tier)
}

export interface ScanResult {
  tier: 'account' | 'course' | 'self-report';
  tools: DetectedTool[];
  gaps: string[];
}

interface ExternalTool {
  name?: string;
  domain?: string;
}
interface CourseRef {
  id: number;
  name?: string;
}

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, Accept: 'application/json' };
}

async function getJson(
  fetchFn: typeof fetch,
  url: string,
  token: string,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const res = await fetchFn(url, { headers: authHeaders(token) });
  let body: unknown = undefined;
  try {
    body = await res.json();
  } catch {
    body = undefined;
  }
  return { ok: res.ok, status: res.status, body };
}

function toolName(t: ExternalTool): string | undefined {
  return t.name ?? t.domain;
}

/** Best-effort cascade: account → per-course → self-report. Injected fetch for testing. */
export async function scanCanvasTools(cfg: InstitutionConfigLike, fetchFn: typeof fetch): Promise<ScanResult> {
  if (!cfg.apiToken || !cfg.canvasUrl) {
    return { tier: 'self-report', tools: [], gaps: [] };
  }
  const base = cfg.canvasUrl.replace(/\/+$/, '');
  const gaps: string[] = [];

  // Tier 1: account-level
  try {
    const acct = await getJson(fetchFn, `${base}/api/v1/accounts/self/external_tools?per_page=100`, cfg.apiToken);
    if (acct.ok && Array.isArray(acct.body)) {
      const tools = (acct.body as ExternalTool[])
        .map(toolName)
        .filter((n): n is string => !!n)
        .map((rawName) => ({ rawName }));
      return { tier: 'account', tools, gaps };
    }
    gaps.push(`Account-level tool listing unavailable (HTTP ${acct.status}); used per-course scan.`);
  } catch {
    gaps.push('Account-level tool listing failed; used per-course scan.');
  }

  // Tier 2: per-course
  let courses: CourseRef[] = [];
  try {
    const courseRes = await getJson(
      fetchFn,
      `${base}/api/v1/courses?enrollment_type=teacher&per_page=100`,
      cfg.apiToken,
    );
    if (courseRes.ok && Array.isArray(courseRes.body)) {
      courses = courseRes.body as CourseRef[];
    } else {
      gaps.push(`Could not list courses (HTTP ${courseRes.status}); self-report only.`);
      return { tier: 'self-report', tools: [], gaps };
    }
  } catch {
    gaps.push('Could not list courses; self-report only.');
    return { tier: 'self-report', tools: [], gaps };
  }

  const byName = new Map<string, Set<string>>(); // rawName → set of course names
  for (const c of courses) {
    const courseLabel = c.name ?? `course ${c.id}`;
    try {
      const r = await getJson(fetchFn, `${base}/api/v1/courses/${c.id}/external_tools?per_page=100`, cfg.apiToken);
      if (!r.ok || !Array.isArray(r.body)) {
        gaps.push(`Could not read tools for ${courseLabel} (HTTP ${r.status}).`);
        continue;
      }
      for (const t of r.body as ExternalTool[]) {
        const n = toolName(t);
        if (!n) continue;
        if (!byName.has(n)) byName.set(n, new Set());
        byName.get(n)!.add(courseLabel);
      }
    } catch {
      gaps.push(`Could not read tools for ${courseLabel}.`);
    }
  }

  const tools: DetectedTool[] = [...byName.entries()].map(([rawName, set]) => ({
    rawName,
    courses: [...set],
  }));
  return { tier: 'course', tools, gaps };
}
```

- [ ] **Step 4: Run test — confirm PASS** (4 tests). Then build.

- [ ] **Step 5: Commit**

```bash
git add packages/command-and-control/src/discovery/canvas_scan.ts packages/command-and-control/tests/discovery/canvas_scan.test.ts
git commit -m "feat(discovery): best-effort Canvas scan cascade (account/course/self-report) (#76)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Matcher (detected ↔ catalog ↔ module state)

**Files:**
- Create: `packages/command-and-control/src/discovery/match.ts`
- Test: `packages/command-and-control/tests/discovery/match.test.ts`

Cross-references detected tools against the catalog and the known-module enabled state. Module state is injected (a `ModuleInfo[]` like `list_modules` returns) so the matcher is pure/testable.

- [ ] **Step 1: Write the failing test** `packages/command-and-control/tests/discovery/match.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { loadCatalog } from '../../src/discovery/catalog.js';
import { matchDetected } from '../../src/discovery/match.js';

const catalog = loadCatalog();
const moduleState = [
  { id: 'video', name: 'Lecture Video', enabled: false, handles: ['panopto', 'zoom'] as string[] },
];

describe('matchDetected', () => {
  it('flags a catalog tool whose module exists, carrying enabled state', () => {
    const r = matchDetected(catalog, moduleState, [{ rawName: 'BSU Panopto', courses: ['ITM 370'] }]);
    expect(r.matchedModules).toEqual([{ tool: 'panopto', module: 'video', enabled: false }]);
    expect(r.unmatched).toEqual([]);
  });

  it('treats a catalog tool with module:null as unmatched (free-form signal)', () => {
    const r = matchDetected(catalog, moduleState, [{ rawName: 'iClicker' }]);
    expect(r.matchedModules).toEqual([]);
    expect(r.unmatched).toContain('iclicker');
  });

  it('treats a detected tool with no catalog hit as unmatched by raw name', () => {
    const r = matchDetected(catalog, moduleState, [{ rawName: 'Acme Whiteboard' }]);
    expect(r.unmatched).toContain('Acme Whiteboard');
  });

  it('does not suggest a module that is not in the known-module state', () => {
    // catalog maps panopto→video, but if no module state lists video, no suggestion
    const r = matchDetected(catalog, [], [{ rawName: 'Panopto' }]);
    expect(r.matchedModules).toEqual([]);
    expect(r.unmatched).toContain('panopto');
  });
});
```

- [ ] **Step 2: Run test — confirm FAIL.**

Run: `npm test --workspace packages/command-and-control -- discovery/match`

- [ ] **Step 3: Implement** `packages/command-and-control/src/discovery/match.ts`:

```ts
import { matchIdentifier, type Catalog } from './catalog.js';
import type { DetectedTool } from './canvas_scan.js';

export interface ModuleStateLike {
  id: string;
  name: string;
  enabled: boolean;
  handles: string[];
}

export interface MatchResult {
  matchedModules: Array<{ tool: string; module: string; enabled: boolean }>;
  unmatched: string[]; // catalog id when known, else raw name
}

/** Pure cross-reference: detected tools → catalog → module handles[] + enabled state. */
export function matchDetected(
  catalog: Catalog,
  moduleState: ModuleStateLike[],
  detected: DetectedTool[],
): MatchResult {
  const matchedModules: MatchResult['matchedModules'] = [];
  const unmatched: string[] = [];
  const seenMatch = new Set<string>();

  for (const d of detected) {
    const entry = matchIdentifier(catalog, d.rawName);
    if (entry?.module) {
      // find a known module that handles this tool/provider id
      const mod = moduleState.find((m) => m.id === entry.module && m.handles.includes(entry.id));
      if (mod) {
        const key = `${entry.id}:${mod.id}`;
        if (!seenMatch.has(key)) {
          seenMatch.add(key);
          matchedModules.push({ tool: entry.id, module: mod.id, enabled: mod.enabled });
        }
        continue;
      }
      // catalog says there's a module, but it's not registered/known → unmatched by catalog id
      if (!unmatched.includes(entry.id)) unmatched.push(entry.id);
      continue;
    }
    const label = entry ? entry.id : d.rawName;
    if (!unmatched.includes(label)) unmatched.push(label);
  }

  return { matchedModules, unmatched };
}
```

- [ ] **Step 4: Run test — confirm PASS** (4 tests). Build.

- [ ] **Step 5: Commit**

```bash
git add packages/command-and-control/src/discovery/match.ts packages/command-and-control/tests/discovery/match.test.ts
git commit -m "feat(discovery): matcher — detected tools to module suggestions (#76)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Profile read/serialize/merge

**Files:**
- Create: `packages/command-and-control/src/discovery/profile.ts`
- Test: `packages/command-and-control/tests/discovery/profile.test.ts`

Structured-markdown master profile with a fenced YAML `tools` block. Accretive merge by tool id. Atomic 0o600 write. Also a helper to write the per-class `tools:` delta into a course-config.md.

- [ ] **Step 1: Write the failing test** `packages/command-and-control/tests/discovery/profile.test.ts`:

```ts
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { tmpdir, platform } from 'node:os';
import { join } from 'node:path';
import {
  loadProfile,
  mergeTools,
  saveProfile,
  getProfilePath,
  writeClassDelta,
  type ProfileTool,
} from '../../src/discovery/profile.js';

let ccHomeDir: string;
const ORIGINAL_CC_HOME = process.env.CC_HOME;

beforeEach(() => {
  ccHomeDir = mkdtempSync(join(tmpdir(), 'cc-home-'));
  process.env.CC_HOME = ccHomeDir;
});
afterEach(() => {
  rmSync(ccHomeDir, { recursive: true, force: true });
  if (ORIGINAL_CC_HOME === undefined) delete process.env.CC_HOME;
  else process.env.CC_HOME = ORIGINAL_CC_HOME;
});

const tool = (id: string, over: Partial<ProfileTool> = {}): ProfileTool => ({
  id,
  name: id,
  scope: 'global',
  module: 'none',
  source: 'detected',
  ...over,
});

describe('profile round-trip + merge', () => {
  it('saves and reloads a profile with identifiers and tools', () => {
    const path = saveProfile({ identifiers: { canvas: 'bsu.instructure.com' }, tools: [tool('panopto', { module: 'video' })] });
    expect(path).toBe(getProfilePath());
    if (platform() !== 'win32') expect(statSync(path).mode & 0o777).toBe(0o600);
    const reloaded = loadProfile();
    expect(reloaded.identifiers.canvas).toBe('bsu.instructure.com');
    expect(reloaded.tools.find((t) => t.id === 'panopto')?.module).toBe('video');
  });

  it('merge is accretive: adds new ids, updates existing, drops nothing', () => {
    const existing = [tool('panopto', { module: 'video' }), tool('iclicker')];
    const incoming = [tool('iclicker', { source: 'self-reported' }), tool('gradescope')];
    const { merged, added, updated } = mergeTools(existing, incoming);
    expect(merged.map((t) => t.id).sort()).toEqual(['gradescope', 'iclicker', 'panopto']);
    expect(added).toEqual(['gradescope']);
    expect(updated).toEqual(['iclicker']);
    expect(merged.find((t) => t.id === 'iclicker')?.source).toBe('self-reported');
  });

  it('tolerates a missing profile (empty library) and a corrupt one', () => {
    expect(loadProfile().tools).toEqual([]);
    writeFileSync(getProfilePath(), 'not a valid profile at all');
    expect(loadProfile().tools).toEqual([]);
  });
});

describe('writeClassDelta', () => {
  it('writes a tools: delta into an existing course-config.md without clobbering other content', () => {
    const courseDir = join(ccHomeDir, 'ITM370');
    mkdirSync(courseDir, { recursive: true });
    writeFileSync(join(courseDir, 'course-config.md'), '# Course\n\nsemester: Fall 2026\n');
    writeClassDelta(courseDir, { uses: ['gradescope'], skips: ['google-forms'] });
    const txt = readFileSync(join(courseDir, 'course-config.md'), 'utf-8');
    expect(txt).toContain('semester: Fall 2026');
    expect(txt).toMatch(/tools:/);
    expect(txt).toContain('gradescope');
    expect(txt).toContain('google-forms');
  });

  it('throws COURSE_NOT_FOUND for a missing course dir', () => {
    expect(() => writeClassDelta(join(ccHomeDir, 'nope'), { uses: ['x'] })).toThrow(/COURSE_NOT_FOUND/);
  });
});
```

- [ ] **Step 2: Run test — confirm FAIL.**

Run: `npm test --workspace packages/command-and-control -- discovery/profile`

- [ ] **Step 3: Implement** `packages/command-and-control/src/discovery/profile.ts`:

```ts
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { getCcHomePath } from '../kb/config.js';

export interface ProfileTool {
  id: string;
  name: string;
  scope: 'global' | 'class';
  module: string; // module id or 'none'
  source: 'detected' | 'self-reported';
}

export interface InstitutionProfile {
  identifiers: Record<string, string>;
  tools: ProfileTool[];
}

export function getProfilePath(): string {
  return join(getCcHomePath(), 'institution-profile.md');
}

const FENCE = '```';

/** Extract the fenced ```yaml block following a "## Tools" heading. Tolerant: returns empty on any failure. */
export function loadProfile(path: string = getProfilePath()): InstitutionProfile {
  const empty: InstitutionProfile = { identifiers: {}, tools: [] };
  if (!existsSync(path)) return empty;
  try {
    const text = readFileSync(path, 'utf-8');
    const match = text.match(/##\s*Tools\s*\n+```ya?ml\n([\s\S]*?)\n```/);
    if (!match) return empty;
    const data = parseYaml(match[1]) as { identifiers?: Record<string, string>; tools?: ProfileTool[] } | undefined;
    if (!data || !Array.isArray(data.tools)) return empty;
    return { identifiers: data.identifiers ?? {}, tools: data.tools };
  } catch {
    return empty;
  }
}

/** Accretive merge by id: new ids added, existing ids replaced by incoming, nothing dropped. */
export function mergeTools(
  existing: ProfileTool[],
  incoming: ProfileTool[],
): { merged: ProfileTool[]; added: string[]; updated: string[] } {
  const byId = new Map(existing.map((t) => [t.id, t]));
  const added: string[] = [];
  const updated: string[] = [];
  for (const t of incoming) {
    if (byId.has(t.id)) updated.push(t.id);
    else added.push(t.id);
    byId.set(t.id, t);
  }
  return { merged: [...byId.values()], added, updated };
}

function renderProfile(p: InstitutionProfile): string {
  const idLines = Object.entries(p.identifiers)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join('\n');
  const yamlBlock = stringifyYaml({ identifiers: p.identifiers, tools: p.tools }).trimEnd();
  return [
    '# Institution Profile',
    '',
    '> Produced by canvas-toolchain tool discovery (#76). Identifiers + tool inventory only — no tokens or student data.',
    '',
    '## Identifiers',
    idLines || '- (none)',
    '',
    '## Tools',
    `${FENCE}yaml`,
    yamlBlock,
    FENCE,
    '',
  ].join('\n');
}

function atomicWrite(path: string, content: string): void {
  mkdirSync(getCcHomePath(), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, content, { encoding: 'utf-8', mode: 0o600 });
  renameSync(tmp, path);
}

/** Write the full profile (already-merged) atomically. Returns the path. */
export function saveProfile(p: InstitutionProfile, path: string = getProfilePath()): string {
  atomicWrite(path, renderProfile(p));
  return path;
}

/** Append/replace a `tools:` delta in a course's course-config.md. Throws COURSE_NOT_FOUND if the dir is absent. */
export function writeClassDelta(courseDir: string, delta: { uses?: string[]; skips?: string[] }): void {
  if (!existsSync(courseDir) || !statSync(courseDir).isDirectory()) {
    throw new Error(`COURSE_NOT_FOUND: ${courseDir}`);
  }
  const cfgPath = join(courseDir, 'course-config.md');
  const prior = existsSync(cfgPath) ? readFileSync(cfgPath, 'utf-8') : '# Course\n';
  const block = ['tools:', `  uses: [${(delta.uses ?? []).join(', ')}]`, `  skips: [${(delta.skips ?? []).join(', ')}]`].join(
    '\n',
  );
  // Replace an existing tools: block (our simple 3-line shape) or append.
  const stripped = prior.replace(/\n?tools:\n(?:[ \t]+\w+:.*\n?)*/g, '\n').trimEnd();
  const next = `${stripped}\n\n${block}\n`;
  const tmp = `${cfgPath}.tmp`;
  writeFileSync(tmp, next, { encoding: 'utf-8' });
  renameSync(tmp, cfgPath);
}
```

NOTE: uses `parse`/`stringify` from the `yaml` package (added in Task 1) — the codebase convention.

- [ ] **Step 4: Run test — confirm PASS** (5 tests). Build.

- [ ] **Step 5: Commit**

```bash
git add packages/command-and-control/src/discovery/profile.ts packages/command-and-control/tests/discovery/profile.test.ts
git commit -m "feat(discovery): institution-profile read/serialize/merge + per-class delta (#76)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: `discover_tools` tool (read-only orchestration)

**Files:**
- Create: `packages/command-and-control/src/tools/discover_tools.ts`
- Test: `packages/command-and-control/tests/tools/discover_tools.test.ts`

Orchestrates scan + catalog + match + pick-list. Canvas config load, fetch, and module state are injectable for testing (default to the real `loadInstitutionConfig`, global `fetch`, and `listModules`).

- [ ] **Step 1: Write the failing test** `packages/command-and-control/tests/tools/discover_tools.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { discoverTools } from '../../src/tools/discover_tools.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('discoverTools', () => {
  it('reports matched modules + unmatched + pick-list from an account scan', async () => {
    const deps = {
      loadConfig: () => ({ canvasUrl: 'https://x.instructure.com', apiToken: 't' }),
      fetchFn: (async (url: string) =>
        url.includes('/accounts/self/external_tools')
          ? jsonResponse([{ name: 'BSU Panopto' }, { name: 'iClicker' }])
          : jsonResponse({}, 404)) as unknown as typeof fetch,
      moduleState: async () => [{ id: 'video', name: 'Lecture Video', enabled: false, handles: ['panopto'], activeProvider: undefined }],
    };
    const r = await discoverTools({}, deps);
    expect(r.scanTier).toBe('account');
    expect(r.matchedModules).toEqual([{ tool: 'panopto', module: 'video', enabled: false }]);
    expect(r.unmatched).toContain('iclicker');
    expect(r.catalogPickList.length).toBeGreaterThanOrEqual(10);
  });

  it('returns self-report tier with empty detection when there is no token', async () => {
    const deps = {
      loadConfig: () => ({ canvasUrl: '', apiToken: '' }),
      fetchFn: (async () => jsonResponse({}, 500)) as unknown as typeof fetch,
      moduleState: async () => [],
    };
    const r = await discoverTools({}, deps);
    expect(r.scanTier).toBe('self-report');
    expect(r.detected).toEqual([]);
    expect(r.catalogPickList.length).toBeGreaterThanOrEqual(10);
  });

  it('does not throw if loadConfig throws (no canvas configured) → self-report', async () => {
    const deps = {
      loadConfig: () => {
        throw new Error('CANVAS_NOT_CONFIGURED');
      },
      fetchFn: (async () => jsonResponse({}, 500)) as unknown as typeof fetch,
      moduleState: async () => [],
    };
    const r = await discoverTools({}, deps);
    expect(r.scanTier).toBe('self-report');
  });
});
```

- [ ] **Step 2: Run test — confirm FAIL.**

Run: `npm test --workspace packages/command-and-control -- discover_tools`

- [ ] **Step 3: Implement** `packages/command-and-control/src/tools/discover_tools.ts`:

```ts
import { loadInstitutionConfig } from './publish/canvas_config_bridge.js';
import { listModules, type ModuleInfo } from './list_modules.js';
import { loadCatalog } from '../discovery/catalog.js';
import { scanCanvasTools, type InstitutionConfigLike } from '../discovery/canvas_scan.js';
import { matchDetected, type ModuleStateLike } from '../discovery/match.js';

export interface DiscoverToolsInput {
  scope?: 'account' | 'course' | 'self';
}

export interface DiscoverToolsDeps {
  loadConfig: () => InstitutionConfigLike;
  fetchFn: typeof fetch;
  moduleState: () => Promise<ModuleInfo[]>;
}

export interface DiscoverToolsReport {
  scanTier: 'account' | 'course' | 'self-report';
  gaps: string[];
  detected: Array<{ rawName: string; courses?: string[] }>;
  matchedModules: Array<{ tool: string; module: string; enabled: boolean }>;
  unmatched: string[];
  catalogPickList: Array<{ id: string; name: string; module: string | null }>;
}

const defaultDeps: DiscoverToolsDeps = {
  loadConfig: loadInstitutionConfig,
  fetchFn: (...args) => fetch(...args),
  moduleState: () => listModules(),
};

export async function discoverTools(
  _input: DiscoverToolsInput = {},
  deps: DiscoverToolsDeps = defaultDeps,
): Promise<DiscoverToolsReport> {
  const catalog = loadCatalog();
  const pickList = catalog.all.map((t) => ({ id: t.id, name: t.name, module: t.module }));

  let cfg: InstitutionConfigLike;
  try {
    cfg = deps.loadConfig();
  } catch {
    cfg = { canvasUrl: '', apiToken: '' };
  }

  const scan = await scanCanvasTools(cfg, deps.fetchFn);
  const mods: ModuleStateLike[] = (await deps.moduleState()).map((m) => ({
    id: m.id,
    name: m.name,
    enabled: m.enabled,
    handles: m.handles,
  }));
  const { matchedModules, unmatched } = matchDetected(catalog, mods, scan.tools);

  return {
    scanTier: scan.tier,
    gaps: scan.gaps,
    detected: scan.tools.map((t) => ({ rawName: t.rawName, courses: t.courses })),
    matchedModules,
    unmatched,
    catalogPickList: pickList,
  };
}
```

NOTE: verify `ModuleInfo` (from Task 4 of #94, in `list_modules.ts`) has fields `{ id, name, enabled, handles, activeProvider? }`. It does per that file. The `fetchFn` default uses the global `fetch` (Node 18+; the repo already calls global `fetch` in `breadcrumbs.ts`).

- [ ] **Step 4: Run test — confirm PASS** (3 tests). Build.

- [ ] **Step 5: Commit**

```bash
git add packages/command-and-control/src/tools/discover_tools.ts packages/command-and-control/tests/tools/discover_tools.test.ts
git commit -m "feat(discovery): discover_tools — read-only scan+match orchestration (#76)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: `save_institution_profile` tool (write)

**Files:**
- Create: `packages/command-and-control/src/tools/save_institution_profile.ts`
- Test: `packages/command-and-control/tests/tools/save_institution_profile.test.ts`

- [ ] **Step 1: Write the failing test** `packages/command-and-control/tests/tools/save_institution_profile.test.ts`:

```ts
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saveInstitutionProfile } from '../../src/tools/save_institution_profile.js';
import { loadProfile, getProfilePath } from '../../src/discovery/profile.js';

let ccHomeDir: string;
const ORIGINAL_CC_HOME = process.env.CC_HOME;

beforeEach(() => {
  ccHomeDir = mkdtempSync(join(tmpdir(), 'cc-home-'));
  process.env.CC_HOME = ccHomeDir;
});
afterEach(() => {
  rmSync(ccHomeDir, { recursive: true, force: true });
  if (ORIGINAL_CC_HOME === undefined) delete process.env.CC_HOME;
  else process.env.CC_HOME = ORIGINAL_CC_HOME;
});

const t = (id: string, over = {}) => ({ id, name: id, source: 'detected' as const, ...over });

describe('saveInstitutionProfile', () => {
  it('writes a new profile and reports added ids', async () => {
    const res = await saveInstitutionProfile({
      identifiers: { canvas: 'bsu.instructure.com' },
      tools: [t('panopto', { module: 'video' }), t('iclicker')],
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.added.sort()).toEqual(['iclicker', 'panopto']);
      expect(res.profilePath).toBe(getProfilePath());
    }
    expect(loadProfile().tools.length).toBe(2);
  });

  it('merges accretively on a second call (preserves prior, reports updated)', async () => {
    await saveInstitutionProfile({ tools: [t('panopto', { module: 'video' })] });
    const res = await saveInstitutionProfile({ tools: [t('panopto', { module: 'video' }), t('gradescope')] });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.added).toEqual(['gradescope']);
      expect(res.updated).toEqual(['panopto']);
    }
    expect(loadProfile().tools.map((x) => x.id).sort()).toEqual(['gradescope', 'panopto']);
  });

  it('writes per-class deltas and reports COURSE_NOT_FOUND for a bad dir while still saving the master', async () => {
    const courseDir = join(ccHomeDir, 'ITM370');
    mkdirSync(courseDir, { recursive: true });
    writeFileSync(join(courseDir, 'course-config.md'), '# Course\nsemester: Fall 2026\n');
    const res = await saveInstitutionProfile({
      tools: [t('gradescope')],
      perClass: [
        { courseDir, uses: ['gradescope'] },
        { courseDir: join(ccHomeDir, 'missing'), uses: ['x'] },
      ],
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.classesWritten).toEqual([courseDir]);
      expect(res.classErrors.length).toBe(1);
    }
    expect(readFileSync(join(courseDir, 'course-config.md'), 'utf-8')).toContain('gradescope');
  });

  it('returns INVALID_INPUT when tools is missing/not an array', async () => {
    const res = await saveInstitutionProfile({ tools: undefined as never });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('INVALID_INPUT');
  });
});
```

- [ ] **Step 2: Run test — confirm FAIL.**

Run: `npm test --workspace packages/command-and-control -- save_institution_profile`

- [ ] **Step 3: Implement** `packages/command-and-control/src/tools/save_institution_profile.ts`:

```ts
import {
  loadProfile,
  saveProfile,
  mergeTools,
  writeClassDelta,
  getProfilePath,
  type ProfileTool,
} from '../discovery/profile.js';

export interface SaveProfileToolInput {
  id: string;
  name: string;
  scope?: 'global' | 'class';
  module?: string;
  source: 'detected' | 'self-reported';
}

export interface SaveInstitutionProfileInput {
  tools: SaveProfileToolInput[];
  identifiers?: Record<string, string>;
  perClass?: Array<{ courseDir: string; uses?: string[]; skips?: string[] }>;
}

export type SaveInstitutionProfileResult =
  | {
      ok: true;
      profilePath: string;
      added: string[];
      updated: string[];
      classesWritten: string[];
      classErrors: Array<{ courseDir: string; error: string }>;
    }
  | { ok: false; error: string; message: string; fix: string[] };

function normalize(t: SaveProfileToolInput): ProfileTool {
  return {
    id: t.id,
    name: t.name,
    scope: t.scope ?? 'global',
    module: t.module ?? 'none',
    source: t.source,
  };
}

export async function saveInstitutionProfile(
  input: SaveInstitutionProfileInput,
): Promise<SaveInstitutionProfileResult> {
  if (!Array.isArray(input.tools)) {
    return {
      ok: false,
      error: 'INVALID_INPUT',
      message: 'tools must be an array',
      fix: ['Pass tools: [{ id, name, source }, …]'],
    };
  }

  const current = loadProfile();
  const { merged, added, updated } = mergeTools(current.tools, input.tools.map(normalize));
  const identifiers = { ...current.identifiers, ...(input.identifiers ?? {}) };
  saveProfile({ identifiers, tools: merged });

  const classesWritten: string[] = [];
  const classErrors: Array<{ courseDir: string; error: string }> = [];
  for (const c of input.perClass ?? []) {
    try {
      writeClassDelta(c.courseDir, { uses: c.uses, skips: c.skips });
      classesWritten.push(c.courseDir);
    } catch (err) {
      classErrors.push({ courseDir: c.courseDir, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { ok: true, profilePath: getProfilePath(), added, updated, classesWritten, classErrors };
}
```

- [ ] **Step 4: Run test — confirm PASS** (4 tests). Build.

- [ ] **Step 5: Commit**

```bash
git add packages/command-and-control/src/tools/save_institution_profile.ts packages/command-and-control/tests/tools/save_institution_profile.test.ts
git commit -m "feat(discovery): save_institution_profile — accretive merge + per-class deltas (#76)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Register both tools in the MCP server

**Files:**
- Modify: `packages/command-and-control/src/index.ts`

Register as CORE tools next to `set_module_enabled`/`list_modules` (anchor by searching, not line numbers).

- [ ] **Step 1: Imports** — after the `import { listModules } from './tools/list_modules.js';` line, add:

```ts
import { discoverTools } from './tools/discover_tools.js';
import { saveInstitutionProfile } from './tools/save_institution_profile.js';
```

- [ ] **Step 2: Schemas** — after the `list_modules` schema object in the ListTools array, insert:

```ts
    {
      name: 'discover_tools',
      description:
        'Discover what tools the institution/professor uses: scans the Canvas instance (account → per-course → self-report cascade), matches findings against available modules, and returns detected tools, module-enable suggestions, unmatched tools, and a catalog pick-list. Read-only.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          scope: { type: 'string', enum: ['account', 'course', 'self'], description: 'Optional: force a scan tier.' },
        },
      },
    },
    {
      name: 'save_institution_profile',
      description:
        'Write/merge the institution profile (the master tool library) and optional per-class tool deltas. Accretive — new tools are added, existing preserved. The profile is the payload for usage feedback (#77).',
      inputSchema: {
        type: 'object' as const,
        required: ['tools'],
        properties: {
          tools: {
            type: 'array',
            description: 'Tools to record. Each: { id, name, source:"detected"|"self-reported", scope?, module? }.',
            items: {
              type: 'object' as const,
              required: ['id', 'name', 'source'],
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                source: { type: 'string', enum: ['detected', 'self-reported'] },
                scope: { type: 'string', enum: ['global', 'class'] },
                module: { type: 'string' },
              },
            },
          },
          identifiers: { type: 'object' as const, description: 'e.g. { canvas: "bsu.instructure.com" }.' },
          perClass: {
            type: 'array',
            description: 'Per-class deltas written into each course-config.md.',
            items: {
              type: 'object' as const,
              required: ['courseDir'],
              properties: {
                courseDir: { type: 'string' },
                uses: { type: 'array', items: { type: 'string' } },
                skips: { type: 'array', items: { type: 'string' } },
              },
            },
          },
        },
      },
    },
```

- [ ] **Step 3: Switch cases** — after the `list_modules` case in the CallTool switch, insert:

```ts
      case 'discover_tools':
        result = await discoverTools(args as unknown as Parameters<typeof discoverTools>[0]);
        break;
      case 'save_institution_profile':
        result = await saveInstitutionProfile(args as unknown as Parameters<typeof saveInstitutionProfile>[0]);
        break;
```

- [ ] **Step 4: Build + smoke**

Run: `npm run build --workspace packages/command-and-control`
Run: `npm run smoke:integration --workspace packages/command-and-control`
Expected: clean compile; smoke passes.

- [ ] **Step 5: Commit**

```bash
git add packages/command-and-control/src/index.ts
git commit -m "feat(discovery): register discover_tools + save_institution_profile as core tools (#76)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Docs + handoff

**Files:**
- Modify: `packages/command-and-control/CLAUDE.md` (Implemented list)
- Modify: `AGENTS.md` (v2.0 section)

- [ ] **Step 1: CLAUDE.md** — add to the Implemented list:

```markdown
- `discover_tools` MCP tool — read-only post-install tool discovery (#76). Best-effort Canvas scan cascade (account → per-course → self-report), matched against the `known-tools.yaml` catalog and module `handles[]`. Returns detected tools, module-enable suggestions, unmatched (free-form #77 signal), and a catalog pick-list. Pairs with `set_module_enabled` to enable suggested modules.
- `save_institution_profile` MCP tool — writes/merges the master institution profile (`~/.command-and-control/institution-profile.md`) accretively (new tools added, existing preserved) and writes per-class `tools:` deltas into course-config.md. The profile is the payload for usage feedback (#77).
```

- [ ] **Step 2: AGENTS.md** — in the v2.0 section, mark #76 shipped (one or two lines matching the #78/#94 entries) and note #77 is now unblocked (its payload exists).

- [ ] **Step 3: Commit**

```bash
git add packages/command-and-control/CLAUDE.md AGENTS.md
git commit -m "docs(discovery): document discover_tools + save_institution_profile; #76 shipped"
```

---

## Final verification (after all tasks)

```bash
npm run build
npm test
npm run smoke:integration --workspace packages/command-and-control
```

Expected: build clean across packages; full suite green (existing + ~27 new discovery tests); smoke green. Then dispatch a final whole-implementation review over `fe4f797~1..HEAD`.

**Watch-outs flagged for implementers:**
- **Catalog asset shipping** (Task 1) — `data/known-tools.yaml` lives at package root; the loader resolves `new URL('../../data/known-tools.yaml', import.meta.url)` from `dist/discovery/catalog.js`. Confirmed-correct pattern (mirrors CDS `showcase/catalog.ts`); `build: tsc` only, no copy step, no `files` field so npm includes `data/`.
- **`yaml` dependency** — must be added to C&C's `package.json` (`^2.9.0`, as CDS has). It resolves via hoisting today but MUST be declared. Use `parse`/`stringify`.
- **`ModuleInfo` shape** from `list_modules.ts` — `{ id, name, enabled, handles, activeProvider? }`. The matcher/orchestrator depend on `handles` being present.
