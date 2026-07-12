import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, platform } from 'node:os';
import { sha256File } from '../src/channel/hash.js';
import {
  validateCatalog, fetchCatalog, CatalogError, SUPPORTED_CATALOG_VERSION, MAX_ARTIFACT_BYTES,
  isAllowedRedirectHost,
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
  it('refuses an id that does not match the module-id format', () => {
    const bad = { ...GOOD_ENTRY, id: 'Bad_ID' };
    expect(() => validateCatalog({ catalogVersion: 1, modules: [bad] }))
      .toThrowError(expect.objectContaining({ code: 'CATALOG_INVALID' }));
  });
  it('refuses an artifactUrl outside this repo\'s GitHub Releases (#121)', () => {
    for (const artifactUrl of [
      'https://evil.example/m.mjs',
      'http://github.com/Ryfter/canvas-toolchain/releases/download/x/m.mjs',
      'https://github.com/SomeoneElse/canvas-toolchain/releases/download/x/m.mjs',
      'https://github.com/Ryfter/other-repo/releases/download/x/m.mjs',
    ]) {
      const bad = { ...GOOD_ENTRY, artifactUrl };
      expect(() => validateCatalog({ catalogVersion: 1, modules: [bad] }))
        .toThrowError(expect.objectContaining({ code: 'CATALOG_INVALID' }));
    }
  });
  it('refuses non-finite, non-integer, non-positive, or oversized sizeBytes (#125)', () => {
    for (const sizeBytes of [NaN, Infinity, -Infinity, 0, -1, 1.5, 1e15, MAX_ARTIFACT_BYTES + 1]) {
      const bad = { ...GOOD_ENTRY, sizeBytes };
      expect(() => validateCatalog({ catalogVersion: 1, modules: [bad] }))
        .toThrowError(expect.objectContaining({ code: 'CATALOG_INVALID' }));
    }
    const atCeiling = { ...GOOD_ENTRY, sizeBytes: MAX_ARTIFACT_BYTES };
    expect(validateCatalog({ catalogVersion: 1, modules: [atCeiling] }).modules).toHaveLength(1);
  });
  it('refuses duplicate ids across entries, naming the id', () => {
    expect(() => validateCatalog({ catalogVersion: 1, modules: [GOOD_ENTRY, { ...GOOD_ENTRY }] }))
      .toThrowError(expect.objectContaining({ code: 'CATALOG_INVALID', message: expect.stringContaining(GOOD_ENTRY.id) }));
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
