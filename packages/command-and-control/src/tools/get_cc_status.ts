import { createRequire } from 'node:module';
import { loadConfig } from '../kb/config.js';
import type { CcConfig, Mode, ProviderName } from '../types.js';
import { isCanvasBackupConfigured } from '../passthrough/downloader_tools.js';

const localRequire = createRequire(import.meta.url);

export interface GetCcStatusResult {
  mode: Mode;
  providers: {
    anthropic: { model: string; keyPresent: boolean };
    ollama?: { baseUrl: string; model: string; reachable: boolean };
  };
  installedPackages: {
    ci: boolean;
    downloader: boolean;
    designStudio: boolean;
  };
  routing: { fast: ProviderName; judgment: ProviderName };
  lastRun: CcConfig['lastRun'];
}

async function pingOllama(baseUrl: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${baseUrl}/api/tags`, { signal: controller.signal });
    clearTimeout(tid);
    return res.ok;
  } catch {
    return false;
  }
}

// Resolve, don't import: a status probe must not execute a package's module-level
// code, and cold-importing these bundles takes seconds (it made this tool's tests
// time out under parallel suite load).
function isPackageInstalled(pkg: string): boolean {
  try {
    localRequire.resolve(pkg);
    return true;
  } catch {
    return false;
  }
}

export async function getCcStatus(): Promise<GetCcStatusResult> {
  const config = loadConfig();

  let ollamaStatus: { baseUrl: string; model: string; reachable: boolean } | undefined;
  if (config.providers.ollama) {
    ollamaStatus = {
      ...config.providers.ollama,
      reachable: await pingOllama(config.providers.ollama.baseUrl),
    };
  }

  const ciInstalled = isPackageInstalled('curriculum-intelligence-mcp');
  const designStudioInstalled = isPackageInstalled('canvas-design-mcp');

  return {
    mode: config.mode,
    providers: {
      anthropic: {
        model: config.providers.anthropic.model,
        keyPresent: !!process.env.ANTHROPIC_API_KEY,
      },
      ollama: ollamaStatus,
    },
    installedPackages: {
      ci: ciInstalled,
      downloader: isCanvasBackupConfigured(),
      designStudio: designStudioInstalled,
    },
    routing: config.routing,
    lastRun: config.lastRun,
  };
}
