import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir, platform } from 'node:os';
import { join } from 'node:path';
import { setupLmStudio, loadLmStudioConfig } from '../../src/tools/setup_lmstudio.js';

let ccHomeDir: string;
const ORIGINAL_CC_HOME = process.env.CC_HOME;
const ORIGINAL_LMSTUDIO_KEY = process.env.LMSTUDIO_API_KEY;

beforeEach(() => {
  ccHomeDir = mkdtempSync(join(tmpdir(), 'cc-home-'));
  process.env.CC_HOME = ccHomeDir;
  delete process.env.LMSTUDIO_API_KEY;
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  rmSync(ccHomeDir, { recursive: true, force: true });
  if (ORIGINAL_CC_HOME === undefined) delete process.env.CC_HOME;
  else process.env.CC_HOME = ORIGINAL_CC_HOME;
  if (ORIGINAL_LMSTUDIO_KEY === undefined) delete process.env.LMSTUDIO_API_KEY;
  else process.env.LMSTUDIO_API_KEY = ORIGINAL_LMSTUDIO_KEY;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function mockModels(ids: string[]) {
  (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
    new Response(JSON.stringify({ object: 'list', data: ids.map((id) => ({ id, object: 'model' })) }), { status: 200 }),
  );
}

describe('setup_lmstudio discovery mode', () => {
  it('lists the models the running LM Studio server reports', async () => {
    mockModels(['qwen2.5-14b-instruct', 'llama-3.1-8b-instruct']);

    const result = await setupLmStudio({});

    expect(result.mode).toBe('discovery');
    expect(result.ok).toBe(true);
    expect(result.baseUrl).toBe('http://localhost:1234/v1');
    expect(result.models).toEqual(['qwen2.5-14b-instruct', 'llama-3.1-8b-instruct']);
    expect(result.nextStep).toMatch(/setup_lmstudio/);
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(
      'http://localhost:1234/v1/models',
    );
  });

  it('forwards LMSTUDIO_API_KEY as a Bearer header when set', async () => {
    process.env.LMSTUDIO_API_KEY = 'lm-secret-key';
    mockModels(['qwen2.5-14b-instruct']);

    const result = await setupLmStudio({ model: 'qwen2.5-14b-instruct' });

    expect(result.ok).toBe(true);
    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer lm-secret-key');
  });

  it('explains how to start the server when it is off', async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }),
    );

    const result = await setupLmStudio({});

    expect(result.mode).toBe('discovery');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('LMSTUDIO_UNREACHABLE');
    expect(result.message).toMatch(/Could not reach LM Studio/);
    expect(result.fix).toEqual(expect.arrayContaining([expect.stringMatching(/Start Server/)]));
  });

  it('says so when the server runs but no model is loaded', async () => {
    mockModels([]);

    const result = await setupLmStudio({});

    expect(result.ok).toBe(true);
    expect(result.models).toEqual([]);
    expect(result.message).toMatch(/no model is loaded/);
  });

  it('echoes the canonical baseUrl, not the raw input', async () => {
    mockModels(['m']);

    const result = await setupLmStudio({ baseUrl: 'http://10.0.0.5:1234/v1/?x=1#y' });

    expect(result.ok).toBe(true);
    expect(result.baseUrl).toBe('http://10.0.0.5:1234/v1');
  });

  it('refuses a blocked endpoint without fetching', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await setupLmStudio({ baseUrl: 'http://169.254.169.254/v1' });

    expect(result.ok).toBe(false);
    expect(result.error).toBe('ENDPOINT_BLOCKED');
    expect(result.message).toMatch(/metadata/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses a non-http baseUrl without fetching or echoing it', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await setupLmStudio({ baseUrl: 'file:///etc/passwd' });

    expect(result.ok).toBe(false);
    expect(result.error).toBe('ENDPOINT_BLOCKED');
    expect(result.message).not.toContain('file:///etc/passwd');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('setup_lmstudio commit mode', () => {
  it('writes lmstudio-config.json atomically with 0o600', async () => {
    mockModels(['qwen2.5-14b-instruct']);

    const result = await setupLmStudio({ model: 'qwen2.5-14b-instruct' });

    expect(result.mode).toBe('commit');
    expect(result.ok).toBe(true);
    expect(result.model).toBe('qwen2.5-14b-instruct');
    expect(result.baseUrl).toBe('http://localhost:1234/v1');

    const configPath = join(ccHomeDir, 'lmstudio-config.json');
    expect(existsSync(configPath)).toBe(true);
    expect(JSON.parse(readFileSync(configPath, 'utf-8'))).toEqual({
      baseUrl: 'http://localhost:1234/v1',
      model: 'qwen2.5-14b-instruct',
    });

    if (platform() !== 'win32') {
      expect(statSync(configPath).mode & 0o777).toBe(0o600);
    }
  });

  it('honors a custom baseUrl', async () => {
    mockModels(['m']);

    const result = await setupLmStudio({ baseUrl: 'http://10.0.0.5:1234/v1', model: 'm' });

    expect(result.ok).toBe(true);
    expect(result.baseUrl).toBe('http://10.0.0.5:1234/v1');
    expect(JSON.parse(readFileSync(join(ccHomeDir, 'lmstudio-config.json'), 'utf-8')).baseUrl)
      .toBe('http://10.0.0.5:1234/v1');
  });

  it('rejects a model the server does not have loaded — does NOT write config', async () => {
    mockModels(['other-model']);

    const result = await setupLmStudio({ model: 'qwen2.5-14b-instruct' });

    expect(result.ok).toBe(false);
    expect(result.error).toBe('LMSTUDIO_MODEL_NOT_FOUND');
    expect(result.fix).toEqual(expect.arrayContaining([expect.stringMatching(/qwen2\.5-14b-instruct/)]));
    expect(existsSync(join(ccHomeDir, 'lmstudio-config.json'))).toBe(false);
  });

  it('returns LMSTUDIO_UNREACHABLE when the server is off — does NOT write config', async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new TypeError('fetch failed'));

    const result = await setupLmStudio({ model: 'm' });

    expect(result.mode).toBe('commit');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('LMSTUDIO_UNREACHABLE');
    expect(result.fix).toEqual(expect.arrayContaining([expect.stringMatching(/Start Server/)]));
    expect(existsSync(join(ccHomeDir, 'lmstudio-config.json'))).toBe(false);
  });

  it('returns ENDPOINT_BLOCKED for a blocked baseUrl — does NOT fetch or write config', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await setupLmStudio({ baseUrl: 'http://169.254.169.254/v1', model: 'm' });

    expect(result.ok).toBe(false);
    expect(result.error).toBe('ENDPOINT_BLOCKED');
    expect(existsSync(join(ccHomeDir, 'lmstudio-config.json'))).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('loadLmStudioConfig', () => {
  it('throws when lmstudio-config.json is missing', () => {
    expect(() => loadLmStudioConfig()).toThrow(/LMSTUDIO_NOT_CONFIGURED/);
  });

  it('returns the parsed config when present', () => {
    mkdirSync(ccHomeDir, { recursive: true });
    writeFileSync(
      join(ccHomeDir, 'lmstudio-config.json'),
      JSON.stringify({ baseUrl: 'http://localhost:1234/v1', model: 'qwen2.5-14b-instruct' }),
    );
    expect(loadLmStudioConfig()).toEqual({
      baseUrl: 'http://localhost:1234/v1',
      model: 'qwen2.5-14b-instruct',
    });
  });

  it('throws when the file is corrupt JSON', () => {
    mkdirSync(ccHomeDir, { recursive: true });
    writeFileSync(join(ccHomeDir, 'lmstudio-config.json'), '{ not valid');
    expect(() => loadLmStudioConfig()).toThrow(/LMSTUDIO_NOT_CONFIGURED/);
  });
});
