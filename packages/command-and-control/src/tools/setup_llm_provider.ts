import { listLmStudioModels } from '@canvas-toolchain/shared-llm';
import { probeTags } from './setup_ollama.js';
import {
  formatProviderList,
  listConfiguredProviders,
  PREFERRED_PROVIDER_ORDER,
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

/** One provider the professor could use, with the exact call that gets there. */
export interface ProviderOption {
  provider: ActiveProvider;
  /** Its `<provider>-config.json` is on disk. */
  configured: boolean;
  /** Its local server answered at the default URL. Always false for Anthropic. */
  detected: boolean;
  /** Activate it when it is configured; configure it when it is only detected. */
  call: string;
}

export type SetupLlmProviderResult =
  | {
      mode: 'report';
      activeProvider: ActiveProvider | null;
      configuredProviders: ActiveProvider[];
      localServers: LocalServerProbe[];
      /** Providers worth choosing, best first: LM Studio, Ollama, Anthropic. */
      options: ProviderOption[];
      /** The one call to recommend next, or null when there is nothing to offer. */
      recommended: string | null;
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
): { options: ProviderOption[]; recommended: string | null; nextSteps: string[] } {
  const reachable = new Map<ActiveProvider, LocalServerProbe>(
    localServers.filter((server) => server.reachable).map((server) => [server.provider, server]),
  );

  // Everything worth offering, best first. A configured provider is activated;
  // one that is only detected is what the probe's own configure call does.
  const options: ProviderOption[] = [];
  for (const provider of PREFERRED_PROVIDER_ORDER) {
    const server = reachable.get(provider);
    if (configured.includes(provider)) {
      options.push({
        provider,
        configured: true,
        detected: server !== undefined,
        call: `ct_setup action llm_provider with { provider: "${provider}" }`,
      });
    } else if (server !== undefined) {
      options.push({ provider, configured: false, detected: true, call: server.configure });
    }
  }

  const steps: string[] = [];
  let recommended: string | null = null;

  if (activeProvider !== null && !configured.includes(activeProvider)) {
    // The selector points at a provider with no config file: it is not usable, so
    // do not also call it the active provider — that reads as a contradiction.
    recommended = `ct_setup action ${activeProvider}`;
    steps.push(
      `llm-provider.json selects ${activeProvider}, but ${activeProvider}-config.json is missing; ` +
      `run ${recommended} to configure it.`,
    );
  } else if (activeProvider !== null) {
    steps.push(`Active LLM provider: ${activeProvider}.`);
    // Only a configured provider can be switched to; a merely detected server is
    // reported by the probe lines below, with its own configure call.
    const alternates = options.filter((option) => option.provider !== activeProvider && option.configured);
    if (alternates.length > 0) {
      recommended = alternates[0].call;
      steps.push(
        `Switch with ${recommended}` +
        (alternates.length > 1
          ? `; also available: ${alternates.slice(1).map((option) => option.call).join('; ')}.`
          : '.'),
      );
    } else {
      steps.push(`No other provider is configured; ct_setup action ${formatProviderList()} adds one.`);
    }
  } else if (options.length > 0) {
    // Preferences order the recommendation; they never make the choice.
    recommended = options[0].call;
    steps.push(`Recommended next call: ${recommended}`);
    for (const option of options.slice(1)) {
      steps.push(`Alternative: ${option.call}`);
    }
  } else {
    steps.push(
      'No LLM provider is configured yet. Add an Anthropic key with ct_setup action anthropic, ' +
      'or configure a local model with ct_setup action lmstudio or ollama.',
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
    steps.push('No local LM Studio or Ollama server answered at its default URL.');
  }

  return { options, recommended, nextSteps: steps };
}

/**
 * One place to see and choose the generation LLM. With no `provider` it reports
 * the active and configured providers and probes the local servers at their
 * default URLs, recommending the best candidate first (LM Studio, then Ollama,
 * then Anthropic); with `provider` it activates an already-configured provider.
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
  // Both probes run in parallel; the results are presented in preference order.
  const probes = await Promise.all([detectOllama(), detectLmStudio()]);
  const localServers = PREFERRED_PROVIDER_ORDER
    .flatMap((provider) => probes.filter((probe) => probe.provider === provider));
  const report = nextStepsFor(activeProvider, configuredProviders, localServers);

  return {
    mode: 'report',
    activeProvider,
    configuredProviders,
    localServers,
    options: report.options,
    recommended: report.recommended,
    nextSteps: report.nextSteps,
  };
}
