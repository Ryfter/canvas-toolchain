import { loadConfig, saveConfig } from '../kb/config.js';
import type { CcConfig, Mode, ProviderName } from '../types.js';

export interface SetupCcInput {
  mode?: Mode;
  anthropicModel?: string;
  ollamaBaseUrl?: string;
  ollamaModel?: string;
  routingFast?: ProviderName;
  routingJudgment?: ProviderName;
  /** Absolute path to the canvas-backup executable (or canvas-backup.exe). Persisted in config.json so professors don't need env vars. */
  downloaderPath?: string;
  /** Premium registry token for ryfter:// resources. */
  registryToken?: string;
  /** Optional premium registry base URL override. */
  premiumRegistryBaseUrl?: string;
}

export interface SetupCcResult {
  config: CcConfig;
  message: string;
}

export function setupCc(input: SetupCcInput): SetupCcResult {
  const config = loadConfig();

  if (input.mode !== undefined) config.mode = input.mode;
  if (input.anthropicModel) config.providers.anthropic.model = input.anthropicModel;

  if (input.ollamaBaseUrl || input.ollamaModel) {
    config.providers.ollama = {
      baseUrl: input.ollamaBaseUrl ?? config.providers.ollama?.baseUrl ?? 'http://localhost:11434',
      model: input.ollamaModel ?? config.providers.ollama?.model ?? 'llama3.2',
    };
  }

  if (input.routingFast) config.routing.fast = input.routingFast;
  if (input.routingJudgment) config.routing.judgment = input.routingJudgment;

  if (input.downloaderPath !== undefined) {
    config.downloader = { ...config.downloader, executablePath: input.downloaderPath };
  }

  if (input.registryToken !== undefined || input.premiumRegistryBaseUrl !== undefined) {
    config.registry = {
      ...config.registry,
      token: input.registryToken ?? config.registry?.token,
      premiumBaseUrl: input.premiumRegistryBaseUrl ?? config.registry?.premiumBaseUrl,
    };
  }

  saveConfig(config);
  return { config: redactSecrets(config), message: 'Configuration saved.' };
}

function redactSecrets(config: CcConfig): CcConfig {
  return {
    ...config,
    providers: { ...config.providers, ollama: config.providers.ollama ? { ...config.providers.ollama } : undefined },
    downloader: config.downloader ? { ...config.downloader } : undefined,
    registry: config.registry
      ? {
          ...config.registry,
          token: config.registry.token ? '[configured]' : undefined,
        }
      : undefined,
    routing: { ...config.routing },
    lastRun: { ...config.lastRun },
  };
}
