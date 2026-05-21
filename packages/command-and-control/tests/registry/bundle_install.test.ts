import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { installResource } from '../../src/registry/install_resource.js';
import { readRegistryIndex } from '../../src/registry/local_registry.js';

let tmpHome: string;
let tmpRegistrySource: string;

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'cc-bundle-home-'));
  tmpRegistrySource = mkdtempSync(join(tmpdir(), 'cc-bundle-source-'));
  process.env.CC_HOME = tmpHome;
});

afterEach(() => {
  delete process.env.CC_HOME;
  rmSync(tmpHome, { recursive: true, force: true });
  rmSync(tmpRegistrySource, { recursive: true, force: true });
});

describe('bundle install', () => {
  it('installs included resources and records bundle includes in the index', async () => {
    createTemplate('comparison-layout', '1.0.0');
    createTheme('academic-modern', '1.0.0');
    createPrompt('ranks-voice', '1.0.0');
    const bundle = createBundle('starter-pack', '1.0.0', [
      { kind: 'template', id: 'comparison-layout', version: '1.0.0' },
      { kind: 'theme', id: 'academic-modern', version: '1.0.0' },
      { kind: 'prompt', id: 'ranks-voice', version: '1.0.0' },
    ]);

    const result = await installResource({ url: pathToFileURL(bundle).href });

    expect(result.entry).toMatchObject({ kind: 'bundle', id: 'starter-pack', version: '1.0.0' });
    expect(result.entry.includes).toEqual([
      { kind: 'template', id: 'comparison-layout', version: '1.0.0' },
      { kind: 'theme', id: 'academic-modern', version: '1.0.0' },
      { kind: 'prompt', id: 'ranks-voice', version: '1.0.0' },
    ]);
    expect(readRegistryIndex().installed.map((entry) => `${entry.kind}:${entry.id}`)).toEqual([
      'bundle:starter-pack',
      'prompt:ranks-voice',
      'template:comparison-layout',
      'theme:academic-modern',
    ]);
  });

  it('detects nested bundle cycles', async () => {
    const bundleA = createBundle('bundle-a', '1.0.0', [{ kind: 'bundle', id: 'bundle-b', version: '1.0.0' }]);
    createBundle('bundle-b', '1.0.0', [{ kind: 'bundle', id: 'bundle-a', version: '1.0.0' }]);

    await expect(installResource({ url: pathToFileURL(bundleA).href })).rejects.toThrow('Dependency cycle detected');
  });
});

function createTemplate(id: string, version: string): string {
  const root = sourcePath('templates', id, version);
  writeManifest(root, { schemaVersion: 1, kind: 'template', id, version, files: ['structure.html'] });
  writeFileSync(join(root, 'structure.html'), '<section>{{slot:hero}}</section>');
  return root;
}

function createTheme(id: string, version: string): string {
  const root = sourcePath('themes', id, version);
  writeManifest(root, { schemaVersion: 1, kind: 'theme', id, version, files: ['theme.json'] });
  writeFileSync(join(root, 'theme.json'), '{}');
  return root;
}

function createPrompt(id: string, version: string): string {
  const root = sourcePath('prompts', id, version);
  writeManifest(root, { schemaVersion: 1, kind: 'prompt', id, version, files: ['prompts.json'] });
  writeFileSync(join(root, 'prompts.json'), '{}');
  return root;
}

function createBundle(id: string, version: string, includes: Array<{ kind: string; id: string; version: string }>): string {
  const root = sourcePath('bundles', id, version);
  writeManifest(root, { schemaVersion: 1, kind: 'bundle', id, version, tier: 'free', includes });
  return root;
}

function sourcePath(collection: string, id: string, version: string): string {
  const root = join(tmpRegistrySource, collection, `${id}@${version}`);
  mkdirSync(root, { recursive: true });
  return root;
}

function writeManifest(root: string, manifest: object): void {
  writeFileSync(join(root, 'manifest.json'), JSON.stringify(manifest));
}
