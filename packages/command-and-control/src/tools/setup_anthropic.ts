import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getCcHomePath } from '../kb/config.js';

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

export interface AnthropicSetupConfig {
  apiKey: string;
  model: string;
  configuredAt: string;
  lastValidatedAt: string;
}

export interface SetupAnthropicInput {
  apiKey: string;
  /** Defaults to claude-haiku-4-5-20251001 — chosen for low-cost validation calls. */
  model?: string;
  /** Default: true — validate the key with a 1-token call before saving. */
  test?: boolean;
}

export interface SetupAnthropicResult {
  configured: boolean;
  model?: string;
  validatedAt?: string;
  message?: string;
  error?: string;
  fix?: string[];
}

function getAnthropicConfigPath(): string {
  return join(getCcHomePath(), 'anthropic-config.json');
}

export function loadAnthropicConfig(): AnthropicSetupConfig {
  const configPath = getAnthropicConfigPath();
  if (!existsSync(configPath)) {
    throw new Error(
      'ANTHROPIC_NOT_CONFIGURED: Run setup_anthropic with your Anthropic API key.',
    );
  }
  let config: Partial<AnthropicSetupConfig>;
  try {
    config = JSON.parse(readFileSync(configPath, 'utf-8'));
  } catch {
    throw new Error(
      'ANTHROPIC_NOT_CONFIGURED: anthropic-config.json is corrupt. Re-run setup_anthropic.',
    );
  }
  if (!config.apiKey) {
    throw new Error(
      'ANTHROPIC_NOT_CONFIGURED: anthropic-config.json is missing apiKey. Re-run setup_anthropic.',
    );
  }
  return {
    apiKey: config.apiKey,
    model: config.model ?? DEFAULT_MODEL,
    configuredAt: config.configuredAt ?? '',
    lastValidatedAt: config.lastValidatedAt ?? '',
  };
}

async function validateKey(apiKey: string, model: string): Promise<void> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1,
      messages: [{ role: 'user', content: '.' }],
    }),
  });
  if (!response.ok) {
    throw new Error(`Anthropic API returned ${response.status}`);
  }
}

export async function setupAnthropic(input: SetupAnthropicInput): Promise<SetupAnthropicResult> {
  const { apiKey, model = DEFAULT_MODEL, test = true } = input;
  const now = new Date().toISOString();

  if (test) {
    try {
      await validateKey(apiKey, model);
    } catch (err) {
      return {
        configured: false,
        error: 'CREDENTIAL_VALIDATION_FAILED',
        message: err instanceof Error ? err.message : String(err),
        fix: [
          'Verify the API key at platform.anthropic.com/account/api-keys',
          'Confirm the key has access to the chosen model',
          'Check network connectivity to api.anthropic.com',
        ],
      };
    }
  }

  const config: AnthropicSetupConfig = {
    apiKey,
    model,
    configuredAt: now,
    lastValidatedAt: test ? now : '',
  };

  const home = getCcHomePath();
  mkdirSync(home, { recursive: true });
  const configPath = getAnthropicConfigPath();
  const tmpPath = `${configPath}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(config, null, 2), { encoding: 'utf-8', mode: 0o600 });
  renameSync(tmpPath, configPath);

  return {
    configured: true,
    model,
    ...(test && { validatedAt: now }),
    message: test
      ? `Anthropic API key configured and validated against ${model}.`
      : `Anthropic API key configured (not tested).`,
  };
}
