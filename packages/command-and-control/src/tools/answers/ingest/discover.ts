import { existsSync, readdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { defaultCanonicalFaqPath, defaultSlidesDir } from '../paths.js';

export interface DiscoveredSources {
  transcripts: string[];
  cdsMarkdown: string[];
  slidePdfs: string[];
  canonical: string | null;
}

const SKIP_DIRS = new Set(['.canvas-toolchain', 'node_modules', 'dist', '.git']);

function walkMarkdown(root: string, out: string[]): void {
  if (!existsSync(root)) return;
  for (const entry of readdirSync(root)) {
    const full = join(root, entry);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue;
      walkMarkdown(full, out);
    } else if (extname(entry) === '.md' && !entry.endsWith('.enriched.md')) {
      out.push(full);
    }
  }
}

function walkPdf(root: string, out: string[]): void {
  if (!existsSync(root)) return;
  for (const entry of readdirSync(root)) {
    const full = join(root, entry);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) walkPdf(full, out);
    else if (extname(entry).toLowerCase() === '.pdf') out.push(full);
  }
}

function walkTranscripts(root: string, out: string[]): void {
  if (!existsSync(root)) return;
  for (const entry of readdirSync(root)) {
    const full = join(root, entry);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) walkTranscripts(full, out);
    else if (entry.endsWith('.enriched.md')) out.push(full);
  }
}

export function discoverSources(courseDir: string, transcriptSources: string[]): DiscoveredSources {
  const transcripts: string[] = [];
  for (const src of transcriptSources) walkTranscripts(src, transcripts);

  const cdsMarkdown: string[] = [];
  walkMarkdown(courseDir, cdsMarkdown);

  const slidePdfs: string[] = [];
  walkPdf(defaultSlidesDir(courseDir), slidePdfs);

  const canonicalPath = defaultCanonicalFaqPath(courseDir);
  const canonical = existsSync(canonicalPath) ? canonicalPath : null;

  // The canonical FAQ lives under courseDir, so the markdown walker grabs it too.
  // Strip it from cdsMarkdown so the orchestrator routes it through the canonical
  // chunker (and tags chunks with source='canonical') instead of source='cds'.
  const cdsMarkdownFiltered = canonical
    ? cdsMarkdown.filter(f => f !== canonical)
    : cdsMarkdown;

  return { transcripts, cdsMarkdown: cdsMarkdownFiltered, slidePdfs, canonical };
}
