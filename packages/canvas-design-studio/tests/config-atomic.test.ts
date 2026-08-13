import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'path';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import type { InstitutionConfig } from '../src/types.js';

// Tests the REAL config module (config.test.ts mocks it) via the
// CANVAS_DESIGN_HOME override — the same env var C&C's kb-bridge honors
// for ~/.canvas-design-mcp.
const { configExists, loadConfig, saveConfig } = await import('../src/config.js');

const SAMPLE_CONFIG: InstitutionConfig = {
  institution: 'Example University',
  colors: {
    primary: '#0033A0',
    primaryDark: '#002277',
    primaryLight: '#E6ECF9',
    secondary: '#D64309',
  },
  canvasUrl: 'https://example.instructure.com',
  apiToken: 'example-token-123',
};

let testHome: string;

describe('config storage hardening (real module)', () => {
  beforeEach(() => {
    testHome = mkdtempSync(join(tmpdir(), 'cds-config-'));
    process.env.CANVAS_DESIGN_HOME = testHome;
  });

  afterEach(() => {
    delete process.env.CANVAS_DESIGN_HOME;
    rmSync(testHome, { recursive: true, force: true });
  });

  it('honors CANVAS_DESIGN_HOME for the institution.json location', () => {
    expect(configExists()).toBe(false);
    saveConfig(SAMPLE_CONFIG);
    expect(existsSync(join(testHome, 'institution.json'))).toBe(true);
    expect(configExists()).toBe(true);
    expect(loadConfig().institution).toBe('Example University');
  });

  it('leaves no temp file behind after a successful save', () => {
    saveConfig(SAMPLE_CONFIG);
    expect(readdirSync(testHome)).toEqual(['institution.json']);
  });

  it('writes the config file with owner-only (0o600) permissions', () => {
    saveConfig(SAMPLE_CONFIG);
    if (process.platform !== 'win32') {
      const mode = statSync(join(testHome, 'institution.json')).mode & 0o777;
      expect(mode).toBe(0o600);
    }
  });

  it('replaces an existing config completely (rename over old file)', () => {
    saveConfig(SAMPLE_CONFIG);
    saveConfig({ ...SAMPLE_CONFIG, institution: 'Second University', apiToken: undefined });
    const onDisk = JSON.parse(readFileSync(join(testHome, 'institution.json'), 'utf-8'));
    expect(onDisk.institution).toBe('Second University');
    expect(onDisk.apiToken).toBeUndefined();
    expect(readdirSync(testHome)).toEqual(['institution.json']);
  });
});

describe('canvasUrl canonicalization (regression)', () => {
  beforeEach(() => {
    testHome = mkdtempSync(join(tmpdir(), 'cds-config-canon-'));
    process.env.CANVAS_DESIGN_HOME = testHome;
  });

  afterEach(() => {
    delete process.env.CANVAS_DESIGN_HOME;
    rmSync(testHome, { recursive: true, force: true });
  });

  it('completes a bare subdomain that only passed the old https:// check', () => {
    // "https://schoolname" satisfied startsWith('https://') but resolves nowhere,
    // surfacing much later as an opaque TLS/auth failure.
    saveConfig({ ...SAMPLE_CONFIG, canvasUrl: 'https://exampleucanvas' });
    expect(loadConfig().canvasUrl).toBe('https://exampleucanvas.instructure.com');
  });

  it('accepts a bare subdomain with no scheme at all', () => {
    saveConfig({ ...SAMPLE_CONFIG, canvasUrl: 'exampleucanvas' });
    expect(loadConfig().canvasUrl).toBe('https://exampleucanvas.instructure.com');
  });

  it('strips trailing slashes and paths, leaving a bare origin', () => {
    saveConfig({ ...SAMPLE_CONFIG, canvasUrl: 'https://example.instructure.com/courses/1/' });
    expect(loadConfig().canvasUrl).toBe('https://example.instructure.com');
  });

  it('leaves a vanity domain untouched', () => {
    saveConfig({ ...SAMPLE_CONFIG, canvasUrl: 'https://canvas.exampleu.edu' });
    expect(loadConfig().canvasUrl).toBe('https://canvas.exampleu.edu');
  });

  it('heals a config already on disk without re-running setup', () => {
    saveConfig(SAMPLE_CONFIG);
    const path = join(testHome, 'institution.json');
    const raw = JSON.parse(readFileSync(path, 'utf-8'));
    writeFileSync(path, JSON.stringify({ ...raw, canvasUrl: 'https://exampleucanvas' }));
    expect(loadConfig().canvasUrl).toBe('https://exampleucanvas.instructure.com');
  });
});
