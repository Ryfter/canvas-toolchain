import type { SearchClient, SearchOpts, SearchResult } from './search_client.js';

const BRAVE_SEARCH_API = 'https://api.search.brave.com/res/v1/web/search';
const DEFAULT_COUNT = 8;

/** Maps a `since` date to Brave Search's `freshness` bucket, or undefined if too old. */
function freshnessBucket(since: Date): string | undefined {
  const ageMs = Date.now() - since.getTime();
  const days = ageMs / (1000 * 60 * 60 * 24);
  if (days <= 7) return 'pw';
  if (days <= 31) return 'pm';
  if (days <= 365) return 'py';
  return undefined; // older than a year — Brave has no useful bucket
}

interface BraveWebResult {
  title?: string;
  url?: string;
  description?: string;
  age?: string;
}

interface BraveApiResponse {
  web?: {
    results?: BraveWebResult[];
  };
}

/**
 * Fetches web search results from the Brave Search API.
 *
 * Requires a Brave Search API key (free tier: 2000 queries/month).
 * See https://brave.com/search/api/
 */
export class BraveSearchAdapter implements SearchClient {
  constructor(private readonly apiKey: string) {}

  async search(query: string, opts: SearchOpts = {}): Promise<SearchResult[]> {
    const count = opts.count ?? DEFAULT_COUNT;
    const params = new URLSearchParams({ q: query, count: String(count) });

    if (opts.since) {
      const bucket = freshnessBucket(opts.since);
      if (bucket) params.set('freshness', bucket);
    }

    const url = `${BRAVE_SEARCH_API}?${params.toString()}`;
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': this.apiKey,
      },
    });

    if (!response.ok) {
      throw new Error(`Brave Search API returned ${response.status} for query: ${query}`);
    }

    const data = (await response.json()) as BraveApiResponse;
    const results = data.web?.results ?? [];

    return results.map((r) => ({
      title: r.title ?? '',
      url: r.url ?? '',
      snippet: r.description ?? '',
      ...(r.age ? { publishedDate: r.age } : {}),
    }));
  }
}
