import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setupCourse } from '../../src/tools/setup_course.js';
import { scanRecentDevelopments } from '../../src/tools/scan_recent_developments.js';
import type { LlmClient } from '../../src/llm/client.js';
import type { SearchClient, SearchResult } from '../../src/search/search_client.js';

const MOCK_RESPONSE = JSON.stringify({
  developments: [
    {
      title: 'Agent tool-poisoning attacks',
      summary: 'Researchers showed that tool outputs can be crafted to hijack LLM agents.',
      publishedApprox: '2026-01',
      relevance: 'high',
    },
    {
      title: 'Structured output reliability improvements',
      summary: 'OpenAI and Anthropic both shipped constrained decoding for JSON outputs.',
      publishedApprox: '2025-12',
      relevance: 'medium',
    },
  ],
  candidateTopics: ['Agent tool poisoning', 'Constrained decoding', 'Structured outputs'],
});

function makeMockClient(response: string): LlmClient {
  return {
    complete: async (_prompt: string) => response,
  };
}

function makeMockClientCapturingPrompt(response: string): { client: LlmClient; getLastPrompt: () => string } {
  let lastPrompt = '';
  return {
    client: { complete: async (prompt: string) => { lastPrompt = prompt; return response; } },
    getLastPrompt: () => lastPrompt,
  };
}

function makeMockSearchClient(results: SearchResult[]): SearchClient {
  return { search: async () => results };
}

function makeFailingSearchClient(): SearchClient {
  return { search: async () => { throw new Error('network error'); } };
}

const FAKE_SEARCH_RESULTS: SearchResult[] = [
  { title: 'New attack vector discovered', url: 'https://example.com/a', snippet: 'Researchers found X.', publishedDate: '2025-03' },
  { title: 'Tool poisoning demo', url: 'https://example.com/b', snippet: 'A live demo was released.', publishedDate: '2025-04' },
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

describe('scan_recent_developments', () => {
  test('returns structured developments and candidate topics', async () => {
    const result = await scanRecentDevelopments({
      courseId: 'TEST101',
      topicArea: 'Prompt engineering and LLM agents',
      since: new Date('2025-06-01'),
      llmClient: makeMockClient(MOCK_RESPONSE),
    });
    expect(result.developments.length).toBe(2);
    expect(result.candidateTopics.length).toBeGreaterThan(0);
    expect(result.developments[0].title).toBeTruthy();
    expect(result.developments[0].summary).toBeTruthy();
  });

  test('includes topicArea and since in the result', async () => {
    const since = new Date('2025-06-01');
    const result = await scanRecentDevelopments({
      courseId: 'TEST101',
      topicArea: 'Prompt engineering',
      since,
      llmClient: makeMockClient(MOCK_RESPONSE),
    });
    expect(result.topicArea).toBe('Prompt engineering');
    expect(result.since).toEqual(since);
  });

  test('handles LLM response wrapped in markdown code fences', async () => {
    const fenced = '```json\n' + MOCK_RESPONSE + '\n```';
    const result = await scanRecentDevelopments({
      courseId: 'TEST101',
      topicArea: 'Prompt engineering',
      llmClient: makeMockClient(fenced),
    });
    expect(result.developments.length).toBe(2);
  });

  test('returns empty arrays when LLM returns unparseable response', async () => {
    const result = await scanRecentDevelopments({
      courseId: 'TEST101',
      topicArea: 'Prompt engineering',
      llmClient: makeMockClient('Sorry, I cannot help with that.'),
    });
    expect(result.developments).toEqual([]);
    expect(result.candidateTopics).toEqual([]);
  });

  test('searchResultCount is 0 when no search client provided', async () => {
    const result = await scanRecentDevelopments({
      courseId: 'TEST101',
      topicArea: 'Prompt engineering',
      llmClient: makeMockClient(MOCK_RESPONSE),
    });
    expect(result.searchResultCount).toBe(0);
  });

  test('injects search snippets into prompt and reports searchResultCount', async () => {
    const { client, getLastPrompt } = makeMockClientCapturingPrompt(MOCK_RESPONSE);
    const result = await scanRecentDevelopments({
      courseId: 'TEST101',
      topicArea: 'Prompt engineering',
      llmClient: client,
      searchClient: makeMockSearchClient(FAKE_SEARCH_RESULTS),
    });
    expect(result.searchResultCount).toBe(2);
    const prompt = getLastPrompt();
    expect(prompt).toContain('New attack vector discovered');
    expect(prompt).toContain('Tool poisoning demo');
    expect(prompt).toContain('https://example.com/a');
  });

  test('falls back gracefully when search throws — still returns LLM results', async () => {
    const result = await scanRecentDevelopments({
      courseId: 'TEST101',
      topicArea: 'Prompt engineering',
      llmClient: makeMockClient(MOCK_RESPONSE),
      searchClient: makeFailingSearchClient(),
    });
    expect(result.searchResultCount).toBe(0);
    expect(result.developments.length).toBe(2);
  });

  test('offline mode prompt is unchanged (no search context prefix)', async () => {
    const { client, getLastPrompt } = makeMockClientCapturingPrompt(MOCK_RESPONSE);
    await scanRecentDevelopments({
      courseId: 'TEST101',
      topicArea: 'Prompt engineering',
      llmClient: client,
    });
    expect(getLastPrompt()).not.toContain('search results');
  });
});
