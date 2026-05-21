import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { installResource } from '../../src/registry/install_resource.js';
import { readRegistryIndex } from '../../src/registry/local_registry.js';

let tmpHome: string;
let tmpSource: string;

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'cc-install-home-'));
  tmpSource = mkdtempSync(join(tmpdir(), 'cc-install-source-'));
  process.env.CC_HOME = tmpHome;
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.CC_HOME;
  rmSync(tmpHome, { recursive: true, force: true });
  rmSync(tmpSource, { recursive: true, force: true });
});

describe('installResource', () => {
  it('installs a local file:// template resource', async () => {
    writeFileSync(
      join(tmpSource, 'manifest.json'),
      JSON.stringify({
        schemaVersion: 1,
        kind: 'template',
        id: 'comparison-layout',
        version: '1.0.0',
        files: ['structure.html'],
      }),
    );
    writeFileSync(join(tmpSource, 'structure.html'), '<section>{{slot:hero}}</section>');

    const result = await installResource({ url: pathToFileURL(tmpSource).href });

    expect(result.entry).toMatchObject({
      kind: 'template',
      id: 'comparison-layout',
      version: '1.0.0',
      source: pathToFileURL(tmpSource).href,
    });
    expect(readRegistryIndex().installed).toEqual([result.entry]);
  });

  it('fetches github:// resources from raw.githubusercontent.com', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/manifest.json')) {
        return responseJson({
          schemaVersion: 1,
          kind: 'template',
          id: 'comparison-layout-academic',
          version: '1.2.0',
          tier: 'free',
          files: ['structure.html'],
        });
      }
      return responseText('<section>{{slot:hero}}</section>');
    });
    vi.stubGlobal('fetch', fetchMock);

    await installResource({ url: 'github://canvas-toolchain/templates/comparison-layout-academic@1.2.0' });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://raw.githubusercontent.com/canvas-toolchain/templates/v1.2.0/comparison-layout-academic/manifest.json',
      undefined,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'https://raw.githubusercontent.com/canvas-toolchain/templates/v1.2.0/comparison-layout-academic/structure.html',
      undefined,
    );
  });

  it('rejects premium manifests from github:// resources', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        responseJson({
          schemaVersion: 1,
          kind: 'theme',
          id: 'business-school-pack',
          version: '2.1.0',
          tier: 'premium',
          files: ['theme.json'],
        }),
      ),
    );

    await expect(
      installResource({ url: 'github://canvas-toolchain/themes/business-school-pack@2.1.0' }),
    ).rejects.toThrow('Premium resources cannot be installed from GitHub');
  });

  it('recursively installs github dependencies before the requested resource', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.endsWith('/templates/v1.0.0/main/manifest.json')) {
          return responseJson({
            schemaVersion: 1,
            kind: 'template',
            id: 'main',
            version: '1.0.0',
            files: ['structure.html'],
            dependencies: [{ kind: 'theme', id: 'academic', version: '1.0.0' }],
          });
        }
        if (url.endsWith('/themes/v1.0.0/academic/manifest.json')) {
          return responseJson({
            schemaVersion: 1,
            kind: 'theme',
            id: 'academic',
            version: '1.0.0',
            files: ['theme.json'],
          });
        }
        if (url.endsWith('/theme.json')) return responseText('{}');
        return responseText('<section>{{slot:hero}}</section>');
      }),
    );

    await installResource({ url: 'github://canvas-toolchain/templates/main@1.0.0' });

    expect(readRegistryIndex().installed.map((entry) => `${entry.kind}:${entry.id}`)).toEqual([
      'template:main',
      'theme:academic',
    ]);
  });

  it('requires registry token for ryfter:// resources', async () => {
    await expect(installResource({ url: 'ryfter://templates/business-school-pack@2.1.0' })).rejects.toThrow(
      'registry token is required',
    );
  });

  it('rejects a template payload without structure.html', async () => {
    mkdirSync(join(tmpSource, 'nested'), { recursive: true });
    writeFileSync(
      join(tmpSource, 'manifest.json'),
      JSON.stringify({
        schemaVersion: 1,
        kind: 'template',
        id: 'bad-template',
        version: '1.0.0',
        files: ['nested/other.html'],
      }),
    );
    writeFileSync(join(tmpSource, 'nested', 'other.html'), '<section />');

    await expect(installResource({ url: pathToFileURL(tmpSource).href })).rejects.toThrow(
      'template resources must include structure.html',
    );
  });
});

function responseJson(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

function responseText(body: string): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    text: async () => body,
  } as Response;
}
