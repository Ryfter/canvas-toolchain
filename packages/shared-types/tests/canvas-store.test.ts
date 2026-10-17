import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CANVAS_CONFIG_FILENAME,
  INSTITUTION_CONFIG_FILENAME,
  canvasStoreLocations,
  migrateCanvasStores,
  mirrorToInstitution,
  readCanonicalCanvas,
  writeCanvasConfig,
} from '../src/canvas-store.js';

// #151 R7 / decision D1: ~/.command-and-control/canvas-config.json (CC_HOME) is
// the single source of truth for the Canvas host and token; Canvas Design
// Studio's institution.json (CANVAS_DESIGN_HOME) mirrors it while keeping every
// non-Canvas field it owns. These tests are hermetic — both homes are temp dirs.

const TOKEN = 'canvas-secret-token-abc';
const HOST = 'example.instructure.com';

let ccHome: string;
let designHome: string;

const canvasPath = () => join(ccHome, CANVAS_CONFIG_FILENAME);
const institutionPath = () => join(designHome, INSTITUTION_CONFIG_FILENAME);
const readJson = (path: string): Record<string, unknown> =>
  JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>;

function seedCanvas(value: unknown): void {
  writeFileSync(canvasPath(), JSON.stringify(value, null, 2), 'utf-8');
}

function seedInstitution(value: unknown): void {
  mkdirSync(designHome, { recursive: true });
  writeFileSync(institutionPath(), JSON.stringify(value, null, 2), 'utf-8');
}

const CANVAS_CONFIG = {
  host: HOST,
  token: TOKEN,
  configuredAt: '2026-01-01T00:00:00.000Z',
  lastValidatedAt: '2026-01-01T00:00:00.000Z',
};

/** institution.json as Canvas Design Studio writes it — the Canvas credentials
 *  plus the fields it must keep owning. */
const INSTITUTION = {
  institution: 'Example University',
  colors: { primary: '#0033A0', primaryDark: '#002277', primaryLight: '#E6ECF9', secondary: '#D64309' },
  canvasUrl: `https://${HOST}`,
  apiToken: TOKEN,
  waveApiKey: 'wave-key-123',
};

beforeEach(() => {
  ccHome = mkdtempSync(join(tmpdir(), 'canvas-store-cc-'));
  designHome = mkdtempSync(join(tmpdir(), 'canvas-store-cds-'));
  process.env.CC_HOME = ccHome;
  process.env.CANVAS_DESIGN_HOME = designHome;
});

afterEach(() => {
  delete process.env.CC_HOME;
  delete process.env.CANVAS_DESIGN_HOME;
  rmSync(ccHome, { recursive: true, force: true });
  rmSync(designHome, { recursive: true, force: true });
});

describe('canvasStoreLocations', () => {
  it('honors CC_HOME and CANVAS_DESIGN_HOME for the two store files', () => {
    const locations = canvasStoreLocations();
    expect(locations.canvasConfig).toBe(join(ccHome, 'canvas-config.json'));
    expect(locations.institutionConfig).toBe(join(designHome, 'institution.json'));
  });
});

describe('readCanonicalCanvas', () => {
  it('is null when the canonical store is absent', () => {
    expect(readCanonicalCanvas()).toBeNull();
  });

  it('returns the host and token, with the host canonicalized', () => {
    seedCanvas({ ...CANVAS_CONFIG, host: 'https://Example.Instructure.com/' });
    expect(readCanonicalCanvas()).toEqual({ host: HOST, token: TOKEN });
  });

  it('is null when the file is corrupt rather than throwing', () => {
    writeFileSync(canvasPath(), '{ not json', 'utf-8');
    expect(readCanonicalCanvas()).toBeNull();
  });

  it('is null when host or token is missing', () => {
    seedCanvas({ host: HOST });
    expect(readCanonicalCanvas()).toBeNull();
    seedCanvas({ token: TOKEN });
    expect(readCanonicalCanvas()).toBeNull();
  });
});

describe('writeCanvasConfig', () => {
  it('creates the file owner-only (0o600) with no temp file left behind', () => {
    writeCanvasConfig({ host: HOST, token: TOKEN });
    expect(readdirSync(ccHome)).toEqual([CANVAS_CONFIG_FILENAME]);
    if (process.platform !== 'win32') {
      expect(statSync(canvasPath()).mode & 0o777).toBe(0o600);
    }
  });

  it('canonicalizes the host it stores', () => {
    writeCanvasConfig({ host: 'https://exampleucanvas/', token: TOKEN });
    expect(readJson(canvasPath()).host).toBe('exampleucanvas.instructure.com');
  });

  it('preserves every field it does not own', () => {
    seedCanvas({ ...CANVAS_CONFIG, snapshotsLocation: 'project', snapshotRetentionCount: 7, installerExtras: { future: true } });

    writeCanvasConfig({ host: 'new.instructure.com', token: 'rotated-token', configuredAt: '2026-02-02T00:00:00.000Z', lastValidatedAt: '2026-02-02T00:00:00.000Z' });

    const saved = readJson(canvasPath());
    expect(saved.host).toBe('new.instructure.com');
    expect(saved.token).toBe('rotated-token');
    expect(saved.snapshotsLocation).toBe('project');
    expect(saved.snapshotRetentionCount).toBe(7);
    expect(saved.installerExtras).toEqual({ future: true });
  });

  it('refuses to replace a store it cannot parse unless the owner asks', () => {
    writeFileSync(canvasPath(), 'null', 'utf-8');

    // Default: refuse. A hand-edited snapshot/retention setting with a typo must
    // not be destroyed by the other app writing through the shared store.
    expect(() => writeCanvasConfig({ host: HOST, token: TOKEN })).toThrow(/CANVAS_STORE_CORRUPT/);
    expect(readFileSync(canvasPath(), 'utf-8')).toBe('null');
    expect(readdirSync(ccHome)).toEqual([CANVAS_CONFIG_FILENAME]);

    // setup_canvas owns this file and is explicitly re-configuring, so it opts in.
    writeCanvasConfig({ host: HOST, token: TOKEN }, { replaceCorrupt: true });
    expect(readJson(canvasPath()).host).toBe(HOST);
    // ...and the bytes it replaced are kept, so nothing is lost by accident.
    const backups = readdirSync(ccHome).filter((name) => name.startsWith(`${CANVAS_CONFIG_FILENAME}.bak-`));
    expect(backups).toHaveLength(1);
    expect(readFileSync(join(ccHome, backups[0]), 'utf-8')).toBe('null');
  });

  it('records an empty validation time when the caller skipped the live check', () => {
    // setup_canvas writes '' for an untested token; that shape is preserved.
    writeCanvasConfig({ host: HOST, token: TOKEN, configuredAt: '2026-01-01T00:00:00.000Z', lastValidatedAt: '' });

    const saved = readJson(canvasPath());
    expect(saved.lastValidatedAt).toBe('');
    expect(saved.configuredAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('keeps an existing validation time when the caller does not mention it', () => {
    seedCanvas(CANVAS_CONFIG);

    writeCanvasConfig({ host: HOST, token: 'rotated' });

    const saved = readJson(canvasPath());
    expect(saved.token).toBe('rotated');
    expect(saved.lastValidatedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(saved.configuredAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('refuses an empty host instead of writing an unusable store', () => {
    expect(() => writeCanvasConfig({ host: '  ', token: TOKEN })).toThrow(/CANVAS_HOST_INVALID/);
    expect(existsSync(canvasPath())).toBe(false);
  });
});

describe('mirrorToInstitution', () => {
  it('refuses to create institution.json unless a setup entry point asks', () => {
    writeCanvasConfig({ host: HOST, token: TOKEN });

    const result = mirrorToInstitution();

    expect(result.mirrored).toBe(false);
    expect(result.created).toBe(false);
    expect(result.detail).toContain('run setup_institution');
    expect(existsSync(institutionPath())).toBe(false);
  });

  it('creates institution.json with minimal valid content when asked', () => {
    writeCanvasConfig({ host: HOST, token: TOKEN });

    const result = mirrorToInstitution({ create: true });

    expect(result.mirrored).toBe(true);
    expect(result.created).toBe(true);
    const saved = readJson(institutionPath());
    expect(saved.canvasUrl).toBe(`https://${HOST}`);
    expect(saved.apiToken).toBe(TOKEN);
    // CDS requires institution + colors: they must be present and valid so its
    // own writers (policy, WAVE key) stop failing with a missing-config error.
    expect(saved.institution).toBe('');
    expect(saved.colors).toEqual({
      primary: '#0033A0', primaryDark: '#002277', primaryLight: '#E6ECF9', secondary: '#D64309',
    });
    if (process.platform !== 'win32') {
      expect(statSync(institutionPath()).mode & 0o777).toBe(0o600);
    }
  });

  it('preserves every field the Design Studio owns', () => {
    seedInstitution({ ...INSTITUTION, apiToken: 'stale-token', panopto: { domain: 'example.hosted.panopto.com', iframeWhitelisted: true } });
    writeCanvasConfig({ host: HOST, token: TOKEN });

    mirrorToInstitution();

    const saved = readJson(institutionPath());
    expect(saved.apiToken).toBe(TOKEN);
    expect(saved.institution).toBe('Example University');
    expect(saved.colors).toEqual(INSTITUTION.colors);
    expect(saved.waveApiKey).toBe('wave-key-123');
    expect(saved.panopto).toEqual({ domain: 'example.hosted.panopto.com', iframeWhitelisted: true });
  });

  it('is a no-op when there are no canonical credentials to mirror', () => {
    const result = mirrorToInstitution();
    expect(result.mirrored).toBe(false);
    expect(existsSync(institutionPath())).toBe(false);
  });

  it('never overwrites a corrupt institution.json, and reports it as such', () => {
    writeCanvasConfig({ host: HOST, token: TOKEN });
    writeFileSync(institutionPath(), '{ half a file', 'utf-8');

    const result = mirrorToInstitution();

    expect(result.mirrored).toBe(false);
    expect(result.created).toBe(false);
    expect(result.detail).toContain(INSTITUTION_CONFIG_FILENAME);
    expect(readFileSync(institutionPath(), 'utf-8')).toBe('{ half a file');
  });

  it('backs up institution.json when it replaces a different host', () => {
    writeCanvasConfig({ host: HOST, token: TOKEN });
    seedInstitution({ institution: 'Example U', colors: INSTITUTION.colors, canvasUrl: 'https://old.instructure.com', waveApiKey: 'wave-key-123' });

    const result = mirrorToInstitution();

    expect(result.mirrored).toBe(true);
    expect(result.backup).toMatch(/^institution\.json\.bak-/);
    expect(readFileSync(join(designHome, result.backup!), 'utf-8')).toContain('old.instructure.com');
    expect(readJson(institutionPath()).canvasUrl).toBe(`https://${HOST}`);
    // The Design Studio keeps owning everything else.
    expect(readJson(institutionPath()).waveApiKey).toBe('wave-key-123');
  });

  it('takes no backup when the Canvas fields it writes are already there', () => {
    writeCanvasConfig({ host: HOST, token: TOKEN });
    seedInstitution(INSTITUTION);

    const result = mirrorToInstitution();

    expect(result.mirrored).toBe(true);
    expect(result.backup).toBeUndefined();
    expect(readdirSync(designHome).filter((n) => n.includes('.bak-'))).toHaveLength(0);
  });

  it('marks a file it creates as awaiting brand setup', () => {
    writeCanvasConfig({ host: HOST, token: TOKEN });

    mirrorToInstitution({ create: true });

    // A store the bridge synthesized has no institution name, so Design Studio
    // must keep prompting instead of reporting a fully configured app.
    expect(readJson(institutionPath()).brandSetupPending).toBe(true);
  });
});

describe('migrateCanvasStores', () => {
  it('does nothing on a machine with no Canvas credentials', () => {
    const result = migrateCanvasStores();
    expect(result).toMatchObject({ action: 'nothing-to-migrate', changed: false });
    expect(readdirSync(ccHome)).toEqual([]);
    expect(readdirSync(designHome)).toEqual([]);
  });

  it('creates canvas-config.json from an institution-only install (Canvas Design Studio first)', () => {
    seedInstitution({ ...INSTITUTION, canvasUrl: 'https://exampleucanvas/' });

    const result = migrateCanvasStores();

    expect(result).toMatchObject({ action: 'canvas-config-created', changed: true });
    const created = readJson(canvasPath());
    expect(created.host).toBe('exampleucanvas.instructure.com');
    expect(created.token).toBe(TOKEN);
    if (process.platform !== 'win32') {
      expect(statSync(canvasPath()).mode & 0o777).toBe(0o600);
    }
    // The source file is never rewritten by this branch.
    expect(readJson(institutionPath()).canvasUrl).toBe('https://exampleucanvas/');
  });

  it('leaves a URL-only institution.json alone — there is no token to promote', () => {
    seedInstitution({ institution: 'Example U', colors: INSTITUTION.colors, canvasUrl: `https://${HOST}` });

    const result = migrateCanvasStores();

    expect(result).toMatchObject({ action: 'nothing-to-migrate', changed: false });
    expect(existsSync(canvasPath())).toBe(false);
  });

  it('is a no-op when both stores already agree', () => {
    seedCanvas(CANVAS_CONFIG);
    seedInstitution(INSTITUTION);
    const before = readFileSync(institutionPath(), 'utf-8');

    const result = migrateCanvasStores();

    expect(result).toMatchObject({ action: 'in-sync', changed: false });
    expect(readFileSync(institutionPath(), 'utf-8')).toBe(before);
    expect(readdirSync(designHome)).toEqual([INSTITUTION_CONFIG_FILENAME]);
  });

  it('treats differently spelled hosts that normalize the same as agreeing', () => {
    seedCanvas(CANVAS_CONFIG);
    seedInstitution({ ...INSTITUTION, canvasUrl: 'https://EXAMPLE.instructure.com/courses/1/' });

    expect(migrateCanvasStores()).toMatchObject({ action: 'in-sync', changed: false });
  });

  it('lets canvas-config.json win a disagreement, backing up institution.json first', () => {
    seedCanvas(CANVAS_CONFIG);
    seedInstitution({ ...INSTITUTION, apiToken: 'stale-design-studio-token' });
    const before = readFileSync(institutionPath(), 'utf-8');

    const result = migrateCanvasStores();

    expect(result).toMatchObject({ action: 'canvas-config-wins', changed: true });
    expect(result.backup).toMatch(/^institution\.json\.bak-/);
    // Nothing is discarded: the old file is still there, byte for byte.
    const backup = join(designHome, result.backup!);
    expect(existsSync(backup)).toBe(true);
    expect(readFileSync(backup, 'utf-8')).toBe(before);
    // ...and the Design Studio keeps owning its own fields.
    const saved = readJson(institutionPath());
    expect(saved.apiToken).toBe(TOKEN);
    expect(saved.canvasUrl).toBe(`https://${HOST}`);
    expect(saved.institution).toBe('Example University');
    expect(saved.colors).toEqual(INSTITUTION.colors);
    expect(saved.waveApiKey).toBe('wave-key-123');
  });

  it('uses a Windows-safe backup name (a colon is illegal in a filename)', () => {
    seedCanvas(CANVAS_CONFIG);
    seedInstitution(INSTITUTION);
    writeFileSync(institutionPath(), JSON.stringify({ ...INSTITUTION, apiToken: 'other' }), 'utf-8');

    const result = migrateCanvasStores();

    expect(result.backup).not.toContain(':');
    expect(readdirSync(designHome).every((name) => !name.includes(':'))).toBe(true);
  });

  it('creates the missing institution.json only when the setup path asks for it', () => {
    writeCanvasConfig({ host: HOST, token: TOKEN });

    // Default callers are startup bridges: another app's store is not theirs to
    // create, and an empty one would switch off Design Studio's brand setup.
    const skipped = migrateCanvasStores();
    expect(skipped).toMatchObject({ action: 'institution-config-skipped', changed: false });
    expect(existsSync(institutionPath())).toBe(false);
    expect(readdirSync(designHome)).toEqual([]);

    const created = migrateCanvasStores({ createInstitution: true });

    expect(created).toMatchObject({ action: 'institution-config-mirrored', changed: true });
    const file = readJson(institutionPath());
    expect(file.canvasUrl).toBe(`https://${HOST}`);
    expect(file.apiToken).toBe(TOKEN);
    expect(file.colors).toBeDefined();
    expect(file.brandSetupPending).toBe(true);
  });

  it('fills the Canvas fields of an institution.json that has none (startup may fix an existing file)', () => {
    writeCanvasConfig({ host: HOST, token: TOKEN });
    seedInstitution({ institution: 'Example U', colors: INSTITUTION.colors, waveApiKey: 'wave-key-123' });

    const result = migrateCanvasStores();

    expect(result).toMatchObject({ action: 'institution-config-mirrored', changed: true });
    const saved = readJson(institutionPath());
    expect(saved.apiToken).toBe(TOKEN);
    expect(saved.institution).toBe('Example U');
    expect(saved.waveApiKey).toBe('wave-key-123');
  });

  it('backs up institution.json before the fill path overwrites a different host', () => {
    writeCanvasConfig({ host: HOST, token: TOKEN });
    seedInstitution({
      institution: 'Example U', colors: INSTITUTION.colors,
      canvasUrl: 'https://old.instructure.com', waveApiKey: 'wave-key-123',
    });

    const result = migrateCanvasStores();

    expect(result).toMatchObject({ action: 'institution-config-mirrored', changed: true });
    expect(result.backup).toMatch(/^institution\.json\.bak-/);
    expect(readFileSync(join(designHome, result.backup!), 'utf-8')).toContain('old.instructure.com');
    expect(readJson(institutionPath()).canvasUrl).toBe(`https://${HOST}`);
  });

  it('backs up canvas-config.json before the promote path overwrites a different host', () => {
    // Canvas Design Studio configured first, but canvas-config.json exists with
    // a host from an earlier attempt and no token yet.
    seedInstitution(INSTITUTION);
    seedCanvas({ host: 'old.instructure.com', configuredAt: '2026-01-01T00:00:00.000Z' });

    const result = migrateCanvasStores();

    expect(result).toMatchObject({ action: 'canvas-config-created', changed: true });
    expect(result.backup).toMatch(/^canvas-config\.json\.bak-/);
    expect(readFileSync(join(ccHome, result.backup!), 'utf-8')).toContain('old.instructure.com');
    const saved = readJson(canvasPath());
    expect(saved.host).toBe(HOST);
    expect(saved.token).toBe(TOKEN);
    // The settings the professor owns survive the promotion.
    expect(saved.configuredAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('promotes without a backup when the canonical store does not exist yet', () => {
    seedInstitution(INSTITUTION);

    const result = migrateCanvasStores();

    expect(result).toMatchObject({ action: 'canvas-config-created', changed: true });
    expect(result.backup).toBeUndefined();
  });

  it('is idempotent — a second run changes nothing and adds no second backup', () => {
    seedCanvas(CANVAS_CONFIG);
    seedInstitution({ ...INSTITUTION, apiToken: 'stale-design-studio-token' });
    const first = migrateCanvasStores();
    const afterFirst = readFileSync(institutionPath(), 'utf-8');

    const second = migrateCanvasStores();

    expect(first.action).toBe('canvas-config-wins');
    expect(second).toMatchObject({ action: 'in-sync', changed: false });
    expect(readFileSync(institutionPath(), 'utf-8')).toBe(afterFirst);
    expect(readdirSync(designHome).filter((n) => n.includes('.bak-'))).toHaveLength(1);
  });

  it('reports — and never touches — a corrupt institution.json', () => {
    seedCanvas(CANVAS_CONFIG);
    mkdirSync(designHome, { recursive: true });
    writeFileSync(institutionPath(), '{ half a file', 'utf-8');

    const result = migrateCanvasStores();

    expect(result).toMatchObject({ action: 'corrupt', changed: false });
    expect(result.detail).toContain('institution.json');
    expect(readFileSync(institutionPath(), 'utf-8')).toBe('{ half a file');
    expect(readdirSync(designHome)).toEqual([INSTITUTION_CONFIG_FILENAME]);
  });

  it('reports — and never touches — a corrupt canvas-config.json', () => {
    writeFileSync(canvasPath(), 'null', 'utf-8');
    seedInstitution(INSTITUTION);

    const result = migrateCanvasStores();

    expect(result).toMatchObject({ action: 'corrupt', changed: false });
    expect(result.detail).toContain('canvas-config.json');
    expect(readFileSync(canvasPath(), 'utf-8')).toBe('null');
    expect(readJson(institutionPath())).toEqual(INSTITUTION);
  });

  it('never returns a secret in its result', () => {
    seedCanvas(CANVAS_CONFIG);
    seedInstitution({ ...INSTITUTION, apiToken: 'stale-design-studio-token' });

    const serialized = JSON.stringify(migrateCanvasStores());

    expect(serialized).not.toContain(TOKEN);
    expect(serialized).not.toContain('stale-design-studio-token');
  });
});

// #151 R7 review fix 10: the bridge's outcome, including where a backup landed,
// must be visible to the professor through the doctor rather than only to
// stderr, which an MCP host swallows.
describe('canvas store migration journal', () => {
  const journalPath = () => join(ccHome, 'canvas-store-migration.json');

  it('records the outcome and the backup path of the last migration', () => {
    seedCanvas(CANVAS_CONFIG);
    seedInstitution({ ...INSTITUTION, apiToken: 'stale-design-studio-token' });

    const result = migrateCanvasStores();

    const journal = readJson(journalPath());
    expect(journal.action).toBe('canvas-config-wins');
    expect(journal.backupPath).toBe(join(designHome, result.backup!));
    expect(journal.detail).toContain('canvas-config.json');
    expect(journal.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const serialized = JSON.stringify(journal);
    expect(serialized).not.toContain(TOKEN);
    expect(serialized).not.toContain('stale-design-studio-token');
  });

  it('records a corrupt store so the doctor can report it', () => {
    seedCanvas(CANVAS_CONFIG);
    writeFileSync(institutionPath(), '{ half a file', 'utf-8');

    migrateCanvasStores();

    expect(readJson(journalPath()).action).toBe('corrupt');
  });

  it('stays quiet when it changed nothing', () => {
    seedCanvas(CANVAS_CONFIG);
    seedInstitution(INSTITUTION);

    migrateCanvasStores();

    expect(existsSync(journalPath())).toBe(false);
  });

  it('is readable by the doctor and null when nothing has run yet', async () => {
    const { readCanvasStoreJournal } = await import('../src/canvas-store.js');
    expect(readCanvasStoreJournal()).toBeNull();

    seedCanvas(CANVAS_CONFIG);
    seedInstitution({ ...INSTITUTION, apiToken: 'stale-design-studio-token' });
    migrateCanvasStores();

    expect(readCanvasStoreJournal()?.action).toBe('canvas-config-wins');
  });
});
