import { listLmStudioModels } from '@canvas-toolchain/shared-llm';
import { probeTags } from './setup_ollama.js';
import {
  listConfiguredProviders,
  readActiveProviderOrNull,
  setActiveLlmProvider,
  type ActiveProvider,
} from './set_active_llm_provider.js';

/** The default endpoints local providers listen on, probed only when this op runs. */
const OLLAMA_DEFAULT_URL = 'http://localhost:11434';
const LMSTUDIO_DEFAULT_URL = 'http://localhost:1234/v1';
/** Short budget: detection is a convenience and must never hang the chat. */
const DETECT_TIMEOUT_MS = 1500;

export interface SetupLlmProviderInput {
  /** When set, activate this provider instead of reporting state. */
  provider?: ActiveProvider;
}

export interface LocalServerProbe {
  provider: 'ollama' | 'lmstudio';
  baseUrl: string;
  reachable: boolean;
  /** Model ids the server reports. Empty when unreachable. */
  models: string[];
  /** The exact next call to configure this server. */
  configure: string;
}

export type SetupLlmProviderResult =
  | {
      mode: 'report';
      activeProvider: ActiveProvider | null;
      configuredProviders: ActiveProvider[];
      localServers: LocalServerProbe[];
      nextSteps: string[];
    }
  | { mode: 'activate'; ok: true; provider: ActiveProvider; configPath: string }
  | { mode: 'activate'; ok: false; error: string; message: string; fix: string[] };

async function detectOllama(): Promise<LocalServerProbe> {
  const probe = await probeTags(OLLAMA_DEFAULT_URL, { timeoutMs: DETECT_TIMEOUT_MS });
  if (!probe.ok) {
    return {
      provider: 'ollama',
      baseUrl: OLLAMA_DEFAULT_URL,
      reachable: false,
      models: [],
      configure:
        "Start Ollama with 'ollama serve', pull a model, then run ct_setup action ollama with " +
        '{ model: "<id>" }.',
    };
  }
  return {
    provider: 'ollama',
    baseUrl: probe.url,
    reachable: true,
    models: probe.tags,
    configure: probe.tags.length > 0
      ? `ct_setup action ollama with { model: "${probe.tags[0]}" }`
      : 'Pull a model first (ollama pull <name>), then run ct_setup action ollama with { model: "<id>" }.',
  };
}

async function detectLmStudio(): Promise<LocalServerProbe> {
  try {
    const models = await listLmStudioModels(LMSTUDIO_DEFAULT_URL, { timeoutMs: DETECT_TIMEOUT_MS });
    return {
      provider: 'lmstudio',
      baseUrl: LMSTUDIO_DEFAULT_URL,
      reachable: true,
      models,
      configure: models.length > 0
        ? `ct_setup action lmstudio with { model: "${models[0]}" }`
        : 'Load a model in LM Studio, then run ct_setup action lmstudio.',
    };
  } catch {
    return {
      provider: 'lmstudio',
      baseUrl: LMSTUDIO_DEFAULT_URL,
      reachable: false,
      models: [],
      configure:
        'Open LM Studio, load a model, click Developer > Start Server, then run ct_setup action lmstudio.',
    };
  }
}

function nextStepsFor(
  activeProvider: ActiveProvider | null,
  configured: ActiveProvider[],
  localServers: LocalServerProbe[],
): string[] {
  const steps: string[] = [];

  if (activeProvider !== null && !configured.includes(activeProvider)) {
    steps.push(
      `llm-provider.json selects ${activeProvider}, but ${activeProvider}-config.json is missing; ` +
      `run ct_setup action ${activeProvider} to configure it.`,
    );
  }

  if (activeProvider !== null) {
    steps.push(`Active LLM provider: ${activeProvider}.`);
    const alternates = configured.filter((p) => p !== activeProvider);
    if (alternates.length > 0) {
      steps.push(
        `Switch with ct_setup action llm_provider with { provider: "${alternates[0]}" }` +
        (alternates.length > 1 ? ` (also configured: ${alternates.slice(1).join(', ')}).` : '.'),
      );
    } else {
      steps.push('No other provider is configured; ct_setup action anthropic, ollama or lmstudio adds one.');
    }
  } else if (configured.length > 0) {
    steps.push(
      'No active LLM provider is set. Activate a configured one with ct_setup action llm_provider: ' +
      configured.map((p) => `{ provider: "${p}" }`).join(' or ') + '.',
    );
  } else {
    steps.push(
      'No LLM provider is configured yet. Add an Anthropic key with ct_setup action anthropic, ' +
      'or configure a local model with ct_setup action ollama or lmstudio.',
    );
  }

  for (const server of localServers) {
    if (server.reachable) {
      const named = server.models.length > 0
        ? `${server.models.length} model(s): ${server.models.join(', ')}`
        : 'no model loaded';
      steps.push(
        `${server.provider} is running at ${server.baseUrl} (${named}). Configure it: ${server.configure}`,
      );
    }
  }
  if (localServers.every((server) => !server.reachable)) {
    steps.push('No local Ollama or LM Studio server answered at its default URL.');
  }

  return steps;
}

/**
 * One place to see and choose the generation LLM. With no `provider` it reports
 * the active and configured providers and probes the local servers at their
 * default URLs; with `provider` it activates an already-configured provider.
 */
export async function setupLlmProvider(input: SetupLlmProviderInput = {}): Promise<SetupLlmProviderResult> {
  if (input.provider !== undefined) {
    const result = await setActiveLlmProvider({ provider: input.provider });
    if (result.ok) {
      return { mode: 'activate', ok: true, provider: result.provider, configPath: result.configPath };
    }
    return { mode: 'activate', ok: false, error: result.error, message: result.message, fix: result.fix };
  }

  const activeProvider = readActiveProviderOrNull();
  const configuredProviders = listConfiguredProviders();
  const localServers = await Promise.all([detectOllama(), detectLmStudio()]);

  return {
    mode: 'report',
    activeProvider,
    configuredProviders,
    localServers,
    nextSteps: nextStepsFor(activeProvider, configuredProviders, localServers),
  };
}
