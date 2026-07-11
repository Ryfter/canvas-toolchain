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
