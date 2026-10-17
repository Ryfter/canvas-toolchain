import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getCcHomePath } from '../kb/config.js';

export type ActiveProvider = 'anthropic' | 'ollama' | 'lmstudio';

export interface SetActiveLlmProviderInput {
  provider: ActiveProvider;
}

export type SetActiveLlmProviderResult =
  | { ok: true; provider: ActiveProvider; configPath: string }
  | { ok: false; error: string; message: string; fix: string[] };

function getActiveProviderPath(): string {
  return join(getCcHomePath(), 'llm-provider.json');
}

function getAnthropicConfigPath(): string {
  return join(getCcHomePath(), 'anthropic-config.json');
}

function getOllamaConfigPath(): string {
  return join(getCcHomePath(), 'ollama-config.json');
}

function getLmStudioConfigPath(): string {
  return join(getCcHomePath(), 'lmstudio-config.json');
}

const VALID_PROVIDERS: readonly ActiveProvider[] = ['anthropic', 'ollama', 'lmstudio'];

export function loadActiveProvider(): ActiveProvider {
  const path = getActiveProviderPath();
  if (!existsSync(path)) {
    throw new Error('LLM_PROVIDER_NOT_SET: Run set_active_llm_provider with anthropic, ollama or lmstudio.');
  }
  let parsed: { provider?: string };
  try {
    parsed = JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    throw new Error('LLM_PROVIDER_NOT_SET: llm-provider.json is corrupt. Re-run set_active_llm_provider.');
  }
  if (!VALID_PROVIDERS.includes(parsed.provider as ActiveProvider)) {
    throw new Error(`LLM_PROVIDER_NOT_SET: invalid provider '${parsed.provider}'. Re-run set_active_llm_provider.`);
  }
  return parsed.provider as ActiveProvider;
}

export async function setActiveLlmProvider(input: SetActiveLlmProviderInput): Promise<SetActiveLlmProviderResult> {
  if (!VALID_PROVIDERS.includes(input.provider)) {
    return {
      ok: false,
      error: 'INVALID_PROVIDER',
      message: `Provider must be one of ${VALID_PROVIDERS.map((p) => `'${p}'`).join(', ')}, got '${String(input.provider)}'`,
      fix: [`Provider must be one of ${VALID_PROVIDERS.map((p) => `'${p}'`).join(', ')}`],
    };
  }

  if (input.provider === 'anthropic' && !existsSync(getAnthropicConfigPath())) {
    return {
      ok: false,
      error: 'PROVIDER_NOT_CONFIGURED',
      message: 'anthropic-config.json is missing',
      fix: ['Run setup_anthropic first'],
    };
  }
  if (input.provider === 'ollama' && !existsSync(getOllamaConfigPath())) {
    return {
      ok: false,
      error: 'PROVIDER_NOT_CONFIGURED',
      message: 'ollama-config.json is missing',
      fix: ['Run setup_ollama first'],
    };
  }
  if (input.provider === 'lmstudio' && !existsSync(getLmStudioConfigPath())) {
    return {
      ok: false,
      error: 'PROVIDER_NOT_CONFIGURED',
      message: 'lmstudio-config.json is missing',
      fix: ['Run setup_lmstudio first'],
    };
  }

  const home = getCcHomePath();
  mkdirSync(home, { recursive: true });
  const configPath = getActiveProviderPath();
  const tmp = `${configPath}.tmp`;
  writeFileSync(tmp, JSON.stringify({ provider: input.provider }, null, 2), { encoding: 'utf-8', mode: 0o600 });
  renameSync(tmp, configPath);

  return { ok: true, provider: input.provider, configPath };
}
