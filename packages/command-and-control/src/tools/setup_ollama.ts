import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchRecommendedModels } from '@canvas-toolchain/shared-llm';
import { getCcHomePath } from '../kb/config.js';

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
    }
  | {
      mode: 'commit';
      ok: false;
      error: string;
      message: string;
      fix: string[];
    };

function getOllamaConfigPath(): string {
  return join(getCcHomePath(), 'ollama-config.json');
}

function getCachePath(): string {
  return join(getCcHomePath(), 'cache', 'recommended-models.md');
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

async function probeTags(baseUrl: string): Promise<{ ok: true; tags: string[] } | { ok: false }> {
  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(`${baseUrl}/api/tags`, { signal: controller.signal });
    clearTimeout(tid);
    if (!response.ok) return { ok: false };
    const payload = (await response.json()) as { models?: Array<{ name?: string }> };
    const tags = (payload.models ?? []).map((m) => m.name ?? '').filter(Boolean);
    return { ok: true, tags };
  } catch {
    return { ok: false };
  }
}

export async function setupOllama(input: SetupOllamaInput): Promise<SetupOllamaResult> {
  const baseUrl = input.baseUrl ?? DEFAULT_BASE_URL;
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
      baseUrl,
      recommendations,
      nextStep: 'Pick a model from above and re-run setup_ollama with { model: "<id>" }.',
    };
  }

  const probe = await probeTags(baseUrl);
  if (!probe.ok) {
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

  const config: OllamaConfigFile = { baseUrl, model: input.model };
  const home = getCcHomePath();
  mkdirSync(home, { recursive: true });
  const configPath = getOllamaConfigPath();
  const tmpPath = `${configPath}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(config, null, 2), { encoding: 'utf-8', mode: 0o600 });
  renameSync(tmpPath, configPath);

  return {
    mode: 'commit',
    ok: true,
    baseUrl,
    model: input.model,
    configPath,
  };
}
