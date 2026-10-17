import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadAccessibilityPolicy, saveAccessibilityPolicy, loadWaveApiKey } from '@canvas-toolchain/canvas-design-studio/dist/tools/a11y/policy.js';
import { ccHome } from '@canvas-toolchain/shared-types';
import { setupCanvas } from '../../src/tools/setup_canvas.js';
import { waveDeepCheckTool } from '../../src/tools/wave_deep_check.js';
import { reviewAccessibilityPolicy } from '../../src/tools/review_accessibility_policy.js';
import { getCcHomePath } from '../../src/kb/config.js';

// #151 R7 / decision D1: ~/.command-and-control/canvas-config.json is the single
// source of truth for the Canvas host and token, mirrored into Canvas Design
// Studio's institution.json. Before the bridge, `ct_setup canvas` alone left
// institution.json missing, so C&C's own review_accessibility_policy and
// wave_deep_check failed with INSTITUTION_CONFIG_MISSING.

const TOKEN = 'canvas-store-bridge-token';
const HOST = 'example.instructure.com';

let ccHomeDir: string;
let designHome: string;

const institutionPath = () => join(designHome, 'institution.json');
const canvasPath = () => join(ccHomeDir, 'canvas-config.json');
const readJson = (path: string): Record<string, unknown> =>
  JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>;

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
  ccHomeDir = mkdtempSync(join(tmpdir(), 'cc-bridge-'));
  designHome = mkdtempSync(join(tmpdir(), 'cc-bridge-cds-'));
  process.env.CC_HOME = ccHomeDir;
  process.env.CANVAS_DESIGN_HOME = designHome;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.CC_HOME;
  delete process.env.CANVAS_DESIGN_HOME;
  rmSync(ccHomeDir, { recursive: true, force: true });
  rmSync(designHome, { recursive: true, force: true });
});

async function configuredCanvas(): Promise<void> {
  vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => ({ id: 1 }) } as Response);
  const result = await setupCanvas({ host: HOST, token: TOKEN });
  expect(result.configured).toBe(true);
}

describe('setup_canvas mirrors into Canvas Design Studio', () => {
  it('creates institution.json from a fresh Command & Control setup', async () => {
    await configuredCanvas();

    expect(existsSync(institutionPath())).toBe(true);
    const created = readJson(institutionPath());
    expect(created.canvasUrl).toBe(`https://${HOST}`);
    expect(created.apiToken).toBe(TOKEN);
    // Minimal valid content: a complete config every CDS reader accepts.
    expect(created.institution).toBe('');
    expect(created.colors).toBeDefined();
    // #151 R7 review fix 1: the synthesized file must not look like a finished
    // setup to Canvas Design Studio — it has no institution name or real colors.
    expect(created.brandSetupPending).toBe(true);
    if (process.platform !== 'win32') {
      expect(statSync(institutionPath()).mode & 0o777).toBe(0o600);
    }
  });

  it('never re-marks an existing, genuinely configured institution.json', async () => {
    writeFileSync(institutionPath(), JSON.stringify({
      institution: 'Example University',
      colors: { primary: '#0033A0', primaryDark: '#002277', primaryLight: '#E6ECF9', secondary: '#D64309' },
      canvasUrl: `https://${HOST}`,
      apiToken: TOKEN,
    }, null, 2), 'utf-8');

    await configuredCanvas();

    expect(readJson(institutionPath()).brandSetupPending).toBeUndefined();
  });

  it('keeps the Design Studio fields a pre-existing institution.json already had', async () => {
    writeFileSync(institutionPath(), JSON.stringify({
      institution: 'Example University',
      colors: { primary: '#0033A0', primaryDark: '#002277', primaryLight: '#E6ECF9', secondary: '#D64309' },
      canvasUrl: 'https://old.instructure.com',
      apiToken: 'old-token',
      waveApiKey: 'wave-key-123',
    }, null, 2), 'utf-8');

    await configuredCanvas();

    const saved = readJson(institutionPath());
    expect(saved.apiToken).toBe(TOKEN);
    expect(saved.canvasUrl).toBe(`https://${HOST}`);
    expect(saved.institution).toBe('Example University');
    expect(saved.waveApiKey).toBe('wave-key-123');
  });

  it('backs up a disagreeing institution.json and names the backup in the message', async () => {
    writeFileSync(institutionPath(), JSON.stringify({ institution: 'Example U', colors: {}, canvasUrl: 'https://old.instructure.com', apiToken: 'old-token' }), 'utf-8');

    await configuredCanvas();

    const backups = readdirSync(designHome).filter((name) => name.includes('.bak-'));
    expect(backups).toHaveLength(1);
    expect(readFileSync(join(designHome, backups[0]), 'utf-8')).toContain('old-token');
  });

  it('preserves the canvas-config settings setup_canvas does not own', async () => {
    writeFileSync(canvasPath(), JSON.stringify({
      host: 'old.instructure.com', token: 'old-token',
      configuredAt: '2026-01-01T00:00:00.000Z', lastValidatedAt: '2026-01-01T00:00:00.000Z',
      snapshotsLocation: 'project', snapshotRetentionCount: 7, canvasBreadcrumbs: 'disabled',
    }, null, 2), 'utf-8');

    await configuredCanvas();

    const saved = readJson(canvasPath());
    expect(saved.token).toBe(TOKEN);
    expect(saved.snapshotsLocation).toBe('project');
    expect(saved.snapshotRetentionCount).toBe(7);
    expect(saved.canvasBreadcrumbs).toBe('disabled');
  });

  it('never returns or logs the Canvas token', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => ({ id: 1 }) } as Response);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await setupCanvas({ host: HOST, token: TOKEN });

    expect(JSON.stringify(result)).not.toContain(TOKEN);
    expect(errors.mock.calls.flat().join(' ')).not.toContain(TOKEN);
  });
});

describe('C&C accessibility tools after ct_setup canvas alone', () => {
  it('loads the accessibility policy instead of failing with a missing institution config', async () => {
    await configuredCanvas();

    // Real CDS policy module against the bridged file — this call used to throw
    // "No institution config found".
    expect(loadAccessibilityPolicy()).toBeUndefined();
    const saved = saveAccessibilityPolicy({ recheckWeeks: 2 });
    expect(saved.recheckWeeks).toBe(2);
    expect(readJson(institutionPath()).accessibilityPolicy).toBeDefined();
  });

  it('stores a WAVE key through the real wave_deep_check path', async () => {
    await configuredCanvas();
    const wave = async () => ({ findings: [], unmapped: [], creditsRemaining: 3 });

    const result = await waveDeepCheckTool(
      { url: 'https://example.instructure.com/courses/1/pages/intro', confirm: true, apiKey: 'wave-key-123' },
      { wave },
    );

    expect(result.ok).toBe(true);
    expect(JSON.stringify(result)).not.toContain('wave-key-123');
    expect(readJson(institutionPath()).waveApiKey).toBe('wave-key-123');
    expect(loadWaveApiKey()).toBe('wave-key-123');
  });

  it('runs the deep check without spending a call when no key is configured yet', async () => {
    const wave = vi.fn();
    const result = await waveDeepCheckTool({ url: 'https://example.instructure.com/', confirm: true }, { wave });

    expect(result.error).toBe('NO_WAVE_API_KEY');
    expect(wave).not.toHaveBeenCalled();
  });
});

describe('canvas store migration at startup', () => {
  it('promotes an institution-only install to the canonical store', async () => {
    mkdirSync(designHome, { recursive: true });
    writeFileSync(institutionPath(), JSON.stringify({
      institution: 'Example University',
      colors: { primary: '#0033A0', primaryDark: '#002277', primaryLight: '#E6ECF9', secondary: '#D64309' },
      canvasUrl: `https://${HOST}`,
      apiToken: TOKEN,
    }), 'utf-8');

    // Imported lazily so the boot path is the only thing under test here.
    const { migrateCanvasStores } = await import('@canvas-toolchain/shared-types');
    const result = migrateCanvasStores();

    expect(result).toMatchObject({ action: 'canvas-config-created', changed: true });
    expect(readJson(canvasPath()).host).toBe(HOST);
    expect(JSON.stringify(result)).not.toContain(TOKEN);
  });
});

describe('the shared store path rule', () => {
  it('agrees with Command & Control\'s own CC_HOME resolution', () => {
    expect(ccHome()).toBe(getCcHomePath());
    expect(ccHome()).toBe(ccHomeDir);
  });
});

// #151 R7 review fix 1: startup no longer synthesizes institution.json, so a
// professor who configured Canvas before this change — canvas-config.json only —
// must be told how to create it rather than left with an opaque failure.
describe('recovery on a Command & Control-only install', () => {
  it('tells the professor the action that creates institution.json', () => {
    writeFileSync(canvasPath(), JSON.stringify({ host: HOST, token: TOKEN }, null, 2), 'utf-8');

    const result = reviewAccessibilityPolicy({ confirm: true });

    expect(result.ok).toBe(false);
    expect(result.error).toBe('NO_INSTITUTION_CONFIG');
    expect(result.fix?.join(' ')).toContain('ct_setup action canvas');
  });
});
