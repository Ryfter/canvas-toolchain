// packages/command-and-control/src/tools/answers/types.ts

export type EmbeddingProviderKind = 'ollama' | 'transformers-js' | 'voyage';

export interface EmbeddingProviderInfo {
  kind: EmbeddingProviderKind;
  model: string;          // 'nomic-embed-text' for ollama, 'BGE-small-en-v1.5' for transformers-js, etc.
  dimension: number;      // 768 | 384 | 1024 | ...
}

export type ChunkSource = 'transcript' | 'cds' | 'slide' | 'canonical';

export interface Chunk {
  id?: number;            // assigned at insert time
  content: string;
  source: ChunkSource;
  sourcePath: string;     // path relative to courseDir or to a transcript source root
  sourceRef: string;      // "00:14:32" | "week-03/overview.md#assignments" | "slides/week-03.pdf p.7" | "## How is …"
  deepLink: string | null;
}

export interface IndexMeta {
  courseId: number;
  provider: EmbeddingProviderInfo;
  lastIndexedAt: string;
  transcriptSources: string[];
  sourceFiles: Record<string, { mtime: number; chunkCount: number }>;
}

export interface LectureAnswersConfig {
  provider: EmbeddingProviderKind;
  model?: string;
  voyageApiKey?: string;      // only present if provider === 'voyage'
  ollamaBaseUrl?: string;     // default 'http://localhost:11434'
}
