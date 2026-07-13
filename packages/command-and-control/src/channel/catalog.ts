import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getCcHomePath } from '../kb/config.js';

export const CATALOG_URL =
  'https://raw.githubusercontent.com/Ryfter/canvas-toolchain/main/module-catalog.json';
export const SUPPORTED_CATALOG_VERSION = 2;
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

/** Artifacts are files in this repo, not release assets. A GitHub Release is an
 *  announcement, not a file host: using one put a module on the product's front
 *  page, took the "Latest" badge, and silently killed the update check that
 *  depended on it. Files on main are reviewable in a PR, diffable, and CI can
 *  prove they are what the source builds. The version is a path segment, so a
 *  published artifact's URL is content-immutable by construction. */
export const ALLOWED_ARTIFACT_URL_PREFIX =
  'https://raw.githubusercontent.com/Ryfter/canvas-toolchain/main/modules/';

/** GitHub serves release-asset bodies via a 302 off github.com to a signed URL on
 *  its own user-content domain — historically `objects.githubusercontent.com`, today
 *  `release-assets.githubusercontent.com`. GitHub rotates that hostname without notice,
 *  so the downloader allowlists the *domain* rather than one host: pinning a single
 *  exact hostname refuses every install the day GitHub changes it (it already had —
 *  see isAllowedRedirectHost's tests). Every `*.githubusercontent.com` host is
 *  GitHub-operated, and the sha256 pin remains the guarantee about the bytes; this
 *  allowlist only constrains who may serve them (#121). */
export const ALLOWED_REDIRECT_DOMAIN = 'githubusercontent.com';

/** True only for `githubusercontent.com` and its subdomains — never for lookalikes
 *  such as `evil-githubusercontent.com` or `githubusercontent.com.evil.example`. */
export function isAllowedRedirectHost(host: string): boolean {
  return host === ALLOWED_REDIRECT_DOMAIN || host.endsWith(`.${ALLOWED_REDIRECT_DOMAIN}`);
}

/** A literal `.` or `..` path segment always means dot-segment navigation, which the
 *  WHATWG URL algorithm silently resolves during parsing. Refuse it outright, before
 *  normalization ever runs: comparing only the *normalized* result against a prefix is
 *  not sufficient on its own when that prefix is domain-wide rather than path-scoped
 *  (see isAllowedCompanionUrl) — the collapsed target can still satisfy a broad prefix
 *  even though the raw string encoded a completely different destination.
 *
 *  Segments are split on BOTH `/` and `\`. For "special" schemes — which https is —
 *  the WHATWG URL parser treats `\` as a path separator exactly like `/` and collapses
 *  `..` segments delimited by it. A `/`-only split therefore misses a payload like
 *  `.../modules/\..\..\AttackerOwner/evil-repo/x.mjs`: no `/`-delimited `..` is present,
 *  so a slash-only guard passes it, and the parser still collapses it out of modules/.
 *  This guard also refuses any raw backslash outright, traversal or not — a legitimate
 *  github.com / raw.githubusercontent.com URL never contains one, and trying to enumerate
 *  every way a backslash could be arranged to defeat a segment check is the same mistake
 *  that produced this gap in the first place. */
function hasLiteralDotSegment(url: string): boolean {
  if (url.includes('\\')) return true;
  const pathAndBeyond = url.split(/[?#]/, 1)[0];
  return pathAndBeyond.split(/[/\\]/).some((seg) => seg === '.' || seg === '..');
}

/** True only when the parsed, normalized URL is https and lives under this repo's
 *  modules/ directory. Comparing the RAW string with startsWith is not enough: the
 *  WHATWG URL parser collapses `..` segments, so
 *  `…/main/modules/../../../../Other/repo/x.mjs` passes a raw prefix test and then
 *  fetches from `Other/repo`. Normalize, then compare — and refuse any literal
 *  dot-segment outright rather than trust the collapse landed somewhere allowed. */
export function isAllowedArtifactUrl(url: unknown): boolean {
  if (typeof url !== 'string') return false;
  if (hasLiteralDotSegment(url)) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.href.startsWith(ALLOWED_ARTIFACT_URL_PREFIX);
  } catch {
    return false;
  }
}

function isEntry(v: unknown): v is CatalogEntry {
  if (typeof v !== 'object' || v === null) return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.id === 'string' && MODULE_ID.test(e.id) &&
    typeof e.name === 'string' &&
    typeof e.description === 'string' &&
    typeof e.version === 'string' &&
    typeof e.minHostVersion === 'string' &&
    typeof e.artifactUrl === 'string' && isAllowedArtifactUrl(e.artifactUrl) &&
    typeof e.sha256 === 'string' && SHA256_HEX.test(e.sha256) &&
    typeof e.sizeBytes === 'number' && Number.isInteger(e.sizeBytes) &&
    e.sizeBytes > 0 && e.sizeBytes <= MAX_ARTIFACT_BYTES
  );
}

/** Default-deny. The catalog is the trust root: if an entry could carry a command
 *  line and anything ran it, every hash pin in this file would be decoration. A
 *  companion entry may contain these keys and nothing else. */
const COMPANION_FIELDS = new Set([
  'id', 'name', 'summary', 'whyYouWantIt', 'url', 'worksWithoutToolchain',
]);
const ALLOWED_COMPANION_URL_PREFIX = 'https://github.com/';

/** Same normalization trap as isAllowedArtifactUrl — a companion url is never fetched
 *  by the toolchain, but a professor clicks it, and browsers collapse `..` too. Unlike
 *  the artifact prefix, ALLOWED_COMPANION_URL_PREFIX is domain-wide (any github.com
 *  repo is a legitimate companion), so a collapsed target can still satisfy the prefix
 *  test while the raw string displayed a different repo entirely — the literal
 *  dot-segment refusal is what actually catches that case. */
export function isAllowedCompanionUrl(url: unknown): boolean {
  if (typeof url !== 'string') return false;
  if (hasLiteralDotSegment(url)) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.href.startsWith(ALLOWED_COMPANION_URL_PREFIX);
  } catch {
    return false;
  }
}

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
    typeof e.url === 'string' && isAllowedCompanionUrl(e.url) &&
    (e.worksWithoutToolchain === undefined || typeof e.worksWithoutToolchain === 'boolean')
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
      // #127: same atomic tmp+rename+0o600 idiom as every other C&C state file —
      // the cache is a trust input to install, so keep it owner-only.
      const tmp = `${cachePath}.tmp`;
      writeFileSync(tmp, JSON.stringify({ fetchedAt: new Date(now()).toISOString(), catalog }, null, 2), { encoding: 'utf-8', mode: 0o600 });
      renameSync(tmp, cachePath);
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
