import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AnthropicLlmClient, type LlmClient } from '@canvas-toolchain/shared-llm';
import { ccHome } from '../paths.js';

export interface ModuleAnthropicConfig { apiKey: string; model: string; }

const DEFAULT_MODEL = 'claude-haiku-4-5';

/** Read anthropic-config.json, or null if not configured / unreadable. */
export function loadAnthropicConfig(): ModuleAnthropicConfig | null {
  const path = join(ccHome(), 'anthropic-config.json');
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as Partial<ModuleAnthropicConfig>;
    if (!parsed.apiKey) return null;
    return { apiKey: parsed.apiKey, model: parsed.model ?? DEFAULT_MODEL };
  } catch {
    return null;
  }
}

/** Construct the production LLM client, or null when unconfigured (normalization degrades). */
export function tryMakeAnthropicLlm(): LlmClient | null {
  const cfg = loadAnthropicConfig();
  return cfg ? new AnthropicLlmClient({ apiKey: cfg.apiKey, model: cfg.model }) : null;
}
