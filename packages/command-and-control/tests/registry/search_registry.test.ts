import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setupCc } from '../../src/tools/setup_cc.js';
import { searchRegistry } from '../../src/registry/search_registry.js';

let tmpHome: string;

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'cc-search-registry-'));
  process.env.CC_HOME = tmpHome;
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.CC_HOME;
  rmSync(tmpHome, { recursive: true, force: true });
});

describe('searchRegistry', () => {
  it('searches the default GitHub registry index for free resources', async () => {
    const fetchMock = vi.fn(async () =>
      responseJson({
        resources: [
          {
            kind: 'template',
            id: 'comparison-layout',
            version: '1.0.0',
            name: 'Comparison Layout',
            description: 'Two-column comparison page',
            tags: ['comparison', 'academic'],
          },
          {
            kind: 'template',
            id: 'case-study',
            version: '1.0.0',
            name: 'Case Study',
            tags: ['case'],
          },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await searchRegistry({ kind: 'template', query: 'comparison' });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://raw.githubusercontent.com/canvas-toolchain/templates/main/index.json',
      undefined,
    );
    expect(result.results).toEqual([
      {
        kind: 'template',
        id: 'comparison-layout',
        version: '1.0.0',
        name: 'Comparison Layout',
        description: 'Two-column comparison page',
        tags: ['comparison', 'academic'],
        tier: 'free',
        installUrl: 'github://canvas-toolchain/templates/comparison-layout@1.0.0',
      },
    ]);
  });

  it('requires a registry token for premium search', async () => {
    await expect(searchRegistry({ tier: 'premium', query: 'business' })).rejects.toThrow(
      'registry token is required',
    );
  });

  it('searches the configured premium registry with bearer auth', async () => {
    setupCc({ registryToken: 'secret-token', premiumRegistryBaseUrl: 'https://registry.example.test/api' });
    const fetchMock = vi.fn(async () =>
      responseJson({
        results: [
          {
            kind: 'theme',
            id: 'business-school-pack',
            version: '2.1.0',
            name: 'Business School Pack',
            description: 'Premium business theme',
            tags: ['business'],
            tier: 'premium',
          },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await searchRegistry({ tier: 'premium', kind: 'theme', query: 'business' });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://registry.example.test/api/search?query=business&kind=theme',
      { headers: { Authorization: 'Bearer secret-token' } },
    );
    expect(result.results[0]).toMatchObject({
      id: 'business-school-pack',
      installUrl: 'ryfter://themes/business-school-pack@2.1.0',
    });
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
