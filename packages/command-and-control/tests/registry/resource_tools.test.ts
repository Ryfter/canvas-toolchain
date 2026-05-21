import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  getResourceDirectory,
  listInstalledResources,
  uninstallResource,
  writeRegistryIndex,
  type RegistryIndexEntry,
} from '../../src/registry/local_registry.js';

let tmpHome: string;

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'cc-resource-tools-'));
  process.env.CC_HOME = tmpHome;
});

afterEach(() => {
  delete process.env.CC_HOME;
  rmSync(tmpHome, { recursive: true, force: true });
});

describe('registry list and uninstall tools', () => {
  it('lists installed resources with an optional kind filter', () => {
    const template = entry('template', 'comparison-layout', '1.0.0');
    const theme = entry('theme', 'academic-modern', '1.0.0');
    writeRegistryIndex({ schemaVersion: 1, installed: [theme, template] });

    expect(listInstalledResources({})).toEqual([template, theme]);
    expect(listInstalledResources({ kind: 'theme' })).toEqual([theme]);
  });

  it('uninstalls all versions for a kind and id', () => {
    const first = entry('template', 'comparison-layout', '1.0.0');
    const second = entry('template', 'comparison-layout', '1.1.0');
    const other = entry('theme', 'academic-modern', '1.0.0');
    writeRegistryIndex({ schemaVersion: 1, installed: [first, second, other] });
    for (const item of [first, second, other]) mkdirSync(item.path, { recursive: true });

    const result = uninstallResource({ kind: 'template', id: 'comparison-layout' });

    expect(result.removed).toEqual([first, second]);
    expect(result.index.installed).toEqual([other]);
    expect(existsSync(first.path)).toBe(false);
    expect(existsSync(second.path)).toBe(false);
    expect(existsSync(other.path)).toBe(true);
  });

  it('uninstalls bundle includes along with the bundle index entry', () => {
    const template = entry('template', 'comparison-layout', '1.0.0');
    const theme = entry('theme', 'academic-modern', '1.0.0');
    const bundle: RegistryIndexEntry = {
      ...entry('bundle', 'starter-pack', '1.0.0'),
      includes: [
        { kind: 'template', id: 'comparison-layout', version: '1.0.0' },
        { kind: 'theme', id: 'academic-modern', version: '1.0.0' },
      ],
    };
    writeRegistryIndex({ schemaVersion: 1, installed: [template, theme, bundle] });
    for (const item of [template, theme, bundle]) mkdirSync(item.path, { recursive: true });

    const result = uninstallResource({ kind: 'bundle', id: 'starter-pack' });

    expect(result.removed).toEqual([bundle, template, theme]);
    expect(result.index.installed).toEqual([]);
    expect(existsSync(bundle.path)).toBe(false);
    expect(existsSync(template.path)).toBe(false);
    expect(existsSync(theme.path)).toBe(false);
  });
});

function entry(kind: RegistryIndexEntry['kind'], id: string, version: string): RegistryIndexEntry {
  return {
    kind,
    id,
    version,
    installedAt: '2026-05-21T00:00:00.000Z',
    source: `file:///${kind}/${id}`,
    path: getResourceDirectory(kind, id, version),
  };
}
