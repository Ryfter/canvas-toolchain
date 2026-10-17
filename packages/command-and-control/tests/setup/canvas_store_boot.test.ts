import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bridgeCanvasStoresAtStartup } from '../../src/setup/canvas_store_boot.js';

// #151 R7 review fix 10: the startup bridge used to be an untested inline
// try/catch in index.ts. It must reconcile the stores without creating Canvas
// Design Studio's file, report what it did, and never stop the server booting.

const TOKEN = 'startup-bridge-token';
const HOST = 'example.instructure.com';

let ccHome: string;
let designHome: string;
const institutionPath = () => join(designHome, 'institution.json');
const journalPath = () => join(ccHome, 'canvas-store-migration.json');

const seed = (path: string, value: unknown): void =>
  writeFileSync(path, JSON.stringify(value, null, 2), 'utf-8');

beforeEach(() => {
  ccHome = mkdtempSync(join(tmpdir(), 'cc-boot-'));
  designHome = mkdtempSync(join(tmpdir(), 'cds-boot-'));
  process.env.CC_HOME = ccHome;
  process.env.CANVAS_DESIGN_HOME = designHome;
  // The bridge reports on stderr; capture it instead of printing it.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  delete process.env.CC_HOME;
  delete process.env.CANVAS_DESIGN_HOME;
  rmSync(ccHome, { recursive: true, force: true });
  rmSync(designHome, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('the Canvas store bridge at startup', () => {
  it('promotes a Design Studio install that Command & Control has never seen', () => {
    seed(institutionPath(), {
      institution: 'Example University', canvasUrl: `https://${HOST}`, apiToken: TOKEN,
    });

    const result = bridgeCanvasStoresAtStartup();

    expect(result?.action).toBe('canvas-config-created');
    expect(JSON.parse(readFileSync(join(ccHome, 'canvas-config.json'), 'utf-8')).host).toBe(HOST);
  });

  it('never creates institution.json, so Design Studio keeps its brand setup', () => {
    seed(join(ccHome, 'canvas-config.json'), { host: HOST, token: TOKEN });

    const result = bridgeCanvasStoresAtStartup();

    expect(result?.action).toBe('institution-config-skipped');
    expect(existsSync(institutionPath())).toBe(false);
    expect(existsSync(journalPath())).toBe(false);
  });

  it('reconciles an existing disagreement and journals where the backup went', () => {
    seed(join(ccHome, 'canvas-config.json'), { host: HOST, token: TOKEN });
    seed(institutionPath(), { institution: 'Example U', canvasUrl: 'https://old.instructure.com', apiToken: 'old-token' });

    const result = bridgeCanvasStoresAtStartup();

    expect(result?.action).toBe('canvas-config-wins');
    const journal = JSON.parse(readFileSync(journalPath(), 'utf-8'));
    expect(journal.action).toBe('canvas-config-wins');
    expect(journal.backupPath).toContain('.bak-');
    expect(existsSync(journal.backupPath)).toBe(true);
    expect(JSON.stringify(journal)).not.toContain(TOKEN);
    expect(JSON.stringify(journal)).not.toContain('old-token');
  });

  it('does not throw when the Command & Control home cannot be written', () => {
    // A file where the home directory should be: every write inside it fails.
    rmSync(ccHome, { recursive: true, force: true });
    writeFileSync(ccHome, 'not a directory', 'utf-8');
    seed(institutionPath(), { institution: 'Example U', canvasUrl: `https://${HOST}`, apiToken: TOKEN });
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => bridgeCanvasStoresAtStartup()).not.toThrow();
    expect(bridgeCanvasStoresAtStartup()).toBeNull();
    // The failure is reported, never silent.
    expect(errors.mock.calls.flat().join(' ')).toMatch(/canvas-store/);
    expect(errors.mock.calls.flat().join(' ')).not.toContain(TOKEN);
  });
});
