// NOT YET WIRED. The MCP tool handlers in tools.ts call the Panopto client
// functions directly (with loadPanoptoConfig()) to preserve byte-for-byte the
// current tool output. This provider-resolution seam exists for the future:
// it activates when a second VideoProvider (Zoom/Teams/Meet/YouTube) lands and
// the handlers route through resolveActiveVideoProvider() instead. See #78 plan.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { VideoProvider } from './provider.js';
import { PanoptoProvider } from './panopto/provider.js';
import { loadPanoptoConfig } from './panopto/setup.js';
import { getCcHomePath } from './cc-home.js';

/** Read the active provider id for the video module from modules.json (default 'panopto'). */
export function activeProviderId(): string {
  const path = join(getCcHomePath(), 'modules.json');
  if (!existsSync(path)) return 'panopto';
  try {
    const manifest = JSON.parse(readFileSync(path, 'utf-8')) as {
      modules?: Record<string, { activeProvider?: string }>;
    };
    return manifest.modules?.video?.activeProvider ?? 'panopto';
  } catch {
    return 'panopto';
  }
}

/** Resolve the active VideoProvider. Throws the provider's own NOT_CONFIGURED error if unset. */
export function resolveActiveVideoProvider(): VideoProvider {
  const id = activeProviderId();
  switch (id) {
    case 'panopto':
    default:
      return new PanoptoProvider(loadPanoptoConfig());
  }
}
