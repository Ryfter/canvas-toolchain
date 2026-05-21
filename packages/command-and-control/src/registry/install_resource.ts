import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadConfig } from '../kb/config.js';
import {
  installResourceAtomically,
  type InstallResourceAtomicallyResult,
  type ResourceFilePayload,
  type ResourceKind,
  type ResourceManifest,
} from './local_registry.js';

export interface InstallResourceInput {
  url: string;
}

export type InstallResourceResult = InstallResourceAtomicallyResult;

interface ResolvedResource {
  manifest: ResourceManifest;
  files: ResourceFilePayload[];
  source: string;
  dependencyUrls: string[];
  resolverKind: 'file' | 'github' | 'ryfter';
}

const collectionToKind: Record<string, ResourceKind> = {
  templates: 'template',
  themes: 'theme',
  prompts: 'prompt',
  'adapter-configs': 'adapter-config',
  bundles: 'bundle',
};

const kindToCollection: Record<ResourceKind, string> = {
  template: 'templates',
  theme: 'themes',
  prompt: 'prompts',
  'adapter-config': 'adapter-configs',
  bundle: 'bundles',
};

export async function installResource(input: InstallResourceInput): Promise<InstallResourceResult> {
  return installResourceWithVisited(input, new Set<string>());
}

async function installResourceWithVisited(input: InstallResourceInput, visited: Set<string>): Promise<InstallResourceResult> {
  if (visited.has(input.url)) {
    throw new Error(`Dependency cycle detected while installing ${input.url}`);
  }
  visited.add(input.url);

  const resolved = await resolveResource(input.url);

  if (resolved.resolverKind === 'github' && resolved.manifest.tier === 'premium') {
    throw new Error('Premium resources cannot be installed from GitHub');
  }

  for (const dependencyUrl of resolved.dependencyUrls) {
    await installResourceWithVisited({ url: dependencyUrl }, visited);
  }

  validateKindPayload(resolved.manifest, resolved.files);

  return installResourceAtomically({
    manifest: resolved.manifest,
    files: resolved.files,
    source: resolved.source,
  });
}

async function resolveResource(url: string): Promise<ResolvedResource> {
  if (url.startsWith('file://')) {
    return resolveFileResource(url);
  }

  if (url.startsWith('github://')) {
    return resolveGithubResource(url);
  }

  if (url.startsWith('ryfter://')) {
    return resolveRyfterResource(url);
  }

  throw new Error(`Unsupported resource URL: ${url}`);
}

function resolveFileResource(url: string): ResolvedResource {
  const root = fileURLToPath(url);
  const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf-8')) as ResourceManifest;
  const files = (manifest.files ?? []).map((filePath) => ({
    path: filePath,
    contents: readFileSync(join(root, ...filePath.split('/'))),
  }));

  return {
    manifest,
    files,
    source: url,
    dependencyUrls: dependencyUrlsForManifest(manifest, { resolverKind: 'file', root }),
    resolverKind: 'file',
  };
}

async function resolveGithubResource(url: string): Promise<ResolvedResource> {
  const parsed = parseRegistryUrl(url, 'github');
  const tag = parsed.version.startsWith('v') ? parsed.version : `v${parsed.version}`;
  const baseUrl = `https://raw.githubusercontent.com/${parsed.ownerOrCollection}/${parsed.collection}/${tag}/${parsed.id}`;
  const manifest = await fetchJson<ResourceManifest>(`${baseUrl}/manifest.json`);
  const files = await fetchFiles(baseUrl, manifest.files ?? []);

  return {
    manifest,
    files,
    source: url,
    dependencyUrls: dependencyUrlsForManifest(manifest, {
      resolverKind: 'github',
      owner: parsed.ownerOrCollection,
    }),
    resolverKind: 'github',
  };
}

async function resolveRyfterResource(url: string): Promise<ResolvedResource> {
  const config = loadConfig();
  const registry = config.registry;

  if (!registry?.token) {
    throw new Error('registry token is required for ryfter:// resources');
  }

  const parsed = parseRegistryUrl(url, 'ryfter');
  const base = registry.premiumBaseUrl ?? 'https://ryfter.com/api/registry';
  const resourceBaseUrl = `${base.replace(/\/$/, '')}/${parsed.collection}/${parsed.id}@${parsed.version}`;
  const requestInit = { headers: { Authorization: `Bearer ${registry.token}` } };
  const manifest = await fetchJson<ResourceManifest>(`${resourceBaseUrl}/manifest.json`, requestInit);
  const files = await fetchFiles(resourceBaseUrl, manifest.files ?? [], requestInit);

  return {
    manifest,
    files,
    source: url,
    dependencyUrls: dependencyUrlsForManifest(manifest, { resolverKind: 'ryfter' }),
    resolverKind: 'ryfter',
  };
}

function parseRegistryUrl(url: string, resolverKind: 'github' | 'ryfter'): {
  ownerOrCollection: string;
  collection: string;
  id: string;
  version: string;
} {
  const parsed = new URL(url);
  const pathParts = parsed.pathname.split('/').filter(Boolean);
  const ownerOrCollection = parsed.hostname;
  const collection = resolverKind === 'github' ? pathParts[0] : ownerOrCollection;
  const idAndVersion = resolverKind === 'github' ? pathParts[1] : pathParts[0];

  if (!collection || !idAndVersion) {
    throw new Error(`Invalid ${resolverKind} resource URL: ${url}`);
  }

  if (collectionToKind[collection] === undefined) {
    throw new Error(`Unsupported resource collection: ${collection}`);
  }

  const versionSeparator = idAndVersion.lastIndexOf('@');
  if (versionSeparator <= 0 || versionSeparator === idAndVersion.length - 1) {
    throw new Error(`Resource URL must include @version: ${url}`);
  }

  return {
    ownerOrCollection,
    collection,
    id: idAndVersion.slice(0, versionSeparator),
    version: idAndVersion.slice(versionSeparator + 1),
  };
}

function dependencyUrlsForManifest(
  manifest: ResourceManifest,
  context:
    | { resolverKind: 'file'; root: string }
    | { resolverKind: 'github'; owner: string }
    | { resolverKind: 'ryfter' },
): string[] {
  const deps = [...(manifest.dependencies ?? [])];
  if (manifest.kind === 'bundle' && manifest.includes) {
    deps.push(...manifest.includes);
  }
  return deps.map((dependency) => {
    const version = dependency.version ?? dependency.minVersion;
    if (!version) {
      throw new Error(`Dependency ${dependency.kind}:${dependency.id} must specify version or minVersion`);
    }

    const collection = kindToCollection[dependency.kind];
    if (context.resolverKind === 'github') {
      return `github://${context.owner}/${collection}/${dependency.id}@${version}`;
    }
    if (context.resolverKind === 'ryfter') {
      return `ryfter://${collection}/${dependency.id}@${version}`;
    }

    return pathToFileDependencyUrl(context.root, collection, dependency.id, version);
  });
}

function pathToFileDependencyUrl(root: string, collection: string, id: string, version: string): string {
  const collectionRoot = dirname(dirname(root));
  const dependencyPath = join(collectionRoot, collection, `${id}@${version}`);
  return pathToFileURL(dependencyPath).href;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

async function fetchFiles(baseUrl: string, filePaths: string[], init?: RequestInit): Promise<ResourceFilePayload[]> {
  const files: ResourceFilePayload[] = [];
  for (const filePath of filePaths) {
    const response = await fetch(`${baseUrl}/${filePath}`, init);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${baseUrl}/${filePath}: ${response.status} ${response.statusText}`);
    }
    files.push({ path: filePath, contents: await response.text() });
  }
  return files;
}

function validateKindPayload(manifest: ResourceManifest, files: ResourceFilePayload[]): void {
  const paths = new Set(files.map((file) => file.path));

  if (manifest.kind === 'template' && !paths.has('structure.html')) {
    throw new Error('template resources must include structure.html');
  }
  if (manifest.kind === 'theme' && !paths.has('theme.json')) {
    throw new Error('theme resources must include theme.json');
  }
  if (manifest.kind === 'prompt' && !paths.has('prompts.json')) {
    throw new Error('prompt resources must include prompts.json');
  }
  if (manifest.kind === 'adapter-config' && !paths.has('adapter.json')) {
    throw new Error('adapter-config resources must include adapter.json');
  }
}
