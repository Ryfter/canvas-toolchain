import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join, sep } from 'node:path';
import { tmpdir } from 'node:os';

let home: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'cc-home-'));
  process.env.CC_HOME = home; // MUST be set before any store touch (lesson 045de35)
});
afterEach(() => {
  delete process.env.CC_HOME;
  rmSync(home, { recursive: true, force: true });
});

describe('installed-modules store', () => {
  it('returns empty on missing or corrupt file', async () => {
    const { loadInstalledModules } = await import('../src/channel/installed.js');
    expect(loadInstalledModules()).toEqual({ modules: {} });
    writeFileSync(join(home, 'installed-modules.json'), '{not json');
    expect(loadInstalledModules()).toEqual({ modules: {} });
  });
  it('round-trips atomically and leaves no tmp file', async () => {
    const { loadInstalledModules, saveInstalledModules } = await import('../src/channel/installed.js');
    const entry = { id: 'announcements', version: '1.0.0', sha256: 'a'.repeat(64), installedAt: '2026-07-11T00:00:00Z' };
    saveInstalledModules({ modules: { announcements: entry } });
    expect(loadInstalledModules().modules.announcements).toEqual(entry);
    expect(existsSync(join(home, 'installed-modules.json.tmp'))).toBe(false);
  });
  it('artifactPath nests id/version under <ccHome>/modules', async () => {
    const { artifactPath } = await import('../src/channel/installed.js');
    expect(artifactPath('announcements', '1.0.0'))
      .toBe([home, 'modules', 'announcements', '1.0.0', 'module.mjs'].join(sep));
  });
});

describe('pending-request store', () => {
  it('tolerates missing/corrupt file as empty', async () => {
    const { loadPendingRequests } = await import('../src/channel/pending.js');
    expect(loadPendingRequests()).toEqual({ modules: [] });
    writeFileSync(join(home, 'pending-module-installs.json'), 'garbage');
    expect(loadPendingRequests()).toEqual({ modules: [] });
  });
  it('removePendingModule prunes one id; clearPendingRequests deletes the file', async () => {
    const { loadPendingRequests, savePendingRequests, removePendingModule, clearPendingRequests, getPendingPath } =
      await import('../src/channel/pending.js');
    savePendingRequests({ requestedAt: '2026-07-11T00:00:00Z', modules: ['announcements', 'other'] });
    removePendingModule('announcements');
    expect(loadPendingRequests().modules).toEqual(['other']);
    clearPendingRequests();
    expect(existsSync(getPendingPath())).toBe(false);
    expect(loadPendingRequests()).toEqual({ modules: [] });
  });
});
