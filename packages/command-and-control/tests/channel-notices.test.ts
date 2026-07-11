import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let home: string;
beforeEach(async () => {
  home = mkdtempSync(join(tmpdir(), 'cc-notices-'));
  process.env.CC_HOME = home;
  const { resetChannelNotices } = await import('../src/channel/notices.js');
  resetChannelNotices();
});
afterEach(() => {
  delete process.env.CC_HOME;
  rmSync(home, { recursive: true, force: true });
});

const CATALOG = { catalogVersion: 1, modules: [{
  id: 'announcements', name: 'Announcements Auditor', description: 'd', version: '1.1.0',
  minHostVersion: '2.0.0', artifactUrl: 'https://example.invalid/a.mjs', sha256: 'a'.repeat(64), sizeBytes: 10,
}] };

describe('channel notices', () => {
  it('null when nothing is pending and nothing is outdated', async () => {
    const { checkChannelNotices, getChannelNotices } = await import('../src/channel/notices.js');
    await checkChannelNotices({ catalog: CATALOG });
    expect(getChannelNotices()).toBeNull();
  });
  it('surfaces a pending GUI request for a not-yet-installed module', async () => {
    const { savePendingRequests } = await import('../src/channel/pending.js');
    savePendingRequests({ modules: ['announcements'] });
    const { checkChannelNotices, getChannelNotices } = await import('../src/channel/notices.js');
    await checkChannelNotices({ catalog: CATALOG });
    expect(getChannelNotices()).toContain('Announcements Auditor');
    expect(getChannelNotices()).toContain('install');
  });
  it('surfaces a module update when the catalog is newer than the installed version', async () => {
    const { saveInstalledModules } = await import('../src/channel/installed.js');
    saveInstalledModules({ modules: { announcements: {
      id: 'announcements', version: '1.0.0', sha256: 'a'.repeat(64), installedAt: '2026-07-11T00:00:00Z',
    } } });
    const { checkChannelNotices, getChannelNotices } = await import('../src/channel/notices.js');
    await checkChannelNotices({ catalog: CATALOG });
    expect(getChannelNotices()).toContain('v1.1.0');
  });
  it('pending notice still works when the catalog is unreachable', async () => {
    const { savePendingRequests } = await import('../src/channel/pending.js');
    savePendingRequests({ modules: ['announcements'] });
    const failing: typeof fetch = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
    const { checkChannelNotices, getChannelNotices } = await import('../src/channel/notices.js');
    await checkChannelNotices({ fetchImpl: failing });
    expect(getChannelNotices()).toContain('announcements');
  });
});
