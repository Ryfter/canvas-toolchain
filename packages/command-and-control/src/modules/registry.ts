import type { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { isCanvasToolchainModule, type CanvasToolchainModule } from '@canvas-toolchain/module-contract';
import { loadModuleManifest } from './manifest.js';

/** Static registry of known modules. Future runtime-loading swaps this map for dynamic import. */
export const KNOWN_MODULES: Record<string, () => Promise<CanvasToolchainModule>> = {
  video: async () => (await import('@canvas-toolchain/module-video')).default,
};

/** Ids of all known modules (whether enabled or not). */
export function knownModuleIds(
  known: Record<string, () => Promise<CanvasToolchainModule>> = KNOWN_MODULES,
): string[] {
  return Object.keys(known);
}

export interface LoadedModules {
  tools: Tool[];
  handlers: Map<string, (args: unknown) => Promise<CallToolResult>>;
}

/** Load all enabled modules; return their merged tool schemas + a name->handler map.
 *  An optional `known` map can be injected for testing (defaults to KNOWN_MODULES).
 *  If any module's loader throws or fails the contract check, it is skipped with a
 *  warning — a broken/optional module must NOT crash the host server (fail-soft). */
export async function loadModules(
  known: Record<string, () => Promise<CanvasToolchainModule>> = KNOWN_MODULES,
): Promise<LoadedModules> {
  const manifest = loadModuleManifest();
  const tools: Tool[] = [];
  const handlers = new Map<string, (args: unknown) => Promise<CallToolResult>>();

  for (const [id, entry] of Object.entries(manifest.modules)) {
    if (!entry?.enabled) continue;
    const loader = known[id];
    if (!loader) continue;
    try {
      const mod = await loader();
      if (!isCanvasToolchainModule(mod)) {
        console.error(`[modules] '${id}' did not satisfy the module contract; skipping.`);
        continue;
      }
      for (const t of mod.tools) {
        tools.push(t.schema);
        handlers.set(t.schema.name, t.handler);
      }
    } catch (err) {
      console.error(`[modules] failed to load '${id}'; skipping. ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { tools, handlers };
}
