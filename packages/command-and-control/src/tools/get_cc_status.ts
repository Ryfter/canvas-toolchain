import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { getCcHomePath, loadConfig } from '../kb/config.js';
import type { CcConfig, Mode, ProviderName } from '../types.js';
import { isCanvasBackupConfigured } from '../passthrough/downloader_tools.js';
import { loadAnthropicConfig } from './setup_anthropic.js';
import { loadSpotCheckPreference } from './shell_ready/spot_check_preference.js';

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
  /** Presence-only. Never includes tokens, keys, hosts, or file contents. */
  configured: {
    canvasConfig: boolean;
    llmProvider: boolean;
    canvasBackupToml: boolean;
  };
  /** Presence-only weekly spot-check preference (shell readiness). */
  spotCheck: {
    configured: boolean;
    enabled: boolean;
    day: string | null;
  };
  routing: { fast: ProviderName; judgment: ProviderName };
  lastRun: CcConfig['lastRun'];
}

function anthropicKeyPresent(): boolean {
  if (process.env.ANTHROPIC_API_KEY) return true;
  try {
    loadAnthropicConfig();
    return true;
  } catch {
    return false;
  }
}

function configFilePresent(name: string): boolean {
  return existsSync(join(getCcHomePath(), name));
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

  const ciInstalled = isPackageInstalled('@canvas-toolchain/curriculum-intelligence');
  const designStudioInstalled = isPackageInstalled('@canvas-toolchain/canvas-design-studio');
  const spotPref = loadSpotCheckPreference();

  return {
    mode: config.mode,
    providers: {
      anthropic: {
        model: config.providers.anthropic.model,
        keyPresent: anthropicKeyPresent(),
      },
      ollama: ollamaStatus,
    },
    installedPackages: {
      ci: ciInstalled,
      downloader: isCanvasBackupConfigured(),
      designStudio: designStudioInstalled,
    },
    configured: {
      canvasConfig: configFilePresent('canvas-config.json'),
      llmProvider: configFilePresent('llm-provider.json'),
      canvasBackupToml: configFilePresent('canvas-backup.generated.toml'),
    },
    spotCheck: spotPref
      ? { configured: true, enabled: spotPref.weeklyCheckEnabled, day: spotPref.weeklyCheckDay }
      : { configured: false, enabled: false, day: null },
    routing: config.routing,
    lastRun: config.lastRun,
  };
}
