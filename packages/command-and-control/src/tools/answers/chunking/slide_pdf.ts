// packages/command-and-control/src/tools/answers/chunking/slide_pdf.ts

import { readFile } from 'node:fs/promises';

export interface SlideChunk {
  page: number;        // 1-indexed
  content: string;     // extracted text for that page
}

/** Parses a PDF and emits one SlideChunk per page. Pages with no extractable
 *  text are skipped. Uses LiteParse under the hood (lazy-imported to avoid
 *  loading until needed). */
export async function chunkSlidePdf(pdfPath: string): Promise<SlideChunk[]> {
  const { parsePdfBuffer } = await import('./_liteparse_shim.js');
  const buf = await readFile(pdfPath);
  const pages = await parsePdfBuffer(buf);
  return pages
    .map((text, i) => ({ page: i + 1, content: text.trim() }))
    .filter(s => s.content.length > 0);
}
