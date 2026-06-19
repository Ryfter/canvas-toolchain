// packages/command-and-control/src/tools/answers/chunking/markdown.ts

import { parseFrontMatter } from '../../../lib/front_matter.js';

export interface MarkdownChunk {
  content: string;
  headingPath: string;  // e.g. "Week 3 > Activities > Submit"
}

const TARGET_TOKENS = 400;
const HARD_MAX_TOKENS = 700;

export function chunkMarkdown(raw: string): MarkdownChunk[] {
  const { content } = parseFrontMatter(raw);
  const lines = content.split(/\r?\n/);

  type Section = { headingPath: string[]; lines: string[] };
  const sections: Section[] = [];
  const stack: string[] = [];
  let current: Section | null = null;

  for (const line of lines) {
    const m = /^(#{1,6})\s+(.*)$/.exec(line);
    if (m) {
      const level = m[1]!.length;
      const text = m[2]!.trim();
      while (stack.length >= level) stack.pop();
      stack.push(text);
      if (current) sections.push(current);
      current = { headingPath: [...stack], lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) sections.push(current);

  const chunks: MarkdownChunk[] = [];
  for (const s of sections) {
    const text = s.lines.join('\n').trim();
    if (!text) continue;
    const tokens = text.split(/\s+/).length;
    const headingPath = s.headingPath.join(' > ');
    if (tokens <= HARD_MAX_TOKENS) {
      chunks.push({ content: text, headingPath });
    } else {
      // very long section — split on blank lines, then merge to TARGET
      const paragraphs = text.split(/\n\s*\n/);
      let buf: string[] = [];
      let toks = 0;
      for (const p of paragraphs) {
        const pt = p.split(/\s+/).length;
        if (toks + pt > HARD_MAX_TOKENS && buf.length > 0) {
          chunks.push({ content: buf.join('\n\n'), headingPath });
          buf = []; toks = 0;
        }
        buf.push(p); toks += pt;
        if (toks >= TARGET_TOKENS) {
          chunks.push({ content: buf.join('\n\n'), headingPath });
          buf = []; toks = 0;
        }
      }
      if (buf.length > 0) chunks.push({ content: buf.join('\n\n'), headingPath });
    }
  }
  return chunks;
}
