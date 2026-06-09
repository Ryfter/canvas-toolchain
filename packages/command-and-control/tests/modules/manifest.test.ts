import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir, platform } from 'node:os';
import { join } from 'node:path';
import { loadModuleManifest, saveModuleManifest, getModulesManifestPath } from '../../src/modules/manifest.js';

let ccHomeDir: string;
const ORIGINAL_CC_HOME = process.env.CC_HOME;

beforeEach(() => {
  ccHomeDir = mkdtempSync(join(tmpdir(), 'cc-home-'));
  process.env.CC_HOME = ccHomeDir;
});
afterEach(() => {
  rmSync(ccHomeDir, { recursive: true, force: true });
  if (ORIGINAL_CC_HOME === undefined) delete process.env.CC_HOME;
  else process.env.CC_HOME = ORIGINAL_CC_HOME;
});

describe('loadModuleManifest', () => {
  it('returns empty modules when file absent', () => {
    expect(loadModuleManifest()).toEqual({ modules: {} });
  });
  it('reads enabled state', () => {
    writeFileSync(join(ccHomeDir, 'modules.json'), JSON.stringify({ modules: { video: { enabled: true, activeProvider: 'panopto' } } }));
    expect(loadModuleManifest().modules.video).toEqual({ enabled: true, activeProvider: 'panopto' });
  });
  it('tolerates corrupt JSON by returning empty', () => {
    writeFileSync(join(ccHomeDir, 'modules.json'), '{ not json');
    expect(loadModuleManifest()).toEqual({ modules: {} });
  });
});

describe('saveModuleManifest', () => {
  it('writes modules.json that loadModuleManifest reads back', () => {
    const manifest = { modules: { video: { enabled: true, activeProvider: 'panopto' } } };
    const path = saveModuleManifest(manifest);
    expect(path).toBe(getModulesManifestPath());
    expect(loadModuleManifest()).toEqual(manifest);
  });

  it('writes 0o600 on non-windows', () => {
    const path = saveModuleManifest({ modules: {} });
    if (platform() !== 'win32') {
      expect(statSync(path).mode & 0o777).toBe(0o600);
    }
  });

  it('overwrites an existing (even corrupt) file', () => {
    writeFileSync(getModulesManifestPath(), 'not json');
    saveModuleManifest({ modules: { video: { enabled: false } } });
    expect(loadModuleManifest()).toEqual({ modules: { video: { enabled: false } } });
  });
});
