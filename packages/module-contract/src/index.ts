import type { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/** One MCP tool a module contributes. */
export interface ModuleTool {
  schema: Tool;
  handler(args: unknown): Promise<CallToolResult>;
}

/** The single object every module package default-exports. */
export interface CanvasToolchainModule {
  id: string;
  name: string;
  description: string;
  version: string;
  /** Provider/tool types this module can integrate, for #76 discovery matching. */
  handles?: string[];
  tools: ModuleTool[];
  onEnable?(): Promise<void>;
  onDisable?(): Promise<void>;
}

export interface ModuleManifestEntry {
  enabled: boolean;
  /** Optional active provider id for modules with a provider layer. */
  activeProvider?: string;
}

export interface ModuleManifest {
  modules: Record<string, ModuleManifestEntry>;
}

/** Runtime guard used by the registry before trusting a loaded module. */
export function isCanvasToolchainModule(value: unknown): value is CanvasToolchainModule {
  if (typeof value !== 'object' || value === null) return false;
  const m = value as Record<string, unknown>;
  return (
    typeof m.id === 'string' &&
    typeof m.name === 'string' &&
    typeof m.description === 'string' &&
    typeof m.version === 'string' &&
    Array.isArray(m.tools)
  );
}
