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
  tmpHome = mkdtempSync(join(tmpdir(), 'cc-anthropic-setup-'));
  process.env.CC_HOME = tmpHome;
});

afterEach(() => {
  delete process.env.CC_HOME;
  rmSync(tmpHome, { recursive: true, force: true });
});

import { setupAnthropic, loadAnthropicConfig } from '../../src/tools/setup_anthropic.js';

const TEST_INPUT = {
  apiKey: 'sk-ant-test-key',
};

describe('setupAnthropic', () => {
  it('saves config and returns configured:true when key validates', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ content: [{ type: 'text', text: '.' }] }),
    } as Response);

    const result = await setupAnthropic(TEST_INPUT);

    expect(result.configured).toBe(true);
    expect(result.validatedAt).toBeDefined();
    const saved = JSON.parse(readFileSync(join(tmpHome, 'anthropic-config.json'), 'utf-8'));
    expect(saved.apiKey).toBe('sk-ant-test-key');
    expect(saved.lastValidatedAt).toBeDefined();
  });

  it.skipIf(process.platform === 'win32')('writes the config file with 0o600 permissions', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ content: [{ type: 'text', text: '.' }] }),
    } as Response);

    await setupAnthropic(TEST_INPUT);

    const stats = statSync(join(tmpHome, 'anthropic-config.json'));
    expect(stats.mode & 0o777).toBe(0o600);
  });

  it('does NOT save and returns error when key fails 401', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 401,
    } as Response);

    const result = await setupAnthropic(TEST_INPUT);

    expect(result.configured).toBe(false);
    expect(result.error).toBe('CREDENTIAL_VALIDATION_FAILED');
    expect(existsSync(join(tmpHome, 'anthropic-config.json'))).toBe(false);
  });

  it('saves without calling fetch when test:false', async () => {
    const result = await setupAnthropic({ ...TEST_INPUT, test: false });

    expect(result.configured).toBe(true);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    expect(existsSync(join(tmpHome, 'anthropic-config.json'))).toBe(true);
  });

  it('does not include apiKey in return value', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ content: [{ type: 'text', text: '.' }] }),
    } as Response);

    const result = await setupAnthropic(TEST_INPUT);

    expect(JSON.stringify(result)).not.toContain('sk-ant-test-key');
  });

  it('uses the model from input when provided', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ content: [{ type: 'text', text: '.' }] }),
    } as Response);

    await setupAnthropic({ ...TEST_INPUT, model: 'claude-opus-4-8' });

    const saved = JSON.parse(readFileSync(join(tmpHome, 'anthropic-config.json'), 'utf-8'));
    expect(saved.model).toBe('claude-opus-4-8');
  });

  it('defaults to claude-haiku-4-5-20251001 when model omitted', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ content: [{ type: 'text', text: '.' }] }),
    } as Response);

    await setupAnthropic(TEST_INPUT);

    const saved = JSON.parse(readFileSync(join(tmpHome, 'anthropic-config.json'), 'utf-8'));
    expect(saved.model).toBe('claude-haiku-4-5-20251001');
  });

  it('sends the Anthropic API call to the messages endpoint with the right headers', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ content: [{ type: 'text', text: '.' }] }),
    } as Response);

    await setupAnthropic(TEST_INPUT);

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('sk-ant-test-key');
    expect(headers['anthropic-version']).toBe('2023-06-01');
    expect(headers['content-type']).toBe('application/json');
  });
});

describe('loadAnthropicConfig', () => {
  it('throws ANTHROPIC_NOT_CONFIGURED when file is absent', () => {
    expect(() => loadAnthropicConfig()).toThrow('ANTHROPIC_NOT_CONFIGURED');
  });

  it('returns full config when file exists and is valid', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ content: [{ type: 'text', text: '.' }] }),
    } as Response);
    await setupAnthropic(TEST_INPUT);

    const config = loadAnthropicConfig();
    expect(config.apiKey).toBe('sk-ant-test-key');
    expect(config.model).toBe('claude-haiku-4-5-20251001');
  });

  it('throws ANTHROPIC_NOT_CONFIGURED when config is missing apiKey', async () => {
    const { writeFileSync, mkdirSync } = await import('node:fs');
    mkdirSync(tmpHome, { recursive: true });
    writeFileSync(join(tmpHome, 'anthropic-config.json'), JSON.stringify({ model: 'foo' }));
    expect(() => loadAnthropicConfig()).toThrow('ANTHROPIC_NOT_CONFIGURED');
  });
});
