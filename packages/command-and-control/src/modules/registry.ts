import type { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { isCanvasToolchainModule, type CanvasToolchainModule } from '@canvas-toolchain/module-contract';
import { loadModuleManifest } from './manifest.js';

/** Static registry of known modules. Future runtime-loading swaps this map for dynamic import. */
const KNOWN_MODULES: Record<string, () => Promise<CanvasToolchainModule>> = {
  video: async () => (await import('@canvas-toolchain/module-video')).default,
};

export interface LoadedModules {
  tools: Tool[];
  handlers: Map<string, (args: unknown) => Promise<CallToolResult>>;
}

/** Load all enabled modules; return their merged tool schemas + a name->handler map. */
export async function loadModules(): Promise<LoadedModules> {
  const manifest = loadModuleManifest();
  const tools: Tool[] = [];
  const handlers = new Map<string, (args: unknown) => Promise<CallToolResult>>();

  for (const [id, entry] of Object.entries(manifest.modules)) {
    if (!entry?.enabled) continue;
    const loader = KNOWN_MODULES[id];
    if (!loader) continue;
    const mod = await loader();
    if (!isCanvasToolchainModule(mod)) continue;
    for (const t of mod.tools) {
      tools.push(t.schema);
      handlers.set(t.schema.name, t.handler);
    }
  }
  return { tools, handlers };
}
