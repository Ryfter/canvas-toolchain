import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, saveConfig, getCcHomePath } from '../../src/kb/config.js';
import { DEFAULT_CONFIG } from '../../src/types.js';

let tmpHome: string;

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'cc-home-'));
  process.env.CC_HOME = tmpHome;
});

afterEach(() => {
  delete process.env.CC_HOME;
  rmSync(tmpHome, { recursive: true, force: true });
});

describe('loadConfig', () => {
  it('returns default config when no file exists', () => {
    const config = loadConfig();
    expect(config.mode).toBe('easy');
    expect(config.providers.anthropic.model).toBe('claude-sonnet-4-6');
    expect(config.providers.ollama).toBeUndefined();
  });

  it('reads saved config back correctly', () => {
    const custom = { ...DEFAULT_CONFIG, mode: 'advanced' as const };
    saveConfig(custom);
    const loaded = loadConfig();
    expect(loaded.mode).toBe('advanced');
  });
});

describe('getCcHomePath', () => {
  it('respects CC_HOME env var', () => {
    expect(getCcHomePath()).toBe(tmpHome);
  });
});
