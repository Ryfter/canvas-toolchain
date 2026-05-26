import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const NETWORK_TIMEOUT_MS = 5000;
const GITHUB_RELEASES_URL =
  'https://api.github.com/repos/Ryfter/canvas-toolchain/releases/latest';

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

function readCache(): UpdateCache | null {
  const cachePath = getCachePath();
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

async function fetchLatestRelease(): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);
  try {
    const response = await fetch(GITHUB_RELEASES_URL, {
      headers: { accept: 'application/vnd.github+json' },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { tag_name?: string };
    if (typeof body.tag_name !== 'string') return null;
    return body.tag_name.replace(/^v/i, '');
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function checkForUpdates(): Promise<void> {
  const installed = getInstalledVersion();
  const cache = readCache();

  let latest: string | null = null;
  if (cache && isFresh(cache)) {
    latest = cache.latestVersion;
  } else {
    latest = await fetchLatestRelease();
    if (latest !== null) {
      try {
        writeFileSync(
          getCachePath(),
          JSON.stringify({ lastCheckAt: new Date().toISOString(), latestVersion: latest }, null, 2),
          'utf-8',
        );
      } catch {
        // Cache write is best-effort; ignore failures (e.g. read-only filesystem).
      }
    }
  }

  if (latest && compareVersions(installed, latest) < 0) {
    cachedNotice = formatNotice(latest);
  } else {
    cachedNotice = null;
  }
}

export function getUpdateNotice(): string | null {
  return cachedNotice;
}
