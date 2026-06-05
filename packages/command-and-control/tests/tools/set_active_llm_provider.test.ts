import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir, platform } from 'node:os';
import { join } from 'node:path';
import { setActiveLlmProvider, loadActiveProvider } from '../../src/tools/set_active_llm_provider.js';

let ccHomeDir: string;
const ORIGINAL_CC_HOME = process.env.CC_HOME;

beforeEach(() => {
  ccHomeDir = mkdtempSync(join(tmpdir(), 'cc-home-'));
  process.env.CC_HOME = ccHomeDir;
});

afterEach(() => {
  rmSync(ccHomeDir, { recursive: true, force: true });
  if (ORIGINAL_CC_HOME === undefined) delete process.env.CC_HOME;
  else process.env.CC_HOME = ORIGINAL_CC_HOME;
});

function seedAnthropicConfig() {
  writeFileSync(join(ccHomeDir, 'anthropic-config.json'), JSON.stringify({ apiKey: 'sk-test', model: 'claude' }));
}

function seedOllamaConfig() {
  writeFileSync(join(ccHomeDir, 'ollama-config.json'), JSON.stringify({ baseUrl: 'http://localhost:11434', model: 'qwen2.5:14b' }));
}

describe('setActiveLlmProvider', () => {
  it('writes llm-provider.json with provider=anthropic when anthropic-config.json exists', async () => {
    seedAnthropicConfig();
    const result = await setActiveLlmProvider({ provider: 'anthropic' });

    expect(result.ok).toBe(true);
    expect(result.provider).toBe('anthropic');
    const path = join(ccHomeDir, 'llm-provider.json');
    expect(JSON.parse(readFileSync(path, 'utf-8'))).toEqual({ provider: 'anthropic' });

    if (platform() !== 'win32') {
      expect(statSync(path).mode & 0o777).toBe(0o600);
    }
  });

  it('writes llm-provider.json with provider=ollama when ollama-config.json exists', async () => {
    seedOllamaConfig();
    const result = await setActiveLlmProvider({ provider: 'ollama' });

    expect(result.ok).toBe(true);
    expect(result.provider).toBe('ollama');
    expect(JSON.parse(readFileSync(join(ccHomeDir, 'llm-provider.json'), 'utf-8'))).toEqual({ provider: 'ollama' });
  });

  it('returns PROVIDER_NOT_CONFIGURED when anthropic chosen but config missing', async () => {
    const result = await setActiveLlmProvider({ provider: 'anthropic' });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('PROVIDER_NOT_CONFIGURED');
    expect(result.fix).toEqual(['Run setup_anthropic first']);
    expect(existsSync(join(ccHomeDir, 'llm-provider.json'))).toBe(false);
  });

  it('returns PROVIDER_NOT_CONFIGURED when ollama chosen but config missing', async () => {
    const result = await setActiveLlmProvider({ provider: 'ollama' });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('PROVIDER_NOT_CONFIGURED');
    expect(result.fix).toEqual(['Run setup_ollama first']);
    expect(existsSync(join(ccHomeDir, 'llm-provider.json'))).toBe(false);
  });

  it('returns INVALID_PROVIDER for any other value', async () => {
    seedAnthropicConfig();
    const result = await setActiveLlmProvider({ provider: 'gemini' as never });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('INVALID_PROVIDER');
  });
});

describe('loadActiveProvider', () => {
  it('throws when llm-provider.json absent', () => {
    expect(() => loadActiveProvider()).toThrow(/LLM_PROVIDER_NOT_SET/);
  });

  it('returns the provider name when file present', () => {
    mkdirSync(ccHomeDir, { recursive: true });
    writeFileSync(join(ccHomeDir, 'llm-provider.json'), JSON.stringify({ provider: 'ollama' }));
    expect(loadActiveProvider()).toBe('ollama');
  });

  it('throws when file is corrupt', () => {
    mkdirSync(ccHomeDir, { recursive: true });
    writeFileSync(join(ccHomeDir, 'llm-provider.json'), 'not json');
    expect(() => loadActiveProvider()).toThrow(/LLM_PROVIDER_NOT_SET/);
  });

  it('throws when provider value is not anthropic or ollama', () => {
    mkdirSync(ccHomeDir, { recursive: true });
    writeFileSync(join(ccHomeDir, 'llm-provider.json'), JSON.stringify({ provider: 'gemini' }));
    expect(() => loadActiveProvider()).toThrow(/LLM_PROVIDER_NOT_SET/);
  });
});
