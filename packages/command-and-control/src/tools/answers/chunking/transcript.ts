// packages/command-and-control/src/tools/answers/chunking/transcript.ts

import { parseFrontMatter } from '../../../lib/front_matter.js';

export interface TranscriptChunk {
  content: string;
  startSeconds: number;     // first timestamp inside the chunk
  endSeconds: number;       // last timestamp inside the chunk
  deepLink: string | null;  // rendered from frontmatter.deepLinkTemplate, null if absent
}

export interface TranscriptFrontmatter {
  sourcePlatform?: string;
  sourceId?: string;
  deepLinkTemplate?: string;
  title?: string;
  recordedAt?: string;
  durationSeconds?: number;
}

const TARGET_TOKENS = 300;   // rough — measured by whitespace splits
const HARD_MAX_TOKENS = 500;

function timestampToSeconds(ts: string): number {
  const parts = ts.split(':').map(Number);
  if (parts.length === 3) return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
  if (parts.length === 2) return parts[0]! * 60 + parts[1]!;
  return Number(parts[0]);
}

export function parseTranscript(raw: string): { frontmatter: TranscriptFrontmatter; body: string } {
  const parsed = parseFrontMatter(raw);
  return { frontmatter: parsed.data as TranscriptFrontmatter, body: parsed.content };
}

/** Split a body of `[HH:MM:SS] line ...` lines into ~TARGET_TOKENS chunks,
 *  rendering deep-link URLs from the frontmatter template. */
export function chunkTranscript(raw: string): TranscriptChunk[] {
  const { frontmatter, body } = parseTranscript(raw);
  const lineRegex = /^\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s?(.*)$/;
  const lines = body.split(/\r?\n/).map(l => {
    const m = lineRegex.exec(l);
    if (!m) return null;
    return { ts: timestampToSeconds(m[1]!), text: m[2]! };
  }).filter((x): x is { ts: number; text: string } => x !== null);

  const chunks: TranscriptChunk[] = [];
  let buf: { ts: number; text: string }[] = [];
  let tokens = 0;

  const flush = () => {
    if (buf.length === 0) return;
    const start = buf[0]!.ts;
    const end = buf[buf.length - 1]!.ts;
    const content = buf.map(l => `[${formatHMS(l.ts)}] ${l.text}`).join('\n');
    chunks.push({
      content, startSeconds: start, endSeconds: end,
      deepLink: renderDeepLink(frontmatter, start),
    });
    buf = []; tokens = 0;
  };

  for (const l of lines) {
    const lt = l.text.split(/\s+/).length;
    if (tokens + lt > HARD_MAX_TOKENS && buf.length > 0) flush();
    buf.push(l);
    tokens += lt;
    if (tokens >= TARGET_TOKENS) flush();
  }
  flush();
  return chunks;
}

function formatHMS(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  return `${m}:${String(sec).padStart(2,'0')}`;
}

function renderDeepLink(fm: TranscriptFrontmatter, startSeconds: number): string | null {
  if (!fm.deepLinkTemplate || !fm.sourceId) return null;
  return fm.deepLinkTemplate
    .replace('{sourceId}', fm.sourceId)
    .replace('{startSeconds}', String(startSeconds));
}
