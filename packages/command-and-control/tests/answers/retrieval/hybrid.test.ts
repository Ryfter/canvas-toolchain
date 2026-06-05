import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AnswersStore } from '../../../src/tools/answers/store/store.js';
import { hybridRetrieve } from '../../../src/tools/answers/retrieval/hybrid.js';
import type { EmbeddingProvider } from '../../../src/tools/answers/provider/types.js';

let courseDir: string;

beforeEach(() => { courseDir = mkdtempSync(join(tmpdir(), 'course-')); });
afterEach(() => { rmSync(courseDir, { recursive: true, force: true }); });

function v(d: number, ...vals: number[]): Float32Array {
  const a = new Array(d).fill(0);
  vals.forEach((x, i) => { a[i] = x; });
  return new Float32Array(a);
}

class StaticProvider implements EmbeddingProvider {
  readonly info = { kind: 'ollama' as const, model: 'f', dimension: 4 };
  constructor(private vec: Float32Array) {}
  async embed() { return [this.vec]; }
}

describe('hybridRetrieve', () => {
  it('boosts canonical chunks over equally-scored transcripts', async () => {
    const store = new AnswersStore(courseDir, 4);
    store.insertChunks([
      { content: 'how is grading done? weighted average', source: 'canonical',
        sourcePath: 'a.md', sourceRef: '## grading', deepLink: null,
        embedding: v(4, 1, 0, 0, 0), sourceFile: '/a', sourceMtime: 1 },
      { content: 'grading was discussed in week 4 at length',
        source: 'transcript', sourcePath: 't.md', sourceRef: '0:00', deepLink: null,
        embedding: v(4, 1, 0, 0, 0), sourceFile: '/t', sourceMtime: 1 },
    ]);
    const result = await hybridRetrieve({
      question: 'grading', k: 5, store, provider: new StaticProvider(v(4, 1, 0, 0, 0)),
    });
    expect(result.chunks[0]!.chunk.source).toBe('canonical');
    store.close();
  });

  it('degrades to keyword-only when provider is null', async () => {
    const store = new AnswersStore(courseDir, 4);
    store.insertChunks([{
      content: 'VLOOKUP for vertical lookups', source: 'transcript',
      sourcePath: 'a.md', sourceRef: '0:00', deepLink: null,
      embedding: v(4, 1, 0, 0, 0), sourceFile: '/a', sourceMtime: 1,
    }]);
    const result = await hybridRetrieve({ question: 'VLOOKUP', k: 5, store, provider: null });
    expect(result.mode).toBe('keyword-only');
    expect(result.chunks.length).toBe(1);
    store.close();
  });

  it('escapes FTS5-special characters in the query', async () => {
    const store = new AnswersStore(courseDir, 4);
    store.insertChunks([{
      content: 'parens and quotes are dangerous',
      source: 'cds', sourcePath: 'x.md', sourceRef: '#', deepLink: null,
      embedding: v(4, 1, 0, 0, 0), sourceFile: '/x', sourceMtime: 1,
    }]);
    // raw paren would normally crash FTS5
    const result = await hybridRetrieve({
      question: 'parens (and) "quotes"', k: 5, store, provider: null,
    });
    expect(result.chunks.length).toBeGreaterThan(0);
    store.close();
  });
});
