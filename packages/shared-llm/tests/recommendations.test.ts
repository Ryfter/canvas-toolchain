import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync, statSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fetchRecommendedModels } from '../src/recommendations.js';

let tmpDir: string;
let cachePath: string;
let fallbackPath: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'rec-models-'));
  cachePath = join(tmpDir, 'cache.md');
  fallbackPath = join(tmpDir, 'fallback.md');
  writeFileSync(fallbackPath, '# Fallback content');
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('fetchRecommendedModels', () => {
  it('returns network content and writes cache on successful fetch', async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response('# Network content', { status: 200 }),
    );

    const result = await fetchRecommendedModels({
      url: 'http://example.test/models.md',
      cachePath,
      fallbackPath,
      ttlMs: 24 * 60 * 60 * 1000,
    });

    expect(result).toBe('# Network content');
    expect(readFileSync(cachePath, 'utf-8')).toBe('# Network content');
  });

  it('returns fresh cache without hitting network when cache is within TTL', async () => {
    writeFileSync(cachePath, '# Cached content');
    const result = await fetchRecommendedModels({
      url: 'http://example.test/models.md',
      cachePath,
      fallbackPath,
      ttlMs: 24 * 60 * 60 * 1000,
    });

    expect(result).toBe('# Cached content');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('re-fetches when cache exists but is older than TTL', async () => {
    writeFileSync(cachePath, '# Stale cache');
    const oldTime = new Date(Date.now() - 48 * 60 * 60 * 1000);
    utimesSync(cachePath, oldTime, oldTime);
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response('# Fresh content', { status: 200 }),
    );

    const result = await fetchRecommendedModels({
      url: 'http://example.test/models.md',
      cachePath,
      fallbackPath,
      ttlMs: 24 * 60 * 60 * 1000,
    });

    expect(result).toBe('# Fresh content');
  });

  it('returns stale cache when network fails and cache exists', async () => {
    writeFileSync(cachePath, '# Stale cache');
    const oldTime = new Date(Date.now() - 48 * 60 * 60 * 1000);
    utimesSync(cachePath, oldTime, oldTime);
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new TypeError('fetch failed'));

    const result = await fetchRecommendedModels({
      url: 'http://example.test/models.md',
      cachePath,
      fallbackPath,
      ttlMs: 24 * 60 * 60 * 1000,
    });

    expect(result).toBe('# Stale cache');
  });

  it('returns fallback when both network and cache absent', async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new TypeError('fetch failed'));

    const result = await fetchRecommendedModels({
      url: 'http://example.test/models.md',
      cachePath,
      fallbackPath,
      ttlMs: 24 * 60 * 60 * 1000,
    });

    expect(result).toBe('# Fallback content');
  });

  it('returns fallback when fetch returns non-OK and no cache', async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(new Response('not found', { status: 404 }));

    const result = await fetchRecommendedModels({
      url: 'http://example.test/models.md',
      cachePath,
      fallbackPath,
      ttlMs: 24 * 60 * 60 * 1000,
    });

    expect(result).toBe('# Fallback content');
  });

  it('creates cache directory if it does not exist', async () => {
    const nestedCachePath = join(tmpDir, 'nested', 'deep', 'cache.md');
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response('# Network', { status: 200 }),
    );

    await fetchRecommendedModels({
      url: 'http://example.test/models.md',
      cachePath: nestedCachePath,
      fallbackPath,
      ttlMs: 24 * 60 * 60 * 1000,
    });

    expect(existsSync(nestedCachePath)).toBe(true);
  });
});
