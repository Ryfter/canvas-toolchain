import { isCanvasToolchainModule, type CanvasToolchainModule } from '@canvas-toolchain/module-contract';
import { KNOWN_MODULES } from '../modules/registry.js';
import { loadModuleManifest } from '../modules/manifest.js';

export interface ModuleInfo {
  id: string;
  name: string;
  enabled: boolean;
  activeProvider?: string;
  handles: string[];
  loadError?: string;
}

/** Report every known module's id/name/enabled/activeProvider/handles, fail-soft per module. */
export async function listModules(
  known: Record<string, () => Promise<CanvasToolchainModule>> = KNOWN_MODULES,
): Promise<ModuleInfo[]> {
  const manifest = loadModuleManifest();
  const out: ModuleInfo[] = [];

  for (const [id, loader] of Object.entries(known)) {
    const entry = manifest.modules[id];
    const enabled = entry?.enabled ?? false;
    const activeProvider = entry?.activeProvider;
    try {
      const mod = await loader();
      if (!isCanvasToolchainModule(mod)) {
        out.push({ id, name: id, enabled, activeProvider, handles: [], loadError: 'failed module contract' });
        continue;
      }
      out.push({ id, name: mod.name, enabled, activeProvider, handles: mod.handles ?? [] });
    } catch (err) {
      out.push({
        id,
        name: id,
        enabled,
        activeProvider,
        handles: [],
        loadError: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return out;
}
