import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { installResourcesFromLockfile } from '../../src/registry/lockfile_install.js';
import { installResource } from '../../src/registry/install_resource.js';
import { readRegistryIndex } from '../../src/registry/local_registry.js';

let tmpHome: string;
let tmpRoot: string;

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'cc-lock-home-'));
  tmpRoot = mkdtempSync(join(tmpdir(), 'cc-lock-sources-'));
  process.env.CC_HOME = tmpHome;
});

afterEach(() => {
  delete process.env.CC_HOME;
  rmSync(tmpHome, { recursive: true, force: true });
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe('installResourcesFromLockfile', () => {
  it('installs resources from a plain-text lockfile in order', async () => {
    const first = createTemplateSource('first-template', '1.0.0');
    const second = createThemeSource('second-theme', '1.0.0');
    const lockfilePath = join(tmpRoot, 'resources.lock');
    writeFileSync(lockfilePath, `${pathToFileURL(first).href}\n\n${pathToFileURL(second).href}\n`);

    const result = await installResourcesFromLockfile({ path: lockfilePath });

    expect(result.summary).toEqual({ installed: 2, skipped: 0, failed: 0, total: 2 });
    expect(result.results.map((item) => item.status)).toEqual(['installed', 'installed']);
    expect(readRegistryIndex().installed.map((entry) => entry.id)).toEqual(['first-template', 'second-theme']);
  });

  it('installs resources from a JSON array lockfile', async () => {
    const source = createTemplateSource('json-template', '1.0.0');
    const lockfilePath = join(tmpRoot, 'resources.json');
    writeFileSync(lockfilePath, JSON.stringify([pathToFileURL(source).href]));

    const result = await installResourcesFromLockfile({ path: lockfilePath });

    expect(result.summary).toEqual({ installed: 1, skipped: 0, failed: 0, total: 1 });
  });

  it('skips already-installed resources at the same version', async () => {
    const source = createTemplateSource('already-installed', '1.0.0');
    await installResource({ url: pathToFileURL(source).href });
    const lockfilePath = join(tmpRoot, 'resources.lock');
    writeFileSync(lockfilePath, pathToFileURL(source).href);

    const result = await installResourcesFromLockfile({ path: lockfilePath });

    expect(result.summary).toEqual({ installed: 0, skipped: 1, failed: 0, total: 1 });
    expect(result.results[0]).toMatchObject({ status: 'skipped', id: 'already-installed', version: '1.0.0' });
  });

  it('reports failures per resource and continues', async () => {
    const good = createTemplateSource('good-template', '1.0.0');
    const lockfilePath = join(tmpRoot, 'resources.lock');
    writeFileSync(lockfilePath, `file:///does/not/exist\n${pathToFileURL(good).href}`);

    const result = await installResourcesFromLockfile({ path: lockfilePath });

    expect(result.summary).toEqual({ installed: 1, skipped: 0, failed: 1, total: 2 });
    expect(result.results.map((item) => item.status)).toEqual(['failed', 'installed']);
  });
});

function createTemplateSource(id: string, version: string): string {
  const root = join(tmpRoot, `${id}@${version}`);
  mkdirSync(root, { recursive: true });
  writeFileSync(
    join(root, 'manifest.json'),
    JSON.stringify({ schemaVersion: 1, kind: 'template', id, version, files: ['structure.html'] }),
  );
  writeFileSync(join(root, 'structure.html'), '<section>{{slot:hero}}</section>');
  return root;
}

function createThemeSource(id: string, version: string): string {
  const root = join(tmpRoot, `${id}@${version}`);
  mkdirSync(root, { recursive: true });
  writeFileSync(
    join(root, 'manifest.json'),
    JSON.stringify({ schemaVersion: 1, kind: 'theme', id, version, files: ['theme.json'] }),
  );
  writeFileSync(join(root, 'theme.json'), '{}');
  return root;
}
