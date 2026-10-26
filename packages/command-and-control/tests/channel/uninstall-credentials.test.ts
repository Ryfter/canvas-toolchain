import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import {
  setModuleCredential, setModuleShare, moduleCredentialFileExists,
} from '@canvas-toolchain/shared-types';

const ARTIFACT = `export default { id: 'announcements', name: 'A', description: 'd', version: '1.0.0', tools: [] };\n`;
const SHA = createHash('sha256').update(ARTIFACT).digest('hex');
const CATALOG = {
  catalogVersion: 2,
  modules: [{
    id: 'announcements', name: 'Announcements Auditor', description: 'Audit.',
    version: '1.0.0', minHostVersion: '2.0.0',
    artifactUrl: 'https://raw.githubusercontent.com/Ryfter/canvas-toolchain/main/modules/announcements/1.0.0/announcements-1.0.0.mjs',
    sha256: SHA, sizeBytes: ARTIFACT.length,
  }],
  companions: [],
};
const fetchArtifact: typeof fetch = (async () => new Response(ARTIFACT, { status: 200 })) as unknown as typeof fetch;
const TOKEN = 'PLANTED-uninstall-token-3c1d';
const HOST = 'planted-uninstall-host.instructure.com';

let home: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'cc-uninst-'));
  process.env.CC_HOME = home;
});
afterEach(() => {
  delete process.env.CC_HOME;
  rmSync(home, { recursive: true, force: true });
});

async function install() {
  const { installModule } = await import('../../src/channel/install.js');
  await installModule({ moduleId: 'announcements', confirm: true },
    { catalog: CATALOG as never, hostVersion: '2.0.0', fetchImpl: fetchArtifact });
}

const offline = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;

describe('uninstall_module credential cleanup (CT201-11)', () => {
  it('without a credential file, one call uninstalls (no confirm needed)', async () => {
    await install();
    const { uninstallModuleTool } = await import('../../src/tools/module_channel_tools.js');
    const res = await uninstallModuleTool({ moduleId: 'announcements' }, { knownIds: [], fetchImpl: offline });
    expect(res.uninstalled).toBe(true);
  });

  it('with a credential file and no confirm: CONFIRMATION_REQUIRED, nothing deleted, no secrets', async () => {
    await install();
    setModuleCredential('announcements', 'canvas', { host: HOST, token: TOKEN });
    const { uninstallModuleTool } = await import('../../src/tools/module_channel_tools.js');
    const { loadInstalledModules } = await import('../../src/channel/installed.js');
    const res = await uninstallModuleTool({ moduleId: 'announcements' }, { knownIds: [], fetchImpl: offline });
    expect(res.error).toBe('CONFIRMATION_REQUIRED');
    expect(String(res.message)).toMatch(/credentials/i);
    expect(JSON.stringify(res)).not.toContain(TOKEN);
    expect(JSON.stringify(res)).not.toContain(HOST);
    expect(loadInstalledModules().modules.announcements).toBeDefined();
    expect(existsSync(join(home, 'modules', 'announcements'))).toBe(true);
    expect(moduleCredentialFileExists('announcements')).toBe(true);
  });

  it('confirm: false behaves like no confirm', async () => {
    await install();
    setModuleCredential('announcements', 'canvas', { host: HOST, token: TOKEN });
    const { uninstallModuleTool } = await import('../../src/tools/module_channel_tools.js');
    const res = await uninstallModuleTool({ moduleId: 'announcements', confirm: false }, { knownIds: [], fetchImpl: offline });
    expect(res.error).toBe('CONFIRMATION_REQUIRED');
    expect(moduleCredentialFileExists('announcements')).toBe(true);
  });

  it('with confirm: true uninstalls and deletes the credential file', async () => {
    await install();
    setModuleCredential('announcements', 'canvas', { host: HOST, token: TOKEN });
    const { uninstallModuleTool } = await import('../../src/tools/module_channel_tools.js');
    const { loadInstalledModules } = await import('../../src/channel/installed.js');
    const res = await uninstallModuleTool({ moduleId: 'announcements', confirm: true }, { knownIds: [], fetchImpl: offline });
    expect(res.uninstalled).toBe(true);
    expect(JSON.stringify(res)).not.toContain(TOKEN);
    expect(JSON.stringify(res)).not.toContain(HOST);
    expect(loadInstalledModules().modules.announcements).toBeUndefined();
    expect(moduleCredentialFileExists('announcements')).toBe(false);
  });

  it('a file holding only share flags still triggers the gate', async () => {
    await install();
    setModuleShare('announcements', 'canvas', true);
    expect(moduleCredentialFileExists('announcements')).toBe(true);
    const { uninstallModuleTool } = await import('../../src/tools/module_channel_tools.js');
    const res = await uninstallModuleTool({ moduleId: 'announcements' }, { knownIds: [], fetchImpl: offline });
    expect(res.error).toBe('CONFIRMATION_REQUIRED');
    const ok = await uninstallModuleTool({ moduleId: 'announcements', confirm: true }, { knownIds: [], fetchImpl: offline });
    expect(ok.uninstalled).toBe(true);
    expect(moduleCredentialFileExists('announcements')).toBe(false);
  });

  it('disabling a module never deletes its credentials', async () => {
    await install();
    setModuleCredential('announcements', 'canvas', { host: HOST, token: TOKEN });
    const { loadModuleManifest, saveModuleManifest } = await import('../../src/modules/manifest.js');
    const m = loadModuleManifest();
    m.modules.announcements = { ...m.modules.announcements, enabled: false };
    saveModuleManifest(m);
    expect(moduleCredentialFileExists('announcements')).toBe(true);
  });

  it('bundled and unknown modules never reach the credential gate', async () => {
    setModuleCredential('video', 'canvas', { host: HOST, token: TOKEN });
    const { uninstallModuleTool } = await import('../../src/tools/module_channel_tools.js');
    expect((await uninstallModuleTool({ moduleId: 'video' }, { knownIds: ['video'], fetchImpl: offline })).error).toBe('BUNDLED_MODULE');
    expect((await uninstallModuleTool({ moduleId: 'ghost' }, { knownIds: [], fetchImpl: offline })).error).toBe('NOT_INSTALLED');
    expect(moduleCredentialFileExists('video')).toBe(true);
  });
});
