import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const NETWORK_TIMEOUT_MS = 5000;
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

interface UpdateCache {
  lastCheckAt: string;
  latestVersion: string;
}

let cachedNotice: string | null = null;

export function resetUpdateState(): void {
  cachedNotice = null;
}

export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => v.replace(/^v/i, '').split('.').map((p) => {
    const n = parseInt(p, 10);
    return Number.isNaN(n) ? 0 : n;
  });
  const av = parse(a);
  const bv = parse(b);
  const len = Math.max(av.length, bv.length);
  for (let i = 0; i < len; i++) {
    const x = av[i] ?? 0;
    const y = bv[i] ?? 0;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}

function getInstallDir(): string {
  if (process.env.CC_INSTALL_DIR) return process.env.CC_INSTALL_DIR;
  // This file at runtime: <install-dir>/packages/command-and-control/dist/update/check.js
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, '..', '..', '..', '..');
}

function readPackageVersion(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // From src/update/check.ts -> ../../package.json. From dist/update/check.js -> ../../package.json.
  const pkgPath = resolve(here, '..', '..', 'package.json');
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    return typeof pkg.version === 'string' ? pkg.version : '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export function getInstalledVersion(): string {
  const markerPath = join(getInstallDir(), '.canvas-toolchain-version');
  if (existsSync(markerPath)) {
    const raw = readFileSync(markerPath, 'utf-8').trim();
    return raw.replace(/^v/i, '');
  }
  return readPackageVersion();
}

function getCachePath(): string {
  return join(getInstallDir(), '.canvas-toolchain-update-cache.json');
}

function readCache(cachePath: string): UpdateCache | null {
  if (!existsSync(cachePath)) return null;
  try {
    return JSON.parse(readFileSync(cachePath, 'utf-8')) as UpdateCache;
  } catch {
    return null;
  }
}

function isFresh(cache: UpdateCache): boolean {
  const checkedAt = Date.parse(cache.lastCheckAt);
  if (Number.isNaN(checkedAt)) return false;
  return Date.now() - checkedAt < CACHE_TTL_MS;
}

function formatNotice(latest: string): string {
  return `\n\n_Update available: v${latest} — click the Canvas Toolchain Updater shortcut to upgrade._`;
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

export function getUpdateNotice(): string | null {
  return cachedNotice;
}
