export interface LlmOpts {
  model?: string;
  maxTokens?: number;
  /**
   * Caller hint that live search context was requested.
   * search_recent_developments injects snippets via SearchClient before the LLM call;
   * LlmClient adapters do not act on this field and may ignore it.
   */
  webSearch?: boolean;
}

export interface LlmClient {
  complete(prompt: string, opts?: LlmOpts): Promise<string>;
}
