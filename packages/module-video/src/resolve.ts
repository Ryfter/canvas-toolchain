// NOT YET WIRED. The MCP tool handlers in tools.ts call the Panopto client
// functions directly (with ctx.credentials) to preserve byte-for-byte the
// current tool output. This provider-resolution seam exists for the future:
// it activates when a second VideoProvider (Zoom/Teams/Meet/YouTube) lands and
// the handlers route through resolveActiveVideoProvider() instead. See #78 plan.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { VideoProvider } from './provider.js';
import { PanoptoProvider } from './panopto/provider.js';
import type { ModuleContext } from '@canvas-toolchain/module-contract';

/** Read the active provider id for the video module from modules.json (default 'panopto'). */
export function activeProviderId(configDir: string): string {
  const path = join(configDir, 'modules.json');
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
export async function resolveActiveVideoProvider(ctx: ModuleContext): Promise<VideoProvider> {
  const id = activeProviderId(ctx.paths.config);
  switch (id) {
    case 'panopto':
    default:
      return new PanoptoProvider(
        await ctx.credentials.get('panopto'),
        join(ctx.paths.designStudioData, 'transcripts'),
      );
  }
}
