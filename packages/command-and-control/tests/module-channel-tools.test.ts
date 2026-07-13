import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

let home: string;
beforeEach(async () => {
  home = mkdtempSync(join(tmpdir(), 'cc-tools-'));
  process.env.CC_HOME = home;
  const { resetChannelNotices } = await import('../src/channel/notices.js');
  resetChannelNotices();
});
afterEach(() => { delete process.env.CC_HOME; rmSync(home, { recursive: true, force: true }); });

const CATALOG = { catalogVersion: 2, modules: [{
  id: 'announcements', name: 'Announcements Auditor', description: 'd', version: '1.0.0',
  minHostVersion: '2.0.0', artifactUrl: 'https://raw.githubusercontent.com/Ryfter/canvas-toolchain/main/modules/announcements/1.0.0/announcements-1.0.0.mjs', sha256: 'a'.repeat(64), sizeBytes: 10,
}], companions: [] };

const INSTALL_ARTIFACT = `export default { id: 'announcements', name: 'A', description: 'd', version: '1.0.0', tools: [] };\n`;
const INSTALL_ARTIFACT_SHA = createHash('sha256').update(INSTALL_ARTIFACT).digest('hex');
const INSTALL_CATALOG = { catalogVersion: 2, modules: [{
  id: 'announcements', name: 'Announcements Auditor', description: 'd', version: '1.0.0',
  minHostVersion: '2.0.0', artifactUrl: 'https://raw.githubusercontent.com/Ryfter/canvas-toolchain/main/modules/announcements/1.0.0/announcements-1.0.0.mjs',
  sha256: INSTALL_ARTIFACT_SHA, sizeBytes: INSTALL_ARTIFACT.length,
}], companions: [] };
const artifactFetch: typeof fetch = (async () => new Response(INSTALL_ARTIFACT, { status: 200 })) as unknown as typeof fetch;

describe('browse_module_catalog handler', () => {
  it('reports companions as install-separately entries and never offers to install them', async () => {
    const catalog = {
      catalogVersion: 2,
      modules: [],
      companions: [{
        id: 'canvas-backup', name: 'Canvas Backup',
        summary: 'Downloads a complete local archive of a Canvas course.',
        whyYouWantIt: 'The toolchain reads its archive as the start of the pipeline.',
        url: 'https://github.com/Ryfter/Canvas-Download',
        worksWithoutToolchain: true,
      }],
    };
    const { browseModuleCatalog } = await import('../src/tools/module_channel_tools.js');
    const res = await browseModuleCatalog({}, { catalog });
    const companions = res.companions as Array<Record<string, unknown>>;
    expect(companions).toHaveLength(1);
    expect(companions[0].url).toBe('https://github.com/Ryfter/Canvas-Download');
    expect(JSON.stringify(res)).not.toContain('install_module({ moduleId: "canvas-backup"');
  });
  it('reports per-module status and pending requests', async () => {
    const { savePendingRequests } = await import('../src/channel/pending.js');
    savePendingRequests({ modules: ['announcements'] });
    const { browseModuleCatalog } = await import('../src/tools/module_channel_tools.js');
    const res = await browseModuleCatalog({}, { catalog: CATALOG });
    const rows = res.modules as Array<Record<string, unknown>>;
    expect(rows[0]).toMatchObject({ id: 'announcements', status: 'not installed', pendingRequest: true });
  });
  it('clearPending: true empties the pending file', async () => {
    const { savePendingRequests, getPendingPath } = await import('../src/channel/pending.js');
    savePendingRequests({ modules: ['announcements'] });
    const { browseModuleCatalog } = await import('../src/tools/module_channel_tools.js');
    await browseModuleCatalog({ clearPending: true }, { catalog: CATALOG });
    expect(existsSync(getPendingPath())).toBe(false);
  });
  it('catalog unreachable → structured error, no throw', async () => {
    const failing: typeof fetch = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
    const { browseModuleCatalog } = await import('../src/tools/module_channel_tools.js');
    const res = await browseModuleCatalog({}, { fetchImpl: failing });
    expect(res.error).toBe('CATALOG_UNREACHABLE');
  });
});

describe('matchCatalogSuggestions', () => {
  it('suggests a not-installed catalog module whose handles match a detected tool', async () => {
    const { matchCatalogSuggestions } = await import('../src/tools/module_channel_tools.js');
    const catalog = { catalogVersion: 2, modules: [{
      id: 'announcements', name: 'Announcements Auditor', description: 'd', version: '1.0.0',
      minHostVersion: '2.0.0', artifactUrl: 'https://raw.githubusercontent.com/Ryfter/canvas-toolchain/main/modules/announcements/1.0.0/announcements-1.0.0.mjs',
      sha256: 'a'.repeat(64), sizeBytes: 10, handles: ['announcements'],
    }], companions: [] };
    const out = matchCatalogSuggestions(['Course Announcements Feed'], catalog, new Set());
    expect(out).toEqual([{
      id: 'announcements', name: 'Announcements Auditor',
      reason: 'detected "Course Announcements Feed" matches handle "announcements"',
      install: 'install_module({ moduleId: "announcements" })',
    }]);
  });
  it('suppresses suggestions for already-installed ids', async () => {
    const { matchCatalogSuggestions } = await import('../src/tools/module_channel_tools.js');
    const catalog = { catalogVersion: 2, modules: [{
      id: 'announcements', name: 'A', description: 'd', version: '1.0.0', minHostVersion: '2.0.0',
      artifactUrl: 'https://raw.githubusercontent.com/Ryfter/canvas-toolchain/main/modules/announcements/1.0.0/announcements-1.0.0.mjs', sha256: 'a'.repeat(64), sizeBytes: 10, handles: ['announcements'],
    }], companions: [] };
    expect(matchCatalogSuggestions(['announcements'], catalog, new Set(['announcements']))).toEqual([]);
  });
});

describe('installModuleTool / uninstallModuleTool channel-notice refresh', () => {
  it('a fulfilled pending request stops appearing in channel notices', async () => {
    const { savePendingRequests } = await import('../src/channel/pending.js');
    savePendingRequests({ modules: ['announcements'] });

    const { checkChannelNotices, getChannelNotices } = await import('../src/channel/notices.js');
    await checkChannelNotices({ catalog: INSTALL_CATALOG });
    expect(getChannelNotices()).toContain('announcements');

    const { installModuleTool } = await import('../src/tools/module_channel_tools.js');
    const res = await installModuleTool(
      { moduleId: 'announcements', confirm: true },
      { catalog: INSTALL_CATALOG, hostVersion: '2.0.0', fetchImpl: artifactFetch },
    );
    expect(res.installed).toBe(true);
    expect(getChannelNotices()).toBeNull();
  });
});
