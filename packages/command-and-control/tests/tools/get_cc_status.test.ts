import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getCcStatus } from '../../src/tools/get_cc_status.js';

let tmpHome: string;

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'cc-home-'));
  process.env.CC_HOME = tmpHome;
  vi.restoreAllMocks();
});

afterEach(() => {
  delete process.env.CC_HOME;
  rmSync(tmpHome, { recursive: true, force: true });
});

describe('getCcStatus', () => {
  it('reports anthropic key absent when env var not set', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const status = await getCcStatus();
    expect(status.providers.anthropic.keyPresent).toBe(false);
  });

  it('reports anthropic key present when env var set', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const status = await getCcStatus();
    expect(status.providers.anthropic.keyPresent).toBe(true);
    delete process.env.ANTHROPIC_API_KEY;
  });

  it('reports anthropic key present when anthropic-config.json supplies a key', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    writeFileSync(
      join(tmpHome, 'anthropic-config.json'),
      JSON.stringify({ apiKey: 'sk-from-file', model: 'claude' }),
    );
    const status = await getCcStatus();
    expect(status.providers.anthropic.keyPresent).toBe(true);
    expect(JSON.stringify(status)).not.toContain('sk-from-file');
  });

  it('reports anthropic key absent when config file has no apiKey', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    writeFileSync(join(tmpHome, 'anthropic-config.json'), JSON.stringify({ model: 'claude' }));
    const status = await getCcStatus();
    expect(status.providers.anthropic.keyPresent).toBe(false);
  });

  it('reports canvas-config.json presence without echoing host or token', async () => {
    expect((await getCcStatus()).configured.canvasConfig).toBe(false);
    writeFileSync(
      join(tmpHome, 'canvas-config.json'),
      JSON.stringify({ host: 'example.instructure.com', token: 'tok-secret' }),
    );
    const status = await getCcStatus();
    expect(status.configured.canvasConfig).toBe(true);
    const dumped = JSON.stringify(status);
    expect(dumped).not.toContain('tok-secret');
    expect(dumped).not.toContain('example.instructure.com');
  });

  it('reports llm-provider.json presence', async () => {
    expect((await getCcStatus()).configured.llmProvider).toBe(false);
    writeFileSync(join(tmpHome, 'llm-provider.json'), JSON.stringify({ provider: 'anthropic' }));
    expect((await getCcStatus()).configured.llmProvider).toBe(true);
  });

  it('reports canvas-backup.generated.toml presence without echoing contents', async () => {
    expect((await getCcStatus()).configured.canvasBackupToml).toBe(false);
    writeFileSync(
      join(tmpHome, 'canvas-backup.generated.toml'),
      'base_url = "https://secret.example"\n',
    );
    const status = await getCcStatus();
    expect(status.configured.canvasBackupToml).toBe(true);
    expect(JSON.stringify(status)).not.toContain('secret.example');
  });

  it('reports ollama as undefined when not configured', async () => {
    const status = await getCcStatus();
    expect(status.providers.ollama).toBeUndefined();
  });

  it('reports mode and routing from config', async () => {
    const status = await getCcStatus();
    expect(status.mode).toBe('easy');
    expect(status.routing.fast).toBe('anthropic');
  });

  it('reports ci as installed (it is a local dep)', async () => {
    const status = await getCcStatus();
    expect(status.installedPackages.ci).toBe(true);
  });
});
