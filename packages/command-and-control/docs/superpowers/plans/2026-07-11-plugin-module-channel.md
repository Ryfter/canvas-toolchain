# Plug-in Module Channel (v2.0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modules become drop-in: published as hash-pinned single-file artifacts on GitHub Releases, listed in a catalog on `main`, installed conversationally through a two-call confirmed `install_module`, with a GUI picker that only *requests* installs — closing #78 and shipping as v2.0.0.

**Architecture:** A new `src/channel/` layer in Command & Control owns catalog fetch/validation, sha256 verification, the installed-modules store, the pending-request file, and the fail-closed install path. The existing module loader gains one dynamic-import phase with load-time re-hashing and semver precedence. A channel-native proof module (`module-announcements`) ships only via the channel. The Go installer gains a catalog-driven picker that writes a pending-request file and never installs code.

**Tech Stack:** TypeScript (Node ≥20, ESM, vitest), esbuild (single-file module artifacts), GitHub Actions (`release-module.yml`), Go + Fyne (installer picker).

**Spec:** `docs/superpowers/specs/2026-07-11-plugin-module-channel-design.md` (approved 2026-07-11). The spec is authoritative; this plan implements it.

## Global Constraints

- **No live network in tests.** All fetches injectable (`fetchImpl`), fixtures served from memory/`file://`/local `httptest`.
- **Fail-soft loader invariant:** a missing/corrupt/tampered/contract-violating/throwing dynamic module must never prevent server startup (spec §8).
- **Fail-closed install path:** any verification failure deletes temp state and refuses; nothing unverified ever reaches `~/.command-and-control/modules/<id>/<version>/` (spec §7).
- **Atomic config writes:** tmp + rename, `mode: 0o600` — mirror `saveModuleManifest` (`src/modules/manifest.ts:24`).
- **Two-call confirm gate** for `install_module` and `recreate_announcement` — first call previews with zero side effects; only `confirm: true` acts (idiom: `wave_deep_check`, `submit_usage_feedback`).
- **Dispatch idiom:** `index.ts` switch cases assign the OUTER `result` and `break` (never early-return) so the shared notice path runs.
- **Public repo:** placeholders only (`example.edu`, generic course ids). Guard grep `boisestate|bsu|krank|rank85|48894|48895` must return nothing on every commit.
- **CC home resolution:** always `process.env.CC_HOME ?? join(homedir(), '.command-and-control')` via `getCcHomePath()` — tests isolate with `CC_HOME` + `mkdtempSync` and MUST set it before touching any store (lesson 045de35: never let a test's first real-writer call land in the real home).
- Reuse `compareVersions` and `getInstalledVersion` from `src/update/check.ts` — do not add a semver dependency.
- Commits end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Run everything from repo root `D:\Dev\canvas-toolchain` unless a task says otherwise.

---

### Task 1: Channel primitives — sha256 + catalog types/validation/fetch

**Files:**
- Create: `packages/command-and-control/src/channel/hash.ts`
- Create: `packages/command-and-control/src/channel/catalog.ts`
- Test: `packages/command-and-control/tests/channel-catalog.test.ts`

**Interfaces:**
- Consumes: `getCcHomePath()` from `src/kb/config.js`.
- Produces: `sha256File(path: string): Promise<string>` (lowercase hex); `interface CatalogEntry { id: string; name: string; description: string; version: string; minHostVersion: string; artifactUrl: string; sha256: string; sizeBytes: number; handles?: string[]; bundled?: boolean }`; `interface ModuleCatalog { catalogVersion: number; modules: CatalogEntry[] }`; `class CatalogError extends Error { code: 'CATALOG_INVALID' | 'CATALOG_VERSION_UNSUPPORTED' | 'CATALOG_UNREACHABLE' }`; `validateCatalog(value: unknown): ModuleCatalog`; `fetchCatalog(opts?: FetchCatalogOptions): Promise<ModuleCatalog>` with `FetchCatalogOptions { fetchImpl?: typeof fetch; url?: string; cachePath?: string; now?: () => number }`; `CATALOG_URL`; `SUPPORTED_CATALOG_VERSION = 1`.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/command-and-control/tests/channel-catalog.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { sha256File } from '../src/channel/hash.js';
import {
  validateCatalog, fetchCatalog, CatalogError, SUPPORTED_CATALOG_VERSION,
} from '../src/channel/catalog.js';

const GOOD_ENTRY = {
  id: 'announcements', name: 'Announcements Auditor', description: 'Audit scheduled announcements.',
  version: '1.0.0', minHostVersion: '2.0.0',
  artifactUrl: 'https://github.com/Ryfter/canvas-toolchain/releases/download/module-announcements-v1.0.0/module-announcements-1.0.0.mjs',
  sha256: 'a'.repeat(64), sizeBytes: 1234,
};
const GOOD_CATALOG = { catalogVersion: SUPPORTED_CATALOG_VERSION, modules: [GOOD_ENTRY] };

function fakeFetch(status: number, body: unknown): typeof fetch {
  return (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
}

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'cc-catalog-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe('sha256File', () => {
  it('hashes file contents as lowercase hex', async () => {
    const f = join(dir, 'x.bin');
    writeFileSync(f, 'hello');
    // echo -n hello | sha256sum
    expect(await sha256File(f)).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  });
});

describe('validateCatalog', () => {
  it('accepts a well-formed catalog', () => {
    expect(validateCatalog(GOOD_CATALOG).modules[0].id).toBe('announcements');
  });
  it('refuses a newer catalogVersion with CATALOG_VERSION_UNSUPPORTED', () => {
    expect(() => validateCatalog({ ...GOOD_CATALOG, catalogVersion: 2 }))
      .toThrowError(expect.objectContaining({ code: 'CATALOG_VERSION_UNSUPPORTED' }));
  });
  it('refuses entries missing required fields or with a malformed sha256', () => {
    const bad = { ...GOOD_ENTRY, sha256: 'nothex' };
    expect(() => validateCatalog({ catalogVersion: 1, modules: [bad] }))
      .toThrowError(expect.objectContaining({ code: 'CATALOG_INVALID' }));
    const missing = { ...GOOD_ENTRY } as Record<string, unknown>;
    delete missing.artifactUrl;
    expect(() => validateCatalog({ catalogVersion: 1, modules: [missing] }))
      .toThrowError(expect.objectContaining({ code: 'CATALOG_INVALID' }));
  });
  it('ignores unknown fields (forward compatibility)', () => {
    const entry = { ...GOOD_ENTRY, futureField: 'ok' };
    expect(validateCatalog({ catalogVersion: 1, modules: [entry], futureTop: true }).modules).toHaveLength(1);
  });
});

describe('fetchCatalog', () => {
  it('fetches, validates, and writes the cache', async () => {
    const cachePath = join(dir, 'cache.json');
    const cat = await fetchCatalog({ fetchImpl: fakeFetch(200, GOOD_CATALOG), cachePath });
    expect(cat.modules[0].id).toBe('announcements');
    expect(existsSync(cachePath)).toBe(true);
  });
  it('serves a fresh cache without fetching', async () => {
    const cachePath = join(dir, 'cache.json');
    writeFileSync(cachePath, JSON.stringify({ fetchedAt: new Date().toISOString(), catalog: GOOD_CATALOG }));
    let called = false;
    const spy: typeof fetch = (async () => { called = true; return new Response('{}'); }) as unknown as typeof fetch;
    const cat = await fetchCatalog({ fetchImpl: spy, cachePath });
    expect(cat.modules).toHaveLength(1);
    expect(called).toBe(false);
  });
  it('falls back to a stale cache when the network fails', async () => {
    const cachePath = join(dir, 'cache.json');
    writeFileSync(cachePath, JSON.stringify({ fetchedAt: '2000-01-01T00:00:00Z', catalog: GOOD_CATALOG }));
    const failing: typeof fetch = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
    const cat = await fetchCatalog({ fetchImpl: failing, cachePath });
    expect(cat.modules[0].id).toBe('announcements');
  });
  it('throws CATALOG_UNREACHABLE when the network fails and no cache exists', async () => {
    const failing: typeof fetch = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
    await expect(fetchCatalog({ fetchImpl: failing, cachePath: join(dir, 'none.json') }))
      .rejects.toMatchObject({ code: 'CATALOG_UNREACHABLE' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/channel-catalog.test.ts --root packages/command-and-control`
Expected: FAIL — `Cannot find module '../src/channel/hash.js'`.

- [ ] **Step 3: Implement `hash.ts` and `catalog.ts`**

```ts
// packages/command-and-control/src/channel/hash.ts
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

/** Streaming sha256 of a file, lowercase hex. */
export function sha256File(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(path);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}
```

```ts
// packages/command-and-control/src/channel/catalog.ts
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getCcHomePath } from '../kb/config.js';

export const CATALOG_URL =
  'https://raw.githubusercontent.com/Ryfter/canvas-toolchain/main/module-catalog.json';
export const SUPPORTED_CATALOG_VERSION = 1;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const NETWORK_TIMEOUT_MS = 5000;

export interface CatalogEntry {
  id: string;
  name: string;
  description: string;
  version: string;
  minHostVersion: string;
  artifactUrl: string;
  sha256: string;
  sizeBytes: number;
  handles?: string[];
  bundled?: boolean;
}

export interface ModuleCatalog {
  catalogVersion: number;
  modules: CatalogEntry[];
}

export type CatalogErrorCode = 'CATALOG_INVALID' | 'CATALOG_VERSION_UNSUPPORTED' | 'CATALOG_UNREACHABLE';

export class CatalogError extends Error {
  constructor(readonly code: CatalogErrorCode, message: string) {
    super(message);
    this.name = 'CatalogError';
  }
}

const SHA256_HEX = /^[0-9a-f]{64}$/;

function isEntry(v: unknown): v is CatalogEntry {
  if (typeof v !== 'object' || v === null) return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.id === 'string' && e.id.length > 0 &&
    typeof e.name === 'string' &&
    typeof e.description === 'string' &&
    typeof e.version === 'string' &&
    typeof e.minHostVersion === 'string' &&
    typeof e.artifactUrl === 'string' && e.artifactUrl.startsWith('https://') &&
    typeof e.sha256 === 'string' && SHA256_HEX.test(e.sha256) &&
    typeof e.sizeBytes === 'number'
  );
}

/** Validate untrusted catalog JSON. Throws CatalogError; never returns partial data. */
export function validateCatalog(value: unknown): ModuleCatalog {
  if (typeof value !== 'object' || value === null) {
    throw new CatalogError('CATALOG_INVALID', 'Catalog is not an object.');
  }
  const c = value as Record<string, unknown>;
  if (typeof c.catalogVersion !== 'number') {
    throw new CatalogError('CATALOG_INVALID', 'Catalog missing catalogVersion.');
  }
  if (c.catalogVersion > SUPPORTED_CATALOG_VERSION) {
    throw new CatalogError(
      'CATALOG_VERSION_UNSUPPORTED',
      `Catalog version ${c.catalogVersion} is newer than this toolchain supports (${SUPPORTED_CATALOG_VERSION}). Update the toolchain.`,
    );
  }
  if (!Array.isArray(c.modules)) {
    throw new CatalogError('CATALOG_INVALID', 'Catalog missing modules array.');
  }
  for (const entry of c.modules) {
    if (!isEntry(entry)) {
      throw new CatalogError('CATALOG_INVALID', `Malformed catalog entry: ${JSON.stringify(entry).slice(0, 200)}`);
    }
  }
  return { catalogVersion: c.catalogVersion, modules: c.modules as CatalogEntry[] };
}

interface CatalogCache { fetchedAt: string; catalog: ModuleCatalog }

export interface FetchCatalogOptions {
  fetchImpl?: typeof fetch;
  url?: string;
  cachePath?: string;
  now?: () => number;
}

function defaultCachePath(): string {
  return join(getCcHomePath(), 'module-catalog-cache.json');
}

function readCache(path: string): CatalogCache | null {
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8')) as CatalogCache;
    return raw.catalog ? { fetchedAt: raw.fetchedAt, catalog: validateCatalog(raw.catalog) } : null;
  } catch {
    return null;
  }
}

/** Fetch the module catalog (5s timeout, 24h cache, stale-cache fallback on network failure). */
export async function fetchCatalog(opts: FetchCatalogOptions = {}): Promise<ModuleCatalog> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const url = opts.url ?? CATALOG_URL;
  const cachePath = opts.cachePath ?? defaultCachePath();
  const now = opts.now ?? Date.now;

  const cache = readCache(cachePath);
  if (cache) {
    const age = now() - Date.parse(cache.fetchedAt);
    if (!Number.isNaN(age) && age < CACHE_TTL_MS) return cache.catalog;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const catalog = validateCatalog(await res.json());
    try {
      writeFileSync(cachePath, JSON.stringify({ fetchedAt: new Date(now()).toISOString(), catalog }, null, 2), 'utf-8');
    } catch {
      // Cache write is best-effort.
    }
    return catalog;
  } catch (err) {
    if (err instanceof CatalogError) throw err; // validation failures are never masked by cache fallback
    if (cache) return cache.catalog; // stale cache beats no catalog
    const msg = err instanceof Error ? err.message : String(err);
    throw new CatalogError('CATALOG_UNREACHABLE', `Could not fetch the module catalog (${msg}). Check your connection and try again.`);
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/channel-catalog.test.ts --root packages/command-and-control`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/command-and-control/src/channel packages/command-and-control/tests/channel-catalog.test.ts
git commit -m "feat(cc): module-channel catalog primitives — sha256, validation, cached fetch (Task 1)"
```

---

### Task 2: Installed-modules store + pending-request store

**Files:**
- Create: `packages/command-and-control/src/channel/installed.ts`
- Create: `packages/command-and-control/src/channel/pending.ts`
- Test: `packages/command-and-control/tests/channel-stores.test.ts`

**Interfaces:**
- Consumes: `getCcHomePath()`.
- Produces: `interface InstalledModuleEntry { id: string; version: string; sha256: string; installedAt: string; previous?: { version: string; sha256: string } }`; `interface InstalledModulesFile { modules: Record<string, InstalledModuleEntry> }`; `getModulesRoot(): string`; `artifactPath(id: string, version: string): string` (= `<ccHome>/modules/<id>/<version>/module.mjs`); `getTmpDownloadDir(): string`; `loadInstalledModules(): InstalledModulesFile`; `saveInstalledModules(f: InstalledModulesFile): string`. From `pending.ts`: `interface PendingRequests { requestedAt?: string; modules: string[] }`; `loadPendingRequests(): PendingRequests`; `savePendingRequests(p: PendingRequests): string`; `removePendingModule(id: string): void`; `clearPendingRequests(): void`; `getPendingPath(): string`.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/command-and-control/tests/channel-stores.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join, sep } from 'node:path';
import { tmpdir } from 'node:os';

let home: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'cc-home-'));
  process.env.CC_HOME = home; // MUST be set before any store touch (lesson 045de35)
});
afterEach(() => {
  delete process.env.CC_HOME;
  rmSync(home, { recursive: true, force: true });
});

describe('installed-modules store', () => {
  it('returns empty on missing or corrupt file', async () => {
    const { loadInstalledModules } = await import('../src/channel/installed.js');
    expect(loadInstalledModules()).toEqual({ modules: {} });
    writeFileSync(join(home, 'installed-modules.json'), '{not json');
    expect(loadInstalledModules()).toEqual({ modules: {} });
  });
  it('round-trips atomically and leaves no tmp file', async () => {
    const { loadInstalledModules, saveInstalledModules } = await import('../src/channel/installed.js');
    const entry = { id: 'announcements', version: '1.0.0', sha256: 'a'.repeat(64), installedAt: '2026-07-11T00:00:00Z' };
    saveInstalledModules({ modules: { announcements: entry } });
    expect(loadInstalledModules().modules.announcements).toEqual(entry);
    expect(existsSync(join(home, 'installed-modules.json.tmp'))).toBe(false);
  });
  it('artifactPath nests id/version under <ccHome>/modules', async () => {
    const { artifactPath } = await import('../src/channel/installed.js');
    expect(artifactPath('announcements', '1.0.0'))
      .toBe([home, 'modules', 'announcements', '1.0.0', 'module.mjs'].join(sep));
  });
});

describe('pending-request store', () => {
  it('tolerates missing/corrupt file as empty', async () => {
    const { loadPendingRequests } = await import('../src/channel/pending.js');
    expect(loadPendingRequests()).toEqual({ modules: [] });
    writeFileSync(join(home, 'pending-module-installs.json'), 'garbage');
    expect(loadPendingRequests()).toEqual({ modules: [] });
  });
  it('removePendingModule prunes one id; clearPendingRequests deletes the file', async () => {
    const { loadPendingRequests, savePendingRequests, removePendingModule, clearPendingRequests, getPendingPath } =
      await import('../src/channel/pending.js');
    savePendingRequests({ requestedAt: '2026-07-11T00:00:00Z', modules: ['announcements', 'other'] });
    removePendingModule('announcements');
    expect(loadPendingRequests().modules).toEqual(['other']);
    clearPendingRequests();
    expect(existsSync(getPendingPath())).toBe(false);
    expect(loadPendingRequests()).toEqual({ modules: [] });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/channel-stores.test.ts --root packages/command-and-control`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement both stores**

```ts
// packages/command-and-control/src/channel/installed.ts
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getCcHomePath } from '../kb/config.js';

export interface InstalledModuleEntry {
  id: string;
  version: string;
  sha256: string;
  installedAt: string;
  /** Retained on upgrade until the new version loads successfully once (spec §7 step 6, §9). */
  previous?: { version: string; sha256: string };
}

export interface InstalledModulesFile {
  modules: Record<string, InstalledModuleEntry>;
}

export function getInstalledModulesPath(): string {
  return join(getCcHomePath(), 'installed-modules.json');
}

export function getModulesRoot(): string {
  return join(getCcHomePath(), 'modules');
}

export function getTmpDownloadDir(): string {
  return join(getModulesRoot(), '.tmp');
}

export function artifactPath(id: string, version: string): string {
  return join(getModulesRoot(), id, version, 'module.mjs');
}

/** Tolerant load — missing/corrupt returns empty (the server must always start). */
export function loadInstalledModules(): InstalledModulesFile {
  const path = getInstalledModulesPath();
  if (!existsSync(path)) return { modules: {} };
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as InstalledModulesFile;
    return parsed.modules ? parsed : { modules: {} };
  } catch {
    return { modules: {} };
  }
}

/** Atomic write (tmp + rename, 0o600) — mirrors saveModuleManifest. */
export function saveInstalledModules(file: InstalledModulesFile): string {
  const home = getCcHomePath();
  mkdirSync(home, { recursive: true });
  const path = getInstalledModulesPath();
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(file, null, 2), { encoding: 'utf-8', mode: 0o600 });
  renameSync(tmp, path);
  return path;
}
```

```ts
// packages/command-and-control/src/channel/pending.ts
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getCcHomePath } from '../kb/config.js';

/** Written by the GUI installer picker; consumed here. The file is a REQUEST,
 *  never an authorization — installs still require the chat confirm gate. */
export interface PendingRequests {
  requestedAt?: string;
  modules: string[];
}

export function getPendingPath(): string {
  return join(getCcHomePath(), 'pending-module-installs.json');
}

export function loadPendingRequests(): PendingRequests {
  const path = getPendingPath();
  if (!existsSync(path)) return { modules: [] };
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as PendingRequests;
    return Array.isArray(parsed.modules) ? parsed : { modules: [] };
  } catch {
    return { modules: [] };
  }
}

export function savePendingRequests(p: PendingRequests): string {
  const home = getCcHomePath();
  mkdirSync(home, { recursive: true });
  const path = getPendingPath();
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(p, null, 2), { encoding: 'utf-8', mode: 0o600 });
  renameSync(tmp, path);
  return path;
}

export function removePendingModule(id: string): void {
  const current = loadPendingRequests();
  if (!current.modules.includes(id)) return;
  const modules = current.modules.filter((m) => m !== id);
  if (modules.length === 0) {
    clearPendingRequests();
    return;
  }
  savePendingRequests({ ...current, modules });
}

export function clearPendingRequests(): void {
  rmSync(getPendingPath(), { force: true });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/channel-stores.test.ts --root packages/command-and-control`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/command-and-control/src/channel packages/command-and-control/tests/channel-stores.test.ts
git commit -m "feat(cc): installed-modules + pending-request stores, atomic 0o600 (Task 2)"
```

---

### Task 3: The install engine — `installModule` / `uninstallModule`

**Files:**
- Create: `packages/command-and-control/src/channel/install.ts`
- Test: `packages/command-and-control/tests/channel-install.test.ts`

**Interfaces:**
- Consumes: Task 1 (`fetchCatalog`, `CatalogEntry`, `CatalogError`, `sha256File`), Task 2 stores, `compareVersions`/`getInstalledVersion` from `../update/check.js`, `loadModuleManifest`/`saveModuleManifest` from `../modules/manifest.js`, `knownModuleIds` from `../modules/registry.js`.
- Produces: `installModule(args: { moduleId: string; confirm?: boolean }, deps?: InstallDeps): Promise<Record<string, unknown>>` where `InstallDeps { fetchImpl?: typeof fetch; catalog?: ModuleCatalog; hostVersion?: string }`. Returns `{ preview: true, ... }` without `confirm`, `{ installed: true, id, version, note }` on success, or `{ error: '<CODE>', message, fix? }` on refusal — codes: `MODULE_NOT_IN_CATALOG`, `ALREADY_INSTALLED`, `HOST_TOO_OLD`, `DOWNLOAD_FAILED`, `HASH_MISMATCH`, plus `CatalogError` codes passed through as `{ error: code, message }`. Also `uninstallModule(args: { moduleId: string }, deps?: { knownIds?: string[] }): Record<string, unknown>` — codes `BUNDLED_MODULE`, `NOT_INSTALLED`, success `{ uninstalled: true, id }`.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/command-and-control/tests/channel-install.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

const ARTIFACT = `export default { id: 'announcements', name: 'A', description: 'd', version: '1.0.0', tools: [] };\n`;
const ARTIFACT_SHA = createHash('sha256').update(ARTIFACT).digest('hex');

function catalogWith(overrides: Record<string, unknown> = {}) {
  return {
    catalogVersion: 1,
    modules: [{
      id: 'announcements', name: 'Announcements Auditor', description: 'Audit scheduled announcements.',
      version: '1.0.0', minHostVersion: '2.0.0',
      artifactUrl: 'https://example.invalid/module-announcements-1.0.0.mjs',
      sha256: ARTIFACT_SHA, sizeBytes: ARTIFACT.length, ...overrides,
    }],
  };
}
const artifactFetch: typeof fetch = (async () => new Response(ARTIFACT, { status: 200 })) as unknown as typeof fetch;

let home: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'cc-install-'));
  process.env.CC_HOME = home;
});
afterEach(() => {
  delete process.env.CC_HOME;
  rmSync(home, { recursive: true, force: true });
});

describe('installModule', () => {
  it('previews without side effects when confirm is absent', async () => {
    const { installModule } = await import('../src/channel/install.js');
    const res = await installModule({ moduleId: 'announcements' }, { catalog: catalogWith(), hostVersion: '2.0.0' });
    expect(res.preview).toBe(true);
    expect(res.sha256).toBe(ARTIFACT_SHA);
    expect(existsSync(join(home, 'modules'))).toBe(false);
    expect(existsSync(join(home, 'installed-modules.json'))).toBe(false);
  });

  it('installs on confirm: verified artifact in place, record written, module enabled, no tmp left', async () => {
    const { installModule } = await import('../src/channel/install.js');
    const { artifactPath, loadInstalledModules } = await import('../src/channel/installed.js');
    const { loadModuleManifest } = await import('../src/modules/manifest.js');
    const res = await installModule(
      { moduleId: 'announcements', confirm: true },
      { catalog: catalogWith(), hostVersion: '2.0.0', fetchImpl: artifactFetch },
    );
    expect(res.installed).toBe(true);
    const path = artifactPath('announcements', '1.0.0');
    expect(readFileSync(path, 'utf-8')).toBe(ARTIFACT);
    expect(loadInstalledModules().modules.announcements.sha256).toBe(ARTIFACT_SHA);
    expect(loadModuleManifest().modules.announcements?.enabled).toBe(true);
    expect(readdirSync(join(home, 'modules', '.tmp'))).toEqual([]);
  });

  it('refuses a hash mismatch fail-closed: nothing installed, tmp deleted', async () => {
    const { installModule } = await import('../src/channel/install.js');
    const res = await installModule(
      { moduleId: 'announcements', confirm: true },
      { catalog: catalogWith({ sha256: 'b'.repeat(64) }), hostVersion: '2.0.0', fetchImpl: artifactFetch },
    );
    expect(res.error).toBe('HASH_MISMATCH');
    expect(String(res.message)).toContain('b'.repeat(64));
    expect(String(res.message)).toContain(ARTIFACT_SHA);
    expect(existsSync(join(home, 'modules', 'announcements'))).toBe(false);
    expect(readdirSync(join(home, 'modules', '.tmp'))).toEqual([]);
  });

  it('refuses when the host is too old', async () => {
    const { installModule } = await import('../src/channel/install.js');
    const res = await installModule(
      { moduleId: 'announcements', confirm: true },
      { catalog: catalogWith(), hostVersion: '1.11.1', fetchImpl: artifactFetch },
    );
    expect(res.error).toBe('HOST_TOO_OLD');
  });

  it('upgrade retains the previous version entry + directory for rollback', async () => {
    const { installModule } = await import('../src/channel/install.js');
    const { loadInstalledModules, artifactPath } = await import('../src/channel/installed.js');
    await installModule({ moduleId: 'announcements', confirm: true },
      { catalog: catalogWith(), hostVersion: '2.0.0', fetchImpl: artifactFetch });
    const v2 = ARTIFACT.replace("version: '1.0.0'", "version: '1.1.0'");
    const v2sha = createHash('sha256').update(v2).digest('hex');
    const v2fetch: typeof fetch = (async () => new Response(v2, { status: 200 })) as unknown as typeof fetch;
    const res = await installModule({ moduleId: 'announcements', confirm: true },
      { catalog: catalogWith({ version: '1.1.0', sha256: v2sha, sizeBytes: v2.length }), hostVersion: '2.0.0', fetchImpl: v2fetch });
    expect(res.installed).toBe(true);
    const rec = loadInstalledModules().modules.announcements;
    expect(rec.version).toBe('1.1.0');
    expect(rec.previous).toEqual({ version: '1.0.0', sha256: ARTIFACT_SHA });
    expect(existsSync(artifactPath('announcements', '1.0.0'))).toBe(true);
  });

  it('reports ALREADY_INSTALLED for same-or-older catalog version', async () => {
    const { installModule } = await import('../src/channel/install.js');
    await installModule({ moduleId: 'announcements', confirm: true },
      { catalog: catalogWith(), hostVersion: '2.0.0', fetchImpl: artifactFetch });
    const res = await installModule({ moduleId: 'announcements', confirm: true },
      { catalog: catalogWith(), hostVersion: '2.0.0', fetchImpl: artifactFetch });
    expect(res.error).toBe('ALREADY_INSTALLED');
  });

  it('unknown module id → MODULE_NOT_IN_CATALOG', async () => {
    const { installModule } = await import('../src/channel/install.js');
    const res = await installModule({ moduleId: 'nope' }, { catalog: catalogWith(), hostVersion: '2.0.0' });
    expect(res.error).toBe('MODULE_NOT_IN_CATALOG');
  });
});

describe('uninstallModule', () => {
  it('refuses bundled modules', async () => {
    const { uninstallModule } = await import('../src/channel/install.js');
    const res = uninstallModule({ moduleId: 'video' }, { knownIds: ['video'] });
    expect(res.error).toBe('BUNDLED_MODULE');
  });
  it('removes an installed module: artifact dir, record, and manifest enablement', async () => {
    const { installModule, uninstallModule } = await import('../src/channel/install.js');
    const { loadInstalledModules } = await import('../src/channel/installed.js');
    const { loadModuleManifest } = await import('../src/modules/manifest.js');
    await installModule({ moduleId: 'announcements', confirm: true },
      { catalog: catalogWith(), hostVersion: '2.0.0', fetchImpl: artifactFetch });
    const res = uninstallModule({ moduleId: 'announcements' }, { knownIds: ['video'] });
    expect(res.uninstalled).toBe(true);
    expect(loadInstalledModules().modules.announcements).toBeUndefined();
    expect(existsSync(join(home, 'modules', 'announcements'))).toBe(false);
    expect(loadModuleManifest().modules.announcements?.enabled).toBe(false);
  });
  it('NOT_INSTALLED for unknown id', async () => {
    const { uninstallModule } = await import('../src/channel/install.js');
    expect(uninstallModule({ moduleId: 'ghost' }, { knownIds: [] }).error).toBe('NOT_INSTALLED');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/channel-install.test.ts --root packages/command-and-control`
Expected: FAIL — `install.js` not found.

- [ ] **Step 3: Implement the engine**

```ts
// packages/command-and-control/src/channel/install.ts
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fetchCatalog, CatalogError, type ModuleCatalog, type CatalogEntry } from './catalog.js';
import { sha256File } from './hash.js';
import {
  artifactPath, getModulesRoot, getTmpDownloadDir,
  loadInstalledModules, saveInstalledModules,
} from './installed.js';
import { removePendingModule } from './pending.js';
import { compareVersions, getInstalledVersion } from '../update/check.js';
import { loadModuleManifest, saveModuleManifest } from '../modules/manifest.js';
import { knownModuleIds } from '../modules/registry.js';

const DOWNLOAD_TIMEOUT_MS = 60_000;

export interface InstallDeps {
  fetchImpl?: typeof fetch;
  catalog?: ModuleCatalog;
  hostVersion?: string;
}

function refusal(error: string, message: string, fix?: string): Record<string, unknown> {
  return fix ? { error, message, fix } : { error, message };
}

function previewOf(entry: CatalogEntry, action: 'install' | 'upgrade'): Record<string, unknown> {
  return {
    preview: true,
    action,
    id: entry.id,
    name: entry.name,
    description: entry.description,
    version: entry.version,
    sizeBytes: entry.sizeBytes,
    source: entry.artifactUrl,
    sha256: entry.sha256,
    handles: entry.handles ?? [],
    note: 'Nothing has been downloaded. Call install_module again with confirm: true to install.',
  };
}

async function downloadTo(url: string, dest: string, fetchImpl: typeof fetch): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, bytes, { mode: 0o600 });
  } finally {
    clearTimeout(timer);
  }
}

/** The single fail-closed install choke point (spec §7). */
export async function installModule(
  args: { moduleId: string; confirm?: boolean },
  deps: InstallDeps = {},
): Promise<Record<string, unknown>> {
  let catalog: ModuleCatalog;
  try {
    catalog = deps.catalog ?? (await fetchCatalog({ fetchImpl: deps.fetchImpl }));
  } catch (err) {
    if (err instanceof CatalogError) return refusal(err.code, err.message);
    throw err;
  }

  const entry = catalog.modules.find((m) => m.id === args.moduleId);
  if (!entry) {
    return refusal('MODULE_NOT_IN_CATALOG', `No module '${args.moduleId}' in the catalog.`,
      'Run browse_module_catalog to see what is available.');
  }

  const installed = loadInstalledModules();
  const existing = installed.modules[entry.id];
  if (existing && compareVersions(existing.version, entry.version) >= 0) {
    return refusal('ALREADY_INSTALLED',
      `Module '${entry.id}' v${existing.version} is already installed (catalog has v${entry.version}).`);
  }

  const host = deps.hostVersion ?? getInstalledVersion();
  if (compareVersions(host, entry.minHostVersion) < 0) {
    return refusal('HOST_TOO_OLD',
      `Module '${entry.id}' v${entry.version} needs toolchain v${entry.minHostVersion}+ (you have v${host}).`,
      'Update the toolchain first (Canvas Toolchain Updater shortcut), then retry.');
  }

  if (!args.confirm) return previewOf(entry, existing ? 'upgrade' : 'install');

  // Download → verify → place. Any failure deletes temp state and refuses.
  const tmpDir = getTmpDownloadDir();
  mkdirSync(tmpDir, { recursive: true });
  const tmpFile = join(tmpDir, `${entry.id}-${entry.version}.download`);
  try {
    await downloadTo(entry.artifactUrl, tmpFile, deps.fetchImpl ?? fetch);
  } catch (err) {
    rmSync(tmpFile, { force: true });
    const msg = err instanceof Error ? err.message : String(err);
    return refusal('DOWNLOAD_FAILED', `Could not download ${entry.artifactUrl} (${msg}).`);
  }

  const actual = await sha256File(tmpFile);
  if (actual !== entry.sha256) {
    rmSync(tmpFile, { force: true });
    return refusal('HASH_MISMATCH',
      `Artifact hash mismatch for '${entry.id}' v${entry.version}: expected ${entry.sha256}, got ${actual}. ` +
      'The download was NOT installed. This can indicate a corrupted or tampered artifact — do not retry blindly; ' +
      'check https://github.com/Ryfter/canvas-toolchain for a catalog correction.');
  }

  const dest = artifactPath(entry.id, entry.version);
  mkdirSync(dirname(dest), { recursive: true });
  renameSync(tmpFile, dest);

  installed.modules[entry.id] = {
    id: entry.id,
    version: entry.version,
    sha256: entry.sha256,
    installedAt: new Date().toISOString(),
    ...(existing ? { previous: { version: existing.version, sha256: existing.sha256 } } : {}),
  };
  saveInstalledModules(installed);

  const manifest = loadModuleManifest();
  manifest.modules[entry.id] = { ...manifest.modules[entry.id], enabled: true };
  saveModuleManifest(manifest);

  removePendingModule(entry.id);

  return {
    installed: true,
    id: entry.id,
    version: entry.version,
    note: 'Takes effect on the next Claude reconnect/restart (modules load at startup).',
  };
}

export function uninstallModule(
  args: { moduleId: string },
  deps: { knownIds?: string[] } = {},
): Record<string, unknown> {
  const knownIds = deps.knownIds ?? knownModuleIds();
  if (knownIds.includes(args.moduleId)) {
    return refusal('BUNDLED_MODULE',
      `'${args.moduleId}' is a bundled module and cannot be uninstalled.`,
      `Disable it instead: set_module_enabled({ moduleId: '${args.moduleId}', enabled: false }).`);
  }
  const installed = loadInstalledModules();
  if (!installed.modules[args.moduleId]) {
    return refusal('NOT_INSTALLED', `Module '${args.moduleId}' is not installed.`);
  }
  rmSync(join(getModulesRoot(), args.moduleId), { recursive: true, force: true });
  delete installed.modules[args.moduleId];
  saveInstalledModules(installed);

  const manifest = loadModuleManifest();
  manifest.modules[args.moduleId] = { ...manifest.modules[args.moduleId], enabled: false };
  saveModuleManifest(manifest);

  return { uninstalled: true, id: args.moduleId, note: 'Takes effect on the next Claude reconnect/restart.' };
}
```

Note: `set_module_enabled`'s existing input property name must be checked at implementation time (`grep -n "set_module_enabled" packages/command-and-control/src/index.ts`) and the `fix` string in `uninstallModule` adjusted to the real parameter names.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/channel-install.test.ts --root packages/command-and-control`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/command-and-control/src/channel/install.ts packages/command-and-control/tests/channel-install.test.ts
git commit -m "feat(cc): fail-closed module install engine with two-call gate (Task 3)"
```

---

### Task 4: Loader phase 2 — dynamic artifacts with re-hash, precedence, retention prune

**Files:**
- Modify: `packages/command-and-control/src/modules/registry.ts`
- Test: `packages/command-and-control/tests/channel-loader.test.ts` (new; existing registry tests must stay green)

**Interfaces:**
- Consumes: Task 2 (`loadInstalledModules`, `saveInstalledModules`, `artifactPath`, `getModulesRoot`), Task 1 (`sha256File`), `compareVersions`.
- Produces: `loadModules(known?)` keeps its exact signature and `LoadedModules` return shape (callers in `index.ts` are untouched). New internal export for tests: `loadInstalledArtifacts(manifest: ModuleManifest): Promise<Map<string, CanvasToolchainModule>>`.

- [ ] **Step 1: Write the failing tests**

The fixture artifact is a hand-written single-file ESM module — no build step needed:

```ts
// packages/command-and-control/tests/channel-loader.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

function moduleSource(id: string, version: string, toolName: string): string {
  return `export default { id: '${id}', name: 'Fixture', description: 'test', version: '${version}',
  tools: [{ schema: { name: '${toolName}', description: 'fixture', inputSchema: { type: 'object' } },
            handler: async () => ({ content: [{ type: 'text', text: 'ok' }] }) }] };\n`;
}

let home: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'cc-loader-'));
  process.env.CC_HOME = home;
});
afterEach(() => {
  delete process.env.CC_HOME;
  rmSync(home, { recursive: true, force: true });
});

async function placeArtifact(id: string, version: string, source: string, recordSha?: string) {
  const { artifactPath } = await import('../src/channel/installed.js');
  const { loadInstalledModules, saveInstalledModules } = await import('../src/channel/installed.js');
  const p = artifactPath(id, version);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, source);
  const file = loadInstalledModules();
  file.modules[id] = {
    id, version, installedAt: '2026-07-11T00:00:00Z',
    sha256: recordSha ?? createHash('sha256').update(source).digest('hex'),
  };
  saveInstalledModules(file);
}

describe('dynamic artifact loading', () => {
  it('loads an enabled installed artifact and registers its tools', async () => {
    await placeArtifact('fixture', '1.0.0', moduleSource('fixture', '1.0.0', 'fixture_tool'));
    const { saveModuleManifest } = await import('../src/modules/manifest.js');
    saveModuleManifest({ modules: { fixture: { enabled: true } } });
    const { loadModules } = await import('../src/modules/registry.js');
    const loaded = await loadModules({}); // no static modules
    expect(loaded.handlers.has('fixture_tool')).toBe(true);
  });

  it('skips (never loads) an artifact whose bytes no longer match the recorded sha256', async () => {
    const src = moduleSource('fixture', '1.0.0', 'fixture_tool');
    await placeArtifact('fixture', '1.0.0', src, createHash('sha256').update('something else').digest('hex'));
    const { saveModuleManifest } = await import('../src/modules/manifest.js');
    saveModuleManifest({ modules: { fixture: { enabled: true } } });
    const { loadModules } = await import('../src/modules/registry.js');
    const loaded = await loadModules({});
    expect(loaded.handlers.has('fixture_tool')).toBe(false);
  });

  it('skips a contract-violating artifact fail-soft', async () => {
    await placeArtifact('bad', '1.0.0', `export default { nope: true };\n`);
    const { saveModuleManifest } = await import('../src/modules/manifest.js');
    saveModuleManifest({ modules: { bad: { enabled: true } } });
    const { loadModules } = await import('../src/modules/registry.js');
    const loaded = await loadModules({});
    expect(loaded.tools).toHaveLength(0);
  });

  it('ignores disabled installed artifacts', async () => {
    await placeArtifact('fixture', '1.0.0', moduleSource('fixture', '1.0.0', 'fixture_tool'));
    const { saveModuleManifest } = await import('../src/modules/manifest.js');
    saveModuleManifest({ modules: { fixture: { enabled: false } } });
    const { loadModules } = await import('../src/modules/registry.js');
    expect((await loadModules({})).handlers.has('fixture_tool')).toBe(false);
  });

  it('semver-newer installed artifact wins over a bundled module with the same id', async () => {
    await placeArtifact('dup', '2.0.0', moduleSource('dup', '2.0.0', 'dup_tool_new'));
    const { saveModuleManifest } = await import('../src/modules/manifest.js');
    saveModuleManifest({ modules: { dup: { enabled: true } } });
    const bundled = {
      dup: async () => ({
        id: 'dup', name: 'Bundled', description: 'old', version: '1.0.0',
        tools: [{ schema: { name: 'dup_tool_old', description: 'x', inputSchema: { type: 'object' as const } },
                  handler: async () => ({ content: [] }) }],
      }),
    };
    const { loadModules } = await import('../src/modules/registry.js');
    const loaded = await loadModules(bundled as never);
    expect(loaded.handlers.has('dup_tool_new')).toBe(true);
    expect(loaded.handlers.has('dup_tool_old')).toBe(false);
  });

  it('bundled wins when versions are equal or bundled is newer', async () => {
    await placeArtifact('dup', '1.0.0', moduleSource('dup', '1.0.0', 'dup_tool_installed'));
    const { saveModuleManifest } = await import('../src/modules/manifest.js');
    saveModuleManifest({ modules: { dup: { enabled: true } } });
    const bundled = {
      dup: async () => ({
        id: 'dup', name: 'Bundled', description: 'same', version: '1.0.0',
        tools: [{ schema: { name: 'dup_tool_bundled', description: 'x', inputSchema: { type: 'object' as const } },
                  handler: async () => ({ content: [] }) }],
      }),
    };
    const { loadModules } = await import('../src/modules/registry.js');
    const loaded = await loadModules(bundled as never);
    expect(loaded.handlers.has('dup_tool_bundled')).toBe(true);
    expect(loaded.handlers.has('dup_tool_installed')).toBe(false);
  });

  it('prunes the retained previous version after the new version loads successfully once', async () => {
    const oldSrc = moduleSource('fixture', '1.0.0', 'fixture_old');
    const newSrc = moduleSource('fixture', '1.1.0', 'fixture_new');
    const { artifactPath, loadInstalledModules, saveInstalledModules } = await import('../src/channel/installed.js');
    for (const [v, s] of [['1.0.0', oldSrc], ['1.1.0', newSrc]] as const) {
      const p = artifactPath('fixture', v);
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, s);
    }
    saveInstalledModules({ modules: { fixture: {
      id: 'fixture', version: '1.1.0', installedAt: '2026-07-11T00:00:00Z',
      sha256: createHash('sha256').update(newSrc).digest('hex'),
      previous: { version: '1.0.0', sha256: createHash('sha256').update(oldSrc).digest('hex') },
    } } });
    const { saveModuleManifest } = await import('../src/modules/manifest.js');
    saveModuleManifest({ modules: { fixture: { enabled: true } } });
    const { loadModules } = await import('../src/modules/registry.js');
    const loaded = await loadModules({});
    expect(loaded.handlers.has('fixture_new')).toBe(true);
    expect(existsSync(artifactPath('fixture', '1.0.0'))).toBe(false);
    expect(loadInstalledModules().modules.fixture.previous).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/channel-loader.test.ts --root packages/command-and-control`
Expected: FAIL — dynamic artifacts are not loaded (handlers missing).

- [ ] **Step 3: Extend `registry.ts`**

Replace the body of `loadModules` and add the dynamic phase (keep `KNOWN_MODULES`, `knownModuleIds`, `LoadedModules` exactly as they are):

```ts
// packages/command-and-control/src/modules/registry.ts — additions/replacement
import { existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ModuleManifest } from '@canvas-toolchain/module-contract';
import { sha256File } from '../channel/hash.js';
import { artifactPath, getModulesRoot, loadInstalledModules, saveInstalledModules } from '../channel/installed.js';
import { compareVersions } from '../update/check.js';

/** Load installed channel artifacts: enabled + re-hash verified + contract checked.
 *  Every failure mode is fail-soft (warn + skip); the host always starts. */
export async function loadInstalledArtifacts(
  manifest: ModuleManifest,
): Promise<Map<string, CanvasToolchainModule>> {
  const out = new Map<string, CanvasToolchainModule>();
  const installed = loadInstalledModules();
  for (const [id, rec] of Object.entries(installed.modules)) {
    if (!manifest.modules[id]?.enabled) continue;
    const path = artifactPath(id, rec.version);
    try {
      if (!existsSync(path)) {
        console.error(`[modules] installed artifact missing for '${id}' v${rec.version}; skipping.`);
        continue;
      }
      const actual = await sha256File(path);
      if (actual !== rec.sha256) {
        console.error(
          `[modules] '${id}' v${rec.version} failed integrity re-check (expected ${rec.sha256}, got ${actual}); ` +
          `NOT loaded. Reinstall with install_module, or roll back to a retained previous version.`,
        );
        continue;
      }
      const mod = (await import(pathToFileURL(path).href)).default as unknown;
      if (!isCanvasToolchainModule(mod)) {
        console.error(`[modules] installed '${id}' did not satisfy the module contract; skipping.`);
        continue;
      }
      out.set(id, mod);
      // Successful load of the current version → prune the retained previous version (spec §9).
      if (rec.previous) {
        rmSync(dirname(artifactPath(id, rec.previous.version)), { recursive: true, force: true });
        const file = loadInstalledModules();
        if (file.modules[id]) {
          delete file.modules[id].previous;
          saveInstalledModules(file);
        }
      }
    } catch (err) {
      console.error(`[modules] failed to load installed '${id}'; skipping. ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return out;
}

export async function loadModules(
  known: Record<string, () => Promise<CanvasToolchainModule>> = KNOWN_MODULES,
): Promise<LoadedModules> {
  const manifest = loadModuleManifest();
  const active = new Map<string, CanvasToolchainModule>();

  // Phase 1: bundled modules (unchanged semantics).
  for (const [id, entry] of Object.entries(manifest.modules)) {
    if (!entry?.enabled) continue;
    const loader = known[id];
    if (!loader) continue;
    try {
      const mod = await loader();
      if (!isCanvasToolchainModule(mod)) {
        console.error(`[modules] '${id}' did not satisfy the module contract; skipping.`);
        continue;
      }
      active.set(id, mod);
    } catch (err) {
      console.error(`[modules] failed to load '${id}'; skipping. ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Phase 2: installed channel artifacts. Semver-newer wins on id collision (spec §8).
  const dynamic = await loadInstalledArtifacts(manifest);
  for (const [id, mod] of dynamic) {
    const bundled = active.get(id);
    if (bundled && compareVersions(mod.version, bundled.version) <= 0) {
      console.error(`[modules] '${id}': bundled v${bundled.version} >= installed v${mod.version}; using bundled.`);
      continue;
    }
    if (bundled) {
      console.error(`[modules] '${id}': installed v${mod.version} > bundled v${bundled.version}; using installed.`);
    }
    active.set(id, mod);
  }

  const tools: Tool[] = [];
  const handlers = new Map<string, (args: unknown) => Promise<CallToolResult>>();
  for (const mod of active.values()) {
    for (const t of mod.tools) {
      tools.push(t.schema);
      handlers.set(t.schema.name, t.handler);
    }
  }
  return { tools, handlers };
}
```

(Merge the new imports with the file's existing imports; `isCanvasToolchainModule`, `loadModuleManifest`, `Tool`, `CallToolResult`, `CanvasToolchainModule` are already imported.)

- [ ] **Step 4: Run the new tests AND the existing registry tests**

Run: `npx vitest run tests/channel-loader.test.ts --root packages/command-and-control`
Expected: PASS (7 tests).
Run: `npm test --workspace=packages/command-and-control`
Expected: full suite green — the phase-1 restructure must not change bundled-module behavior.

- [ ] **Step 5: Commit**

```bash
git add packages/command-and-control/src/modules/registry.ts packages/command-and-control/tests/channel-loader.test.ts
git commit -m "feat(cc): loader phase 2 — verified dynamic artifacts, semver precedence, retention prune (Task 4)"
```

---

### Task 5: Channel notices + the three MCP tools wired into `index.ts`

**Files:**
- Create: `packages/command-and-control/src/channel/notices.ts`
- Create: `packages/command-and-control/src/tools/module_channel_tools.ts`
- Modify: `packages/command-and-control/src/index.ts` (tool schemas in ListTools; dispatch cases; startup call; notice append at `index.ts:1040`)
- Test: `packages/command-and-control/tests/channel-notices.test.ts`, `packages/command-and-control/tests/module-channel-tools.test.ts`

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces: `checkChannelNotices(opts?: { fetchImpl?: typeof fetch; catalog?: ModuleCatalog }): Promise<void>`; `getChannelNotices(): string | null`; `resetChannelNotices(): void`. Tool handlers: `browseModuleCatalog(args: { clearPending?: boolean }, deps?): Promise<Record<string, unknown>>`, plus re-exported `installModule`/`uninstallModule` from Task 3. MCP tool names: `browse_module_catalog`, `install_module`, `uninstall_module`.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/command-and-control/tests/channel-notices.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let home: string;
beforeEach(async () => {
  home = mkdtempSync(join(tmpdir(), 'cc-notices-'));
  process.env.CC_HOME = home;
  const { resetChannelNotices } = await import('../src/channel/notices.js');
  resetChannelNotices();
});
afterEach(() => {
  delete process.env.CC_HOME;
  rmSync(home, { recursive: true, force: true });
});

const CATALOG = { catalogVersion: 1, modules: [{
  id: 'announcements', name: 'Announcements Auditor', description: 'd', version: '1.1.0',
  minHostVersion: '2.0.0', artifactUrl: 'https://example.invalid/a.mjs', sha256: 'a'.repeat(64), sizeBytes: 10,
}] };

describe('channel notices', () => {
  it('null when nothing is pending and nothing is outdated', async () => {
    const { checkChannelNotices, getChannelNotices } = await import('../src/channel/notices.js');
    await checkChannelNotices({ catalog: CATALOG });
    expect(getChannelNotices()).toBeNull();
  });
  it('surfaces a pending GUI request for a not-yet-installed module', async () => {
    const { savePendingRequests } = await import('../src/channel/pending.js');
    savePendingRequests({ modules: ['announcements'] });
    const { checkChannelNotices, getChannelNotices } = await import('../src/channel/notices.js');
    await checkChannelNotices({ catalog: CATALOG });
    expect(getChannelNotices()).toContain('Announcements Auditor');
    expect(getChannelNotices()).toContain('install');
  });
  it('surfaces a module update when the catalog is newer than the installed version', async () => {
    const { saveInstalledModules } = await import('../src/channel/installed.js');
    saveInstalledModules({ modules: { announcements: {
      id: 'announcements', version: '1.0.0', sha256: 'a'.repeat(64), installedAt: '2026-07-11T00:00:00Z',
    } } });
    const { checkChannelNotices, getChannelNotices } = await import('../src/channel/notices.js');
    await checkChannelNotices({ catalog: CATALOG });
    expect(getChannelNotices()).toContain('v1.1.0');
  });
  it('pending notice still works when the catalog is unreachable', async () => {
    const { savePendingRequests } = await import('../src/channel/pending.js');
    savePendingRequests({ modules: ['announcements'] });
    const failing: typeof fetch = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
    const { checkChannelNotices, getChannelNotices } = await import('../src/channel/notices.js');
    await checkChannelNotices({ fetchImpl: failing });
    expect(getChannelNotices()).toContain('announcements');
  });
});
```

```ts
// packages/command-and-control/tests/module-channel-tools.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let home: string;
beforeEach(() => { home = mkdtempSync(join(tmpdir(), 'cc-tools-')); process.env.CC_HOME = home; });
afterEach(() => { delete process.env.CC_HOME; rmSync(home, { recursive: true, force: true }); });

const CATALOG = { catalogVersion: 1, modules: [{
  id: 'announcements', name: 'Announcements Auditor', description: 'd', version: '1.0.0',
  minHostVersion: '2.0.0', artifactUrl: 'https://example.invalid/a.mjs', sha256: 'a'.repeat(64), sizeBytes: 10,
}] };

describe('browse_module_catalog handler', () => {
  it('reports per-module status and pending requests', async () => {
    const { savePendingRequests } = await import('../src/channel/pending.js');
    savePendingRequests({ modules: ['announcements'] });
    const { browseModuleCatalog } = await import('../src/tools/module_channel_tools.js');
    const res = await browseModuleCatalog({}, { catalog: CATALOG });
    const rows = res.modules as Array<Record<string, unknown>>;
    expect(rows[0]).toMatchObject({ id: 'announcements', status: 'not installed', pendingRequest: true });
  });
  it('clearPending: true empties the pending file', async () => {
    const { savePendingRequests, getPendingPath } = await import('../src/channel/pending.js');
    savePendingRequests({ modules: ['announcements'] });
    const { browseModuleCatalog } = await import('../src/tools/module_channel_tools.js');
    await browseModuleCatalog({ clearPending: true }, { catalog: CATALOG });
    expect(existsSync(getPendingPath())).toBe(false);
  });
  it('catalog unreachable → structured error, no throw', async () => {
    const failing: typeof fetch = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
    const { browseModuleCatalog } = await import('../src/tools/module_channel_tools.js');
    const res = await browseModuleCatalog({}, { fetchImpl: failing });
    expect(res.error).toBe('CATALOG_UNREACHABLE');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/channel-notices.test.ts tests/module-channel-tools.test.ts --root packages/command-and-control`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement notices + handlers**

```ts
// packages/command-and-control/src/channel/notices.ts
import { fetchCatalog, type ModuleCatalog } from './catalog.js';
import { loadInstalledModules } from './installed.js';
import { loadPendingRequests } from './pending.js';
import { compareVersions } from '../update/check.js';

let channelNotice: string | null = null;

export function resetChannelNotices(): void {
  channelNotice = null;
}

export function getChannelNotices(): string | null {
  return channelNotice;
}

/** Best-effort, never throws. Pending-request notices work even with no catalog;
 *  update notices need the (possibly cached) catalog. */
export async function checkChannelNotices(
  opts: { fetchImpl?: typeof fetch; catalog?: ModuleCatalog } = {},
): Promise<void> {
  const parts: string[] = [];
  const installed = loadInstalledModules();

  let catalog: ModuleCatalog | null = null;
  try {
    catalog = opts.catalog ?? (await fetchCatalog({ fetchImpl: opts.fetchImpl }));
  } catch {
    catalog = null; // offline is fine; skip update notices
  }

  const pending = loadPendingRequests().modules.filter((id) => !installed.modules[id]);
  if (pending.length > 0) {
    const names = pending
      .map((id) => catalog?.modules.find((m) => m.id === id)?.name ?? id)
      .join(', ');
    parts.push(`_You requested ${names} in the installer — say "install ${pending[0]}" to proceed._`);
  }

  if (catalog) {
    for (const rec of Object.values(installed.modules)) {
      const entry = catalog.modules.find((m) => m.id === rec.id);
      if (entry && compareVersions(rec.version, entry.version) < 0) {
        parts.push(`_Module update available: ${rec.id} v${entry.version} — say "install ${rec.id}" to upgrade._`);
      }
    }
  }

  channelNotice = parts.length > 0 ? `\n\n${parts.join('\n')}` : null;
}
```

```ts
// packages/command-and-control/src/tools/module_channel_tools.ts
import { fetchCatalog, CatalogError, type ModuleCatalog } from '../channel/catalog.js';
import { loadInstalledModules } from '../channel/installed.js';
import { loadPendingRequests, clearPendingRequests } from '../channel/pending.js';
import { loadModuleManifest } from '../modules/manifest.js';
import { knownModuleIds } from '../modules/registry.js';
import { compareVersions } from '../update/check.js';

export { installModule } from '../channel/install.js';
export { uninstallModule } from '../channel/install.js';

export interface BrowseDeps { fetchImpl?: typeof fetch; catalog?: ModuleCatalog }

export async function browseModuleCatalog(
  args: { clearPending?: boolean },
  deps: BrowseDeps = {},
): Promise<Record<string, unknown>> {
  if (args.clearPending) clearPendingRequests();

  let catalog: ModuleCatalog;
  try {
    catalog = deps.catalog ?? (await fetchCatalog({ fetchImpl: deps.fetchImpl }));
  } catch (err) {
    if (err instanceof CatalogError) return { error: err.code, message: err.message };
    throw err;
  }

  const installed = loadInstalledModules();
  const manifest = loadModuleManifest();
  const pending = new Set(loadPendingRequests().modules);
  const bundledIds = new Set(knownModuleIds());

  const modules = catalog.modules.map((entry) => {
    const rec = installed.modules[entry.id];
    let status: string;
    if (bundledIds.has(entry.id) && !rec) status = 'bundled';
    else if (!rec) status = 'not installed';
    else if (compareVersions(rec.version, entry.version) < 0) status = `update available (v${rec.version} → v${entry.version})`;
    else status = manifest.modules[entry.id]?.enabled ? 'installed (enabled)' : 'installed (disabled)';
    return {
      id: entry.id,
      name: entry.name,
      description: entry.description,
      catalogVersion: entry.version,
      status,
      pendingRequest: pending.has(entry.id),
    };
  });

  return {
    modules,
    note: 'Install with install_module({ moduleId }) — it previews first and only acts on confirm: true.',
  };
}
```

- [ ] **Step 4: Wire into `index.ts`**

Four edits (follow the file's existing patterns exactly):

1. Imports (near the `loadModules` import at `index.ts:87`):

```ts
import { checkChannelNotices, getChannelNotices } from './channel/notices.js';
import { browseModuleCatalog, installModule, uninstallModule } from './tools/module_channel_tools.js';
```

2. Startup (next to `void checkForUpdates();`):

```ts
void checkChannelNotices();
```

3. ListTools — add three schemas alongside the existing module tools (`list_modules` / `set_module_enabled` block):

```ts
{
  name: 'browse_module_catalog',
  description: 'List the module catalog: what exists, what is installed/enabled, which have updates, and any modules requested from the installer GUI. Read-only. Pass clearPending: true to discard stale installer requests.',
  inputSchema: {
    type: 'object' as const,
    properties: { clearPending: { type: 'boolean', description: 'Discard pending installer-GUI module requests.' } },
  },
},
{
  name: 'install_module',
  description: 'Install (or upgrade) a module from the catalog. Two-call gate: first call previews name/version/size/source/sha256 with NO side effects; call again with confirm: true to download, verify the pinned sha256, and install. Takes effect on the next reconnect.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      moduleId: { type: 'string', description: 'Catalog module id, e.g. "announcements".' },
      confirm: { type: 'boolean', description: 'Set true on the second call to actually install.' },
    },
    required: ['moduleId'],
  },
},
{
  name: 'uninstall_module',
  description: 'Remove a channel-installed module (artifact + record) and disable it. Bundled modules cannot be uninstalled — disable those with set_module_enabled.',
  inputSchema: {
    type: 'object' as const,
    properties: { moduleId: { type: 'string', description: 'Installed module id.' } },
    required: ['moduleId'],
  },
},
```

4. Dispatch — three cases in the CallTool switch. **House idiom: assign the outer `result` and `break`; never early-return** (the shared notice append at `index.ts:1040` must run):

```ts
case 'browse_module_catalog': {
  result = await browseModuleCatalog(args as { clearPending?: boolean });
  break;
}
case 'install_module': {
  result = await installModule(args as { moduleId: string; confirm?: boolean });
  break;
}
case 'uninstall_module': {
  result = uninstallModule(args as { moduleId: string });
  break;
}
```

5. Notice append — change `index.ts:1040-1041` from:

```ts
const notice = getUpdateNotice();
const text = JSON.stringify(result, null, 2) + (notice ?? '');
```

to:

```ts
const notice = (getUpdateNotice() ?? '') + (getChannelNotices() ?? '');
const text = JSON.stringify(result, null, 2) + notice;
```

- [ ] **Step 5: Catalog modules feed `discover_tools` (spec §4 `handles[]`)**

First the failing test — append to `tests/module-channel-tools.test.ts`:

```ts
describe('matchCatalogSuggestions', () => {
  it('suggests a not-installed catalog module whose handles match a detected tool', async () => {
    const { matchCatalogSuggestions } = await import('../src/tools/module_channel_tools.js');
    const catalog = { catalogVersion: 1, modules: [{
      id: 'announcements', name: 'Announcements Auditor', description: 'd', version: '1.0.0',
      minHostVersion: '2.0.0', artifactUrl: 'https://example.invalid/a.mjs',
      sha256: 'a'.repeat(64), sizeBytes: 10, handles: ['announcements'],
    }] };
    const out = matchCatalogSuggestions(['Course Announcements Feed'], catalog, new Set());
    expect(out).toEqual([{
      id: 'announcements', name: 'Announcements Auditor',
      reason: 'detected "Course Announcements Feed" matches handle "announcements"',
      install: 'install_module({ moduleId: "announcements" })',
    }]);
  });
  it('suppresses suggestions for already-installed ids', async () => {
    const { matchCatalogSuggestions } = await import('../src/tools/module_channel_tools.js');
    const catalog = { catalogVersion: 1, modules: [{
      id: 'announcements', name: 'A', description: 'd', version: '1.0.0', minHostVersion: '2.0.0',
      artifactUrl: 'https://example.invalid/a.mjs', sha256: 'a'.repeat(64), sizeBytes: 10, handles: ['announcements'],
    }] };
    expect(matchCatalogSuggestions(['announcements'], catalog, new Set(['announcements']))).toEqual([]);
  });
});
```

Run: `npx vitest run tests/module-channel-tools.test.ts --root packages/command-and-control` → FAIL (function missing). Then add to `src/tools/module_channel_tools.ts`:

```ts
/** Match detected tool names against CATALOG module handles (substring, both directions,
 *  case-insensitive — same spirit as known-tools matching) so discovery can suggest
 *  channel modules, not only bundled ones (spec §4). */
export function matchCatalogSuggestions(
  detectedNames: string[],
  catalog: ModuleCatalog,
  installedOrBundledIds: Set<string>,
): Array<{ id: string; name: string; reason: string; install: string }> {
  const out: Array<{ id: string; name: string; reason: string; install: string }> = [];
  for (const entry of catalog.modules) {
    if (installedOrBundledIds.has(entry.id)) continue;
    for (const handle of entry.handles ?? []) {
      const h = handle.toLowerCase();
      const hit = detectedNames.find((n) => {
        const d = n.toLowerCase();
        return d.includes(h) || h.includes(d);
      });
      if (hit) {
        out.push({
          id: entry.id,
          name: entry.name,
          reason: `detected "${hit}" matches handle "${handle}"`,
          install: `install_module({ moduleId: "${entry.id}" })`,
        });
        break;
      }
    }
  }
  return out;
}
```

Then wire it into `discoverTools` (`src/tools/discover_tools.ts:57-66`) — after the `matchDetected` call, add a best-effort catalog pass and a new report field:

```ts
  let catalogSuggestions: Array<{ id: string; name: string; reason: string; install: string }> = [];
  try {
    const channelCatalog = await fetchCatalog();
    const knownOrInstalled = new Set([
      ...mods.map((m) => m.id),
      ...Object.keys(loadInstalledModules().modules),
    ]);
    catalogSuggestions = matchCatalogSuggestions(
      scan.tools.map((t) => t.rawName), channelCatalog, knownOrInstalled,
    );
  } catch {
    // Offline / no catalog — discovery works exactly as before.
  }
```

Add `catalogSuggestions` to the returned report object and to the `DiscoverToolsReport` type, with imports `fetchCatalog` (`../channel/catalog.js`), `loadInstalledModules` (`../channel/installed.js`), `matchCatalogSuggestions` (`./module_channel_tools.js`). Existing discover-tools tests must stay green (the field is additive and empty when offline).

Run: `npx vitest run tests/module-channel-tools.test.ts --root packages/command-and-control` → PASS.

- [ ] **Step 6: Run tests + build**

Run: `npx vitest run tests/channel-notices.test.ts tests/module-channel-tools.test.ts --root packages/command-and-control`
Expected: PASS (9 tests).
Run: `npm run build --workspace=packages/command-and-control && npm test --workspace=packages/command-and-control`
Expected: build clean, full suite green (including the existing discover-tools suite).

- [ ] **Step 7: Commit**

```bash
git add packages/command-and-control/src packages/command-and-control/tests
git commit -m "feat(cc): browse/install/uninstall module tools + channel notices (Task 5)"
```

---

### Task 6: `module-announcements` — the channel-native proof module

**Files:**
- Create: `packages/module-announcements/package.json`, `tsconfig.json`
- Create: `packages/module-announcements/src/index.ts`, `src/canvas.ts`, `src/audit.ts`, `src/tools.ts`
- Test: `packages/module-announcements/tests/audit.test.ts`, `tests/tools.test.ts`
- Modify: root `package.json` (add to the `build` chain after `module-peerassessment`)

**Interfaces:**
- Consumes: `@canvas-toolchain/module-contract` (default-export contract), `~/.command-and-control/canvas-config.json` (`{ host, token }` — same file/idiom as `module-group-builder/src/data/canvas-client.ts:17-25`; honors `CC_HOME`).
- Produces: default export `CanvasToolchainModule` with `id: 'announcements'`, `handles: ['announcements']`, tools `audit_announcements` and `recreate_announcement`. **Deliberately NOT added to `KNOWN_MODULES`** — this module is reachable only via the channel (spec §11). It IS in the root build chain so CI can compile/test it and Task 7 can bundle it.

**Canvas API used:** announcements are discussion topics — `GET /api/v1/courses/:courseId/discussion_topics?only_announcements=true&per_page=100` (fields: `id`, `title`, `message`, `posted_at`, `delayed_post_at`); create via `POST /api/v1/courses/:courseId/discussion_topics` with `{ title, message, is_announcement: true, delayed_post_at, published: true }`.

- [ ] **Step 1: Scaffold the package**

```json
// packages/module-announcements/package.json
{
  "name": "@canvas-toolchain/module-announcements",
  "license": "MIT",
  "version": "1.0.0",
  "description": "Announcements Auditor: find scheduled Canvas announcements with stale fire dates (e.g. after a course copy) and recreate them with corrected dates. Channel-native module — never bundled into the installer.",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": { "build": "tsc", "test": "vitest run" },
  "dependencies": {
    "@canvas-toolchain/module-contract": "*",
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

Copy `packages/module-peerassessment/tsconfig.json` verbatim as `packages/module-announcements/tsconfig.json`.

Root `package.json` build script: insert `npm run build --workspace=packages/module-announcements && ` immediately after the `module-peerassessment` build segment.

- [ ] **Step 2: Write the failing audit-logic tests**

```ts
// packages/module-announcements/tests/audit.test.ts
import { describe, it, expect } from 'vitest';
import { classifyAnnouncements, type AnnouncementRow } from '../src/audit.js';

const NOW = Date.parse('2026-08-20T12:00:00Z'); // e.g. start of a fall term

function ann(overrides: Partial<AnnouncementRow>): AnnouncementRow {
  return { id: 1, title: 'Welcome', message: '<p>Hi</p>', posted_at: null, delayed_post_at: null, ...overrides };
}

describe('classifyAnnouncements', () => {
  it('flags a scheduled announcement whose fire date already passed as stale', () => {
    const rows = [ann({ id: 10, delayed_post_at: '2026-05-01T09:00:00Z' })]; // spring date after a course copy
    const res = classifyAnnouncements(rows, NOW);
    expect(res.stale).toHaveLength(1);
    expect(res.stale[0].reason).toContain('already passed');
  });
  it('flags a fire date outside the given term window', () => {
    const rows = [ann({ id: 11, delayed_post_at: '2027-03-01T09:00:00Z' })];
    const res = classifyAnnouncements(rows, NOW, { termStart: '2026-08-15T00:00:00Z', termEnd: '2026-12-20T00:00:00Z' });
    expect(res.stale[0].reason).toContain('outside');
  });
  it('a future in-term scheduled announcement is ok', () => {
    const rows = [ann({ id: 12, delayed_post_at: '2026-09-01T09:00:00Z' })];
    const res = classifyAnnouncements(rows, NOW, { termStart: '2026-08-15T00:00:00Z', termEnd: '2026-12-20T00:00:00Z' });
    expect(res.stale).toHaveLength(0);
    expect(res.ok).toHaveLength(1);
  });
  it('already-posted announcements (no delayed_post_at) are reported ok, never stale', () => {
    const rows = [ann({ id: 13, posted_at: '2026-08-18T09:00:00Z' })];
    const res = classifyAnnouncements(rows, NOW);
    expect(res.stale).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/audit.test.ts --root packages/module-announcements`
Expected: FAIL — `audit.js` not found.

- [ ] **Step 4: Implement `audit.ts` and `canvas.ts`**

```ts
// packages/module-announcements/src/audit.ts
export interface AnnouncementRow {
  id: number;
  title: string;
  message: string;
  posted_at: string | null;
  delayed_post_at: string | null;
}

export interface StaleFinding {
  id: number;
  title: string;
  delayedPostAt: string;
  reason: string;
}

export interface AuditResult {
  stale: StaleFinding[];
  ok: Array<{ id: number; title: string; delayedPostAt: string | null }>;
}

export interface TermWindow { termStart?: string; termEnd?: string }

/** Pure classification. An announcement is stale when it is SCHEDULED (delayed_post_at set)
 *  and its fire date already passed, or falls outside the given term window —
 *  the classic symptom of a course copy keeping last term's dates. */
export function classifyAnnouncements(
  rows: AnnouncementRow[],
  nowMs: number,
  term: TermWindow = {},
): AuditResult {
  const stale: StaleFinding[] = [];
  const ok: AuditResult['ok'] = [];
  for (const row of rows) {
    if (!row.delayed_post_at) {
      ok.push({ id: row.id, title: row.title, delayedPostAt: null });
      continue;
    }
    const fire = Date.parse(row.delayed_post_at);
    let reason: string | null = null;
    if (!Number.isNaN(fire) && fire < nowMs) {
      reason = `fire date ${row.delayed_post_at} has already passed`;
    } else if (term.termStart && fire < Date.parse(term.termStart)) {
      reason = `fire date ${row.delayed_post_at} is outside the term (before ${term.termStart})`;
    } else if (term.termEnd && fire > Date.parse(term.termEnd)) {
      reason = `fire date ${row.delayed_post_at} is outside the term (after ${term.termEnd})`;
    }
    if (reason) stale.push({ id: row.id, title: row.title, delayedPostAt: row.delayed_post_at, reason });
    else ok.push({ id: row.id, title: row.title, delayedPostAt: row.delayed_post_at });
  }
  return { stale, ok };
}
```

```ts
// packages/module-announcements/src/canvas.ts
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { AnnouncementRow } from './audit.js';

export interface CanvasCreds { host: string; token: string }
export interface CanvasClientOptions { fetchImpl?: typeof fetch }

/** Same credential source + idiom as module-group-builder's canvas client. */
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

export class AnnouncementsClient {
  private readonly fetchImpl: typeof fetch;
  constructor(private readonly creds: CanvasCreds, opts: CanvasClientOptions = {}) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }
  private base(): string { return `https://${this.creds.host}/api/v1`; }
  private headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.creds.token}`, 'Content-Type': 'application/json', Accept: 'application/json' };
  }
  /** Announcements are discussion topics with only_announcements=true; paginated. */
  async listAnnouncements(courseId: number): Promise<AnnouncementRow[]> {
    const out: AnnouncementRow[] = [];
    let next: string | undefined =
      `${this.base()}/courses/${courseId}/discussion_topics?only_announcements=true&per_page=100`;
    while (next) {
      const res = await this.fetchImpl(next, { method: 'GET', headers: this.headers() });
      if (!res.ok) throw new Error(`Canvas GET ${next} failed: ${res.status}`);
      out.push(...((await res.json()) as AnnouncementRow[]));
      next = parseNextLink(res.headers.get('link'));
    }
    return out;
  }
  async createAnnouncement(
    courseId: number,
    input: { title: string; message: string; delayedPostAt: string },
  ): Promise<{ id: number }> {
    const res = await this.fetchImpl(`${this.base()}/courses/${courseId}/discussion_topics`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        title: input.title,
        message: input.message,
        is_announcement: true,
        delayed_post_at: input.delayedPostAt,
        published: true,
      }),
    });
    if (!res.ok) throw new Error(`Canvas POST discussion_topics failed: ${res.status}`);
    return (await res.json()) as { id: number };
  }
}
```

- [ ] **Step 5: Run audit tests to verify they pass**

Run: `npx vitest run tests/audit.test.ts --root packages/module-announcements`
Expected: PASS (4 tests).

- [ ] **Step 6: Write the failing tool tests**

```ts
// packages/module-announcements/tests/tools.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { announcementTools, handleAudit, handleRecreate } from '../src/tools.js';
import announcementsModule from '../src/index.js';
import { isCanvasToolchainModule } from '@canvas-toolchain/module-contract';

const ROWS = [
  { id: 10, title: 'Week 1 kickoff', message: '<p>Hello</p>', posted_at: null, delayed_post_at: '2026-05-01T09:00:00Z' },
  { id: 11, title: 'Midterm reminder', message: '<p>Soon</p>', posted_at: null, delayed_post_at: '2099-01-01T09:00:00Z' },
];

function fetchFor(routes: Record<string, unknown>): typeof fetch {
  return (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    const key = `${init?.method ?? 'GET'} ${u.includes('discussion_topics') ? 'topics' : u}`;
    if (!(key in routes)) throw new Error(`unexpected fetch: ${key}`);
    return new Response(JSON.stringify(routes[key]), { status: 200 });
  }) as unknown as typeof fetch;
}

let home: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'ann-'));
  process.env.CC_HOME = home;
  mkdirSync(home, { recursive: true });
  writeFileSync(join(home, 'canvas-config.json'),
    JSON.stringify({ host: 'example.instructure.com', token: 'test-token' }));
});
afterEach(() => { delete process.env.CC_HOME; rmSync(home, { recursive: true, force: true }); });

describe('module contract', () => {
  it('default export satisfies the contract with both tools', () => {
    expect(isCanvasToolchainModule(announcementsModule)).toBe(true);
    expect(announcementsModule.id).toBe('announcements');
    expect(announcementTools.map((t) => t.schema.name)).toEqual(['audit_announcements', 'recreate_announcement']);
  });
});

describe('audit_announcements', () => {
  it('lists stale + ok announcements', async () => {
    const res = await handleAudit({ courseId: 20244 }, { fetchImpl: fetchFor({ 'GET topics': ROWS }) });
    expect(res.stale).toHaveLength(1);
    expect((res.stale as Array<{ id: number }>)[0].id).toBe(10);
    expect(res.ok).toHaveLength(1);
  });
});

describe('recreate_announcement', () => {
  it('previews without posting when confirm is absent', async () => {
    let posted = false;
    const f = fetchFor({ 'GET topics': ROWS, 'POST topics': { id: 99 } });
    const spy: typeof fetch = (async (u, i) => { if (i?.method === 'POST') posted = true; return f(u, i); }) as unknown as typeof fetch;
    const res = await handleRecreate(
      { courseId: 20244, announcementId: 10, newDelayedPostAt: '2099-02-01T09:00:00Z' },
      { fetchImpl: spy },
    );
    expect(res.preview).toBe(true);
    expect(posted).toBe(false);
  });
  it('creates the corrected copy on confirm and never deletes the original', async () => {
    const calls: string[] = [];
    const f = fetchFor({ 'GET topics': ROWS, 'POST topics': { id: 99 } });
    const spy: typeof fetch = (async (u, i) => { calls.push(i?.method ?? 'GET'); return f(u, i); }) as unknown as typeof fetch;
    const res = await handleRecreate(
      { courseId: 20244, announcementId: 10, newDelayedPostAt: '2099-02-01T09:00:00Z', confirm: true },
      { fetchImpl: spy },
    );
    expect(res.created).toMatchObject({ id: 99 });
    expect(String(res.note)).toContain('delete the stale original');
    expect(calls).not.toContain('DELETE');
  });
});
```

- [ ] **Step 7: Run tool tests to verify they fail**

Run: `npx vitest run tests/tools.test.ts --root packages/module-announcements`
Expected: FAIL — `tools.js` not found.

- [ ] **Step 8: Implement `tools.ts` and `index.ts`**

```ts
// packages/module-announcements/src/tools.ts
import type { ModuleTool } from '@canvas-toolchain/module-contract';
import { classifyAnnouncements, type TermWindow } from './audit.js';
import { AnnouncementsClient, loadCanvasCreds, type CanvasClientOptions } from './canvas.js';

export interface AuditArgs { courseId: number; termStart?: string; termEnd?: string }
export interface RecreateArgs { courseId: number; announcementId: number; newDelayedPostAt: string; confirm?: boolean }

export async function handleAudit(args: AuditArgs, opts: CanvasClientOptions = {}): Promise<Record<string, unknown>> {
  const client = new AnnouncementsClient(loadCanvasCreds(), opts);
  const rows = await client.listAnnouncements(args.courseId);
  const term: TermWindow = { termStart: args.termStart, termEnd: args.termEnd };
  const result = classifyAnnouncements(rows, Date.now(), term);
  return {
    courseId: args.courseId,
    stale: result.stale,
    ok: result.ok,
    note: result.stale.length > 0
      ? 'Stale announcements usually come from a course copy keeping last term\'s fire dates. Recreate each with recreate_announcement, then delete the stale original in Canvas.'
      : 'No stale scheduled announcements found.',
  };
}

export async function handleRecreate(args: RecreateArgs, opts: CanvasClientOptions = {}): Promise<Record<string, unknown>> {
  const client = new AnnouncementsClient(loadCanvasCreds(), opts);
  const rows = await client.listAnnouncements(args.courseId);
  const original = rows.find((r) => r.id === args.announcementId);
  if (!original) {
    return { error: 'ANNOUNCEMENT_NOT_FOUND', message: `No announcement ${args.announcementId} in course ${args.courseId}.` };
  }
  if (!args.confirm) {
    return {
      preview: true,
      title: original.title,
      oldDelayedPostAt: original.delayed_post_at,
      newDelayedPostAt: args.newDelayedPostAt,
      note: 'Nothing has been created. Call again with confirm: true to create the corrected copy.',
    };
  }
  const created = await client.createAnnouncement(args.courseId, {
    title: original.title,
    message: original.message,
    delayedPostAt: args.newDelayedPostAt,
  });
  return {
    created,
    note: `Created a corrected copy of "${original.title}" scheduled for ${args.newDelayedPostAt}. ` +
      'Now delete the stale original in Canvas (this tool never deletes anything).',
  };
}

export const announcementTools: ModuleTool[] = [
  {
    schema: {
      name: 'audit_announcements',
      description: 'List a course\'s announcements and flag scheduled ones with stale fire dates (already passed, or outside the term window if termStart/termEnd are given) — the classic course-copy gotcha. Read-only.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          courseId: { type: 'number', description: 'Canvas course id.' },
          termStart: { type: 'string', description: 'Optional ISO date — fire dates before this are flagged.' },
          termEnd: { type: 'string', description: 'Optional ISO date — fire dates after this are flagged.' },
        },
        required: ['courseId'],
      },
    },
    handler: async (args: unknown) => ({
      content: [{ type: 'text', text: JSON.stringify(await handleAudit(args as AuditArgs), null, 2) }],
    }),
  },
  {
    schema: {
      name: 'recreate_announcement',
      description: 'Create a corrected copy of a stale scheduled announcement with a new fire date. Two-call gate: previews first; confirm: true creates. Never deletes the original — you remove it in Canvas.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          courseId: { type: 'number', description: 'Canvas course id.' },
          announcementId: { type: 'number', description: 'Id of the stale announcement (from audit_announcements).' },
          newDelayedPostAt: { type: 'string', description: 'Corrected ISO fire date.' },
          confirm: { type: 'boolean', description: 'Set true on the second call to actually create.' },
        },
        required: ['courseId', 'announcementId', 'newDelayedPostAt'],
      },
    },
    handler: async (args: unknown) => ({
      content: [{ type: 'text', text: JSON.stringify(await handleRecreate(args as RecreateArgs), null, 2) }],
    }),
  },
];
```

```ts
// packages/module-announcements/src/index.ts
import type { CanvasToolchainModule } from '@canvas-toolchain/module-contract';
import { announcementTools } from './tools.js';

export const MODULE_ID = 'announcements';

const announcementsModule: CanvasToolchainModule = {
  id: MODULE_ID,
  name: 'Announcements Auditor',
  description:
    'Find scheduled Canvas announcements whose fire dates are stale (typically after a course copy keeps ' +
    'last term\'s dates) and recreate them with corrected dates. Read-first; creation is confirm-gated; ' +
    'never deletes anything.',
  version: '1.0.0',
  handles: ['announcements'],
  tools: announcementTools,
};

export default announcementsModule;
export { classifyAnnouncements } from './audit.js';
```

- [ ] **Step 9: Run all module tests + build**

Run: `npm install` (link the new workspace), then `npm run build --workspace=packages/module-announcements && npm test --workspace=packages/module-announcements`
Expected: build clean, 7 tests PASS.

- [ ] **Step 10: Commit**

```bash
git add packages/module-announcements package.json package-lock.json
git commit -m "feat(module): Announcements Auditor — channel-native proof module, never bundled (Task 6)"
```

---

### Task 7: `build:module` script + artifact smoke test

**Files:**
- Create: `scripts/build-module.mjs`
- Modify: root `package.json` (add `"build:module": "node scripts/build-module.mjs"` to scripts; add `"esbuild": "^0.28.1"` to a new root `devDependencies` — the version matches the existing root override)
- Test: `packages/command-and-control/tests/channel-artifact-smoke.test.ts`

**Interfaces:**
- Consumes: any `packages/module-<id>` workspace (Task 6's module is the target).
- Produces: `dist-channel/module-<id>-<version>.mjs` + stdout JSON `{ "id", "version", "outfile", "sha256", "sizeBytes" }` — the exact fields a catalog entry needs.

- [ ] **Step 1: Write the build script**

```js
// scripts/build-module.mjs
// Usage: npm run build:module -- <id>   (e.g. npm run build:module -- announcements)
// Bundles packages/module-<id> + ALL runtime deps into one self-contained ESM file
// and prints the catalog-entry fields (sha256, sizeBytes) as JSON.
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const id = process.argv[2];
if (!id) {
  console.error('Usage: npm run build:module -- <id>');
  process.exit(1);
}
const pkgDir = join('packages', `module-${id}`);
const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf-8'));
const version = pkg.version;
mkdirSync('dist-channel', { recursive: true });
const outfile = join('dist-channel', `module-${id}-${version}.mjs`);

await build({
  entryPoints: [join(pkgDir, 'src', 'index.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile,
  // CJS deps bundled into ESM sometimes call require(); provide it.
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});

const bytes = readFileSync(outfile);
console.log(JSON.stringify({
  id,
  version,
  outfile,
  sha256: createHash('sha256').update(bytes).digest('hex'),
  sizeBytes: statSync(outfile).size,
}, null, 2));
```

Add `dist-channel/` to the root `.gitignore`.

- [ ] **Step 2: Write the failing smoke test**

```ts
// packages/command-and-control/tests/channel-artifact-smoke.test.ts
import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isCanvasToolchainModule } from '@canvas-toolchain/module-contract';

// ESM-safe repo root (tests run as ESM; __dirname does not exist here).
const repoRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..');

describe('channel artifact smoke (real esbuild build)', () => {
  it('builds module-announcements into a single ESM file that imports clean and satisfies the contract', async () => {
    const out = execSync('node scripts/build-module.mjs announcements', { cwd: repoRoot, encoding: 'utf-8' });
    const meta = JSON.parse(out) as { outfile: string; sha256: string; sizeBytes: number };
    const artifact = join(repoRoot, meta.outfile);
    expect(existsSync(artifact)).toBe(true);
    expect(meta.sha256).toMatch(/^[0-9a-f]{64}$/);
    const mod = (await import(pathToFileURL(artifact).href)).default;
    expect(isCanvasToolchainModule(mod)).toBe(true);
    expect(mod.id).toBe('announcements');
    expect(mod.tools.map((t: { schema: { name: string } }) => t.schema.name))
      .toEqual(['audit_announcements', 'recreate_announcement']);
  }, 60_000);
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run tests/channel-artifact-smoke.test.ts --root packages/command-and-control`
Expected: FAIL — `scripts/build-module.mjs` missing / esbuild not a root dep.

- [ ] **Step 4: Add the root devDependency + script, install, re-run**

In root `package.json`: add `"build:module": "node scripts/build-module.mjs"` to `scripts` and a `"devDependencies": { "esbuild": "^0.28.1" }` block. Run `npm install`.

Run: `npx vitest run tests/channel-artifact-smoke.test.ts --root packages/command-and-control`
Expected: PASS — the artifact builds, imports, and passes the contract guard.

- [ ] **Step 5: Commit**

```bash
git add scripts/build-module.mjs package.json package-lock.json .gitignore packages/command-and-control/tests/channel-artifact-smoke.test.ts
git commit -m "feat: build:module esbuild bundler + real-artifact smoke test (Task 7)"
```

---

### Task 8: `module-catalog.json` + `release-module.yml` + release runbook

**Files:**
- Create: `module-catalog.json` (repo root)
- Create: `.github/workflows/release-module.yml`
- Create: `docs/module-channel.md` (runbook: how to publish a module release)

**Interfaces:**
- Consumes: Task 7's `build:module` output fields.
- Produces: the catalog file clients fetch (starts with an empty `modules` array — the announcements entry is added by the release runbook after the first real `module-announcements-v1.0.0` tag, because its `sha256` must come from the actual released artifact); the CI workflow that builds + attaches artifacts.

- [ ] **Step 1: Create the initial catalog**

```json
{
  "catalogVersion": 1,
  "modules": []
}
```

- [ ] **Step 2: Create the workflow**

```yaml
# .github/workflows/release-module.yml
name: release-module

on:
  push:
    tags:
      - 'module-*-v*'

permissions:
  contents: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - name: Parse module id and version from tag
        id: parse
        run: |
          TAG="${GITHUB_REF_NAME}"                 # module-announcements-v1.0.0
          WITHOUT_PREFIX="${TAG#module-}"          # announcements-v1.0.0
          MODULE_ID="${WITHOUT_PREFIX%-v*}"        # announcements
          VERSION="${TAG##*-v}"                    # 1.0.0
          echo "id=${MODULE_ID}" >> "$GITHUB_OUTPUT"
          echo "version=${VERSION}" >> "$GITHUB_OUTPUT"
      - run: npm ci
      - run: npm run build
      - name: Test the module workspace
        run: npm test --workspace=packages/module-${{ steps.parse.outputs.id }}
      - name: Verify tag version matches package version
        run: |
          PKG_VERSION=$(node -p "require('./packages/module-${{ steps.parse.outputs.id }}/package.json').version")
          if [ "$PKG_VERSION" != "${{ steps.parse.outputs.version }}" ]; then
            echo "Tag says ${{ steps.parse.outputs.version }} but package.json says $PKG_VERSION"; exit 1
          fi
      - name: Build the channel artifact
        id: artifact
        run: |
          npm run build:module -- ${{ steps.parse.outputs.id }} | tee artifact.json
          echo "sha256=$(node -p "JSON.parse(require('fs').readFileSync('artifact.json','utf8')).sha256")" >> "$GITHUB_OUTPUT"
          echo "size=$(node -p "JSON.parse(require('fs').readFileSync('artifact.json','utf8')).sizeBytes")" >> "$GITHUB_OUTPUT"
      - name: Create the GitHub Release with the artifact
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          gh release create "${GITHUB_REF_NAME}" \
            "dist-channel/module-${{ steps.parse.outputs.id }}-${{ steps.parse.outputs.version }}.mjs" \
            --title "${GITHUB_REF_NAME}" \
            --notes "Module channel artifact. sha256: ${{ steps.artifact.outputs.sha256 }}"
      - name: Print the catalog entry for the follow-up commit
        run: |
          cat >> "$GITHUB_STEP_SUMMARY" <<EOF
          Add this entry to module-catalog.json on main (fill name/description/minHostVersion/handles from the module):
          \`\`\`json
          {
            "id": "${{ steps.parse.outputs.id }}",
            "version": "${{ steps.parse.outputs.version }}",
            "artifactUrl": "https://github.com/${GITHUB_REPOSITORY}/releases/download/${GITHUB_REF_NAME}/module-${{ steps.parse.outputs.id }}-${{ steps.parse.outputs.version }}.mjs",
            "sha256": "${{ steps.artifact.outputs.sha256 }}",
            "sizeBytes": ${{ steps.artifact.outputs.size }}
          }
          \`\`\`
          EOF
```

- [ ] **Step 3: Write the runbook**

`docs/module-channel.md` — cover, in order: (1) what the channel is (link the spec); (2) publishing a module version: bump the module `package.json` version → tag `module-<id>-v<version>` → push tag → wait for `release-module` green → copy the catalog entry from the job summary into `module-catalog.json` (adding `name`, `description`, `minHostVersion`, `handles` from the module source) → commit to `main` (this commit IS the publish; its history is the audit log); (3) how professors install (`browse_module_catalog` → `install_module` two-call, GUI picker just requests); (4) rollback story (retained previous version; catalog revert commit); (5) the trust model in two sentences (hash pinned on `main`; verified at install and every load). Keep it under ~80 lines; the spec holds the detail.

- [ ] **Step 4: Validate the workflow syntax and the catalog against the validator**

Run: `npx vitest run tests/channel-catalog.test.ts --root packages/command-and-control` (still green) and
`node -e "const {validateCatalog}=await import('./packages/command-and-control/dist/channel/catalog.js'); validateCatalog(JSON.parse(require('fs').readFileSync('module-catalog.json','utf8'))); console.log('catalog valid')"`
Expected: `catalog valid`. (Build C&C first if `dist/` is stale: `npm run build --workspace=packages/command-and-control`.)

- [ ] **Step 5: Commit**

```bash
git add module-catalog.json .github/workflows/release-module.yml docs/module-channel.md
git commit -m "feat: module catalog + release-module workflow + publish runbook (Task 8)"
```

---

### Task 9: Go installer — catalog fetch, "Additional modules" picker, pending-file write

**Files:**
- Create: `installer/tasks/modulecatalog.go`, `installer/tasks/modulecatalog_test.go`
- Modify: `installer/screens/state.go` (add fields; init map at the `ConnectHosts` init, `state.go:66`)
- Modify: `installer/screens/workflows.go` (picker section)
- Modify: `installer/screens/install.go` (`buildSteps`, after the `WriteModulesManifest` step at `install.go:186`)

**Interfaces:**
- Consumes: `module-catalog.json` raw URL; `tasks.CcHomePath()` (exists — used at `install.go:186`).
- Produces: `tasks.CatalogModule { ID, Name, Description, Version string; Bundled bool }`; `tasks.FetchModuleCatalog(ctx context.Context, url string) ([]CatalogModule, error)` (filters `Bundled`, rejects `catalogVersion != 1`); `tasks.ModuleCatalogURL` const; `tasks.WritePendingModuleRequests(ccHome string, ids []string) (string, error)`. State gains `RequestedModules map[string]bool`.

- [ ] **Step 1: Write the failing Go tests**

```go
// installer/tasks/modulecatalog_test.go
package tasks

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

const catalogJSON = `{"catalogVersion":1,"modules":[
  {"id":"announcements","name":"Announcements Auditor","description":"Audit scheduled announcements.","version":"1.0.0","minHostVersion":"2.0.0","artifactUrl":"https://example.invalid/a.mjs","sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","sizeBytes":10},
  {"id":"video","name":"Lecture Video","description":"Bundled.","version":"1.0.0","minHostVersion":"1.0.0","artifactUrl":"https://example.invalid/v.mjs","sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","sizeBytes":10,"bundled":true}
]}`

func TestFetchModuleCatalogFiltersBundled(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(catalogJSON))
	}))
	defer srv.Close()
	mods, err := FetchModuleCatalog(context.Background(), srv.URL)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(mods) != 1 || mods[0].ID != "announcements" {
		t.Fatalf("expected only the non-bundled module, got %+v", mods)
	}
}

func TestFetchModuleCatalogRejectsUnknownVersion(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"catalogVersion":2,"modules":[]}`))
	}))
	defer srv.Close()
	if _, err := FetchModuleCatalog(context.Background(), srv.URL); err == nil {
		t.Fatal("expected an error for catalogVersion 2")
	}
}

func TestWritePendingModuleRequests(t *testing.T) {
	home := t.TempDir()
	path, err := WritePendingModuleRequests(home, []string{"announcements"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if filepath.Base(path) != "pending-module-installs.json" {
		t.Fatalf("wrong filename: %s", path)
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read failed: %v", err)
	}
	var got struct {
		RequestedAt string   `json:"requestedAt"`
		Modules     []string `json:"modules"`
	}
	if err := json.Unmarshal(raw, &got); err != nil {
		t.Fatalf("bad json: %v", err)
	}
	if len(got.Modules) != 1 || got.Modules[0] != "announcements" || got.RequestedAt == "" {
		t.Fatalf("unexpected payload: %+v", got)
	}
}

func TestWritePendingModuleRequestsSkipsWhenEmpty(t *testing.T) {
	home := t.TempDir()
	path, err := WritePendingModuleRequests(home, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if path != "" {
		t.Fatalf("expected no file for empty request, got %s", path)
	}
}
```

- [ ] **Step 2: Run to verify failure**

Run (from `installer/`): `go test ./tasks/ -run "ModuleCatalog|PendingModule" -v`
Expected: FAIL — undefined functions.

- [ ] **Step 3: Implement `modulecatalog.go`**

```go
// installer/tasks/modulecatalog.go
package tasks

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

// ModuleCatalogURL is the raw-GitHub location of the module catalog on main.
const ModuleCatalogURL = "https://raw.githubusercontent.com/Ryfter/canvas-toolchain/main/module-catalog.json"

const supportedCatalogVersion = 1

// CatalogModule is one entry of module-catalog.json (installer-relevant fields only).
type CatalogModule struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Version     string `json:"version"`
	Bundled     bool   `json:"bundled"`
}

type moduleCatalog struct {
	CatalogVersion int             `json:"catalogVersion"`
	Modules        []CatalogModule `json:"modules"`
}

// FetchModuleCatalog downloads and parses the catalog, returning only
// non-bundled (channel-installable) modules. The installer NEVER downloads
// module code — this list only feeds the request picker.
func FetchModuleCatalog(ctx context.Context, url string) ([]CatalogModule, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("module catalog fetch: HTTP %d", res.StatusCode)
	}
	var cat moduleCatalog
	if err := json.NewDecoder(res.Body).Decode(&cat); err != nil {
		return nil, fmt.Errorf("module catalog parse: %w", err)
	}
	if cat.CatalogVersion != supportedCatalogVersion {
		return nil, fmt.Errorf("module catalog version %d unsupported (want %d)", cat.CatalogVersion, supportedCatalogVersion)
	}
	out := make([]CatalogModule, 0, len(cat.Modules))
	for _, m := range cat.Modules {
		if !m.Bundled {
			out = append(out, m)
		}
	}
	return out, nil
}

// WritePendingModuleRequests writes the ids the user picked to
// <ccHome>/pending-module-installs.json (0600). It is a REQUEST for the chat
// flow to fulfil — never an authorization; no code is downloaded here.
// Empty ids → no file, empty path, nil error.
func WritePendingModuleRequests(ccHome string, ids []string) (string, error) {
	if len(ids) == 0 {
		return "", nil
	}
	if err := os.MkdirAll(ccHome, 0o755); err != nil {
		return "", err
	}
	payload := struct {
		RequestedAt string   `json:"requestedAt"`
		Modules     []string `json:"modules"`
	}{RequestedAt: time.Now().UTC().Format(time.RFC3339), Modules: ids}
	raw, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		return "", err
	}
	path := filepath.Join(ccHome, "pending-module-installs.json")
	if err := os.WriteFile(path, raw, 0o600); err != nil {
		return "", err
	}
	return path, nil
}
```

- [ ] **Step 4: Run Go tests to verify they pass**

Run (from `installer/`): `go test ./tasks/ -run "ModuleCatalog|PendingModule" -v`
Expected: PASS (4 tests).
(Note: `go test ./...` currently fails locally in `update/cmd/updater` from a pre-existing go-gl/OpenGL build-constraint environment issue on this machine — scope test runs to `./tasks/` and `./screens/` locally; CI runs the full matrix.)

- [ ] **Step 5: Add state + picker UI**

`installer/screens/state.go` — add to the `State` struct (near `ConnectHosts`, `state.go:34`):

```go
	// RequestedModules holds catalog module ids the user asked to have
	// installed via chat after setup (written as a pending-request file).
	RequestedModules map[string]bool
```

and initialize alongside `ConnectHosts` (`state.go:66`): `RequestedModules: map[string]bool{},`

`installer/screens/workflows.go` — insert an "Additional modules" section between the `hostSection` separator and the "Optional extras" block (i.e. after line 85's separator), following the screen's async-status pattern (`pythonStatus`, lines 57–73):

```go
	modulesLabel := widget.NewLabelWithStyle("Additional modules", fyne.TextAlignLeading, fyne.TextStyle{Bold: true})
	modulesHint := widget.NewLabel("These install later through Claude — checking one just queues the request. " +
		"Next time you open Claude it will offer to install them, or just ask: \"install the <module> module\".")
	modulesHint.Wrapping = fyne.TextWrapWord
	modulesStatus := ui.NewStatusRow("Checking the module catalog…")
	modulesStatus.SetStatus(ui.StatusRunning, "")
	modulesBox := container.NewVBox()

	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		mods, err := tasks.FetchModuleCatalog(ctx, tasks.ModuleCatalogURL)
		if err != nil {
			modulesStatus.SetStatus(ui.StatusWarn, "Module catalog unavailable — you can install modules later by asking Claude.")
			return
		}
		if len(mods) == 0 {
			modulesStatus.SetStatus(ui.StatusOK, "No additional modules published yet.")
			return
		}
		modulesStatus.SetStatus(ui.StatusOK, "Catalog loaded")
		for _, m := range mods {
			mod := m // capture
			check := widget.NewCheck(mod.Name+" — "+mod.Description, func(b bool) { st.RequestedModules[mod.ID] = b })
			check.SetChecked(st.RequestedModules[mod.ID])
			modulesBox.Add(check)
		}
		modulesBox.Refresh()
	}()
```

and add to the `form` VBox (after `hostSection`'s separator):

```go
		widget.NewSeparator(),
		modulesLabel,
		modulesHint,
		modulesStatus,
		modulesBox,
```

`installer/screens/install.go` — add a step in `buildSteps` immediately after the `WriteModulesManifest` step (`install.go:186`), same `tasks.Step` shape as its neighbors:

```go
		{Name: "Record requested modules", Run: func(ctx context.Context) error {
			ids := make([]string, 0, len(st.RequestedModules))
			for id, want := range st.RequestedModules {
				if want {
					ids = append(ids, id)
				}
			}
			sort.Strings(ids)
			_, err := tasks.WritePendingModuleRequests(tasks.CcHomePath(), ids)
			return err
		}},
```

(add `"sort"` to install.go's imports — the `{Name: ..., Run: func(ctx context.Context) error {...}}` literal shape above matches the file's existing steps exactly; also append the matching row label `"Record requested modules"` at the same position in `installRowLabels()`, `install.go:226`.)

- [ ] **Step 6: Build + test the installer packages**

Run (from `installer/`): `go build ./... && go vet ./tasks/ ./screens/ && go test ./tasks/ ./screens/`
Expected: build + vet clean, tests PASS. (`go build ./...` may fail on the known local `update/cmd/updater` OpenGL issue; if so, scope to `go build ./tasks/ ./screens/ .` and rely on CI for the rest.)

- [ ] **Step 7: Commit**

```bash
git add installer/tasks/modulecatalog.go installer/tasks/modulecatalog_test.go installer/screens/state.go installer/screens/workflows.go installer/screens/install.go
git commit -m "feat(installer): Additional-modules picker — catalog fetch + pending-request file, no install logic in Go (Task 9)"
```

---

### Task 10: Docs sweep + final verification

**Files:**
- Modify: `docs/modules.md` (§1 "Plug-in module system": add the channel — drop-in installs, the three new tools, the Announcements Auditor as module #20 with its own section)
- Modify: `docs/commands-and-credentials.md` (new §2 subsection "Module channel" table: `browse_module_catalog`, `install_module`, `uninstall_module`, `audit_announcements`, `recreate_announcement`; note in §3 that the channel adds NO new credentials)
- Modify: `docs/tool-overview.md` (prose paragraph on the module channel — this file is prose-only by C&C CLAUDE.md rule, no tables)
- Modify: `docs/roadmap.md` (move "v2.0 plug-in architecture #78" from Later to shipped-when-released; current release line)
- Modify: `AGENTS.md` (handoff note: channel BUILT, key paths, release runbook pointer)
- Modify: `packages/command-and-control/CLAUDE.md` (implemented-tools bullets for the three channel tools + the loader phase-2 behavior + `docs/module-channel.md` pointer)

**Interfaces:** none — documentation of Tasks 1–9 exactly as built (verify tool names/params against the code, not this plan).

- [ ] **Step 1: Write the doc updates**

For each file above, document what the merged code actually does. Key sentences that MUST appear:
- The GUI picker "requests — never installs"; chat's `install_module` confirm gate is the only authorization.
- Hash verification happens at install AND at every load; failures are fail-soft (server always starts) and fail-closed (unverified code never loads).
- `module-announcements` is channel-only: present in the source tree, absent from `KNOWN_MODULES`, installable only via the catalog.
- Publishing runbook lives in `docs/module-channel.md`.

- [ ] **Step 2: Full verification**

```powershell
npm run build
npm test
cd installer; go build ./tasks/ ./screens/ .; go test ./tasks/ ./screens/; cd ..
git grep -niE "boisestate|bsu|krank|rank85|48894|48895" -- ':!docs/institutions/*'
```

Expected: build clean; all workspaces green (C&C suite + the ~23 new channel tests + 7 module-announcements tests); Go green; guard grep silent.

- [ ] **Step 3: Commit**

```bash
git add docs AGENTS.md packages/command-and-control/CLAUDE.md
git commit -m "docs: module channel — modules.md, commands, tool-overview, roadmap, agent handoffs (Task 10)"
```

---

## Release sequence (after merge — controller runs this, not a task subagent)

1. Branch `feat/module-channel` → PR titled `feat: plug-in module channel (v2.0) — closes #78` → CI green → squash-merge.
2. Tag `module-announcements-v1.0.0` → `release-module.yml` green → copy the job-summary catalog entry into `module-catalog.json` (add `name`, `description`, `minHostVersion: "2.0.0"`, `handles: ["announcements"]`) → commit to `main`.
3. Prepend v2.0.0 notes to `.github/RELEASE_TEMPLATE/installer-release.md` → tag `v2.0.0` → `release-installer.yml` → verify 4 assets.
4. Post-release: roadmap/AGENTS/memory updates; close #78.
