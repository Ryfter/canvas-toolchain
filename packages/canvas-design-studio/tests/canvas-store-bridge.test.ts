import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configExists, loadConfig, needsBrandSetup, saveConfig } from '../src/config.js';
import { getStarted } from '../src/tools/get-started.js';
import type { InstitutionConfig } from '../src/types.js';

// #151 R7 / D1: ~/.command-and-control/canvas-config.json is the single source of
// truth for the Canvas host and token; institution.json mirrors it and keeps
// owning its own fields. These tests exercise the REAL config module.

const CANONICAL_TOKEN = 'canonical-canvas-token';
const INSTITUTION_TOKEN = 'stale-institution-token';
const HOST = 'example.instructure.com';

const SAMPLE_CONFIG: InstitutionConfig = {
  institution: 'Example University',
  colors: {
    primary: '#0033A0',
    primaryDark: '#002277',
    primaryLight: '#E6ECF9',
    secondary: '#D64309',
  },
  canvasUrl: `https://${HOST}`,
  apiToken: INSTITUTION_TOKEN,
};

let designHome: string;
let ccHome: string;

const institutionPath = () => join(designHome, 'institution.json');
const canvasPath = () => join(ccHome, 'canvas-config.json');
const readJson = (path: string): Record<string, unknown> =>
  JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>;

function seedCanvas(value: unknown): void {
  writeFileSync(canvasPath(), JSON.stringify(value, null, 2), 'utf-8');
}

function seedInstitution(value: unknown): void {
  writeFileSync(institutionPath(), JSON.stringify(value, null, 2), 'utf-8');
}

const CANVAS_CONFIG = {
  host: HOST,
  token: CANONICAL_TOKEN,
  configuredAt: '2026-01-01T00:00:00.000Z',
  lastValidatedAt: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => {
  designHome = mkdtempSync(join(tmpdir(), 'cds-bridge-'));
  ccHome = mkdtempSync(join(tmpdir(), 'cds-bridge-cc-'));
  process.env.CANVAS_DESIGN_HOME = designHome;
  process.env.CC_HOME = ccHome;
});

afterEach(() => {
  delete process.env.CANVAS_DESIGN_HOME;
  delete process.env.CC_HOME;
  rmSync(designHome, { recursive: true, force: true });
  rmSync(ccHome, { recursive: true, force: true });
});

describe('loadConfig prefers the canonical Canvas store', () => {
  it('uses canvas-config.json host and token over institution.json values', () => {
    seedInstitution(SAMPLE_CONFIG);
    seedCanvas(CANVAS_CONFIG);

    const config = loadConfig();

    expect(config.canvasUrl).toBe(`https://${HOST}`);
    expect(config.apiToken).toBe(CANONICAL_TOKEN);
    // Everything else still comes from institution.json.
    expect(config.institution).toBe('Example University');
    expect(config.colors.primary).toBe('#0033A0');
  });

  it('takes the canonical host even when institution.json points elsewhere', () => {
    seedInstitution({ ...SAMPLE_CONFIG, canvasUrl: 'https://old.instructure.com' });
    seedCanvas(CANVAS_CONFIG);

    expect(loadConfig().canvasUrl).toBe(`https://${HOST}`);
  });

  it('falls back to institution.json when no canonical store exists (pre-migration install)', () => {
    seedInstitution(SAMPLE_CONFIG);

    const config = loadConfig();

    expect(config.canvasUrl).toBe(`https://${HOST}`);
    expect(config.apiToken).toBe(INSTITUTION_TOKEN);
  });

  it('falls back when the canonical store has a host but no token (manual-paste workflow)', () => {
    seedInstitution(SAMPLE_CONFIG);
    seedCanvas({ host: HOST, token: '' });

    expect(loadConfig().apiToken).toBe(INSTITUTION_TOKEN);
  });

  it('falls back instead of throwing when the canonical store is corrupt', () => {
    seedInstitution(SAMPLE_CONFIG);
    writeFileSync(canvasPath(), '{ not json', 'utf-8');

    expect(loadConfig().apiToken).toBe(INSTITUTION_TOKEN);
  });

  it('still reports missing setup when institution.json is absent', () => {
    seedCanvas(CANVAS_CONFIG);
    expect(configExists()).toBe(false);
    expect(() => loadConfig()).toThrow(/setup_institution/);
  });
});

describe('the setup path writes the canonical store too', () => {
  it('mirrors host and token into canvas-config.json', () => {
    saveConfig(
      { ...SAMPLE_CONFIG, canvasUrl: 'https://exampleucanvas/', apiToken: CANONICAL_TOKEN },
      { syncCanvasStore: true },
    );

    const written = JSON.parse(readFileSync(canvasPath(), 'utf-8'));
    expect(written.host).toBe('exampleucanvas.instructure.com');
    expect(written.token).toBe(CANONICAL_TOKEN);
    if (process.platform !== 'win32') {
      expect(statSync(canvasPath()).mode & 0o777).toBe(0o600);
    }
  });

  it('preserves the canvas-config settings the setup tool does not own', () => {
    seedCanvas({ ...CANVAS_CONFIG, snapshotsLocation: 'project', snapshotRetentionCount: 7 });

    saveConfig({ ...SAMPLE_CONFIG, apiToken: CANONICAL_TOKEN }, { syncCanvasStore: true });

    const written = JSON.parse(readFileSync(canvasPath(), 'utf-8'));
    expect(written.token).toBe(CANONICAL_TOKEN);
    expect(written.snapshotsLocation).toBe('project');
    expect(written.snapshotRetentionCount).toBe(7);
  });

  it('leaves the canonical store alone when the save has no token to mirror', () => {
    saveConfig({ ...SAMPLE_CONFIG, apiToken: undefined }, { syncCanvasStore: true });

    expect(existsSync(canvasPath())).toBe(false);
    expect(readdirSync(designHome)).toEqual(['institution.json']);
  });

  it('does not touch the canonical store on an ordinary save', () => {
    saveConfig(SAMPLE_CONFIG);

    expect(existsSync(canvasPath())).toBe(false);
  });
});

// #151 R7 review fix 2: loadConfig() overlays the canonical host and token, so a
// load -> save cycle (the a11y policy, the WAVE key, list_canvas_courses' kbTip)
// used to copy the canonical token onto disk — silently, and with no backup.
describe('an ordinary save keeps the Canvas fields the file has', () => {
  it('does not copy the overlaid canonical token into institution.json', () => {
    seedInstitution(SAMPLE_CONFIG);
    seedCanvas(CANVAS_CONFIG);
    const before = readFileSync(institutionPath(), 'utf-8');

    // Exactly what saveAccessibilityPolicy / saveWaveApiKey / list-courses do.
    saveConfig(loadConfig());

    expect(readJson(institutionPath()).apiToken).toBe(INSTITUTION_TOKEN);
    const backups = readdirSync(designHome).filter((name) => name.includes('.bak-'));
    expect(backups).toEqual([]);
    // Nothing needed to change, so the file the professor had is the file they keep.
    expect(readFileSync(institutionPath(), 'utf-8')).toBe(before);
  });

  it('does not give a file with no Canvas fields one', () => {
    seedInstitution({ institution: 'Example U', colors: SAMPLE_CONFIG.colors });
    seedCanvas(CANVAS_CONFIG);
    const overlaid = loadConfig();
    expect(overlaid.apiToken).toBe(CANONICAL_TOKEN); // the overlay really is in play

    saveConfig({ ...overlaid, kbTipShown: true });

    const saved = readJson(institutionPath());
    expect(saved.apiToken).toBeUndefined();
    expect(saved.canvasUrl).toBeUndefined();
    expect(saved.kbTipShown).toBe(true);
  });
});

describe('the setup path rotates the Canvas credentials deliberately', () => {
  it('records a fresh, unvalidated configuration when host or token changes', () => {
    seedCanvas(CANVAS_CONFIG);

    saveConfig(
      { ...SAMPLE_CONFIG, canvasUrl: 'https://new.instructure.com', apiToken: 'rotated-token' },
      { syncCanvasStore: true },
    );

    const written = readJson(canvasPath());
    expect(written.host).toBe('new.instructure.com');
    expect(written.token).toBe('rotated-token');
    // The previous validation belonged to the previous token, so it must not be
    // reported as this one's.
    expect(written.lastValidatedAt).toBe('');
    expect(written.configuredAt).not.toBe(CANVAS_CONFIG.configuredAt);
  });

  it('keeps the recorded timestamps when the credentials are unchanged', () => {
    seedCanvas(CANVAS_CONFIG);

    saveConfig(
      { ...SAMPLE_CONFIG, canvasUrl: `https://${HOST}`, apiToken: CANONICAL_TOKEN },
      { syncCanvasStore: true },
    );

    const written = readJson(canvasPath());
    expect(written.configuredAt).toBe(CANVAS_CONFIG.configuredAt);
    expect(written.lastValidatedAt).toBe(CANVAS_CONFIG.lastValidatedAt);
  });

  it('backs up institution.json before the setup path rewrites a different Canvas value', () => {
    seedInstitution(SAMPLE_CONFIG);
    const before = readFileSync(institutionPath(), 'utf-8');

    saveConfig(
      { ...SAMPLE_CONFIG, canvasUrl: `https://${HOST}`, apiToken: 'new-canvas-token' },
      { syncCanvasStore: true },
    );

    const backups = readdirSync(designHome).filter((name) => name.includes('.bak-'));
    expect(backups).toHaveLength(1);
    expect(readFileSync(join(designHome, backups[0]), 'utf-8')).toBe(before);
    expect(readJson(institutionPath()).apiToken).toBe('new-canvas-token');
  });

  it('takes no backup when it rewrites the same Canvas credentials', () => {
    seedInstitution({ ...SAMPLE_CONFIG, apiToken: CANONICAL_TOKEN });

    saveConfig({ ...SAMPLE_CONFIG, apiToken: CANONICAL_TOKEN }, { syncCanvasStore: true });

    expect(readdirSync(designHome).filter((name) => name.includes('.bak-'))).toEqual([]);
  });

  // #151 R7 review fix 4: before the bridge, only setup_canvas replaced
  // canvas-config.json. Now the wizard can too — and a hand-edited file with a
  // typo in its snapshot settings must not be destroyed by it.
  it('refuses to replace a corrupt canvas-config.json, leaving both stores alone', () => {
    seedInstitution(SAMPLE_CONFIG);
    const institutionBefore = readFileSync(institutionPath(), 'utf-8');
    writeFileSync(canvasPath(), '{ not json', 'utf-8');

    expect(() => saveConfig({ ...SAMPLE_CONFIG, apiToken: 'new-canvas-token' }, { syncCanvasStore: true }))
      .toThrow(/CANVAS_STORE_CORRUPT/);

    expect(readFileSync(canvasPath(), 'utf-8')).toBe('{ not json');
    expect(readFileSync(institutionPath(), 'utf-8')).toBe(institutionBefore);
  });
});

// #151 R7 review fix 1: institution.json created by the bridge has no institution
// name and only placeholder colors, so Design Studio must keep asking for brand
// setup instead of reporting a fully configured app.
describe('a store the bridge synthesized still asks for brand setup', () => {
  const SYNTHESIZED = {
    institution: '',
    colors: SAMPLE_CONFIG.colors,
    canvasUrl: `https://${HOST}`,
    apiToken: CANONICAL_TOKEN,
    brandSetupPending: true,
  };

  it('reports brand setup as pending and says so in get_started', () => {
    seedInstitution(SYNTHESIZED);

    expect(configExists()).toBe(true);
    expect(needsBrandSetup()).toBe(true);
    const text = getStarted();
    expect(text).toMatch(/institution name and brand colors/i);
    expect(text).not.toContain('fully configured');
  });

  it('is settled once the wizard has written a real institution name', () => {
    seedInstitution(SAMPLE_CONFIG);

    expect(needsBrandSetup()).toBe(false);
    expect(getStarted()).toContain('fully configured');
  });

  it('asks for brand setup when there is no file at all', () => {
    expect(needsBrandSetup()).toBe(true);
  });
});
