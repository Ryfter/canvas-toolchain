// packages/command-and-control/src/tools/answers/chunking/canonical.ts

export interface CanonicalChunk {
  question: string;
  content: string;  // includes question heading line for context
}

/** Splits canonical.md into one chunk per ## section. Each chunk's content
 *  includes the question heading + the body up to the next ##. */
export function chunkCanonical(raw: string): CanonicalChunk[] {
  const lines = raw.split(/\r?\n/);
  const chunks: CanonicalChunk[] = [];
  let currentQ: string | null = null;
  let buf: string[] = [];

  const flush = () => {
    if (currentQ === null) return;
    const body = buf.join('\n').trim();
    if (body || currentQ) {
      chunks.push({ question: currentQ, content: `## ${currentQ}\n\n${body}` });
    }
  };

  for (const line of lines) {
    const m = /^##\s+(.*)$/.exec(line);
    if (m) {
      flush();
      currentQ = m[1]!.trim();
      buf = [];
    } else if (currentQ !== null) {
      buf.push(line);
    }
  }
  flush();
  return chunks;
}
