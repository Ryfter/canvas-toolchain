import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configExists, loadConfig, saveConfig } from '../src/config.js';
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
