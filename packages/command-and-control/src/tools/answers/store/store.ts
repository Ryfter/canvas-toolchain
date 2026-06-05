// packages/command-and-control/src/tools/answers/store/store.ts

import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { answersIndexRoot, chunkBodiesDir, chunksDbPath, vectorsDbPath } from '../paths.js';
import { FTS_TABLE_DDL, META_TABLE_DDL, vecTableDdl } from './schema.js';
import type { Chunk } from '../types.js';

export interface InsertChunkInput extends Omit<Chunk, 'id'> {
  embedding: Float32Array;
  /** The absolute source file path the chunk came from. Recorded in chunk_meta
   *  so we can later prune all chunks for a file when it changes. */
  sourceFile: string;
  sourceMtime: number;
}

export class AnswersStore {
  private chunksDb: Database.Database;
  private vecDb: Database.Database;

  constructor(private courseDir: string, dimension: number) {
    mkdirSync(answersIndexRoot(courseDir), { recursive: true });
    mkdirSync(chunkBodiesDir(courseDir), { recursive: true });
    this.chunksDb = new Database(chunksDbPath(courseDir));
    this.chunksDb.exec(FTS_TABLE_DDL);
    this.chunksDb.exec(META_TABLE_DDL);
    this.vecDb = new Database(vectorsDbPath(courseDir));
    sqliteVec.load(this.vecDb);
    this.vecDb.exec(vecTableDdl(dimension));
  }

  close(): void {
    this.chunksDb.close();
    this.vecDb.close();
  }

  insertChunks(chunks: InsertChunkInput[]): number[] {
    const ids: number[] = [];
    const insertChunkStmt = this.chunksDb.prepare(
      `INSERT INTO chunks(content, source, source_path, source_ref, deep_link) VALUES (?,?,?,?,?)`,
    );
    const insertMetaStmt = this.chunksDb.prepare(
      `INSERT INTO chunk_meta(chunk_id, source_file, source_mtime) VALUES (?,?,?)`,
    );
    const insertVecStmt = this.vecDb.prepare(
      `INSERT INTO vec(chunk_id, embedding) VALUES (?,?)`,
    );

    const tx = this.chunksDb.transaction((batch: InsertChunkInput[]) => {
      for (const c of batch) {
        const info = insertChunkStmt.run(c.content, c.source, c.sourcePath, c.sourceRef, c.deepLink ?? null);
        const id = Number(info.lastInsertRowid);
        insertMetaStmt.run(id, c.sourceFile, c.sourceMtime);
        // sqlite-vec's vec0 virtual table requires BigInt bindings for INTEGER PRIMARY KEY
        // columns on insert (better-sqlite3 binds JS numbers as float by default, which vec0 rejects).
        insertVecStmt.run(BigInt(id), Buffer.from(c.embedding.buffer));
        writeFileSync(join(chunkBodiesDir(this.courseDir), `${id}.md`), c.content, 'utf-8');
        ids.push(id);
      }
    });
    tx(chunks);
    return ids;
  }

  /** Remove all chunks (FTS + vec + on-disk markdown) for a given absolute source file path.
   *  Returns the count of rows removed. */
  removeBySourceFile(absSourceFile: string): number {
    const rows = this.chunksDb.prepare(`SELECT chunk_id FROM chunk_meta WHERE source_file = ?`).all(absSourceFile) as Array<{ chunk_id: number }>;
    if (rows.length === 0) return 0;
    const ids = rows.map(r => r.chunk_id);
    const placeholders = ids.map(() => '?').join(',');
    this.chunksDb.prepare(`DELETE FROM chunks WHERE ROWID IN (${placeholders})`).run(...ids);
    this.chunksDb.prepare(`DELETE FROM chunk_meta WHERE chunk_id IN (${placeholders})`).run(...ids);
    this.vecDb.prepare(`DELETE FROM vec WHERE chunk_id IN (${placeholders})`).run(...ids);
    for (const id of ids) {
      try { rmSync(join(chunkBodiesDir(this.courseDir), `${id}.md`), { force: true }); } catch { /* ignore */ }
    }
    return ids.length;
  }

  /** Read a chunk's full record by id. */
  getChunk(id: number): Chunk | null {
    const row = this.chunksDb.prepare(
      `SELECT ROWID as id, content, source, source_path, source_ref, deep_link FROM chunks WHERE ROWID = ?`,
    ).get(id) as { id: number; content: string; source: string; source_path: string; source_ref: string; deep_link: string | null } | undefined;
    if (!row) return null;
    return {
      id: row.id, content: row.content,
      source: row.source as Chunk['source'],
      sourcePath: row.source_path, sourceRef: row.source_ref,
      deepLink: row.deep_link,
    };
  }

  /** FTS5 BM25 search. Returns top-K chunk ids + scores. */
  searchKeyword(query: string, k: number): Array<{ id: number; score: number }> {
    const rows = this.chunksDb.prepare(
      `SELECT ROWID as id, bm25(chunks) as score FROM chunks WHERE chunks MATCH ? ORDER BY score LIMIT ?`,
    ).all(query, k) as Array<{ id: number; score: number }>;
    return rows;
  }

  /** Cosine-similarity vector search. Returns top-K chunk ids + distances. */
  searchVector(vector: Float32Array, k: number): Array<{ id: number; score: number }> {
    const buf = Buffer.from(vector.buffer);
    const rows = this.vecDb.prepare(
      `SELECT chunk_id as id, distance as score FROM vec WHERE embedding MATCH ? ORDER BY distance LIMIT ?`,
    ).all(buf, k) as Array<{ id: number; score: number }>;
    return rows;
  }
}

export function destroyIndex(courseDir: string): void {
  const root = answersIndexRoot(courseDir);
  if (existsSync(root)) rmSync(root, { recursive: true, force: true });
}
