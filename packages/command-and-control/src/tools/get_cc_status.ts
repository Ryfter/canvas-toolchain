import { createRequire } from 'node:module';
import { assertEndpointAllowed, parseEndpointUrl } from '@canvas-toolchain/shared-llm';
import { loadConfig } from '../kb/config.js';
import { readSetupState } from '../setup/read_state.js';
import type { ActiveProvider } from '../setup/types.js';
import { DEFAULT_CONFIG, type CcConfig, type Mode, type ProviderName } from '../types.js';
import { loadSpotCheckPreference } from './shell_ready/spot_check_preference.js';

const localRequire = createRequire(import.meta.url);

/** Bounded: a status snapshot must not stall when Ollama is configured but down. */
const OLLAMA_PROBE_TIMEOUT_MS = 2000;

/** Set when ANTHROPIC_API_KEY is present but the runtime will not read it. */
const ENV_ONLY_ANTHROPIC_NOTE =
  'ANTHROPIC_API_KEY is set in the environment, but the runtime reads ' +
  'anthropic-config.json instead — run ct_setup action anthropic to store the key where it is used.';

export interface GetCcStatusResult {
  mode: Mode;
  providers: {
    anthropic: {
      model: string;
      /** True only when anthropic-config.json holds a key — the surface the runtime reads. */
      keyPresent: boolean;
      /** Where a key exists. 'env' means the runtime ignores it. */
      source: 'file' | 'env' | 'both' | 'none';
      /** Present only when an environment key exists that the runtime does not read. */
      note?: string;
    };
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
  /** Which LLM provider the AI tools will actually use. */
  llm: { activeProvider: ActiveProvider | null };
  /** Where to go for the full readiness report. */
  diagnostics: {
    tool: 'ct_setup';
    action: 'doctor';
    hint: string;
  };
  routing: { fast: ProviderName; judgment: ProviderName };
  lastRun: CcConfig['lastRun'];
}

/** Canonical form of a saved base URL. A URL that fails to parse (e.g. one
 *  carrying user:pass@) is never echoed — status output flows into LLM context. */
function describeBaseUrl(raw: string): string {
  try {
    return parseEndpointUrl(raw).url;
  } catch {
    return '(invalid URL)';
  }
}

/** Called only when `ollama-config.json` says Ollama is configured. */
async function pingOllama(baseUrl: string): Promise<boolean> {
  // SSRF guard: a saved config may hold a now-blocked URL — report unreachable
  // rather than crashing the status probe or fetching the blocked target.
  let endpoint: Awaited<ReturnType<typeof assertEndpointAllowed>>;
  try {
    endpoint = await assertEndpointAllowed(baseUrl);
  } catch {
    return false;
  }
  try {
    const res = await fetch(`${endpoint.url}/api/tags`, {
      signal: AbortSignal.timeout(OLLAMA_PROBE_TIMEOUT_MS),
      redirect: 'manual',
    });
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

/**
 * A projection of `readSetupState` in the legacy status shape, plus a pointer to
 * the doctor. Adds fields; never renames or removes one.
 */
export async function getCcStatus(): Promise<GetCcStatusResult> {
  const config = loadConfig();
  const state = await readSetupState();
  const { anthropic, ollama } = state.llm;

  const ollamaStatus = ollama.configured && ollama.host
    ? {
        baseUrl: describeBaseUrl(ollama.host),
        model: ollama.model ?? '',
        reachable: await pingOllama(ollama.host),
      }
    : undefined;

  const ciInstalled = isPackageInstalled('@canvas-toolchain/curriculum-intelligence');
  const designStudioInstalled = isPackageInstalled('@canvas-toolchain/canvas-design-studio');
  const spotPref = loadSpotCheckPreference();

  return {
    mode: config.mode ?? DEFAULT_CONFIG.mode,
    providers: {
      anthropic: {
        model: config.providers?.anthropic?.model ?? DEFAULT_CONFIG.providers.anthropic.model,
        keyPresent: anthropic.source === 'file' || anthropic.source === 'both',
        source: anthropic.source,
        ...(anthropic.source === 'env' ? { note: ENV_ONLY_ANTHROPIC_NOTE } : {}),
      },
      ollama: ollamaStatus,
    },
    installedPackages: {
      ci: ciInstalled,
      downloader: state.backup.executableConfigured,
      designStudio: designStudioInstalled,
    },
    configured: {
      canvasConfig: state.files['canvas-config'].present,
      llmProvider: state.files['llm-provider'].present,
      canvasBackupToml: state.backup.managedTomlPresent,
    },
    spotCheck: spotPref
      ? { configured: true, enabled: spotPref.weeklyCheckEnabled, day: spotPref.weeklyCheckDay }
      : { configured: false, enabled: false, day: null },
    llm: { activeProvider: state.llm.activeProvider },
    diagnostics: {
      tool: 'ct_setup',
      action: 'doctor',
      hint: 'Run ct_setup action doctor for full diagnostics (probe:true adds live Canvas and Anthropic checks).',
    },
    routing: config.routing ?? DEFAULT_CONFIG.routing,
    lastRun: config.lastRun ?? DEFAULT_CONFIG.lastRun,
  };
}
