import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getCcHomePath } from '../kb/config.js';

export type ActiveProvider = 'anthropic' | 'ollama' | 'lmstudio';

export interface SetActiveLlmProviderInput {
  provider: ActiveProvider;
}

export type SetActiveLlmProviderResult =
  | { ok: true; provider: ActiveProvider; configPath: string }
  | { ok: false; error: string; message: string; fix: string[] };

/** What an automatic activation did, so a calling setup tool can report it honestly. */
export interface AutoActivateResult {
  /** True only when this call wrote llm-provider.json. */
  activated: boolean;
  /** The provider that is active afterwards, or null when none could be set. */
  activeProvider: ActiveProvider | null;
  /** One-line note for the calling tool's result. */
  note: string;
}

export interface MigrateActiveProviderResult {
  activated: boolean;
  provider: ActiveProvider | null;
}

export const VALID_PROVIDERS: readonly ActiveProvider[] = ['anthropic', 'ollama', 'lmstudio'];

function getActiveProviderPath(): string {
  return join(getCcHomePath(), 'llm-provider.json');
}

/** Each provider owns exactly one config file: `<provider>-config.json`. */
function providerConfigPath(provider: ActiveProvider): string {
  return join(getCcHomePath(), `${provider}-config.json`);
}

/** A provider counts as configured when its config file is on disk. */
export function isProviderConfigured(provider: ActiveProvider): boolean {
  return existsSync(providerConfigPath(provider));
}

export function listConfiguredProviders(): ActiveProvider[] {
  return VALID_PROVIDERS.filter(isProviderConfigured);
}

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

/** The active provider when the selector is present and valid, else null. Never throws. */
export function readActiveProviderOrNull(): ActiveProvider | null {
  try {
    return loadActiveProvider();
  } catch {
    return null;
  }
}

/**
 * Atomic 0o600 write of the provider selector — the single writer for
 * llm-provider.json, shared by the explicit tool, auto-activation and the
 * startup migration so they can never drift.
 */
function writeActiveProviderFile(provider: ActiveProvider): string {
  const home = getCcHomePath();
  mkdirSync(home, { recursive: true });
  const configPath = getActiveProviderPath();
  const tmp = `${configPath}.tmp`;
  writeFileSync(tmp, JSON.stringify({ provider }, null, 2), { encoding: 'utf-8', mode: 0o600 });
  // `mode` is ignored when tmp already exists (a tmp left by an interrupted
  // write), so force it. POSIX only — Windows has no POSIX modes.
  if (process.platform !== 'win32') chmodSync(tmp, 0o600);
  renameSync(tmp, configPath);
  return configPath;
}

/**
 * Activate `provider` after it was configured, unless a usable provider is
 * already active. Faculty may have several providers configured; the first one
 * they set up wins, and switching stays an explicit choice.
 */
export function autoActivateProvider(provider: ActiveProvider): AutoActivateResult {
  const current = readActiveProviderOrNull();
  if (current !== null && isProviderConfigured(current)) {
    return {
      activated: false,
      activeProvider: current,
      note:
        `Active LLM provider is already ${current}; ` +
        `run ct_setup action llm_provider to switch to ${provider}.`,
    };
  }
  writeActiveProviderFile(provider);
  return {
    activated: true,
    activeProvider: provider,
    note: `${provider} is now the active LLM provider.`,
  };
}

/**
 * Startup migration for installs that configured a provider before
 * auto-activation existed. Only a lone configured provider is unambiguous, so
 * with two or more this does nothing and the doctor's llm.active_provider
 * warning points at ct_setup action llm_provider. No network.
 */
export function migrateActiveProvider(): MigrateActiveProviderResult {
  if (existsSync(getActiveProviderPath())) return { activated: false, provider: null };
  const configured = listConfiguredProviders();
  if (configured.length !== 1) return { activated: false, provider: null };
  const provider = configured[0];
  writeActiveProviderFile(provider);
  return { activated: true, provider };
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

  if (!isProviderConfigured(input.provider)) {
    return {
      ok: false,
      error: 'PROVIDER_NOT_CONFIGURED',
      message: `${input.provider}-config.json is missing`,
      fix: [`Run setup_${input.provider} first`],
    };
  }

  const configPath = writeActiveProviderFile(input.provider);
  return { ok: true, provider: input.provider, configPath };
}
