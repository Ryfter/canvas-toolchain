import { loadConfig } from '../kb/config.js';
import type { ResourceKind } from './local_registry.js';

export interface SearchRegistryInput {
  kind?: ResourceKind;
  query: string;
  tier?: 'free' | 'premium';
}

export interface RegistrySearchResult {
  kind: ResourceKind;
  id: string;
  version: string;
  name?: string;
  description?: string;
  tags: string[];
  tier: 'free' | 'premium';
  installUrl: string;
}

export interface SearchRegistryResult {
  results: RegistrySearchResult[];
}

type IndexedResource = Omit<RegistrySearchResult, 'installUrl' | 'tags' | 'tier'> & {
  tags?: string[];
  tier?: 'free' | 'premium';
};

const kindToCollection: Record<ResourceKind, string> = {
  template: 'templates',
  theme: 'themes',
  prompt: 'prompts',
  'adapter-config': 'adapter-configs',
  bundle: 'bundles',
};

const searchableKinds: ResourceKind[] = ['template', 'theme', 'prompt', 'adapter-config', 'bundle'];

export async function searchRegistry(input: SearchRegistryInput): Promise<SearchRegistryResult> {
  if (!input.query || input.query.trim() === '') {
    throw new Error('query is required');
  }

  if (input.tier === 'premium') {
    return searchPremiumRegistry(input);
  }

  return searchFreeGithubRegistry(input);
}

async function searchFreeGithubRegistry(input: SearchRegistryInput): Promise<SearchRegistryResult> {
  const config = loadConfig();
  const org = config.registry?.githubOrg ?? 'canvas-toolchain';
  const kinds = input.kind ? [input.kind] : searchableKinds;
  const results: RegistrySearchResult[] = [];

  for (const kind of kinds) {
    const collection = kindToCollection[kind];
    const indexUrl = `https://raw.githubusercontent.com/${org}/${collection}/main/index.json`;
    const index = await fetchOptionalJson<{ resources?: IndexedResource[] }>(indexUrl);
    for (const resource of index?.resources ?? []) {
      const normalized = normalizeSearchResult(resource, 'free', `github://${org}/${collection}/${resource.id}@${resource.version}`);
      if (normalized.kind === kind && matchesQuery(normalized, input.query)) {
        results.push(normalized);
      }
    }
  }

  return { results: sortResults(results) };
}

async function searchPremiumRegistry(input: SearchRegistryInput): Promise<SearchRegistryResult> {
  const config = loadConfig();
  const registry = config.registry;

  if (!registry?.token) {
    throw new Error('registry token is required for premium registry search');
  }

  const base = registry.premiumBaseUrl ?? 'https://ryfter.com/api/registry';
  const params = new URLSearchParams({ query: input.query });
  if (input.kind) params.set('kind', input.kind);

  const response = await fetch(`${base.replace(/\/$/, '')}/search?${params.toString()}`, {
    headers: { Authorization: `Bearer ${registry.token}` },
  });
  if (!response.ok) {
    throw new Error(`Premium registry search failed: ${response.status} ${response.statusText}`);
  }

  const body = (await response.json()) as { results?: IndexedResource[] };
  return {
    results: sortResults(
      (body.results ?? []).map((resource) =>
        normalizeSearchResult(
          resource,
          'premium',
          `ryfter://${kindToCollection[resource.kind]}/${resource.id}@${resource.version}`,
        ),
      ),
    ),
  };
}

async function fetchOptionalJson<T>(url: string): Promise<T | null> {
  const response = await fetch(url, undefined);
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`Registry index fetch failed: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

function normalizeSearchResult(resource: IndexedResource, tier: 'free' | 'premium', installUrl: string): RegistrySearchResult {
  return {
    kind: resource.kind,
    id: resource.id,
    version: resource.version,
    name: resource.name,
    description: resource.description,
    tags: resource.tags ?? [],
    tier: resource.tier ?? tier,
    installUrl,
  };
}

function matchesQuery(resource: RegistrySearchResult, query: string): boolean {
  const haystack = [
    resource.kind,
    resource.id,
    resource.version,
    resource.name,
    resource.description,
    ...resource.tags,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term));
}

function sortResults(results: RegistrySearchResult[]): RegistrySearchResult[] {
  return [...results].sort((a, b) => `${a.kind}:${a.id}:${a.version}`.localeCompare(`${b.kind}:${b.id}:${b.version}`));
}
