import { OllamaAdapter } from '../llm/ollama_adapter.js';
import { loadConfig } from '../kb/config.js';
import type { CcConfig, Mode, ProviderName } from '../types.js';
import { isCanvasBackupConfigured } from '../passthrough/downloader_tools.js';

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

async function isPackageInstalled(pkg: string): Promise<boolean> {
  try {
    await import(pkg);
    return true;
  } catch {
    return false;
  }
}

export async function getCcStatus(): Promise<GetCcStatusResult> {
  const config = loadConfig();

  let ollamaStatus: { baseUrl: string; model: string; reachable: boolean } | undefined;
  if (config.providers.ollama) {
    const adapter = new OllamaAdapter(
      config.providers.ollama.baseUrl,
      config.providers.ollama.model,
    );
    ollamaStatus = {
      ...config.providers.ollama,
      reachable: await adapter.isReachable(),
    };
  }

  const [ciInstalled, designStudioInstalled] = await Promise.all([
    isPackageInstalled('curriculum-intelligence-mcp'),
    isPackageInstalled('canvas-design-mcp'),
  ]);

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
