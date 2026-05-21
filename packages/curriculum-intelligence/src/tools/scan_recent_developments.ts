import type { LlmClient } from '../llm/client.js';
import { AnthropicAdapter } from '../llm/anthropic_adapter.js';
import type { SearchClient, SearchResult } from '../search/search_client.js';
import type { CourseId } from '../types.js';

export interface Development {
  title: string;
  summary: string;
  publishedApprox: string;
  relevance: 'high' | 'medium' | 'low';
}

export interface ScanRecentDevelopmentsInput {
  courseId: CourseId;
  topicArea: string;
  since?: Date;
  llmClient?: LlmClient;
  /** When provided, fetches live search snippets and injects them into the LLM prompt. */
  searchClient?: SearchClient;
}

export interface ScanRecentDevelopmentsResult {
  courseId: CourseId;
  topicArea: string;
  since: Date | undefined;
  developments: Development[];
  candidateTopics: string[];
  /** Number of live search snippets injected into the prompt. 0 means offline/no-search mode. */
  searchResultCount: number;
}

function formatSnippets(snippets: SearchResult[]): string {
  return snippets
    .map((s, i) => {
      const date = s.publishedDate ? ` (${s.publishedDate})` : '';
      return `${i + 1}. [${s.title}]${date}\n   ${s.snippet}\n   ${s.url}`;
    })
    .join('\n\n');
}

function buildPrompt(topicArea: string, since?: Date, snippets?: SearchResult[]): string {
  const sinceClause = since
    ? `since ${since.toISOString().slice(0, 10)}`
    : 'in the last 12 months';

  const searchContext =
    snippets && snippets.length > 0
      ? `Here are recent search results about **${topicArea}**:\n\n${formatSnippets(snippets)}\n\nBased on these results and your own knowledge, `
      : '';

  return (
    `You are a curriculum researcher helping a professor update their course.\n\n` +
    (searchContext || ``) +
    `${searchContext ? 'i' : 'I'}dentify the most important developments in the topic area: **${topicArea}**\n` +
    `Focus on developments ${sinceClause}.\n\n` +
    `Return a JSON object with this exact shape — no extra commentary, just the JSON:\n` +
    `{\n` +
    `  "developments": [\n` +
    `    {\n` +
    `      "title": "Short title for the development",\n` +
    `      "summary": "1-2 sentence summary",\n` +
    `      "publishedApprox": "YYYY-MM or YYYY",\n` +
    `      "relevance": "high" | "medium" | "low"\n` +
    `    }\n` +
    `  ],\n` +
    `  "candidateTopics": ["Topic name 1", "Topic name 2"]\n` +
    `}\n\n` +
    `List up to 8 developments. candidateTopics should be 3-6 concise course-topic phrases.`
  );
}

function parseResponse(raw: string): { developments: Development[]; candidateTopics: string[] } {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();

  try {
    const parsed = JSON.parse(cleaned) as {
      developments?: unknown[];
      candidateTopics?: unknown[];
    };
    const developments = (parsed.developments ?? []).filter(
      (d): d is Development =>
        typeof d === 'object' && d !== null && 'title' in d && 'summary' in d
    );
    const candidateTopics = (parsed.candidateTopics ?? []).filter(
      (t): t is string => typeof t === 'string'
    );
    return { developments, candidateTopics };
  } catch {
    return { developments: [], candidateTopics: [] };
  }
}

export async function scanRecentDevelopments(
  input: ScanRecentDevelopmentsInput
): Promise<ScanRecentDevelopmentsResult> {
  const client = input.llmClient ?? new AnthropicAdapter();

  // Fetch live search snippets if a search client is provided. Failures are non-fatal.
  let snippets: SearchResult[] = [];
  if (input.searchClient) {
    try {
      snippets = await input.searchClient.search(
        `${input.topicArea} recent developments news`,
        { count: 8, since: input.since }
      );
    } catch (err) {
      process.stderr.write(
        `[scan_recent_developments] search failed, continuing offline: ${err instanceof Error ? err.message : String(err)}\n`
      );
    }
  }

  const prompt = buildPrompt(input.topicArea, input.since, snippets);
  const raw = await client.complete(prompt, { maxTokens: 2048 });
  const { developments, candidateTopics } = parseResponse(raw);

  return {
    courseId: input.courseId,
    topicArea: input.topicArea,
    since: input.since,
    developments,
    candidateTopics,
    searchResultCount: snippets.length,
  };
}
