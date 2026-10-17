import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  parseEndpointUrl,
  listLmStudioModels,
  EndpointBlockedError,
  LlmProviderError,
} from '@canvas-toolchain/shared-llm';
import { getCcHomePath } from '../kb/config.js';

const DEFAULT_BASE_URL = 'http://localhost:1234/v1';

const UNREACHABLE_FIX = [
  'Open LM Studio, load a model, then click Developer > Start Server',
  'Confirm the server URL matches your baseUrl (default http://localhost:1234/v1)',
];

export interface LmStudioConfigFile {
  baseUrl: string;
  model: string;
}

export interface SetupLmStudioInput {
  baseUrl?: string;
  model?: string;
}

export type SetupLmStudioResult =
  | {
      mode: 'discovery';
      ok: true;
      baseUrl: string;
      models: string[];
      message: string;
      nextStep: string;
    }
  | {
      mode: 'discovery';
      ok: false;
      error: string;
      message: string;
      fix: string[];
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
    }
  | {
      /** The supplied baseUrl never passed URL validation (scheme, userinfo,
       *  host) or resolves to a blocked address. No request was made and
       *  nothing was written. */
      mode: 'blocked';
      ok: false;
      error: 'ENDPOINT_BLOCKED';
      message: string;
      fix: string[];
    };

function getLmStudioConfigPath(): string {
  return join(getCcHomePath(), 'lmstudio-config.json');
}

export function loadLmStudioConfig(): LmStudioConfigFile {
  const path = getLmStudioConfigPath();
  if (!existsSync(path)) {
    throw new Error('LMSTUDIO_NOT_CONFIGURED: Run setup_lmstudio with a chosen model.');
  }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as Partial<LmStudioConfigFile>;
    if (!parsed.baseUrl || !parsed.model) {
      throw new Error('LMSTUDIO_NOT_CONFIGURED: lmstudio-config.json missing fields. Re-run setup_lmstudio.');
    }
    return { baseUrl: parsed.baseUrl, model: parsed.model };
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('LMSTUDIO_NOT_CONFIGURED')) throw err;
    throw new Error('LMSTUDIO_NOT_CONFIGURED: lmstudio-config.json is corrupt. Re-run setup_lmstudio.');
  }
}

export async function setupLmStudio(input: SetupLmStudioInput): Promise<SetupLmStudioResult> {
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

  // LM Studio serves an OpenAI-compatible surface. Listing models is both the
  // discovery answer and the reachability probe the commit path validates
  // against, so it runs through the guard (which re-resolves the host) and
  // refuses redirects. A remote/LAN server may require Bearer auth; the key
  // arrives via the environment and is sent as a header only — never persisted.
  const apiKey = process.env.LMSTUDIO_API_KEY;
  let models: string[];
  try {
    models = await listLmStudioModels(baseUrl, apiKey ? { apiKey } : {});
  } catch (err) {
    if (err instanceof EndpointBlockedError) {
      return { mode: 'blocked', ok: false, error: 'ENDPOINT_BLOCKED', message: err.message, fix: err.fix };
    }
    if (err instanceof LlmProviderError) {
      const message = `Could not reach LM Studio at ${baseUrl}/models`;
      if (input.model) {
        return { mode: 'commit', ok: false, error: err.code, message, fix: err.fix };
      }
      return { mode: 'discovery', ok: false, error: err.code, message, fix: err.fix };
    }
    const message = `Could not reach LM Studio at ${baseUrl}/models`;
    if (input.model) {
      return { mode: 'commit', ok: false, error: 'LMSTUDIO_UNREACHABLE', message, fix: UNREACHABLE_FIX };
    }
    return { mode: 'discovery', ok: false, error: 'LMSTUDIO_UNREACHABLE', message, fix: UNREACHABLE_FIX };
  }

  if (!input.model) {
    const message = models.length > 0
      ? `LM Studio is running at ${baseUrl}. Loaded models: ${models.join(', ')}.`
      : 'LM Studio is running at ' + baseUrl + ' but no model is loaded.';
    return {
      mode: 'discovery',
      ok: true,
      baseUrl,
      models,
      message,
      nextStep: models.length > 0
        ? 'Pick a model from above and re-run setup_lmstudio with { model: "<id>" }.'
        : 'Load a model in LM Studio, then re-run setup_lmstudio.',
    };
  }

  if (!models.includes(input.model)) {
    return {
      mode: 'commit',
      ok: false,
      error: 'LMSTUDIO_MODEL_NOT_FOUND',
      message: `Model '${input.model}' is not loaded in LM Studio`,
      fix: [
        `Load '${input.model}' in LM Studio, or run setup_lmstudio with no model to list loaded models`,
      ],
    };
  }

  // Persist the canonical (query/fragment-free) URL the guard vetted.
  const config: LmStudioConfigFile = { baseUrl, model: input.model };
  const home = getCcHomePath();
  mkdirSync(home, { recursive: true });
  const configPath = getLmStudioConfigPath();
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
