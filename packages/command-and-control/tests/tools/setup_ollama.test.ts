import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir, platform } from 'node:os';
import { join } from 'node:path';
import { setupOllama, loadOllamaConfig } from '../../src/tools/setup_ollama.js';

let ccHomeDir: string;
const ORIGINAL_CC_HOME = process.env.CC_HOME;

beforeEach(() => {
  ccHomeDir = mkdtempSync(join(tmpdir(), 'cc-home-'));
  process.env.CC_HOME = ccHomeDir;
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  rmSync(ccHomeDir, { recursive: true, force: true });
  if (ORIGINAL_CC_HOME === undefined) delete process.env.CC_HOME;
  else process.env.CC_HOME = ORIGINAL_CC_HOME;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('setup_ollama discovery mode', () => {
  it('returns the bundled fallback markdown when no model arg and no network', async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new TypeError('fetch failed'));

    const result = await setupOllama({});

    expect(result.mode).toBe('discovery');
    expect(result.recommendations).toMatch(/Recommended Models for Canvas Toolchain/);
    expect(result.nextStep).toMatch(/setup_ollama/);
  });

  it('returns network-fetched markdown when reachable', async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response('# Live recommendations\n\n## Tier: 32 GB\n', { status: 200 }),
    );

    const result = await setupOllama({});

    expect(result.mode).toBe('discovery');
    expect(result.recommendations).toBe('# Live recommendations\n\n## Tier: 32 GB\n');
  });
});

describe('setup_ollama commit mode', () => {
  function mockTagsAndGenerate(modelInTags: string) {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
      if (url.endsWith('/api/tags')) {
        return new Response(JSON.stringify({ models: [{ name: modelInTags }] }), { status: 200 });
      }
      return new Response('not handled', { status: 500 });
    });
  }

  it('happy path: writes ollama-config.json atomically with 0o600 and returns ok', async () => {
    mockTagsAndGenerate('qwen2.5:14b');

    const result = await setupOllama({ model: 'qwen2.5:14b' });

    expect(result.mode).toBe('commit');
    expect(result.ok).toBe(true);
    expect(result.model).toBe('qwen2.5:14b');
    expect(result.baseUrl).toBe('http://localhost:11434');

    const configPath = join(ccHomeDir, 'ollama-config.json');
    expect(existsSync(configPath)).toBe(true);
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(config).toEqual({ baseUrl: 'http://localhost:11434', model: 'qwen2.5:14b' });

    if (platform() !== 'win32') {
      const mode = statSync(configPath).mode & 0o777;
      expect(mode).toBe(0o600);
    }
  });

  it('honors custom baseUrl', async () => {
    mockTagsAndGenerate('qwen2.5:14b');

    const result = await setupOllama({ baseUrl: 'http://10.0.0.5:11434', model: 'qwen2.5:14b' });

    expect(result.ok).toBe(true);
    expect(result.baseUrl).toBe('http://10.0.0.5:11434');
    const config = JSON.parse(readFileSync(join(ccHomeDir, 'ollama-config.json'), 'utf-8'));
    expect(config.baseUrl).toBe('http://10.0.0.5:11434');
  });

  it('returns OLLAMA_UNREACHABLE when probe fails — does NOT write config', async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new TypeError('fetch failed'));

    const result = await setupOllama({ model: 'qwen2.5:14b' });

    expect(result.ok).toBe(false);
    expect(result.error).toBe('OLLAMA_UNREACHABLE');
    expect(result.fix).toEqual(expect.arrayContaining([expect.stringMatching(/ollama serve/)]));
    expect(existsSync(join(ccHomeDir, 'ollama-config.json'))).toBe(false);
  });

  it('returns OLLAMA_MODEL_NOT_PULLED when model absent from /api/tags', async () => {
    mockTagsAndGenerate('different-model');

    const result = await setupOllama({ model: 'qwen2.5:14b' });

    expect(result.ok).toBe(false);
    expect(result.error).toBe('OLLAMA_MODEL_NOT_PULLED');
    expect(result.fix).toEqual(expect.arrayContaining([expect.stringMatching(/ollama pull qwen2.5:14b/)]));
    expect(existsSync(join(ccHomeDir, 'ollama-config.json'))).toBe(false);
  });
});

describe('loadOllamaConfig', () => {
  it('throws when ollama-config.json is missing', () => {
    expect(() => loadOllamaConfig()).toThrow(/OLLAMA_NOT_CONFIGURED/);
  });

  it('returns the parsed config when present', () => {
    mkdirSync(ccHomeDir, { recursive: true });
    writeFileSync(
      join(ccHomeDir, 'ollama-config.json'),
      JSON.stringify({ baseUrl: 'http://localhost:11434', model: 'qwen2.5:14b' }),
    );
    expect(loadOllamaConfig()).toEqual({ baseUrl: 'http://localhost:11434', model: 'qwen2.5:14b' });
  });

  it('throws when the file is corrupt JSON', () => {
    mkdirSync(ccHomeDir, { recursive: true });
    writeFileSync(join(ccHomeDir, 'ollama-config.json'), '{ not valid');
    expect(() => loadOllamaConfig()).toThrow(/OLLAMA_NOT_CONFIGURED/);
  });
});
