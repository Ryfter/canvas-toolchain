export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  /** ISO date string or partial (e.g. "2025-05"). Absent when the API doesn't return a date. */
  publishedDate?: string;
}

export interface SearchOpts {
  /** Number of results to request. Default: 8. */
  count?: number;
  /** When set, bias results toward content published after this date. */
  since?: Date;
}

export interface SearchClient {
  search(query: string, opts?: SearchOpts): Promise<SearchResult[]>;
}
