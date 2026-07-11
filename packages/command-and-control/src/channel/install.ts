import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
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

/**
 * Removes a module version's directory, then removes its parent module-id directory too,
 * but ONLY if that leaves it empty — a sibling version dir (e.g. an upgrade's still-good
 * previous version, or a just-placed current version) must survive.
 * Best-effort: a blocked/unreadable parent (e.g. a file occupying the id path) is left
 * alone rather than raising.
 */
function removeVersionDir(versionDir: string): void {
  try {
    // On Node 20, rmSync throws ENOTDIR (not swallowed by force) when a path
    // COMPONENT is a regular file — e.g. the placement-failure case where the
    // module-id path itself is a file. Cleanup must never mask the structured
    // refusal this runs under, so the whole body is best-effort.
    rmSync(versionDir, { recursive: true, force: true });
    const idDir = dirname(versionDir);
    if (existsSync(idDir) && readdirSync(idDir).length === 0) {
      rmSync(idDir, { recursive: true, force: true });
    }
  } catch {
    // best-effort cleanup only; leaving a blocked/empty parent behind is not fatal
  }
}

/**
 * Removes the placed-but-not-yet-coherent version directory (see removeVersionDir for the
 * parent-cleanup rules). This runs from inside an existing catch handler, so it never raises.
 */
function cleanupPlacementDir(dest: string): void {
  removeVersionDir(dirname(dest));
}

/** Thrown when a download body exceeds the catalog-declared size (memory/tamper cap). */
class DownloadTooLargeError extends Error {
  constructor(maxBytes: number) {
    super(`body exceeded the catalog-declared size of ${maxBytes} bytes`);
    this.name = 'DownloadTooLargeError';
  }
}

async function downloadTo(url: string, dest: string, fetchImpl: typeof fetch, maxBytes: number): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    let bytes: Buffer;
    if (res.body) {
      // Read incrementally so an oversized body is refused before it is fully buffered.
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel();
          throw new DownloadTooLargeError(maxBytes);
        }
        chunks.push(value);
      }
      bytes = Buffer.concat(chunks);
    } else {
      // Some fetch fakes have no stream body — buffer, then enforce the cap.
      bytes = Buffer.from(await res.arrayBuffer());
      if (bytes.byteLength > maxBytes) throw new DownloadTooLargeError(maxBytes);
    }
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
    await downloadTo(entry.artifactUrl, tmpFile, deps.fetchImpl ?? fetch, entry.sizeBytes);
  } catch (err) {
    rmSync(tmpFile, { force: true });
    if (err instanceof DownloadTooLargeError) {
      return refusal('DOWNLOAD_TOO_LARGE',
        `Artifact exceeded the catalog-declared size (${entry.sizeBytes} bytes); refusing. ` +
        'This can indicate a tampered artifact.');
    }
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

  // Place, record, and finish bookkeeping in three stages. Each stage's cleanup only
  // undoes what isn't yet coherent — once artifact + record agree (end of Stage B),
  // later failures must never delete a completed install (spec: staged cleanup).
  const dest = artifactPath(entry.id, entry.version);

  // Stage A — placement. On failure, nothing is recorded yet: clean up everything.
  try {
    mkdirSync(dirname(dest), { recursive: true });
    renameSync(tmpFile, dest);
  } catch (err) {
    rmSync(tmpFile, { force: true });
    cleanupPlacementDir(dest);
    const msg = err instanceof Error ? err.message : String(err);
    return refusal('INSTALL_FAILED',
      `Could not place the verified artifact (${msg}). ` +
      'Nothing was installed; retry after resolving the underlying issue.');
  }

  // Stage B — record. Artifact is placed but not yet recorded; on failure the artifact
  // would be an orphan (the loader only loads recorded modules), so remove it.
  //
  // Rollback-target semantics: `previous` must always name the last version that
  // load-verified successfully (the loader clears `previous` after a successful load —
  // see registry.ts). If `existing.previous` is still set, `existing.version` itself never
  // load-verified (e.g. chained upgrades within one session, no reconnect in between) — carry
  // `previous` FORWARD unchanged rather than overwriting it with the never-loaded version.
  const carryForward = existing?.previous;
  const nextPrevious = existing
    ? (carryForward ?? { version: existing.version, sha256: existing.sha256 })
    : undefined;
  try {
    installed.modules[entry.id] = {
      id: entry.id,
      version: entry.version,
      sha256: entry.sha256,
      installedAt: new Date().toISOString(),
      ...(nextPrevious ? { previous: nextPrevious } : {}),
    };
    saveInstalledModules(installed);
  } catch (err) {
    cleanupPlacementDir(dest);
    const msg = err instanceof Error ? err.message : String(err);
    return refusal('INSTALL_FAILED',
      `Could not record the installed module (${msg}). ` +
      'The artifact was removed; nothing is installed. Retry after resolving the underlying issue.');
  }

  // The record now agrees with the artifact (Stage B succeeded). If `existing` never
  // load-verified, its version directory is now orphaned — the retained rollback target is
  // `carryForward` (already carried into the record above), not `existing.version`. Best-effort:
  // a cleanup failure here must not undo the otherwise-complete install.
  if (carryForward) {
    try {
      removeVersionDir(dirname(artifactPath(entry.id, existing!.version)));
    } catch (err) {
      console.error(`installModule: cleanup of superseded never-loaded '${entry.id}' v${existing!.version} failed:`, err);
    }
  }

  // Stage C — post-install bookkeeping. The install IS complete and coherent (artifact +
  // record agree). Failures here must never delete anything or report failure — at worst
  // they degrade to a warning (manifest enable) or a logged, swallowed error (pending cleanup).
  let warning: string | undefined;
  try {
    const manifest = loadModuleManifest();
    manifest.modules[entry.id] = { ...manifest.modules[entry.id], enabled: true };
    saveModuleManifest(manifest);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warning = `Installed, but could not enable the module (${msg}). ` +
      `Enable it manually: set_module_enabled({ module: "${entry.id}", enabled: true }).`;
  }

  try {
    removePendingModule(entry.id);
  } catch (err) {
    console.error(`installModule: removePendingModule('${entry.id}') failed:`, err);
  }

  return {
    installed: true,
    id: entry.id,
    version: entry.version,
    note: 'Takes effect on the next Claude reconnect/restart (modules load at startup).',
    ...(warning ? { warning } : {}),
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
      `Disable it instead: set_module_enabled({ module: '${args.moduleId}', enabled: false }).`);
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
