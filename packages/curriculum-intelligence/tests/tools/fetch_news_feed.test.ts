import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setupCourse } from '../../src/tools/setup_course.js';
import { fetchNewsFeed } from '../../src/tools/fetch_news_feed.js';

const SAMPLE_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Simon Willison's Blog</title>
    <link>https://simonwillison.net/</link>
    <item>
      <title>LLM tool use patterns</title>
      <link>https://simonwillison.net/2026/Jan/15/llm-tool-use/</link>
      <pubDate>Wed, 15 Jan 2026 12:00:00 GMT</pubDate>
      <description>An exploration of how LLMs can be given tools to use.</description>
    </item>
    <item>
      <title>Old article about transformers</title>
      <link>https://simonwillison.net/2023/Jan/01/transformers/</link>
      <pubDate>Sun, 01 Jan 2023 00:00:00 GMT</pubDate>
      <description>Transformers explained from scratch.</description>
    </item>
  </channel>
</rss>`;

let tmpHome: string;

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'ci-home-'));
  process.env.CURRICULUM_INTELLIGENCE_HOME = tmpHome;
  setupCourse({ id: 'TEST101', title: 'Test Course' });

  vi.stubGlobal('fetch', async (_url: string) => ({
    ok: true,
    text: async () => SAMPLE_RSS,
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.CURRICULUM_INTELLIGENCE_HOME;
  rmSync(tmpHome, { recursive: true, force: true });
});

describe('fetch_news_feed', () => {
  test('fetches and parses RSS items from supplied URLs', async () => {
    const result = await fetchNewsFeed({
      courseId: 'TEST101',
      feedUrls: ['https://simonwillison.net/atom/everything/'],
    });
    expect(result.items.length).toBeGreaterThan(0);
    const item = result.items[0];
    expect(item.title).toBeTruthy();
    expect(item.url).toBeTruthy();
    expect(item.publishedAt).toBeInstanceOf(Date);
    expect(item.summary).toBeTruthy();
  });

  test('filters out items before the since date', async () => {
    const result = await fetchNewsFeed({
      courseId: 'TEST101',
      feedUrls: ['https://simonwillison.net/atom/everything/'],
      since: new Date('2025-01-01'),
    });
    expect(result.items.length).toBe(1);
    expect(result.items[0].title).toBe('LLM tool use patterns');
  });

  test('writes news-cache.json under the course folder', async () => {
    const result = await fetchNewsFeed({
      courseId: 'TEST101',
      feedUrls: ['https://simonwillison.net/atom/everything/'],
    });
    expect(existsSync(result.cachePath)).toBe(true);
  });

  test('returns feedCount and itemCount summary', async () => {
    const result = await fetchNewsFeed({
      courseId: 'TEST101',
      feedUrls: ['https://simonwillison.net/atom/everything/'],
    });
    expect(result.feedCount).toBe(1);
    expect(result.itemCount).toBe(result.items.length);
  });

  test('reports fetch errors per feed without crashing', async () => {
    vi.stubGlobal('fetch', async (_url: string) => ({
      ok: false,
      status: 404,
      text: async () => '',
    }));
    const result = await fetchNewsFeed({
      courseId: 'TEST101',
      feedUrls: ['https://simonwillison.net/atom/everything/'],
    });
    expect(result.items.length).toBe(0);
    expect(result.errors.length).toBe(1);
  });
});
