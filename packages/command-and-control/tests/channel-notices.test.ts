import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, platform } from 'node:os';
import { loadNoticeState, saveNoticeState } from '../src/channel/notice_state.js';

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

const CATALOG = { catalogVersion: 2, modules: [{
  id: 'announcements', name: 'Announcements Auditor', description: 'd', version: '1.1.0',
  minHostVersion: '2.0.0', artifactUrl: 'https://raw.githubusercontent.com/Ryfter/canvas-toolchain/main/modules/announcements/1.1.0/announcements-1.1.0.mjs', sha256: 'a'.repeat(64), sizeBytes: 10,
}], companions: [] };

describe('channel notices', () => {
  it('null when nothing is pending and nothing is outdated', async () => {
    // Also installed at the catalog version, so the discovery notice (a newly
    // added throttled notice — see 'discovery notice' below) has nothing to report.
    const { saveInstalledModules } = await import('../src/channel/installed.js');
    saveInstalledModules({ modules: { announcements: {
      id: 'announcements', version: '1.1.0', sha256: 'a'.repeat(64), installedAt: '2026-07-11T00:00:00Z',
    } } });
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

describe('notice state', () => {
  it('round-trips, defaults to empty, and writes owner-only without leaving a tmp file', () => {
    const p = join(home, 'state.json');
    expect(loadNoticeState(p)).toEqual({ lastDiscoveryIds: [] });
    saveNoticeState({ lastDiscoveryIds: ['a', 'b'] }, p);
    expect(loadNoticeState(p)).toEqual({ lastDiscoveryIds: ['a', 'b'] });
    if (platform() !== 'win32') expect(statSync(p).mode & 0o777).toBe(0o600);
    expect(existsSync(`${p}.tmp`)).toBe(false);
  });
});

const DISCOVERY_CATALOG = {
  catalogVersion: 2,
  modules: [{
    id: 'announcements', name: 'Announcements Auditor', description: 'Audit scheduled announcements.',
    version: '1.1.0', minHostVersion: '2.1.0',
    artifactUrl: 'https://raw.githubusercontent.com/Ryfter/canvas-toolchain/main/modules/announcements/1.1.0/announcements-1.1.0.mjs',
    sha256: 'a'.repeat(64), sizeBytes: 1234,
  }],
  companions: [],
};

describe('discovery notice', () => {
  it('fires once for a newly available module, then stays quiet on the next startup', async () => {
    const { checkChannelNotices, getChannelNotices, resetChannelNotices } = await import('../src/channel/notices.js');
    resetChannelNotices();
    await checkChannelNotices({ catalog: DISCOVERY_CATALOG });
    expect(getChannelNotices()).toContain('browse modules');

    resetChannelNotices();
    await checkChannelNotices({ catalog: DISCOVERY_CATALOG });
    expect(getChannelNotices()).toBeNull();
  });

  it('fires again when a genuinely new module appears', async () => {
    const { checkChannelNotices, getChannelNotices, resetChannelNotices } = await import('../src/channel/notices.js');
    resetChannelNotices();
    await checkChannelNotices({ catalog: DISCOVERY_CATALOG });

    const withSecond = {
      ...DISCOVERY_CATALOG,
      modules: [...DISCOVERY_CATALOG.modules, { ...DISCOVERY_CATALOG.modules[0], id: 'rubrics', name: 'Rubric Helper' }],
    };
    resetChannelNotices();
    await checkChannelNotices({ catalog: withSecond });
    expect(getChannelNotices()).toContain('browse modules');
  });
});
