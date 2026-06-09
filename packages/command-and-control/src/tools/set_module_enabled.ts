import { knownModuleIds } from '../modules/registry.js';
import { loadModuleManifest, saveModuleManifest } from '../modules/manifest.js';

export interface SetModuleEnabledInput {
  module: string;
  enabled: boolean;
  activeProvider?: string;
}

export type SetModuleEnabledResult =
  | { ok: true; module: string; enabled: boolean; activeProvider?: string; note: string }
  | { ok: false; error: string; message: string; fix: string[] };

const RESTART_NOTE =
  'Modules load at server startup. Reconnect or restart your MCP client for this change to take effect.';

export async function setModuleEnabled(input: SetModuleEnabledInput): Promise<SetModuleEnabledResult> {
  if (typeof input.enabled !== 'boolean') {
    return {
      ok: false,
      error: 'INVALID_ENABLED',
      message: `'enabled' must be a boolean, got '${String(input.enabled)}'`,
      fix: ["Pass enabled: true or enabled: false"],
    };
  }

  const ids = knownModuleIds();
  if (!ids.includes(input.module)) {
    return {
      ok: false,
      error: 'UNKNOWN_MODULE',
      message: `Unknown module '${String(input.module)}'`,
      fix: [`Valid modules: ${ids.join(', ')}`],
    };
  }

  const manifest = loadModuleManifest();
  const entry: { enabled: boolean; activeProvider?: string } = { enabled: input.enabled };
  if (input.activeProvider !== undefined) entry.activeProvider = input.activeProvider;
  manifest.modules[input.module] = entry;
  saveModuleManifest(manifest);

  return {
    ok: true,
    module: input.module,
    enabled: input.enabled,
    ...(input.activeProvider !== undefined ? { activeProvider: input.activeProvider } : {}),
    note: RESTART_NOTE,
  };
}
