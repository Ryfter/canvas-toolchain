import { loadInstitutionConfig } from './publish/canvas_config_bridge.js';
import { listModules, type ModuleInfo } from './list_modules.js';
import { loadCatalog } from '../discovery/catalog.js';
import { scanCanvasTools, type InstitutionConfigLike } from '../discovery/canvas_scan.js';
import { matchDetected, type ModuleStateLike } from '../discovery/match.js';
import { fetchCatalog } from '../channel/catalog.js';
import { loadInstalledModules } from '../channel/installed.js';
import { matchCatalogSuggestions } from './module_channel_tools.js';

// No inputs today (the scan auto-cascades). Kept as a named type for the tool signature.
export type DiscoverToolsInput = Record<string, never>;

export interface DiscoverToolsDeps {
  loadConfig: () => InstitutionConfigLike;
  fetchFn: typeof fetch;
  moduleState: () => Promise<ModuleInfo[]>;
}

export interface DiscoverToolsReport {
  scanTier: 'account' | 'course' | 'self-report';
  gaps: string[];
  detected: Array<{ rawName: string; courses?: string[] }>;
  matchedModules: Array<{ tool: string; module: string; enabled: boolean }>;
  unmatched: string[];
  catalogPickList: Array<{ id: string; name: string; module: string | null; recommended?: boolean }>;
  catalogSuggestions: Array<{ id: string; name: string; reason: string; install: string }>;
}

const defaultDeps: DiscoverToolsDeps = {
  loadConfig: loadInstitutionConfig,
  fetchFn: (...args) => fetch(...args),
  moduleState: () => listModules(),
};

export async function discoverTools(
  _input: DiscoverToolsInput = {},
  deps: DiscoverToolsDeps = defaultDeps,
): Promise<DiscoverToolsReport> {
  const catalog = loadCatalog();
  const pickList = catalog.all.map((t) => ({
    id: t.id,
    name: t.name,
    module: t.module,
    ...(t.recommended ? { recommended: true } : {}),
  }));

  let cfg: InstitutionConfigLike;
  try {
    cfg = deps.loadConfig();
  } catch {
    cfg = { canvasUrl: '', apiToken: '' };
  }

  const scan = await scanCanvasTools(cfg, deps.fetchFn);
  const mods: ModuleStateLike[] = (await deps.moduleState()).map((m) => ({
    id: m.id,
    name: m.name,
    enabled: m.enabled,
    handles: m.handles,
  }));
  const { matchedModules, unmatched } = matchDetected(catalog, mods, scan.tools);

  let catalogSuggestions: Array<{ id: string; name: string; reason: string; install: string }> = [];
  try {
    const channelCatalog = await fetchCatalog();
    const knownOrInstalled = new Set([
      ...mods.map((m) => m.id),
      ...Object.keys(loadInstalledModules().modules),
    ]);
    catalogSuggestions = matchCatalogSuggestions(
      scan.tools.map((t) => t.rawName), channelCatalog, knownOrInstalled,
    );
  } catch (err) {
    // Best-effort only — discovery must never fail because of the catalog.
    console.error(`[discovery] module-catalog suggestions unavailable: ${err instanceof Error ? err.message : String(err)}`);
  }

  return {
    scanTier: scan.tier,
    gaps: scan.gaps,
    detected: scan.tools.map((t) => ({ rawName: t.rawName, courses: t.courses })),
    matchedModules,
    unmatched,
    catalogPickList: pickList,
    catalogSuggestions,
  };
}
