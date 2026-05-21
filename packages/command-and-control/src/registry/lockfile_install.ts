import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installResource } from './install_resource.js';
import { readRegistryIndex, type RegistryIndexEntry, type ResourceKind, type ResourceManifest } from './local_registry.js';

export interface InstallResourcesFromLockfileInput {
  path: string;
}

export interface LockfileInstallItemResult {
  url: string;
  status: 'installed' | 'skipped' | 'failed';
  kind?: ResourceKind;
  id?: string;
  version?: string;
  entry?: RegistryIndexEntry;
  error?: string;
}

export interface InstallResourcesFromLockfileResult {
  results: LockfileInstallItemResult[];
  summary: {
    installed: number;
    skipped: number;
    failed: number;
    total: number;
  };
}

const collectionToKind: Record<string, ResourceKind> = {
  templates: 'template',
  themes: 'theme',
  prompts: 'prompt',
  'adapter-configs': 'adapter-config',
  bundles: 'bundle',
};

export async function installResourcesFromLockfile(
  input: InstallResourcesFromLockfileInput,
): Promise<InstallResourcesFromLockfileResult> {
  const urls = parseLockfile(readFileSync(input.path, 'utf-8'));
  const results: LockfileInstallItemResult[] = [];

  for (const url of urls) {
    try {
      const identity = identityFromUrl(url);
      if (identity && isInstalled(identity)) {
        results.push({ url, status: 'skipped', ...identity });
        continue;
      }

      const installResult = await installResource({ url });
      results.push({
        url,
        status: 'installed',
        kind: installResult.entry.kind,
        id: installResult.entry.id,
        version: installResult.entry.version,
        entry: installResult.entry,
      });
    } catch (error) {
      results.push({
        url,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    results,
    summary: {
      installed: results.filter((result) => result.status === 'installed').length,
      skipped: results.filter((result) => result.status === 'skipped').length,
      failed: results.filter((result) => result.status === 'failed').length,
      total: results.length,
    },
  };
}

export function parseLockfile(contents: string): string[] {
  const trimmed = contents.trim();
  if (trimmed === '') return [];

  if (trimmed.startsWith('[')) {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(parsed) || parsed.some((entry) => typeof entry !== 'string')) {
      throw new Error('JSON lockfile must be an array of resource URL strings');
    }
    return parsed.map((entry) => entry.trim()).filter(Boolean);
  }

  return contents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));
}

function identityFromUrl(url: string): Pick<RegistryIndexEntry, 'kind' | 'id' | 'version'> | null {
  if (url.startsWith('file://')) {
    const manifest = JSON.parse(readFileSync(join(fileURLToPath(url), 'manifest.json'), 'utf-8')) as ResourceManifest;
    return { kind: manifest.kind, id: manifest.id, version: manifest.version };
  }

  if (url.startsWith('github://') || url.startsWith('ryfter://')) {
    const parsed = new URL(url);
    const isGithub = url.startsWith('github://');
    const pathParts = parsed.pathname.split('/').filter(Boolean);
    const collection = isGithub ? pathParts[0] : parsed.hostname;
    const idAndVersion = isGithub ? pathParts[1] : pathParts[0];
    const kind = collectionToKind[collection];
    if (!kind || !idAndVersion) return null;

    const versionSeparator = idAndVersion.lastIndexOf('@');
    if (versionSeparator <= 0 || versionSeparator === idAndVersion.length - 1) return null;

    return {
      kind,
      id: idAndVersion.slice(0, versionSeparator),
      version: idAndVersion.slice(versionSeparator + 1),
    };
  }

  return null;
}

function isInstalled(identity: Pick<RegistryIndexEntry, 'kind' | 'id' | 'version'>): boolean {
  return readRegistryIndex().installed.some(
    (entry) => entry.kind === identity.kind && entry.id === identity.id && entry.version === identity.version,
  );
}
