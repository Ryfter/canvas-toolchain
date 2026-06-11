import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
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
  tmpHome = mkdtempSync(join(tmpdir(), 'cc-panopto-setup-'));
  process.env.CC_HOME = tmpHome;
});

afterEach(() => {
  delete process.env.CC_HOME;
  rmSync(tmpHome, { recursive: true, force: true });
});

import { setupPanopto, loadPanoptoConfig } from '../src/panopto/setup.js';

const TEST_INPUT = {
  domain: 'example.hosted.panopto.com',
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret',
};

describe('setupPanopto', () => {
  it('saves config and returns configured:true when credentials validate', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'test-token' }),
    } as Response);

    const result = await setupPanopto(TEST_INPUT);

    expect(result.configured).toBe(true);
    expect(result.domain).toBe('example.hosted.panopto.com');
    expect(result.validatedAt).toBeDefined();
    const saved = JSON.parse(readFileSync(join(tmpHome, 'panopto-config.json'), 'utf-8'));
    expect(saved.domain).toBe('example.hosted.panopto.com');
    expect(saved.clientId).toBe('test-client-id');
    expect(saved.lastValidatedAt).toBeDefined();
  });

  it('does NOT save config and returns error when credential test fails', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 401,
    } as Response);

    const result = await setupPanopto(TEST_INPUT);

    expect(result.configured).toBe(false);
    expect(result.error).toBe('CREDENTIAL_VALIDATION_FAILED');
    expect(existsSync(join(tmpHome, 'panopto-config.json'))).toBe(false);
  });

  it('saves without calling fetch when test:false', async () => {
    const result = await setupPanopto({ ...TEST_INPUT, test: false });

    expect(result.configured).toBe(true);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    expect(existsSync(join(tmpHome, 'panopto-config.json'))).toBe(true);
  });

  it('does not include clientSecret in return value', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'test-token' }),
    } as Response);

    const result = await setupPanopto(TEST_INPUT);

    expect(JSON.stringify(result)).not.toContain('test-client-secret');
  });
});

describe('loadPanoptoConfig', () => {
  it('throws PANOPTO_NOT_CONFIGURED when file is absent', () => {
    expect(() => loadPanoptoConfig()).toThrow('PANOPTO_NOT_CONFIGURED');
  });

  it('returns full config when file exists and is valid', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'test-token' }),
    } as Response);
    await setupPanopto(TEST_INPUT);

    const config = loadPanoptoConfig();
    expect(config.domain).toBe('example.hosted.panopto.com');
    expect(config.clientId).toBe('test-client-id');
    expect(config.clientSecret).toBe('test-client-secret');
  });
});
