import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadModules } from '../../src/modules/registry.js';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'cc-e2e-')); process.env.CC_HOME = dir; });
afterEach(() => { delete process.env.CC_HOME; rmSync(dir, { recursive: true, force: true }); });

describe('module enable/disable e2e', () => {
  it('disabled → core only (no video_* names); enabled → video_* present', async () => {
    writeFileSync(join(dir, 'modules.json'), JSON.stringify({ modules: { video: { enabled: false } } }));
    expect((await loadModules()).tools.map((t) => t.name)).not.toContain('video_embed');

    writeFileSync(join(dir, 'modules.json'), JSON.stringify({ modules: { video: { enabled: true, activeProvider: 'panopto' } } }));
    const names = (await loadModules()).tools.map((t) => t.name);
    expect(names).toContain('video_search');
    expect(names).toContain('fetch_panopto_captions'); // alias still served
  });
});
