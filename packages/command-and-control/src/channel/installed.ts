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

/** Same shape validateCatalog enforces on module ids. */
export const MODULE_ID_SEGMENT = /^[a-z0-9][a-z0-9-]*$/;
/** Tight semver — cannot contain path separators or dot-only segments. */
export const VERSION_SEGMENT = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z][0-9A-Za-z.-]*)?$/;

/** #126: ledger id/version become filesystem path segments under the modules
 *  root — refuse anything that isn't the exact shape install_module writes, so
 *  a hand-edited or tampered ledger skips loudly instead of walking (or
 *  rmSync-ing) surprising paths. */
export function isSafeArtifactRef(id: unknown, version: unknown): boolean {
  return typeof id === 'string' && MODULE_ID_SEGMENT.test(id) &&
    typeof version === 'string' && VERSION_SEGMENT.test(version);
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
