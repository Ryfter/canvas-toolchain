import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
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
import type { CanvasSetupConfig } from '../../src/tools/setup_canvas.js';

const TEST_INPUT = {
  host: 'example.instructure.com',
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
    expect(result.host).toBe('example.instructure.com');
    expect(result.validatedAt).toBeDefined();
    const saved = JSON.parse(readFileSync(join(tmpHome, 'canvas-config.json'), 'utf-8'));
    expect(saved.host).toBe('example.instructure.com');
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
    expect(url).toBe('https://example.instructure.com/api/v1/users/self');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['authorization']).toBe('Bearer canvas-test-token');
  });

  it('strips a leading https:// from host before storing', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 1 }),
    } as Response);

    await setupCanvas({ host: 'https://example.instructure.com/', token: 'tok' });

    const saved = JSON.parse(readFileSync(join(tmpHome, 'canvas-config.json'), 'utf-8'));
    expect(saved.host).toBe('example.instructure.com');
  });
});

describe('CanvasSetupConfig', () => {
  it('snapshotsLocation is optional', () => {
    const cfg: CanvasSetupConfig = {
      host: 'example.com',
      token: 'x',
      configuredAt: '2026-06-04T00:00:00.000Z',
      lastValidatedAt: '2026-06-04T00:00:00.000Z',
    };
    expect(cfg.snapshotsLocation).toBeUndefined();
  });

  it('accepts snapshotsLocation when set', () => {
    const cfg: CanvasSetupConfig = {
      host: 'example.com',
      token: 'x',
      configuredAt: '2026-06-04T00:00:00.000Z',
      lastValidatedAt: '2026-06-04T00:00:00.000Z',
      snapshotsLocation: 'project',
    };
    expect(cfg.snapshotsLocation).toBe('project');
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
    expect(config.host).toBe('example.instructure.com');
    expect(config.token).toBe('canvas-test-token');
  });
});

describe('CanvasSetupConfig V&R Plan C fields', () => {
  it('accepts retention fields and breadcrumb settings', () => {
    const cfg: CanvasSetupConfig = {
      host: 'x', token: 'y',
      configuredAt: '2026-06-04T00:00:00.000Z',
      lastValidatedAt: '2026-06-04T00:00:00.000Z',
      snapshotRetentionCount: 5,
      snapshotRetentionDays: 60,
      canvasBreadcrumbs: 'enabled',
      backupOverride: 'auto',
    };
    expect(cfg.snapshotRetentionCount).toBe(5);
    expect(cfg.snapshotRetentionDays).toBe(60);
    expect(cfg.canvasBreadcrumbs).toBe('enabled');
    expect(cfg.backupOverride).toBe('auto');
  });

  it('all V&R Plan C fields are optional', () => {
    const cfg: CanvasSetupConfig = {
      host: 'x', token: 'y',
      configuredAt: '2026-06-04T00:00:00.000Z',
      lastValidatedAt: '2026-06-04T00:00:00.000Z',
    };
    expect(cfg.snapshotRetentionCount).toBeUndefined();
    expect(cfg.snapshotRetentionDays).toBeUndefined();
    expect(cfg.canvasBreadcrumbs).toBeUndefined();
    expect(cfg.backupOverride).toBeUndefined();
  });
});

describe('bare-subdomain hosts (regression)', () => {
  it('completes a bare subdomain before validating and saving', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => ({ id: 1 }) } as Response);

    const result = await setupCanvas({ host: 'exampleucanvas', token: 'tok' });

    // The validation call must go to the completed host, not https://exampleucanvas/.
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe(
      'https://exampleucanvas.instructure.com/api/v1/users/self',
    );
    expect(result.host).toBe('exampleucanvas.instructure.com');

    const saved = JSON.parse(readFileSync(join(tmpHome, 'canvas-config.json'), 'utf-8'));
    expect(saved.host).toBe('exampleucanvas.instructure.com');
  });

  it('self-heals a bare subdomain already on disk', async () => {
    // Simulates a config written before normalization was unified, or hand-edited.
    await setupCanvas({ host: 'exampleucanvas.instructure.com', token: 'tok', test: false });
    const path = join(tmpHome, 'canvas-config.json');
    const raw = JSON.parse(readFileSync(path, 'utf-8'));
    writeFileSync(path, JSON.stringify({ ...raw, host: 'exampleucanvas' }, null, 2));

    expect(loadCanvasConfig().host).toBe('exampleucanvas.instructure.com');
  });

  it('refuses an empty host instead of saving an unusable config', async () => {
    const result = await setupCanvas({ host: '   ', token: 'tok' });
    expect(result.configured).toBe(false);
    expect(result.error).toBe('CANVAS_HOST_INVALID');
    expect(existsSync(join(tmpHome, 'canvas-config.json'))).toBe(false);
  });
});
