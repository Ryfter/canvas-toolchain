import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

const ARTIFACT = `export default { id: 'announcements', name: 'A', description: 'd', version: '1.0.0', tools: [] };\n`;
const ARTIFACT_SHA = createHash('sha256').update(ARTIFACT).digest('hex');

function catalogWith(overrides: Record<string, unknown> = {}) {
  return {
    catalogVersion: 2,
    modules: [{
      id: 'announcements', name: 'Announcements Auditor', description: 'Audit scheduled announcements.',
      version: '1.0.0', minHostVersion: '2.0.0',
      artifactUrl: 'https://raw.githubusercontent.com/Ryfter/canvas-toolchain/main/modules/announcements/1.0.0/announcements-1.0.0.mjs',
      sha256: ARTIFACT_SHA, sizeBytes: ARTIFACT.length, ...overrides,
    }],
    companions: [],
  };
}
const artifactFetch: typeof fetch = (async () => new Response(ARTIFACT, { status: 200 })) as unknown as typeof fetch;

let home: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'cc-install-'));
  process.env.CC_HOME = home;
});
afterEach(() => {
  delete process.env.CC_HOME;
  rmSync(home, { recursive: true, force: true });
});

describe('resolveDownloadCap (#125 belt-and-suspenders)', () => {
  it('bounds download memory even when the declared size is garbage', async () => {
    const { resolveDownloadCap } = await import('../src/channel/install.js');
    const { MAX_ARTIFACT_BYTES } = await import('../src/channel/catalog.js');
    expect(resolveDownloadCap(10)).toBe(10);
    expect(resolveDownloadCap(MAX_ARTIFACT_BYTES)).toBe(MAX_ARTIFACT_BYTES);
    for (const garbage of [NaN, Infinity, -Infinity, 0, -1, 1.5, MAX_ARTIFACT_BYTES + 1]) {
      expect(resolveDownloadCap(garbage)).toBe(MAX_ARTIFACT_BYTES);
    }
  });
});

describe('uninstallModule path hygiene (#126)', () => {
  it('refuses a path-escaping moduleId even when a tampered ledger contains it', async () => {
    const { saveInstalledModules } = await import('../src/channel/installed.js');
    const { uninstallModule } = await import('../src/channel/install.js');
    const { mkdirSync, writeFileSync } = await import('node:fs');
    mkdirSync(join(home, 'victim'), { recursive: true });
    writeFileSync(join(home, 'victim', 'keep.txt'), 'x');
    saveInstalledModules({ modules: { '../victim': {
      id: '../victim', version: '1.0.0', installedAt: '2026-07-11T00:00:00Z', sha256: 'a'.repeat(64),
    } } });
    const res = uninstallModule({ moduleId: '../victim' }, { knownIds: [] });
    expect(res.uninstalled).toBeUndefined();
    expect(res.error).toBeTruthy();
    // rmSync(join(modulesRoot, '../victim')) would have deleted this.
    expect(existsSync(join(home, 'victim', 'keep.txt'))).toBe(true);
  });
});

describe('installModule download-origin allowlist (#121)', () => {
  it('refuses an off-allowlist artifactUrl without downloading anything', async () => {
    const { installModule } = await import('../src/channel/install.js');
    const calls: string[] = [];
    const spy: typeof fetch = (async (url: string) => {
      calls.push(url);
      return new Response(ARTIFACT, { status: 200 });
    }) as unknown as typeof fetch;
    const res = await installModule(
      { moduleId: 'announcements', confirm: true },
      {
        // The v2.0 hosting scheme (GitHub Releases) is no longer accepted: proves
        // the previous scheme is refused, not just an arbitrary evil host.
        catalog: catalogWith({ artifactUrl: 'https://github.com/Ryfter/canvas-toolchain/releases/download/module-announcements-v1.0.0/module-announcements-1.0.0.mjs' }),
        hostVersion: '2.0.0', fetchImpl: spy,
      },
    );
    expect(res.error).toBe('ARTIFACT_URL_NOT_ALLOWED');
    expect(calls).toEqual([]);
  });

  it('follows a redirect to another githubusercontent.com host and installs', async () => {
    const { installModule } = await import('../src/channel/install.js');
    // raw.githubusercontent.com is not expected to redirect in practice, but the
    // downloader must still re-check every hop against the allowlist rather than
    // trusting the first URL — see isAllowedRedirectHost's tests.
    const assetUrl = 'https://release-assets.githubusercontent.com/github-production-release-asset/1245052104/abc?sig=x';
    const calls: string[] = [];
    const spy: typeof fetch = (async (url: string) => {
      calls.push(url);
      if (url.startsWith('https://raw.githubusercontent.com/')) {
        return new Response(null, { status: 302, headers: { location: assetUrl } });
      }
      if (url === assetUrl) return new Response(ARTIFACT, { status: 200 });
      throw new Error(`unexpected url: ${url}`);
    }) as unknown as typeof fetch;
    const res = await installModule(
      { moduleId: 'announcements', confirm: true },
      { catalog: catalogWith(), hostVersion: '2.0.0', fetchImpl: spy },
    );
    expect(res.installed).toBe(true);
    expect(calls).toHaveLength(2);
  });

  it('refuses a dot-segment traversal artifactUrl injected via deps.catalog (raw prefix check bypass)', async () => {
    // deps.catalog skips validateCatalog entirely — this is exactly what the
    // belt-and-suspenders recheck inside installModule exists to catch. The raw
    // string passes startsWith(ALLOWED_ARTIFACT_URL_PREFIX); new URL(...).href
    // collapses the '..' segments onto a different owner/repo.
    const { installModule } = await import('../src/channel/install.js');
    const calls: string[] = [];
    const spy: typeof fetch = (async (url: string) => {
      calls.push(url);
      return new Response(ARTIFACT, { status: 200 });
    }) as unknown as typeof fetch;
    const evilArtifactUrl = 'https://raw.githubusercontent.com/Ryfter/canvas-toolchain/main/modules/../../../../AttackerOwner/evil-repo/main/payload.mjs';
    expect(evilArtifactUrl.startsWith('https://raw.githubusercontent.com/Ryfter/canvas-toolchain/main/modules/')).toBe(true);
    const res = await installModule(
      { moduleId: 'announcements', confirm: true },
      { catalog: catalogWith({ artifactUrl: evilArtifactUrl }), hostVersion: '2.0.0', fetchImpl: spy },
    );
    expect(res.error).toBe('ARTIFACT_URL_NOT_ALLOWED');
    expect(calls).toEqual([]);
  });

  it('refuses a redirect off the allowlist and never fetches the target', async () => {
    const { installModule } = await import('../src/channel/install.js');
    const calls: string[] = [];
    const spy: typeof fetch = (async (url: string) => {
      calls.push(url);
      if (url.includes('evil.example')) throw new Error(`download escaped to ${url}`);
      return new Response(null, { status: 302, headers: { location: 'https://evil.example/payload' } });
    }) as unknown as typeof fetch;
    const res = await installModule(
      { moduleId: 'announcements', confirm: true },
      { catalog: catalogWith(), hostVersion: '2.0.0', fetchImpl: spy },
    );
    expect(res.error).toBe('ARTIFACT_URL_NOT_ALLOWED');
    expect(calls).toHaveLength(1);
    expect(existsSync(join(home, 'modules', 'announcements'))).toBe(false);
  });
});

describe('installModule artifact-ref path hygiene (version as a filesystem path segment)', () => {
  it('refuses ARTIFACT_REF_INVALID for a traversal-shaped version even with a canonical artifactUrl, and touches nothing', async () => {
    // The catalog entry's artifactUrl is a fine, canonical, allowlisted URL (passes
    // isAllowedArtifactUrl) but the version field — never cross-checked against it — is a
    // traversal payload. artifactPath(id, version) and the tmp filename both join it onto
    // disk; without this recheck, an ordinary install failure's cleanupPlacementDir would
    // rmSync(recursive, force) a directory outside the modules root. deps.catalog injection
    // (and the on-disk cache, via the same validateCatalog gap) both reach this without ever
    // re-running network validation, so the engine must hold this invariant on its own.
    const evilVersion = '../../../../evil';
    const { installModule } = await import('../src/channel/install.js');
    const calls: string[] = [];
    const spy: typeof fetch = (async (url: string) => {
      calls.push(url);
      return new Response(ARTIFACT, { status: 200 });
    }) as unknown as typeof fetch;
    const res = await installModule(
      { moduleId: 'announcements', confirm: true },
      { catalog: catalogWith({ version: evilVersion }), hostVersion: '2.0.0', fetchImpl: spy },
    );
    expect(res.error).toBe('ARTIFACT_REF_INVALID');
    expect(String(res.message)).toContain(evilVersion);
    // Nothing was downloaded, nothing was placed, and nothing outside the modules root moved.
    expect(calls).toEqual([]);
    expect(existsSync(join(home, 'modules'))).toBe(false);
    expect(existsSync(join(home, 'installed-modules.json'))).toBe(false);
  });

  it('the preview path (no confirm) also refuses cleanly for a bad version, before any download logic runs', async () => {
    const { installModule } = await import('../src/channel/install.js');
    const res = await installModule(
      { moduleId: 'announcements' },
      { catalog: catalogWith({ version: '../../../../evil' }), hostVersion: '2.0.0' },
    );
    expect(res.error).toBe('ARTIFACT_REF_INVALID');
    expect(res.preview).toBeUndefined();
  });
});

describe('installModule', () => {
  it('previews without side effects when confirm is absent', async () => {
    const { installModule } = await import('../src/channel/install.js');
    const res = await installModule({ moduleId: 'announcements' }, { catalog: catalogWith(), hostVersion: '2.0.0' });
    expect(res.preview).toBe(true);
    expect(res.sha256).toBe(ARTIFACT_SHA);
    expect(existsSync(join(home, 'modules'))).toBe(false);
    expect(existsSync(join(home, 'installed-modules.json'))).toBe(false);
  });

  it('installs on confirm: verified artifact in place, record written, module enabled, no tmp left', async () => {
    const { installModule } = await import('../src/channel/install.js');
    const { artifactPath, loadInstalledModules } = await import('../src/channel/installed.js');
    const { loadModuleManifest } = await import('../src/modules/manifest.js');
    const res = await installModule(
      { moduleId: 'announcements', confirm: true },
      { catalog: catalogWith(), hostVersion: '2.0.0', fetchImpl: artifactFetch },
    );
    expect(res.installed).toBe(true);
    const path = artifactPath('announcements', '1.0.0');
    expect(readFileSync(path, 'utf-8')).toBe(ARTIFACT);
    expect(loadInstalledModules().modules.announcements.sha256).toBe(ARTIFACT_SHA);
    expect(loadModuleManifest().modules.announcements?.enabled).toBe(true);
    expect(readdirSync(join(home, 'modules', '.tmp'))).toEqual([]);
  });

  it('refuses a hash mismatch fail-closed: nothing installed, tmp deleted', async () => {
    const { installModule } = await import('../src/channel/install.js');
    const res = await installModule(
      { moduleId: 'announcements', confirm: true },
      { catalog: catalogWith({ sha256: 'b'.repeat(64) }), hostVersion: '2.0.0', fetchImpl: artifactFetch },
    );
    expect(res.error).toBe('HASH_MISMATCH');
    expect(String(res.message)).toContain('b'.repeat(64));
    expect(String(res.message)).toContain(ARTIFACT_SHA);
    expect(existsSync(join(home, 'modules', 'announcements'))).toBe(false);
    expect(readdirSync(join(home, 'modules', '.tmp'))).toEqual([]);
  });

  it('refuses when the host is too old', async () => {
    const { installModule } = await import('../src/channel/install.js');
    const res = await installModule(
      { moduleId: 'announcements', confirm: true },
      { catalog: catalogWith(), hostVersion: '1.11.1', fetchImpl: artifactFetch },
    );
    expect(res.error).toBe('HOST_TOO_OLD');
  });

  it('upgrade retains the previous version entry + directory for rollback', async () => {
    const { installModule } = await import('../src/channel/install.js');
    const { loadInstalledModules, artifactPath } = await import('../src/channel/installed.js');
    await installModule({ moduleId: 'announcements', confirm: true },
      { catalog: catalogWith(), hostVersion: '2.0.0', fetchImpl: artifactFetch });
    const v2 = ARTIFACT.replace("version: '1.0.0'", "version: '1.1.0'");
    const v2sha = createHash('sha256').update(v2).digest('hex');
    const v2fetch: typeof fetch = (async () => new Response(v2, { status: 200 })) as unknown as typeof fetch;
    const res = await installModule({ moduleId: 'announcements', confirm: true },
      { catalog: catalogWith({ version: '1.1.0', sha256: v2sha, sizeBytes: v2.length }), hostVersion: '2.0.0', fetchImpl: v2fetch });
    expect(res.installed).toBe(true);
    const rec = loadInstalledModules().modules.announcements;
    expect(rec.version).toBe('1.1.0');
    expect(rec.previous).toEqual({ version: '1.0.0', sha256: ARTIFACT_SHA });
    expect(existsSync(artifactPath('announcements', '1.0.0'))).toBe(true);
  });

  it('chained upgrades keep the last-loaded version as rollback target and orphan nothing', async () => {
    const { installModule } = await import('../src/channel/install.js');
    const { loadInstalledModules, artifactPath, getTmpDownloadDir } = await import('../src/channel/installed.js');
    // v1 install (confirmed) — loader never runs in this test, so v1 never load-verifies.
    await installModule({ moduleId: 'announcements', confirm: true },
      { catalog: catalogWith(), hostVersion: '2.0.0', fetchImpl: artifactFetch });
    const v2 = ARTIFACT.replace("version: '1.0.0'", "version: '1.1.0'");
    const v2sha = createHash('sha256').update(v2).digest('hex');
    const v2fetch: typeof fetch = (async () => new Response(v2, { status: 200 })) as unknown as typeof fetch;
    // v2 upgrade — record.previous becomes v1 (matches the single-upgrade test above).
    await installModule({ moduleId: 'announcements', confirm: true },
      { catalog: catalogWith({ version: '1.1.0', sha256: v2sha, sizeBytes: v2.length }), hostVersion: '2.0.0', fetchImpl: v2fetch });
    const v3 = ARTIFACT.replace("version: '1.0.0'", "version: '1.2.0'");
    const v3sha = createHash('sha256').update(v3).digest('hex');
    const v3fetch: typeof fetch = (async () => new Response(v3, { status: 200 })) as unknown as typeof fetch;
    // v3 upgrade before any reconnect — v2 never loaded, so its directory is orphaned:
    // previous must carry FORWARD as v1 (the last version that ever load-verified), not v2.
    const res = await installModule({ moduleId: 'announcements', confirm: true },
      { catalog: catalogWith({ version: '1.2.0', sha256: v3sha, sizeBytes: v3.length }), hostVersion: '2.0.0', fetchImpl: v3fetch });
    expect(res.installed).toBe(true);
    const rec = loadInstalledModules().modules.announcements;
    expect(rec.version).toBe('1.2.0');
    expect(rec.previous).toEqual({ version: '1.0.0', sha256: ARTIFACT_SHA });
    expect(existsSync(artifactPath('announcements', '1.0.0'))).toBe(true);
    expect(existsSync(join(home, 'modules', 'announcements', '1.1.0'))).toBe(false);
    expect(existsSync(artifactPath('announcements', '1.2.0'))).toBe(true);
    expect(readdirSync(getTmpDownloadDir())).toEqual([]);
  });

  it('reports ALREADY_INSTALLED for same-or-older catalog version', async () => {
    const { installModule } = await import('../src/channel/install.js');
    await installModule({ moduleId: 'announcements', confirm: true },
      { catalog: catalogWith(), hostVersion: '2.0.0', fetchImpl: artifactFetch });
    const res = await installModule({ moduleId: 'announcements', confirm: true },
      { catalog: catalogWith(), hostVersion: '2.0.0', fetchImpl: artifactFetch });
    expect(res.error).toBe('ALREADY_INSTALLED');
  });

  it('unknown module id → MODULE_NOT_IN_CATALOG', async () => {
    const { installModule } = await import('../src/channel/install.js');
    const res = await installModule({ moduleId: 'nope' }, { catalog: catalogWith(), hostVersion: '2.0.0' });
    expect(res.error).toBe('MODULE_NOT_IN_CATALOG');
  });

  it('DOWNLOAD_FAILED on HTTP error leaves no temp state', async () => {
    const { installModule } = await import('../src/channel/install.js');
    const notFoundFetch: typeof fetch = (async () => new Response('nope', { status: 404 })) as unknown as typeof fetch;
    const res = await installModule(
      { moduleId: 'announcements', confirm: true },
      { catalog: catalogWith(), hostVersion: '2.0.0', fetchImpl: notFoundFetch },
    );
    expect(res.error).toBe('DOWNLOAD_FAILED');
    const tmpDir = join(home, 'modules', '.tmp');
    if (existsSync(tmpDir)) {
      expect(readdirSync(tmpDir)).toEqual([]);
    }
    expect(existsSync(join(home, 'modules', 'announcements'))).toBe(false);
  });

  it('DOWNLOAD_TOO_LARGE when the body exceeds catalog sizeBytes', async () => {
    const { installModule } = await import('../src/channel/install.js');
    const res = await installModule(
      { moduleId: 'announcements', confirm: true },
      { catalog: catalogWith({ sizeBytes: 5 }), hostVersion: '2.0.0', fetchImpl: artifactFetch },
    );
    expect(res.error).toBe('DOWNLOAD_TOO_LARGE');
    const tmpDir = join(home, 'modules', '.tmp');
    if (existsSync(tmpDir)) {
      expect(readdirSync(tmpDir)).toEqual([]);
    }
    expect(existsSync(join(home, 'modules', 'announcements'))).toBe(false);
  });

  it('INSTALL_FAILED (structured, cleaned up) when placement fails', async () => {
    const { installModule } = await import('../src/channel/install.js');
    const { mkdirSync, writeFileSync } = await import('node:fs');
    mkdirSync(join(home, 'modules'), { recursive: true });
    writeFileSync(join(home, 'modules', 'announcements'), 'blocker');
    const res = await installModule(
      { moduleId: 'announcements', confirm: true },
      { catalog: catalogWith(), hostVersion: '2.0.0', fetchImpl: artifactFetch },
    );
    expect(res.error).toBe('INSTALL_FAILED');
    const tmpDir = join(home, 'modules', '.tmp');
    if (existsSync(tmpDir)) {
      expect(readdirSync(tmpDir)).toEqual([]);
    }
    const installedPath = join(home, 'installed-modules.json');
    if (existsSync(installedPath)) {
      const parsed = JSON.parse(readFileSync(installedPath, 'utf-8'));
      expect(parsed.modules?.announcements).toBeUndefined();
    }
  });

  it('record-write failure rolls back placement (Stage B)', async () => {
    const { installModule } = await import('../src/channel/install.js');
    const { mkdirSync } = await import('node:fs');
    mkdirSync(join(home), { recursive: true });
    mkdirSync(join(home, 'installed-modules.json.tmp'));
    const res = await installModule(
      { moduleId: 'announcements', confirm: true },
      { catalog: catalogWith(), hostVersion: '2.0.0', fetchImpl: artifactFetch },
    );
    expect(res.error).toBe('INSTALL_FAILED');
    expect(existsSync(join(home, 'modules', 'announcements'))).toBe(false);
    expect(existsSync(join(home, 'installed-modules.json'))).toBe(false);
    const tmpDir = join(home, 'modules', '.tmp');
    if (existsSync(tmpDir)) {
      expect(readdirSync(tmpDir)).toEqual([]);
    }
  });

  it('manifest-enable failure preserves the install and warns (Stage C)', async () => {
    const { installModule } = await import('../src/channel/install.js');
    const { artifactPath, loadInstalledModules } = await import('../src/channel/installed.js');
    const { mkdirSync } = await import('node:fs');
    mkdirSync(join(home, 'modules.json.tmp'));
    const res = await installModule(
      { moduleId: 'announcements', confirm: true },
      { catalog: catalogWith(), hostVersion: '2.0.0', fetchImpl: artifactFetch },
    );
    expect(res.installed).toBe(true);
    expect(String(res.warning)).toContain('set_module_enabled');
    expect(existsSync(artifactPath('announcements', '1.0.0'))).toBe(true);
    expect(loadInstalledModules().modules.announcements.version).toBe('1.0.0');
  });
});

describe('uninstallModule', () => {
  it('refuses bundled modules', async () => {
    const { uninstallModule } = await import('../src/channel/install.js');
    const res = uninstallModule({ moduleId: 'video' }, { knownIds: ['video'] });
    expect(res.error).toBe('BUNDLED_MODULE');
  });
  it('removes an installed module: artifact dir, record, and manifest enablement', async () => {
    const { installModule, uninstallModule } = await import('../src/channel/install.js');
    const { loadInstalledModules } = await import('../src/channel/installed.js');
    const { loadModuleManifest } = await import('../src/modules/manifest.js');
    await installModule({ moduleId: 'announcements', confirm: true },
      { catalog: catalogWith(), hostVersion: '2.0.0', fetchImpl: artifactFetch });
    const res = uninstallModule({ moduleId: 'announcements' }, { knownIds: ['video'] });
    expect(res.uninstalled).toBe(true);
    expect(loadInstalledModules().modules.announcements).toBeUndefined();
    expect(existsSync(join(home, 'modules', 'announcements'))).toBe(false);
    expect(loadModuleManifest().modules.announcements?.enabled).toBe(false);
  });
  it('NOT_INSTALLED for unknown id', async () => {
    const { uninstallModule } = await import('../src/channel/install.js');
    expect(uninstallModule({ moduleId: 'ghost' }, { knownIds: [] }).error).toBe('NOT_INSTALLED');
  });
});
