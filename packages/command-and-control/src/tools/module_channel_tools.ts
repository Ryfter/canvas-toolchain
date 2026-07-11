import { fetchCatalog, CatalogError, type ModuleCatalog } from '../channel/catalog.js';
import { loadInstalledModules } from '../channel/installed.js';
import { loadPendingRequests, clearPendingRequests } from '../channel/pending.js';
import { loadModuleManifest } from '../modules/manifest.js';
import { knownModuleIds } from '../modules/registry.js';
import { compareVersions } from '../update/check.js';

export { installModule } from '../channel/install.js';
export { uninstallModule } from '../channel/install.js';

export interface BrowseDeps { fetchImpl?: typeof fetch; catalog?: ModuleCatalog }

export async function browseModuleCatalog(
  args: { clearPending?: boolean },
  deps: BrowseDeps = {},
): Promise<Record<string, unknown>> {
  if (args.clearPending) clearPendingRequests();

  let catalog: ModuleCatalog;
  try {
    catalog = deps.catalog ?? (await fetchCatalog({ fetchImpl: deps.fetchImpl }));
  } catch (err) {
    if (err instanceof CatalogError) return { error: err.code, message: err.message };
    throw err;
  }

  const installed = loadInstalledModules();
  const manifest = loadModuleManifest();
  const pending = new Set(loadPendingRequests().modules);
  const bundledIds = new Set(knownModuleIds());

  const modules = catalog.modules.map((entry) => {
    const rec = installed.modules[entry.id];
    let status: string;
    if (bundledIds.has(entry.id) && !rec) status = 'bundled';
    else if (!rec) status = 'not installed';
    else if (compareVersions(rec.version, entry.version) < 0) status = `update available (v${rec.version} → v${entry.version})`;
    else status = manifest.modules[entry.id]?.enabled ? 'installed (enabled)' : 'installed (disabled)';
    return {
      id: entry.id,
      name: entry.name,
      description: entry.description,
      catalogVersion: entry.version,
      status,
      pendingRequest: pending.has(entry.id),
    };
  });

  return {
    modules,
    note: 'Install with install_module({ moduleId }) — it previews first and only acts on confirm: true.',
  };
}

/** Match detected tool names against CATALOG module handles (substring, both directions,
 *  case-insensitive — same spirit as known-tools matching) so discovery can suggest
 *  channel modules, not only bundled ones (spec §4). */
export function matchCatalogSuggestions(
  detectedNames: string[],
  catalog: ModuleCatalog,
  installedOrBundledIds: Set<string>,
): Array<{ id: string; name: string; reason: string; install: string }> {
  const out: Array<{ id: string; name: string; reason: string; install: string }> = [];
  for (const entry of catalog.modules) {
    if (installedOrBundledIds.has(entry.id)) continue;
    for (const handle of entry.handles ?? []) {
      const h = handle.toLowerCase();
      const hit = detectedNames.find((n) => {
        const d = n.toLowerCase();
        return d.includes(h) || h.includes(d);
      });
      if (hit) {
        out.push({
          id: entry.id,
          name: entry.name,
          reason: `detected "${hit}" matches handle "${handle}"`,
          install: `install_module({ moduleId: "${entry.id}" })`,
        });
        break;
      }
    }
  }
  return out;
}
