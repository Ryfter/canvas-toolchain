import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  fetchRecommendedModels,
  parseEndpointUrl,
  assertEndpointAllowed,
  redirectBlocked,
  EndpointBlockedError,
} from '@canvas-toolchain/shared-llm';
import { getCcDataPath, getCcHomePath } from '../kb/config.js';
import { autoActivateProvider, type AutoActivateResult } from './set_active_llm_provider.js';

const DEFAULT_BASE_URL = 'http://localhost:11434';
const DEFAULT_RECOMMENDATIONS_URL =
  'https://raw.githubusercontent.com/Ryfter/canvas-toolchain/main/docs/recommended-models.md';
const RECOMMENDATIONS_TTL_MS = 24 * 60 * 60 * 1000;

export interface OllamaConfigFile {
  baseUrl: string;
  model: string;
}

export interface SetupOllamaInput {
  baseUrl?: string;
  model?: string;
}

export type SetupOllamaResult =
  | {
      mode: 'discovery';
      ok: true;
      baseUrl: string;
      recommendations: string;
      nextStep: string;
    }
  | {
      mode: 'commit';
      ok: true;
      baseUrl: string;
      model: string;
      configPath: string;
      message: string;
      /** What the post-setup auto-activation did. */
      activation: AutoActivateResult;
    }
  | {
      mode: 'commit';
      ok: false;
      error: string;
      message: string;
      fix: string[];
    }
  | {
      /** The supplied baseUrl never passed URL validation (scheme, userinfo,
       *  host). No request was made and nothing was written. */
      mode: 'blocked';
      ok: false;
      error: 'ENDPOINT_BLOCKED';
      message: string;
      fix: string[];
    };

function getOllamaConfigPath(): string {
  return join(getCcHomePath(), 'ollama-config.json');
}

function getCachePath(): string {
  // data-class (legacyEntryRoot): regenerable cache. ollama-config.json stays config-class (no secret).
  return join(getCcDataPath(), 'cache', 'recommended-models.md');
}

function getFallbackPath(): string {
  return fileURLToPath(new URL('../recommended-models.fallback.md', import.meta.url));
}

export function loadOllamaConfig(): OllamaConfigFile {
  const path = getOllamaConfigPath();
  if (!existsSync(path)) {
    throw new Error('OLLAMA_NOT_CONFIGURED: Run setup_ollama with a chosen model.');
  }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as Partial<OllamaConfigFile>;
    if (!parsed.baseUrl || !parsed.model) {
      throw new Error('OLLAMA_NOT_CONFIGURED: ollama-config.json missing fields. Re-run setup_ollama.');
    }
    return { baseUrl: parsed.baseUrl, model: parsed.model };
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('OLLAMA_NOT_CONFIGURED')) throw err;
    throw new Error('OLLAMA_NOT_CONFIGURED: ollama-config.json is corrupt. Re-run setup_ollama.');
  }
}

export type OllamaProbeResult =
  | { ok: true; url: string; tags: string[] }
  | { ok: false; blocked?: EndpointBlockedError };

const PROBE_TIMEOUT_MS = 3000;

/** Probe `{baseUrl}/api/tags` through the SSRF guard. Shared with detection. */
export async function probeTags(
  baseUrl: string,
  opts: { timeoutMs?: number } = {},
): Promise<OllamaProbeResult> {
  // SSRF guard: refuse blocked targets before any request. Re-checked here
  // rather than only at the top of setupOllama so it runs immediately before
  // the outbound call.
  let endpoint: Awaited<ReturnType<typeof assertEndpointAllowed>>;
  try {
    endpoint = await assertEndpointAllowed(baseUrl);
  } catch (err) {
    return { ok: false, blocked: err instanceof EndpointBlockedError ? err : undefined };
  }
  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), opts.timeoutMs ?? PROBE_TIMEOUT_MS);
    const response = await fetch(`${endpoint.url}/api/tags`, {
      signal: controller.signal,
      redirect: 'manual',
    });
    clearTimeout(tid);
    if (response.status >= 300 && response.status < 400) {
      return { ok: false, blocked: redirectBlocked(`${endpoint.url}/api/tags`) };
    }
    if (!response.ok) return { ok: false };
    const payload = (await response.json()) as { models?: Array<{ name?: string }> };
    const tags = (payload.models ?? []).map((m) => m.name ?? '').filter(Boolean);
    return { ok: true, url: endpoint.url, tags };
  } catch {
    return { ok: false };
  }
}

export async function setupOllama(input: SetupOllamaInput): Promise<SetupOllamaResult> {
  // SSRF guard, parse pass (all modes): validate + canonicalize the endpoint up
  // front so every path — discovery included — echoes and persists only a
  // vetted URL, with any query/fragment/userinfo already stripped.
  let baseUrl: string;
  try {
    baseUrl = parseEndpointUrl(input.baseUrl ?? DEFAULT_BASE_URL).url;
  } catch (err) {
    if (err instanceof EndpointBlockedError) {
      return { mode: 'blocked', ok: false, error: 'ENDPOINT_BLOCKED', message: err.message, fix: err.fix };
    }
    throw err;
  }
  const recommendationsUrl = process.env.CC_RECOMMENDED_MODELS_URL ?? DEFAULT_RECOMMENDATIONS_URL;

  if (!input.model) {
    const recommendations = await fetchRecommendedModels({
      url: recommendationsUrl,
      cachePath: getCachePath(),
      fallbackPath: getFallbackPath(),
      ttlMs: RECOMMENDATIONS_TTL_MS,
    });
    return {
      mode: 'discovery',
      ok: true,
      baseUrl,
      recommendations,
      nextStep: 'Pick a model from above and re-run setup_ollama with { model: "<id>" }.',
    };
  }

  const probe = await probeTags(baseUrl);
  if (!probe.ok) {
    if (probe.blocked) {
      return {
        mode: 'commit',
        ok: false,
        error: 'ENDPOINT_BLOCKED',
        message: probe.blocked.message,
        fix: probe.blocked.fix,
      };
    }
    return {
      mode: 'commit',
      ok: false,
      error: 'OLLAMA_UNREACHABLE',
      message: `Could not reach Ollama at ${baseUrl}/api/tags`,
      fix: [`Start Ollama with 'ollama serve', or switch providers with set_active_llm_provider`],
    };
  }
  if (!probe.tags.includes(input.model)) {
    return {
      mode: 'commit',
      ok: false,
      error: 'OLLAMA_MODEL_NOT_PULLED',
      message: `Model '${input.model}' is not present in /api/tags`,
      fix: [`Run: ollama pull ${input.model}`],
    };
  }

  // Persist the canonical (query/fragment-free) URL the guard vetted.
  const config: OllamaConfigFile = { baseUrl: probe.url, model: input.model };
  const home = getCcHomePath();
  mkdirSync(home, { recursive: true });
  const configPath = getOllamaConfigPath();
  const tmpPath = `${configPath}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(config, null, 2), { encoding: 'utf-8', mode: 0o600 });
  renameSync(tmpPath, configPath);

  const activation = autoActivateProvider('ollama');

  return {
    mode: 'commit',
    ok: true,
    baseUrl: probe.url,
    model: input.model,
    configPath,
    message: `Ollama configured with ${input.model}. ${activation.note}`,
    activation,
  };
}
