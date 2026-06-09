import { loadInstitutionConfig } from './publish/canvas_config_bridge.js';
import { listModules, type ModuleInfo } from './list_modules.js';
import { loadCatalog } from '../discovery/catalog.js';
import { scanCanvasTools, type InstitutionConfigLike } from '../discovery/canvas_scan.js';
import { matchDetected, type ModuleStateLike } from '../discovery/match.js';

export interface DiscoverToolsInput {
  scope?: 'account' | 'course' | 'self';
}

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
  catalogPickList: Array<{ id: string; name: string; module: string | null }>;
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
  const pickList = catalog.all.map((t) => ({ id: t.id, name: t.name, module: t.module }));

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

  return {
    scanTier: scan.tier,
    gaps: scan.gaps,
    detected: scan.tools.map((t) => ({ rawName: t.rawName, courses: t.courses })),
    matchedModules,
    unmatched,
    catalogPickList: pickList,
  };
}
