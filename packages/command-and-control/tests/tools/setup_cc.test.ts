import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setupCc } from '../../src/tools/setup_cc.js';
import { loadConfig } from '../../src/kb/config.js';

let tmpHome: string;

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'cc-home-'));
  process.env.CC_HOME = tmpHome;
});

afterEach(() => {
  delete process.env.CC_HOME;
  rmSync(tmpHome, { recursive: true, force: true });
});

describe('setupCc', () => {
  it('sets mode and saves config', async () => {
    const result = await setupCc({ mode: 'advanced' });
    expect(result.config.mode).toBe('advanced');
    expect(loadConfig().mode).toBe('advanced');
  });

  it('sets ollama provider', async () => {
    await setupCc({ ollamaBaseUrl: 'http://localhost:11434', ollamaModel: 'llama3.2' });
    const config = loadConfig();
    expect(config.providers.ollama?.baseUrl).toBe('http://localhost:11434');
    expect(config.providers.ollama?.model).toBe('llama3.2');
  });

  it('sets routing preferences', async () => {
    await setupCc({ routingFast: 'ollama', routingJudgment: 'anthropic' });
    const config = loadConfig();
    expect(config.routing.fast).toBe('ollama');
    expect(config.routing.judgment).toBe('anthropic');
  });

  it('persists downloaderPath in config', async () => {
    await setupCc({ downloaderPath: 'C:/tools/canvas-backup.exe' });
    const config = loadConfig();
    expect(config.downloader?.executablePath).toBe('C:/tools/canvas-backup.exe');
  });

  it('persists registry token without echoing the raw token', async () => {
    const result = await setupCc({ registryToken: 'secret-token', premiumRegistryBaseUrl: 'https://example.test/api/registry' });
    const config = loadConfig();

    expect(config.registry?.token).toBe('secret-token');
    expect(config.registry?.premiumBaseUrl).toBe('https://example.test/api/registry');
    expect(result.config.registry?.token).toBe('[configured]');
  });

  it('partial update does not overwrite unrelated fields', async () => {
    await setupCc({ mode: 'advanced' });
    await setupCc({ anthropicModel: 'claude-opus-4-8' });
    const config = loadConfig();
    expect(config.mode).toBe('advanced');
    expect(config.providers.anthropic.model).toBe('claude-opus-4-8');
  });

  it('refuses a blocked ollamaBaseUrl and does not write config', async () => {
    const result = await setupCc({ ollamaBaseUrl: 'http://169.254.169.254', ollamaModel: 'llama3.2' });

    expect(result.error).toBe('ENDPOINT_BLOCKED');
    expect(result.message).toMatch(/metadata/i);
    expect(result.fix).toBeDefined();
    expect(existsSync(join(tmpHome, 'config.json'))).toBe(false);
  });

  it('refuses an ollamaBaseUrl with embedded credentials without echoing them', async () => {
    const result = await setupCc({ ollamaBaseUrl: 'http://user:hunter2@localhost:11434' });

    expect(result.error).toBe('ENDPOINT_BLOCKED');
    expect(JSON.stringify(result)).not.toContain('hunter2');
    expect(existsSync(join(tmpHome, 'config.json'))).toBe(false);
  });

  it('persists the canonical ollama endpoint URL, not the raw input', async () => {
    await setupCc({ ollamaBaseUrl: 'http://localhost:11434/?x=1#y', ollamaModel: 'llama3.2' });
    expect(loadConfig().providers.ollama?.baseUrl).toBe('http://localhost:11434');
  });
});
