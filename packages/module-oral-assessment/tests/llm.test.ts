import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadAnthropicConfig } from '../src/llm.js';

const saved = process.env.CC_HOME;
afterEach(() => { if (saved === undefined) delete process.env.CC_HOME; else process.env.CC_HOME = saved; });

describe('loadAnthropicConfig', () => {
  it('throws ANTHROPIC_NOT_CONFIGURED when absent', () => {
    process.env.CC_HOME = mkdtempSync(join(tmpdir(), 'oa-llm-'));
    expect(() => loadAnthropicConfig()).toThrow(/ANTHROPIC_NOT_CONFIGURED/);
  });
  it('reads apiKey + model when present', () => {
    const home = mkdtempSync(join(tmpdir(), 'oa-llm-'));
    process.env.CC_HOME = home;
    writeFileSync(join(home, 'anthropic-config.json'), JSON.stringify({ apiKey: 'sk-x', model: 'claude-y' }));
    const cfg = loadAnthropicConfig();
    expect(cfg.apiKey).toBe('sk-x');
    expect(cfg.model).toBe('claude-y');
    rmSync(home, { recursive: true, force: true });
  });
});
