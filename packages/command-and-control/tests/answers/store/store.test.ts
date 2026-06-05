import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AnswersStore, destroyIndex } from '../../../src/tools/answers/store/store.js';
import { chunkBodiesDir } from '../../../src/tools/answers/paths.js';

let courseDir: string;

beforeEach(() => {
  courseDir = mkdtempSync(join(tmpdir(), 'course-'));
});

afterEach(() => {
  rmSync(courseDir, { recursive: true, force: true });
});

function vec(d: number, fill: number): Float32Array {
  return new Float32Array(new Array(d).fill(fill));
}

describe('AnswersStore', () => {
  it('inserts chunks across FTS + vec + chunks/ dir; readable by id', () => {
    const store = new AnswersStore(courseDir, 4);
    const ids = store.insertChunks([
      { content: 'hello world', source: 'transcript', sourcePath: 'lecture.md',
        sourceRef: '00:00:12', deepLink: 'https://x/y?t=12',
        embedding: vec(4, 0.1), sourceFile: '/abs/path/lecture.md', sourceMtime: 1000 },
    ]);
    expect(ids).toHaveLength(1);
    const got = store.getChunk(ids[0]!);
    expect(got?.content).toBe('hello world');
    expect(got?.deepLink).toBe('https://x/y?t=12');
    expect(existsSync(join(chunkBodiesDir(courseDir), `${ids[0]}.md`))).toBe(true);
    store.close();
  });

  it('removeBySourceFile drops FTS + vec + meta + on-disk markdown', () => {
    const store = new AnswersStore(courseDir, 4);
    const ids = store.insertChunks([
      { content: 'a', source: 'cds', sourcePath: 'p1.md', sourceRef: '#h', deepLink: null,
        embedding: vec(4, 0.1), sourceFile: '/abs/p1.md', sourceMtime: 1 },
      { content: 'b', source: 'cds', sourcePath: 'p2.md', sourceRef: '#h', deepLink: null,
        embedding: vec(4, 0.2), sourceFile: '/abs/p2.md', sourceMtime: 1 },
    ]);
    const removed = store.removeBySourceFile('/abs/p1.md');
    expect(removed).toBe(1);
    expect(store.getChunk(ids[0]!)).toBeNull();
    expect(store.getChunk(ids[1]!)).not.toBeNull();
    expect(existsSync(join(chunkBodiesDir(courseDir), `${ids[0]}.md`))).toBe(false);
    expect(existsSync(join(chunkBodiesDir(courseDir), `${ids[1]}.md`))).toBe(true);
    store.close();
  });

  it('FTS5 keyword search returns matches ranked by bm25', () => {
    const store = new AnswersStore(courseDir, 4);
    store.insertChunks([
      { content: 'VLOOKUP is for vertical lookups', source: 'transcript', sourcePath: 'a.md', sourceRef: '00:01', deepLink: null,
        embedding: vec(4, 0.1), sourceFile: '/a', sourceMtime: 1 },
      { content: 'photosynthesis happens in plants', source: 'transcript', sourcePath: 'b.md', sourceRef: '00:01', deepLink: null,
        embedding: vec(4, 0.2), sourceFile: '/b', sourceMtime: 1 },
    ]);
    const hits = store.searchKeyword('VLOOKUP', 5);
    expect(hits.length).toBeGreaterThan(0);
    const first = store.getChunk(hits[0]!.id);
    expect(first?.content).toMatch(/VLOOKUP/);
    store.close();
  });

  it('vector search returns nearest by cosine distance', () => {
    const store = new AnswersStore(courseDir, 4);
    store.insertChunks([
      { content: 'A', source: 'cds', sourcePath: 'a.md', sourceRef: '#', deepLink: null,
        embedding: new Float32Array([1, 0, 0, 0]), sourceFile: '/a', sourceMtime: 1 },
      { content: 'B', source: 'cds', sourcePath: 'b.md', sourceRef: '#', deepLink: null,
        embedding: new Float32Array([0, 1, 0, 0]), sourceFile: '/b', sourceMtime: 1 },
    ]);
    const hits = store.searchVector(new Float32Array([0.99, 0.01, 0, 0]), 2);
    expect(hits.length).toBe(2);
    expect(store.getChunk(hits[0]!.id)?.content).toBe('A');
    store.close();
  });

  it('destroyIndex wipes the answers-index dir', () => {
    const store = new AnswersStore(courseDir, 4);
    store.insertChunks([{
      content: 'x', source: 'cds', sourcePath: 'a.md', sourceRef: '#', deepLink: null,
      embedding: vec(4, 0.1), sourceFile: '/a', sourceMtime: 1,
    }]);
    store.close();
    destroyIndex(courseDir);
    expect(existsSync(join(courseDir, '.canvas-toolchain', 'answers-index'))).toBe(false);
  });
});
