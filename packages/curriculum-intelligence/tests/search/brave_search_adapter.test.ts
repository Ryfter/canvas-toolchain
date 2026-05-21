import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { BraveSearchAdapter } from '../../src/search/brave_search_adapter.js';

const FAKE_RESPONSE = {
  web: {
    results: [
      {
        title: 'Agent prompt injection in the wild',
        url: 'https://example.com/article1',
        description: 'Researchers demonstrated indirect injection via tool outputs.',
        age: 'May 10, 2025',
      },
      {
        title: 'Structured outputs land in major APIs',
        url: 'https://example.com/article2',
        description: 'JSON-mode constrained decoding ships in Anthropic and OpenAI.',
        age: 'April 2025',
      },
    ],
  },
};

function mockFetch(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch(FAKE_RESPONSE));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('BraveSearchAdapter', () => {
  test('maps API response to SearchResult[]', async () => {
    const adapter = new BraveSearchAdapter('test-key');
    const results = await adapter.search('LLM agents 2025');

    expect(results).toHaveLength(2);
    expect(results[0].title).toBe('Agent prompt injection in the wild');
    expect(results[0].url).toBe('https://example.com/article1');
    expect(results[0].snippet).toBe('Researchers demonstrated indirect injection via tool outputs.');
    expect(results[0].publishedDate).toBe('May 10, 2025');
    expect(results[1].title).toBe('Structured outputs land in major APIs');
  });

  test('returns [] when web.results is absent', async () => {
    vi.stubGlobal('fetch', mockFetch({ web: {} }));
    const adapter = new BraveSearchAdapter('test-key');
    const results = await adapter.search('anything');
    expect(results).toEqual([]);
  });

  test('returns [] when response has no web property', async () => {
    vi.stubGlobal('fetch', mockFetch({}));
    const adapter = new BraveSearchAdapter('test-key');
    const results = await adapter.search('anything');
    expect(results).toEqual([]);
  });

  test('passes X-Subscription-Token header', async () => {
    const fetchMock = mockFetch(FAKE_RESPONSE);
    vi.stubGlobal('fetch', fetchMock);

    const adapter = new BraveSearchAdapter('my-api-key');
    await adapter.search('test query');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['X-Subscription-Token']).toBe('my-api-key');
  });

  test('includes count param in query string', async () => {
    const fetchMock = mockFetch(FAKE_RESPONSE);
    vi.stubGlobal('fetch', fetchMock);

    const adapter = new BraveSearchAdapter('key');
    await adapter.search('test', { count: 5 });

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('count=5');
  });

  test('omits freshness param when since is undefined', async () => {
    const fetchMock = mockFetch(FAKE_RESPONSE);
    vi.stubGlobal('fetch', fetchMock);

    const adapter = new BraveSearchAdapter('key');
    await adapter.search('test');

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).not.toContain('freshness');
  });

  test('sends freshness=pm when since is 15 days ago', async () => {
    const fetchMock = mockFetch(FAKE_RESPONSE);
    vi.stubGlobal('fetch', fetchMock);

    const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
    const adapter = new BraveSearchAdapter('key');
    await adapter.search('test', { since: fifteenDaysAgo });

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('freshness=pm');
  });

  test('sends freshness=py when since is 200 days ago', async () => {
    const fetchMock = mockFetch(FAKE_RESPONSE);
    vi.stubGlobal('fetch', fetchMock);

    const twoHundredDaysAgo = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000);
    const adapter = new BraveSearchAdapter('key');
    await adapter.search('test', { since: twoHundredDaysAgo });

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('freshness=py');
  });

  test('sends freshness=pw when since is 3 days ago', async () => {
    const fetchMock = mockFetch(FAKE_RESPONSE);
    vi.stubGlobal('fetch', fetchMock);

    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const adapter = new BraveSearchAdapter('key');
    await adapter.search('test', { since: threeDaysAgo });

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('freshness=pw');
  });

  test('omits freshness when since is more than a year ago', async () => {
    const fetchMock = mockFetch(FAKE_RESPONSE);
    vi.stubGlobal('fetch', fetchMock);

    const twoYearsAgo = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000);
    const adapter = new BraveSearchAdapter('key');
    await adapter.search('test', { since: twoYearsAgo });

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).not.toContain('freshness');
  });

  test('throws when fetch returns non-OK status', async () => {
    vi.stubGlobal('fetch', mockFetch({ message: 'Unauthorized' }, 401));
    const adapter = new BraveSearchAdapter('bad-key');
    await expect(adapter.search('test')).rejects.toThrow('401');
  });
});
