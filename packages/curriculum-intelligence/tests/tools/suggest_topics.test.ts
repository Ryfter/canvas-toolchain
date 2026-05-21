import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setupCourse } from '../../src/tools/setup_course.js';
import { suggestTopics } from '../../src/tools/suggest_topics.js';
import type { FeedItem } from '../../src/types.js';
import type { Development } from '../../src/tools/scan_recent_developments.js';

const FEED_ITEMS: FeedItem[] = [
  {
    title: 'Prompt injection attacks in LLM agents',
    url: 'https://example.com/1',
    publishedAt: new Date('2026-02-10'),
    summary: 'A new class of prompt injection attacks targeting tool-using agents.',
    sourceId: 'rss:simonwillison',
  },
  {
    title: 'Structured outputs for LLMs',
    url: 'https://example.com/2',
    publishedAt: new Date('2026-01-15'),
    summary: 'Constrained decoding makes JSON outputs reliable.',
    sourceId: 'rss:simonwillison',
  },
  {
    title: 'Prompt injection: new defenses',
    url: 'https://example.com/3',
    publishedAt: new Date('2026-03-01'),
    summary: 'Sandboxing tool outputs reduces prompt injection risk.',
    sourceId: 'rss:aiweekly',
  },
];

const DEVELOPMENTS: Development[] = [
  {
    title: 'Agent tool-poisoning attacks',
    summary: 'Tool outputs crafted to hijack LLM agents.',
    publishedApprox: '2026-01',
    relevance: 'high',
  },
  {
    title: 'Multimodal reasoning improvements',
    summary: 'Vision models now reason over charts and diagrams more reliably.',
    publishedApprox: '2025-12',
    relevance: 'medium',
  },
];

let tmpHome: string;

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'ci-home-'));
  process.env.CURRICULUM_INTELLIGENCE_HOME = tmpHome;
  setupCourse({ id: 'TEST101', title: 'Test Course' });
});

afterEach(() => {
  delete process.env.CURRICULUM_INTELLIGENCE_HOME;
  rmSync(tmpHome, { recursive: true, force: true });
});

describe('suggest_topics', () => {
  test('merges feed items and scan developments into candidates', () => {
    const result = suggestTopics({
      courseId: 'TEST101',
      feedItems: FEED_ITEMS,
      scanDevelopments: DEVELOPMENTS,
    });
    expect(result.candidates.length).toBeGreaterThan(0);
  });

  test('groups repeated topics by title similarity and boosts their score', () => {
    const result = suggestTopics({
      courseId: 'TEST101',
      feedItems: FEED_ITEMS,
      scanDevelopments: DEVELOPMENTS,
    });
    // "Prompt injection" appears in 2 feed items + 1 development → should rank near top
    const injectionCandidate = result.candidates.find((c) =>
      c.topic.toLowerCase().includes('injection')
    );
    expect(injectionCandidate).toBeDefined();
    expect(injectionCandidate!.mentionCount).toBeGreaterThanOrEqual(2);
  });

  test('records source attribution per candidate', () => {
    const result = suggestTopics({
      courseId: 'TEST101',
      feedItems: FEED_ITEMS,
      scanDevelopments: DEVELOPMENTS,
    });
    const first = result.candidates[0];
    expect(first.sources.length).toBeGreaterThan(0);
    expect(first.sources[0]).toHaveProperty('kind');
    expect(first.sources[0]).toHaveProperty('title');
  });

  test('works with feed items only', () => {
    const result = suggestTopics({
      courseId: 'TEST101',
      feedItems: FEED_ITEMS,
    });
    expect(result.candidates.length).toBeGreaterThan(0);
  });

  test('works with scan developments only', () => {
    const result = suggestTopics({
      courseId: 'TEST101',
      scanDevelopments: DEVELOPMENTS,
    });
    expect(result.candidates.length).toBe(DEVELOPMENTS.length);
  });

  test('returns empty candidates when no inputs provided and no cache', () => {
    const result = suggestTopics({ courseId: 'TEST101' });
    expect(result.candidates).toEqual([]);
  });
});
