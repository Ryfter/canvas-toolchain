import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

let tmpHome: string;

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'cc-canvas-setup-'));
  process.env.CC_HOME = tmpHome;
});

afterEach(() => {
  delete process.env.CC_HOME;
  rmSync(tmpHome, { recursive: true, force: true });
});

import { setupCanvas, loadCanvasConfig } from '../../src/tools/setup_canvas.js';

const TEST_INPUT = {
  host: 'bsu.instructure.com',
  token: 'canvas-test-token',
};

describe('setupCanvas', () => {
  it('saves config and returns configured:true when token validates', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 12345, name: 'Test User' }),
    } as Response);

    const result = await setupCanvas(TEST_INPUT);

    expect(result.configured).toBe(true);
    expect(result.host).toBe('bsu.instructure.com');
    expect(result.validatedAt).toBeDefined();
    const saved = JSON.parse(readFileSync(join(tmpHome, 'canvas-config.json'), 'utf-8'));
    expect(saved.host).toBe('bsu.instructure.com');
    expect(saved.token).toBe('canvas-test-token');
  });

  // Skipped on Windows — see note on setup_anthropic.test.ts.
  it.skipIf(process.platform === 'win32')('writes the config file with 0o600 permissions', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 1 }),
    } as Response);

    await setupCanvas(TEST_INPUT);

    const stats = statSync(join(tmpHome, 'canvas-config.json'));
    expect(stats.mode & 0o777).toBe(0o600);
  });

  it('does NOT save and returns error on 401', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 401,
    } as Response);

    const result = await setupCanvas(TEST_INPUT);

    expect(result.configured).toBe(false);
    expect(result.error).toBe('CREDENTIAL_VALIDATION_FAILED');
    expect(existsSync(join(tmpHome, 'canvas-config.json'))).toBe(false);
  });

  it('saves without calling fetch when test:false', async () => {
    const result = await setupCanvas({ ...TEST_INPUT, test: false });

    expect(result.configured).toBe(true);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    expect(existsSync(join(tmpHome, 'canvas-config.json'))).toBe(true);
  });

  it('does not include token in return value', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 1 }),
    } as Response);

    const result = await setupCanvas(TEST_INPUT);

    expect(JSON.stringify(result)).not.toContain('canvas-test-token');
  });

  it('calls the correct Canvas API endpoint with bearer token', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 1 }),
    } as Response);

    await setupCanvas(TEST_INPUT);

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('https://bsu.instructure.com/api/v1/users/self');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['authorization']).toBe('Bearer canvas-test-token');
  });

  it('strips a leading https:// from host before storing', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 1 }),
    } as Response);

    await setupCanvas({ host: 'https://bsu.instructure.com/', token: 'tok' });

    const saved = JSON.parse(readFileSync(join(tmpHome, 'canvas-config.json'), 'utf-8'));
    expect(saved.host).toBe('bsu.instructure.com');
  });
});

describe('loadCanvasConfig', () => {
  it('throws CANVAS_NOT_CONFIGURED when file is absent', () => {
    expect(() => loadCanvasConfig()).toThrow('CANVAS_NOT_CONFIGURED');
  });

  it('returns full config when file exists and is valid', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 1 }),
    } as Response);
    await setupCanvas(TEST_INPUT);

    const config = loadCanvasConfig();
    expect(config.host).toBe('bsu.instructure.com');
    expect(config.token).toBe('canvas-test-token');
  });
});
