import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

let tmpInstallDir: string;

beforeEach(() => {
  tmpInstallDir = mkdtempSync(join(tmpdir(), 'cc-update-check-'));
  process.env.CC_INSTALL_DIR = tmpInstallDir;
});

afterEach(() => {
  delete process.env.CC_INSTALL_DIR;
  rmSync(tmpInstallDir, { recursive: true, force: true });
});

import {
  checkForUpdates,
  getUpdateNotice,
  compareVersions,
  getInstalledVersion,
  resetUpdateState,
} from '../../src/update/check.js';

describe('compareVersions', () => {
  it('returns 0 for equal versions', () => {
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
  });

  it('returns -1 when a < b', () => {
    expect(compareVersions('1.0.0', '1.0.1')).toBe(-1);
    expect(compareVersions('1.0.0', '1.1.0')).toBe(-1);
    expect(compareVersions('1.0.0', '2.0.0')).toBe(-1);
  });

  it('returns 1 when a > b', () => {
    expect(compareVersions('1.0.1', '1.0.0')).toBe(1);
    expect(compareVersions('2.0.0', '1.9.9')).toBe(1);
  });

  it('handles leading v prefix on either side', () => {
    expect(compareVersions('v1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('v1.0.0', 'v1.0.1')).toBe(-1);
  });

  it('treats non-numeric segments as 0', () => {
    expect(compareVersions('1.0.x', '1.0.0')).toBe(0);
  });
});

describe('getInstalledVersion', () => {
  beforeEach(() => {
    resetUpdateState();
  });

  it('reads from .canvas-toolchain-version file when present', () => {
    writeFileSync(join(tmpInstallDir, '.canvas-toolchain-version'), 'v0.9.2\n');
    expect(getInstalledVersion()).toBe('0.9.2');
  });

  it('falls back to package.json version when the marker file is missing', () => {
    const v = getInstalledVersion();
    expect(v).toMatch(/^\d+\.\d+\.\d+/);
  });
});

describe('checkForUpdates', () => {
  beforeEach(() => {
    resetUpdateState();
  });

  it('sets the update-available flag when remote version is newer', async () => {
    writeFileSync(join(tmpInstallDir, '.canvas-toolchain-version'), '0.9.0');
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ tag_name: 'v0.9.1', html_url: 'https://example/release' }),
    } as Response);

    await checkForUpdates();

    expect(getUpdateNotice()).toContain('0.9.1');
    expect(getUpdateNotice()).toContain('Updater');
  });

  it('does NOT set the flag when remote version equals installed', async () => {
    writeFileSync(join(tmpInstallDir, '.canvas-toolchain-version'), '0.9.1');
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ tag_name: 'v0.9.1' }),
    } as Response);

    await checkForUpdates();

    expect(getUpdateNotice()).toBeNull();
  });

  it('does NOT set the flag when remote version is older', async () => {
    writeFileSync(join(tmpInstallDir, '.canvas-toolchain-version'), '0.9.5');
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ tag_name: 'v0.9.4' }),
    } as Response);

    await checkForUpdates();

    expect(getUpdateNotice()).toBeNull();
  });

  it('silently skips when fetch throws', async () => {
    writeFileSync(join(tmpInstallDir, '.canvas-toolchain-version'), '0.9.0');
    vi.mocked(fetch).mockRejectedValueOnce(new Error('network error'));

    await expect(checkForUpdates()).resolves.toBeUndefined();
    expect(getUpdateNotice()).toBeNull();
  });

  it('silently skips on non-OK HTTP response', async () => {
    writeFileSync(join(tmpInstallDir, '.canvas-toolchain-version'), '0.9.0');
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 403,
    } as Response);

    await checkForUpdates();
    expect(getUpdateNotice()).toBeNull();
  });

  it('writes a cache file with the check timestamp', async () => {
    writeFileSync(join(tmpInstallDir, '.canvas-toolchain-version'), '0.9.0');
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ tag_name: 'v0.9.1' }),
    } as Response);

    await checkForUpdates();

    const cachePath = join(tmpInstallDir, '.canvas-toolchain-update-cache.json');
    expect(existsSync(cachePath)).toBe(true);
    const cache = JSON.parse(readFileSync(cachePath, 'utf-8'));
    expect(cache.lastCheckAt).toBeDefined();
    expect(cache.latestVersion).toBe('0.9.1');
  });

  it('skips the network call when cache is fresh (under 24h)', async () => {
    writeFileSync(join(tmpInstallDir, '.canvas-toolchain-version'), '0.9.0');
    const cache = {
      lastCheckAt: new Date().toISOString(),
      latestVersion: '0.9.1',
    };
    writeFileSync(join(tmpInstallDir, '.canvas-toolchain-update-cache.json'), JSON.stringify(cache));

    await checkForUpdates();

    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    expect(getUpdateNotice()).toContain('0.9.1');
  });

  it('re-checks when cache is older than 24h', async () => {
    writeFileSync(join(tmpInstallDir, '.canvas-toolchain-version'), '0.9.0');
    const stale = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    const cache = { lastCheckAt: stale, latestVersion: '0.9.1' };
    writeFileSync(join(tmpInstallDir, '.canvas-toolchain-update-cache.json'), JSON.stringify(cache));
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ tag_name: 'v0.9.2' }),
    } as Response);

    await checkForUpdates();

    expect(vi.mocked(fetch)).toHaveBeenCalledOnce();
    expect(getUpdateNotice()).toContain('0.9.2');
  });

  it('aborts the network call after 5 seconds', async () => {
    writeFileSync(join(tmpInstallDir, '.canvas-toolchain-version'), '0.9.0');
    vi.mocked(fetch).mockImplementationOnce(async (_url, init) => {
      return new Promise((_resolve, reject) => {
        (init as RequestInit).signal?.addEventListener('abort', () => {
          reject(new Error('aborted'));
        });
        setTimeout(() => reject(new Error('not aborted')), 10000);
      });
    });

    const start = Date.now();
    await checkForUpdates();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(7000);
    expect(getUpdateNotice()).toBeNull();
  }, 10000);
});
