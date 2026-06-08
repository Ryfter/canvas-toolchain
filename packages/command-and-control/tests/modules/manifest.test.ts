import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadModuleManifest } from '../../src/modules/manifest.js';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'cc-mani-')); process.env.CC_HOME = dir; });
afterEach(() => { delete process.env.CC_HOME; rmSync(dir, { recursive: true, force: true }); });

describe('loadModuleManifest', () => {
  it('returns empty modules when file absent', () => {
    expect(loadModuleManifest()).toEqual({ modules: {} });
  });
  it('reads enabled state', () => {
    writeFileSync(join(dir, 'modules.json'), JSON.stringify({ modules: { video: { enabled: true, activeProvider: 'panopto' } } }));
    expect(loadModuleManifest().modules.video).toEqual({ enabled: true, activeProvider: 'panopto' });
  });
  it('tolerates corrupt JSON by returning empty', () => {
    writeFileSync(join(dir, 'modules.json'), '{ not json');
    expect(loadModuleManifest()).toEqual({ modules: {} });
  });
});
