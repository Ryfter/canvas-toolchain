import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let home: string;
beforeEach(() => { home = mkdtempSync(join(tmpdir(), 'cc-tools-')); process.env.CC_HOME = home; });
afterEach(() => { delete process.env.CC_HOME; rmSync(home, { recursive: true, force: true }); });

const CATALOG = { catalogVersion: 1, modules: [{
  id: 'announcements', name: 'Announcements Auditor', description: 'd', version: '1.0.0',
  minHostVersion: '2.0.0', artifactUrl: 'https://example.invalid/a.mjs', sha256: 'a'.repeat(64), sizeBytes: 10,
}] };

describe('browse_module_catalog handler', () => {
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
    const catalog = { catalogVersion: 1, modules: [{
      id: 'announcements', name: 'Announcements Auditor', description: 'd', version: '1.0.0',
      minHostVersion: '2.0.0', artifactUrl: 'https://example.invalid/a.mjs',
      sha256: 'a'.repeat(64), sizeBytes: 10, handles: ['announcements'],
    }] };
    const out = matchCatalogSuggestions(['Course Announcements Feed'], catalog, new Set());
    expect(out).toEqual([{
      id: 'announcements', name: 'Announcements Auditor',
      reason: 'detected "Course Announcements Feed" matches handle "announcements"',
      install: 'install_module({ moduleId: "announcements" })',
    }]);
  });
  it('suppresses suggestions for already-installed ids', async () => {
    const { matchCatalogSuggestions } = await import('../src/tools/module_channel_tools.js');
    const catalog = { catalogVersion: 1, modules: [{
      id: 'announcements', name: 'A', description: 'd', version: '1.0.0', minHostVersion: '2.0.0',
      artifactUrl: 'https://example.invalid/a.mjs', sha256: 'a'.repeat(64), sizeBytes: 10, handles: ['announcements'],
    }] };
    expect(matchCatalogSuggestions(['announcements'], catalog, new Set(['announcements']))).toEqual([]);
  });
});
