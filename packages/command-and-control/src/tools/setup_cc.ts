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

  saveConfig(config);
  return { config, message: 'Configuration saved.' };
}
