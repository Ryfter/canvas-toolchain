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
const MODULE_ID = /^[a-z0-9][a-z0-9-]*$/;

/** Hard ceiling for a single-file module artifact (#125). v2.0 artifacts are a
 *  few KiB; 50 MiB leaves generous headroom while bounding install-time RAM —
 *  sizeBytes is the download memory cap, so NaN/Infinity/absurd values would
 *  turn the size guard into an unbounded buffer. */
export const MAX_ARTIFACT_BYTES = 50 * 1024 * 1024;

/** #121: catalog artifacts may only come from this repo's GitHub Releases —
 *  hash pinning guarantees the bytes, this pin guarantees where they were
 *  supposed to come from (a bad catalog can pair an evil URL with its own
 *  matching hash). */
export const ALLOWED_ARTIFACT_URL_PREFIX =
  'https://github.com/Ryfter/canvas-toolchain/releases/download/';

/** GitHub serves release-asset bodies via a 302 to this host; it is the only
 *  redirect target the downloader will follow (#121). */
export const ALLOWED_REDIRECT_HOST = 'objects.githubusercontent.com';

function isEntry(v: unknown): v is CatalogEntry {
  if (typeof v !== 'object' || v === null) return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.id === 'string' && MODULE_ID.test(e.id) &&
    typeof e.name === 'string' &&
    typeof e.description === 'string' &&
    typeof e.version === 'string' &&
    typeof e.minHostVersion === 'string' &&
    typeof e.artifactUrl === 'string' && e.artifactUrl.startsWith(ALLOWED_ARTIFACT_URL_PREFIX) &&
    typeof e.sha256 === 'string' && SHA256_HEX.test(e.sha256) &&
    typeof e.sizeBytes === 'number' && Number.isInteger(e.sizeBytes) &&
    e.sizeBytes > 0 && e.sizeBytes <= MAX_ARTIFACT_BYTES
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
  const seenIds = new Set<string>();
  for (const entry of c.modules) {
    if (!isEntry(entry)) {
      throw new CatalogError('CATALOG_INVALID', `Malformed catalog entry: ${JSON.stringify(entry).slice(0, 200)}`);
    }
    if (seenIds.has(entry.id)) {
      throw new CatalogError('CATALOG_INVALID', `Duplicate module id in catalog: '${entry.id}'.`);
    }
    seenIds.add(entry.id);
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
