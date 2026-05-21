import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  getRegistryRootPath,
  getResourceDirectory,
  installResourceAtomically,
  readRegistryIndex,
  validateResourceManifest,
  writeRegistryIndex,
  type ResourceManifest,
} from '../../src/registry/local_registry.js';

let tmpHome: string;

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'cc-registry-'));
  process.env.CC_HOME = tmpHome;
});

afterEach(() => {
  delete process.env.CC_HOME;
  rmSync(tmpHome, { recursive: true, force: true });
});

describe('local registry', () => {
  it('resolves registry root under CC_HOME', () => {
    expect(getRegistryRootPath()).toBe(join(tmpHome, 'registry'));
  });

  it('uses <kind>/<id>@<version> for resource directories', () => {
    expect(getResourceDirectory('template', 'comparison-layout', '1.2.0')).toBe(
      join(tmpHome, 'registry', 'template', 'comparison-layout@1.2.0'),
    );
  });

  it('returns an empty index when index.json does not exist', () => {
    expect(readRegistryIndex()).toEqual({
      schemaVersion: 1,
      installed: [],
    });
  });

  it('round-trips index.json', () => {
    const entry = {
      kind: 'theme' as const,
      id: 'academic-modern',
      version: '1.0.0',
      installedAt: '2026-05-21T00:00:00.000Z',
      source: 'file:///theme',
      path: join(tmpHome, 'registry', 'theme', 'academic-modern@1.0.0'),
    };

    writeRegistryIndex({ schemaVersion: 1, installed: [entry] });

    expect(readRegistryIndex()).toEqual({ schemaVersion: 1, installed: [entry] });
  });

  it('validates template, theme, prompt, and adapter-config manifests', () => {
    const manifests: ResourceManifest[] = [
      { schemaVersion: 1, kind: 'template', id: 'comparison-layout', version: '1.0.0', files: ['structure.html'] },
      { schemaVersion: 1, kind: 'theme', id: 'academic-modern', version: '1.0.0', files: ['theme.json'] },
      { schemaVersion: 1, kind: 'prompt', id: 'rank-voice', version: '1.0.0', files: ['prompts.json'] },
      { schemaVersion: 1, kind: 'adapter-config', id: 'manual-brand', version: '1.0.0', files: ['adapter.json'] },
    ];

    for (const manifest of manifests) {
      expect(validateResourceManifest(manifest)).toEqual([]);
    }
  });

  it('rejects unsafe manifest paths and ids', () => {
    expect(
      validateResourceManifest({
        schemaVersion: 1,
        kind: 'template',
        id: '../escape',
        version: '1.0.0',
        files: ['../structure.html'],
      }),
    ).toEqual(
      expect.arrayContaining([
        'id must be a safe registry segment',
        'files[0] must be a safe relative path',
      ]),
    );
  });

  it('atomically writes manifest and files, then updates index.json', () => {
    const manifest: ResourceManifest = {
      schemaVersion: 1,
      kind: 'template',
      id: 'comparison-layout',
      version: '1.2.0',
      files: ['structure.html', 'slots.json'],
    };

    const result = installResourceAtomically({
      manifest,
      source: 'file:///D:/Dev/templates/comparison-layout',
      files: [
        { path: 'structure.html', contents: '<section>{{slot:hero}}</section>' },
        { path: 'slots.json', contents: '{"hero":{"required":true}}' },
      ],
      installedAt: '2026-05-21T12:00:00.000Z',
    });

    expect(result.entry).toMatchObject({
      kind: 'template',
      id: 'comparison-layout',
      version: '1.2.0',
      source: 'file:///D:/Dev/templates/comparison-layout',
    });

    expect(existsSync(join(result.entry.path, 'manifest.json'))).toBe(true);
    expect(readFileSync(join(result.entry.path, 'structure.html'), 'utf-8')).toContain('{{slot:hero}}');
    expect(readRegistryIndex().installed).toEqual([result.entry]);
  });

  it('does not update the index when payload validation fails', () => {
    const manifest: ResourceManifest = {
      schemaVersion: 1,
      kind: 'template',
      id: 'broken-layout',
      version: '1.0.0',
      files: ['structure.html'],
    };

    expect(() =>
      installResourceAtomically({
        manifest,
        source: 'file:///broken',
        files: [{ path: 'unexpected.html', contents: '<section />' }],
      }),
    ).toThrow('missing payload file structure.html');

    expect(readRegistryIndex().installed).toEqual([]);
  });
});
