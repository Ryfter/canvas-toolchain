import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { AnthropicLlmClient, type LlmClient } from '@canvas-toolchain/shared-llm';

function ccHome(): string {
  return process.env.CC_HOME ?? join(homedir(), '.command-and-control');
}

export interface ModuleAnthropicConfig {
  apiKey: string;
  model: string;
}

const DEFAULT_MODEL = 'claude-haiku-4-5';

/** Read ~/.command-and-control/anthropic-config.json. Throws if not configured. */
export function loadAnthropicConfig(): ModuleAnthropicConfig {
  const path = join(ccHome(), 'anthropic-config.json');
  if (!existsSync(path)) {
    throw new Error('ANTHROPIC_NOT_CONFIGURED: Run setup_anthropic with your Anthropic API key.');
  }
  let parsed: Partial<ModuleAnthropicConfig>;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf-8')) as Partial<ModuleAnthropicConfig>;
  } catch {
    throw new Error('ANTHROPIC_NOT_CONFIGURED: anthropic-config.json is corrupt. Re-run setup_anthropic.');
  }
  if (!parsed.apiKey) {
    throw new Error('ANTHROPIC_NOT_CONFIGURED: anthropic-config.json is missing apiKey. Re-run setup_anthropic.');
  }
  return { apiKey: parsed.apiKey, model: parsed.model ?? DEFAULT_MODEL };
}

/** Construct the production LLM client. Tests inject their own LlmClient instead. */
export function makeAnthropicLlm(): LlmClient {
  const cfg = loadAnthropicConfig();
  return new AnthropicLlmClient({ apiKey: cfg.apiKey, model: cfg.model });
}
