// packages/command-and-control/src/tools/answers/retrieval/hybrid.ts

import { AnswersStore } from '../store/store.js';
import type { EmbeddingProvider } from '../provider/types.js';
import { EmbeddingProviderUnavailableError } from '../provider/types.js';
import type { Chunk } from '../types.js';

export interface HybridRetrievalInput {
  question: string;
  k: number;
  store: AnswersStore;
  provider: EmbeddingProvider | null;  // null forces keyword-only
  canonicalBoost?: number;             // default 0.3
  rrfK?: number;                       // default 60
}

export interface HybridRetrievalResult {
  chunks: Array<{ chunk: Chunk; score: number }>;
  mode: 'hybrid' | 'keyword-only';
  warnings: string[];
}

export async function hybridRetrieve(input: HybridRetrievalInput): Promise<HybridRetrievalResult> {
  const k = input.k;
  const rrfK = input.rrfK ?? 60;
  const boost = input.canonicalBoost ?? 0.3;
  const warnings: string[] = [];

  const fts = input.store.searchKeyword(escapeFts(input.question), k * 2);
  let vec: Array<{ id: number; score: number }> = [];
  let mode: 'hybrid' | 'keyword-only' = 'keyword-only';
  if (input.provider) {
    try {
      const [qVec] = await input.provider.embed([input.question]);
      vec = input.store.searchVector(qVec!, k * 2);
      mode = 'hybrid';
    } catch (e) {
      if (e instanceof EmbeddingProviderUnavailableError) {
        warnings.push(`Embedding provider unavailable; degraded to keyword-only. (${e.message})`);
      } else {
        warnings.push(`Vector search failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  const ranks = new Map<number, { ftsRank: number | null; vecRank: number | null }>();
  fts.forEach((h, i) => {
    ranks.set(h.id, { ftsRank: i + 1, vecRank: null });
  });
  vec.forEach((h, i) => {
    const e = ranks.get(h.id);
    if (e) e.vecRank = i + 1;
    else ranks.set(h.id, { ftsRank: null, vecRank: i + 1 });
  });

  const scored: Array<{ id: number; score: number }> = [];
  for (const [id, r] of ranks) {
    let s = 0;
    if (r.ftsRank !== null) s += 1 / (rrfK + r.ftsRank);
    if (r.vecRank !== null) s += 1 / (rrfK + r.vecRank);
    scored.push({ id, score: s });
  }

  // Canonical boost applied AFTER RRF so it's an additive bump independent
  // of dual-rank presence
  const chunks = scored.map(s => ({ chunk: input.store.getChunk(s.id)!, score: s.score }))
    .filter(x => x.chunk !== null);
  for (const x of chunks) {
    if (x.chunk.source === 'canonical') x.score += boost;
  }

  chunks.sort((a, b) => b.score - a.score);
  return { chunks: chunks.slice(0, k), mode, warnings };
}

/** Escape FTS5-special characters in a free-text query so SQLite doesn't parse
 *  parens / quotes / operators. Wraps each term as a phrase. */
function escapeFts(query: string): string {
  return query
    .split(/\s+/)
    .filter(Boolean)
    .map(t => `"${t.replace(/"/g, '""')}"`)
    .join(' ');
}
