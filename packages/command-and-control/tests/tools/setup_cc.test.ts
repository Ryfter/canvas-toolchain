import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
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
  it('sets mode and saves config', () => {
    const result = setupCc({ mode: 'advanced' });
    expect(result.config.mode).toBe('advanced');
    expect(loadConfig().mode).toBe('advanced');
  });

  it('sets ollama provider', () => {
    setupCc({ ollamaBaseUrl: 'http://localhost:11434', ollamaModel: 'llama3.2' });
    const config = loadConfig();
    expect(config.providers.ollama?.baseUrl).toBe('http://localhost:11434');
    expect(config.providers.ollama?.model).toBe('llama3.2');
  });

  it('sets routing preferences', () => {
    setupCc({ routingFast: 'ollama', routingJudgment: 'anthropic' });
    const config = loadConfig();
    expect(config.routing.fast).toBe('ollama');
    expect(config.routing.judgment).toBe('anthropic');
  });

  it('persists downloaderPath in config', () => {
    setupCc({ downloaderPath: 'C:/tools/canvas-backup.exe' });
    const config = loadConfig();
    expect(config.downloader?.executablePath).toBe('C:/tools/canvas-backup.exe');
  });

  it('persists registry token without echoing the raw token', () => {
    const result = setupCc({ registryToken: 'secret-token', premiumRegistryBaseUrl: 'https://example.test/api/registry' });
    const config = loadConfig();

    expect(config.registry?.token).toBe('secret-token');
    expect(config.registry?.premiumBaseUrl).toBe('https://example.test/api/registry');
    expect(result.config.registry?.token).toBe('[configured]');
  });

  it('partial update does not overwrite unrelated fields', () => {
    setupCc({ mode: 'advanced' });
    setupCc({ anthropicModel: 'claude-opus-4-8' });
    const config = loadConfig();
    expect(config.mode).toBe('advanced');
    expect(config.providers.anthropic.model).toBe('claude-opus-4-8');
  });
});
