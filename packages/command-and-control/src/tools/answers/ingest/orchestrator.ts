import { readFileSync, statSync } from 'node:fs';
import { relative } from 'node:path';
import { AnswersStore, destroyIndex } from '../store/store.js';
import { readIndexMeta, writeIndexMeta } from '../store/index_meta.js';
import { discoverSources } from './discover.js';
import { chunkTranscript } from '../chunking/transcript.js';
import { chunkMarkdown } from '../chunking/markdown.js';
import { chunkCanonical } from '../chunking/canonical.js';
import { chunkSlidePdf } from '../chunking/slide_pdf.js';
import type { EmbeddingProvider } from '../provider/types.js';
import type { Chunk, IndexMeta } from '../types.js';

export interface IngestInput {
  courseId: number;
  courseDir: string;
  transcriptSources: string[];
  provider: EmbeddingProvider;
  rebuild: boolean;
}

export interface IngestResult {
  filesScanned: number;
  filesIndexed: number;
  chunksTotal: number;
  chunksAdded: number;
  chunksRemoved: number;
  warnings: string[];
}

interface PendingChunk extends Omit<Chunk, 'id'> {
  sourceFile: string;
  sourceMtime: number;
}

export async function ingestCourse(input: IngestInput): Promise<IngestResult> {
  const { courseId, courseDir, transcriptSources, provider, rebuild } = input;
  const warnings: string[] = [];

  if (rebuild) destroyIndex(courseDir);

  const existingMeta = rebuild ? null : readIndexMeta(courseDir);
  if (existingMeta && existingMeta.provider.dimension !== provider.info.dimension) {
    warnings.push(`Index built with dimension ${existingMeta.provider.dimension}; current provider is ${provider.info.dimension}. Forcing rebuild.`);
    destroyIndex(courseDir);
  }

  const store = new AnswersStore(courseDir, provider.info.dimension);
  try {
    const sources = discoverSources(courseDir, transcriptSources);
    const allFiles = [...sources.transcripts, ...sources.cdsMarkdown, ...sources.slidePdfs];
    if (sources.canonical) allFiles.push(sources.canonical);
    const meta: IndexMeta = existingMeta && existingMeta.provider.dimension === provider.info.dimension
      ? existingMeta
      : { courseId, provider: provider.info, lastIndexedAt: new Date(0).toISOString(),
          transcriptSources, sourceFiles: {} };

    let filesIndexed = 0;
    let chunksAdded = 0;
    let chunksRemoved = 0;

    for (const knownFile of Object.keys(meta.sourceFiles)) {
      if (!allFiles.includes(knownFile)) {
        chunksRemoved += store.removeBySourceFile(knownFile);
        delete meta.sourceFiles[knownFile];
      }
    }

    for (const file of allFiles) {
      let mtime: number;
      try { mtime = statSync(file).mtimeMs; }
      catch (e) { warnings.push(`Skipping ${file}: ${e instanceof Error ? e.message : String(e)}`); continue; }
      const prior = meta.sourceFiles[file];
      if (prior && prior.mtime === mtime) continue;

      if (prior) chunksRemoved += store.removeBySourceFile(file);

      let pending: PendingChunk[];
      try {
        if (sources.transcripts.includes(file)) {
          pending = await ingestTranscript(file, mtime, courseDir);
        } else if (sources.cdsMarkdown.includes(file)) {
          pending = ingestCdsMarkdown(file, mtime, courseDir);
        } else if (sources.slidePdfs.includes(file)) {
          pending = await ingestSlidePdf(file, mtime, courseDir);
        } else if (sources.canonical === file) {
          pending = ingestCanonical(file, mtime, courseDir);
        } else continue;
      } catch (e) {
        warnings.push(`Failed to chunk ${file}: ${e instanceof Error ? e.message : String(e)}`);
        continue;
      }

      if (pending.length === 0) { meta.sourceFiles[file] = { mtime, chunkCount: 0 }; continue; }

      let embeddings: Float32Array[];
      try { embeddings = await provider.embed(pending.map(p => p.content)); }
      catch (e) {
        warnings.push(`Embedding failed for ${file}: ${e instanceof Error ? e.message : String(e)}`);
        continue;
      }

      const toInsert = pending.map((p, i) => ({ ...p, embedding: embeddings[i]! }));
      store.insertChunks(toInsert);
      chunksAdded += toInsert.length;
      filesIndexed++;
      meta.sourceFiles[file] = { mtime, chunkCount: pending.length };
    }

    meta.lastIndexedAt = new Date().toISOString();
    meta.transcriptSources = transcriptSources;
    writeIndexMeta(courseDir, meta);

    const chunksTotal = Object.values(meta.sourceFiles).reduce((s, x) => s + x.chunkCount, 0);
    return { filesScanned: allFiles.length, filesIndexed, chunksTotal, chunksAdded, chunksRemoved, warnings };
  } finally {
    store.close();
  }
}

async function ingestTranscript(file: string, mtime: number, courseDir: string): Promise<PendingChunk[]> {
  const raw = readFileSync(file, 'utf-8');
  const chunks = chunkTranscript(raw);
  const rel = relative(courseDir, file) || file;
  return chunks.map(c => ({
    content: c.content, source: 'transcript' as const, sourcePath: rel,
    sourceRef: formatHMS(c.startSeconds), deepLink: c.deepLink,
    sourceFile: file, sourceMtime: mtime,
  }));
}

function ingestCdsMarkdown(file: string, mtime: number, courseDir: string): PendingChunk[] {
  const raw = readFileSync(file, 'utf-8');
  const chunks = chunkMarkdown(raw);
  const rel = relative(courseDir, file);
  return chunks.map(c => ({
    content: c.content, source: 'cds' as const, sourcePath: rel,
    sourceRef: c.headingPath ? `#${c.headingPath}` : '#',
    deepLink: null, sourceFile: file, sourceMtime: mtime,
  }));
}

async function ingestSlidePdf(file: string, mtime: number, courseDir: string): Promise<PendingChunk[]> {
  const chunks = await chunkSlidePdf(file);
  const rel = relative(courseDir, file);
  return chunks.map(c => ({
    content: c.content, source: 'slide' as const, sourcePath: rel,
    sourceRef: `p.${c.page}`, deepLink: null, sourceFile: file, sourceMtime: mtime,
  }));
}

function ingestCanonical(file: string, mtime: number, courseDir: string): PendingChunk[] {
  const raw = readFileSync(file, 'utf-8');
  const chunks = chunkCanonical(raw);
  const rel = relative(courseDir, file);
  return chunks.map(c => ({
    content: c.content, source: 'canonical' as const, sourcePath: rel,
    sourceRef: `## ${c.question}`, deepLink: null,
    sourceFile: file, sourceMtime: mtime,
  }));
}

function formatHMS(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  return `${m}:${String(sec).padStart(2,'0')}`;
}
