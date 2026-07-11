import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

function moduleSource(id: string, version: string, toolName: string): string {
  return `export default { id: '${id}', name: 'Fixture', description: 'test', version: '${version}',
  tools: [{ schema: { name: '${toolName}', description: 'fixture', inputSchema: { type: 'object' } },
            handler: async () => ({ content: [{ type: 'text', text: 'ok' }] }) }] };\n`;
}

let home: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'cc-loader-'));
  process.env.CC_HOME = home;
});
afterEach(() => {
  delete process.env.CC_HOME;
  rmSync(home, { recursive: true, force: true });
});

async function placeArtifact(id: string, version: string, source: string, recordSha?: string) {
  const { artifactPath } = await import('../src/channel/installed.js');
  const { loadInstalledModules, saveInstalledModules } = await import('../src/channel/installed.js');
  const p = artifactPath(id, version);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, source);
  const file = loadInstalledModules();
  file.modules[id] = {
    id, version, installedAt: '2026-07-11T00:00:00Z',
    sha256: recordSha ?? createHash('sha256').update(source).digest('hex'),
  };
  saveInstalledModules(file);
}

describe('dynamic artifact loading', () => {
  it('loads an enabled installed artifact and registers its tools', async () => {
    await placeArtifact('fixture', '1.0.0', moduleSource('fixture', '1.0.0', 'fixture_tool'));
    const { saveModuleManifest } = await import('../src/modules/manifest.js');
    saveModuleManifest({ modules: { fixture: { enabled: true } } });
    const { loadModules } = await import('../src/modules/registry.js');
    const loaded = await loadModules({}); // no static modules
    expect(loaded.handlers.has('fixture_tool')).toBe(true);
  });

  it('skips (never loads) an artifact whose bytes no longer match the recorded sha256', async () => {
    const src = moduleSource('fixture', '1.0.0', 'fixture_tool');
    await placeArtifact('fixture', '1.0.0', src, createHash('sha256').update('something else').digest('hex'));
    const { saveModuleManifest } = await import('../src/modules/manifest.js');
    saveModuleManifest({ modules: { fixture: { enabled: true } } });
    const { loadModules } = await import('../src/modules/registry.js');
    const loaded = await loadModules({});
    expect(loaded.handlers.has('fixture_tool')).toBe(false);
  });

  it('skips a contract-violating artifact fail-soft', async () => {
    await placeArtifact('bad', '1.0.0', `export default { nope: true };\n`);
    const { saveModuleManifest } = await import('../src/modules/manifest.js');
    saveModuleManifest({ modules: { bad: { enabled: true } } });
    const { loadModules } = await import('../src/modules/registry.js');
    const loaded = await loadModules({});
    expect(loaded.tools).toHaveLength(0);
  });

  it('ignores disabled installed artifacts', async () => {
    await placeArtifact('fixture', '1.0.0', moduleSource('fixture', '1.0.0', 'fixture_tool'));
    const { saveModuleManifest } = await import('../src/modules/manifest.js');
    saveModuleManifest({ modules: { fixture: { enabled: false } } });
    const { loadModules } = await import('../src/modules/registry.js');
    expect((await loadModules({})).handlers.has('fixture_tool')).toBe(false);
  });

  it('semver-newer installed artifact wins over a bundled module with the same id', async () => {
    await placeArtifact('dup', '2.0.0', moduleSource('dup', '2.0.0', 'dup_tool_new'));
    const { saveModuleManifest } = await import('../src/modules/manifest.js');
    saveModuleManifest({ modules: { dup: { enabled: true } } });
    const bundled = {
      dup: async () => ({
        id: 'dup', name: 'Bundled', description: 'old', version: '1.0.0',
        tools: [{ schema: { name: 'dup_tool_old', description: 'x', inputSchema: { type: 'object' as const } },
                  handler: async () => ({ content: [] }) }],
      }),
    };
    const { loadModules } = await import('../src/modules/registry.js');
    const loaded = await loadModules(bundled as never);
    expect(loaded.handlers.has('dup_tool_new')).toBe(true);
    expect(loaded.handlers.has('dup_tool_old')).toBe(false);
  });

  it('bundled wins when versions are equal or bundled is newer', async () => {
    await placeArtifact('dup', '1.0.0', moduleSource('dup', '1.0.0', 'dup_tool_installed'));
    const { saveModuleManifest } = await import('../src/modules/manifest.js');
    saveModuleManifest({ modules: { dup: { enabled: true } } });
    const bundled = {
      dup: async () => ({
        id: 'dup', name: 'Bundled', description: 'same', version: '1.0.0',
        tools: [{ schema: { name: 'dup_tool_bundled', description: 'x', inputSchema: { type: 'object' as const } },
                  handler: async () => ({ content: [] }) }],
      }),
    };
    const { loadModules } = await import('../src/modules/registry.js');
    const loaded = await loadModules(bundled as never);
    expect(loaded.handlers.has('dup_tool_bundled')).toBe(true);
    expect(loaded.handlers.has('dup_tool_installed')).toBe(false);
  });

  it('prunes the retained previous version after the new version loads successfully once', async () => {
    const oldSrc = moduleSource('fixture', '1.0.0', 'fixture_old');
    const newSrc = moduleSource('fixture', '1.1.0', 'fixture_new');
    const { artifactPath, loadInstalledModules, saveInstalledModules } = await import('../src/channel/installed.js');
    for (const [v, s] of [['1.0.0', oldSrc], ['1.1.0', newSrc]] as const) {
      const p = artifactPath('fixture', v);
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, s);
    }
    saveInstalledModules({ modules: { fixture: {
      id: 'fixture', version: '1.1.0', installedAt: '2026-07-11T00:00:00Z',
      sha256: createHash('sha256').update(newSrc).digest('hex'),
      previous: { version: '1.0.0', sha256: createHash('sha256').update(oldSrc).digest('hex') },
    } } });
    const { saveModuleManifest } = await import('../src/modules/manifest.js');
    saveModuleManifest({ modules: { fixture: { enabled: true } } });
    const { loadModules } = await import('../src/modules/registry.js');
    const loaded = await loadModules({});
    expect(loaded.handlers.has('fixture_new')).toBe(true);
    expect(existsSync(artifactPath('fixture', '1.0.0'))).toBe(false);
    expect(loadInstalledModules().modules.fixture.previous).toBeUndefined();
  });
});
