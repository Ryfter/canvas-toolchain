// packages/command-and-control/src/tools/answers/retrieval/prompt.ts

import type { Chunk } from '../types.js';

export const SYSTEM_PROMPT = `You are a faculty research assistant. Answer the question using ONLY the provided context chunks. Cite each fact you use by referencing the chunk number in square brackets, like [3]. If the context does NOT contain the answer, say so explicitly — never fabricate or speculate. Keep answers concise and useful for a busy professor double-checking what they covered in class.`;

export function buildUserPrompt(question: string, chunks: Chunk[]): string {
  const formatted = chunks.map((c, i) => {
    const header = `[${i + 1}] (${c.source}: ${c.sourcePath}${c.sourceRef ? ' ' + c.sourceRef : ''})`;
    return `${header}\n${c.content}`;
  }).join('\n\n');
  return `CONTEXT:\n\n${formatted}\n\nQUESTION: ${question}\n\nAnswer the question using only the context above, citing chunk numbers like [N].`;
}

const CITATION_RE = /\[(\d+)\]/g;

/** Extract the set of chunk indexes (1-based) referenced in the answer text. */
export function extractCitedIndexes(answer: string): number[] {
  const set = new Set<number>();
  let m: RegExpExecArray | null;
  while ((m = CITATION_RE.exec(answer)) !== null) {
    const n = Number(m[1]);
    if (Number.isInteger(n) && n > 0) set.add(n);
  }
  return [...set].sort((a, b) => a - b);
}
