// packages/command-and-control/src/tools/answers/store/schema.ts

export const FTS_TABLE_DDL = `
CREATE VIRTUAL TABLE IF NOT EXISTS chunks USING fts5(
  content,
  source UNINDEXED,
  source_path UNINDEXED,
  source_ref UNINDEXED,
  deep_link UNINDEXED
);
`;

export const META_TABLE_DDL = `
CREATE TABLE IF NOT EXISTS chunk_meta (
  chunk_id INTEGER PRIMARY KEY,
  source_file TEXT NOT NULL,
  source_mtime INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chunk_meta_source_file ON chunk_meta(source_file);
`;

export function vecTableDdl(dimension: number): string {
  return `
CREATE VIRTUAL TABLE IF NOT EXISTS vec USING vec0(
  chunk_id INTEGER PRIMARY KEY,
  embedding FLOAT[${dimension}]
);
`;
}
