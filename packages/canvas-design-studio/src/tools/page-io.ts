import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, copyFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

// All four types are exported because src/index.ts needs them for type-casting args.
// Co-located here (not in src/types.ts) because they're only used by this file + index.ts.
export interface LoadCanvasPageInput { filename?: string }
export interface LoadCanvasPageResult { html: string; filename: string }
export interface SaveCanvasPageInput { html: string; filename: string }
export interface SaveCanvasPageResult { saved: string; backup: string | null }

// Resolves relative to wherever the professor runs the server — same convention as ingest/.
export const OUTPUT_DIR = join(process.cwd(), 'output');

// outputDir is a parameter (not hardcoded) so tests can pass tmpdir() instead of polluting
// the real output/ directory. Same testability pattern as personas.ts (personasPath param).
export function loadCanvasPage(input: LoadCanvasPageInput, outputDir = OUTPUT_DIR): LoadCanvasPageResult {
  if (!existsSync(outputDir)) {
    throw new Error('output/ directory not found. Generate a page first with generate_canvas_page.');
  }

  if (input.filename) {
    const filePath = resolve(join(outputDir, input.filename));
    if (!filePath.startsWith(resolve(outputDir) + sep)) {
      throw new Error('Invalid filename: must be a plain filename, not a path.');
    }
    if (!existsSync(filePath)) {
      throw new Error(`File not found: output/${input.filename}`);
    }
    try {
      const html = readFileSync(filePath, 'utf-8');
      return { html, filename: input.filename };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Cannot read file: ${message}`);
    }
  }

  // Auto-select: scan for .html files, sort by mtime descending, pick first.
  const htmlFiles = readdirSync(outputDir).filter(f => f.endsWith('.html'));
  if (htmlFiles.length === 0) {
    throw new Error('No HTML files found in output/. Generate a page first with generate_canvas_page.');
  }

  const sorted = htmlFiles
    .map(f => ({ name: f, mtime: statSync(join(outputDir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  const filename = sorted[0].name;
  try {
    const html = readFileSync(join(outputDir, filename), 'utf-8');
    return { html, filename };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Cannot read file: ${message}`);
  }
}

// outputDir parameter follows the same testability pattern as loadCanvasPage.
// mkdirSync({ recursive: true }) is used so the professor doesn't need to pre-create output/.
// Backup is written before the original is touched — the original is never clobbered
// unless copyFileSync succeeds. This protects against partial writes during errors.
export function saveCanvasPage(input: SaveCanvasPageInput, outputDir = OUTPUT_DIR): SaveCanvasPageResult {
  if (!input.html || !input.html.trim()) {
    throw new Error('html must not be empty');
  }
  if (!input.filename || !input.filename.trim()) {
    throw new Error('filename must not be empty');
  }

  mkdirSync(outputDir, { recursive: true });

  const filePath = resolve(join(outputDir, input.filename));
  if (!filePath.startsWith(resolve(outputDir) + sep)) {
    throw new Error('Invalid filename: must be a plain filename, not a path.');
  }
  const bakPath = join(outputDir, `${input.filename}.bak`);
  let backup: string | null = null;

  if (existsSync(filePath)) {
    try {
      copyFileSync(filePath, bakPath);
      backup = bakPath;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to write backup: ${message}`);
    }
  }

  writeFileSync(filePath, input.html, 'utf-8');
  return { saved: filePath, backup };
}
