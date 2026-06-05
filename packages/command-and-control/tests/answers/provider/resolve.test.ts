import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { providerFromConfig, autoDetect } from '../../../src/tools/answers/provider/resolve.js';
import { OllamaEmbeddingProvider } from '../../../src/tools/answers/provider/ollama.js';
import { VoyageEmbeddingProvider } from '../../../src/tools/answers/provider/voyage.js';

let ccHome: string;
let originalEnv: string | undefined;

beforeEach(() => {
  ccHome = mkdtempSync(join(tmpdir(), 'cc-home-'));
  originalEnv = process.env.CC_HOME;
  process.env.CC_HOME = ccHome;
});

afterEach(() => {
  process.env.CC_HOME = originalEnv;
  rmSync(ccHome, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

describe('providerFromConfig', () => {
  it('throws NO_CONFIG when no config exists', () => {
    expect(() => providerFromConfig()).toThrow(/NO_CONFIG/);
  });

  it('builds Ollama provider from config', () => {
    writeFileSync(join(ccHome, 'lecture-answers-config.json'),
      JSON.stringify({ provider: 'ollama' }), 'utf-8');
    const p = providerFromConfig();
    expect(p).toBeInstanceOf(OllamaEmbeddingProvider);
  });

  it('builds Voyage provider only when apiKey is present', () => {
    writeFileSync(join(ccHome, 'lecture-answers-config.json'),
      JSON.stringify({ provider: 'voyage' }), 'utf-8');
    expect(() => providerFromConfig()).toThrow(/VOYAGE_NO_API_KEY/);
    writeFileSync(join(ccHome, 'lecture-answers-config.json'),
      JSON.stringify({ provider: 'voyage', voyageApiKey: 'k' }), 'utf-8');
    const p = providerFromConfig();
    expect(p).toBeInstanceOf(VoyageEmbeddingProvider);
  });
});

describe('autoDetect', () => {
  it('returns ollama when /api/tags is reachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));
    const r = await autoDetect();
    expect(r.kind).toBe('ollama');
  });

  it('returns unavailable when /api/tags is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    const r = await autoDetect();
    expect(r.kind).toBe('unavailable');
    expect(r.reason).toMatch(/Ollama not reachable/);
  });
});
