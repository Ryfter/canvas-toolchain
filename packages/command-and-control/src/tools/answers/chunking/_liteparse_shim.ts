// packages/command-and-control/src/tools/answers/chunking/_liteparse_shim.ts
// Thin wrapper around @llamaindex/liteparse. Isolated so tests can mock if needed
// and so the LiteParse-specific API doesn't leak into the chunker.
//
// Deviation from plan: @llamaindex/liteparse v2.0.5 exports a `LiteParse` class
// (not a top-level `parse` function). The class is instantiated with config and
// its `parse(buffer)` method returns `{ pages: Array<{ text: string }>, text: string }`.
// We instantiate with `outputFormat: 'text'`, `quiet: true`, and `ocrEnabled: false`
// (OCR requires Tesseract language data we don't bundle — text-extractable PDFs
// work without it; image-only PDFs would need OCR enabled at the call site).

export async function parsePdfBuffer(buf: Buffer): Promise<string[]> {
  const mod = await import('@llamaindex/liteparse');
  const LiteParse = (mod as any).LiteParse ?? (mod as any).default;
  const parser = new LiteParse({ outputFormat: 'text', quiet: true, ocrEnabled: false });
  const result = await parser.parse(buf);
  if (Array.isArray((result as any).pages)) {
    return (result as any).pages.map((p: any) => String(p.text ?? ''));
  }
  // Fallback: treat as single-page document.
  return [String((result as any).text ?? '')];
}
