import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { getPatternById, type CapabilityCatalog, type CatalogPattern } from './catalog.js';

export interface RenderPreviewResult {
  patternId: string;
  previewPath: string;
}

const PAGE_TEMPLATE = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>{{TITLE_ESC}} — Canvas Capability Preview</title>
  <style>
    body { max-width: 900px; margin: 2em auto; font-family: system-ui, sans-serif;
           padding: 0 1em; color: #222; }
    .preview-meta { background: #f5f5f5; padding: 1em 1.25em;
                    border-left: 4px solid #003a70; margin-bottom: 2em;
                    border-radius: 2px; }
    .preview-meta h1 { margin-top: 0; }
    .status { display: inline-block; padding: 2px 8px; border-radius: 3px;
              font-size: 0.85em; }
    .status-supported { background: #d4edda; color: #155724; }
    .status-partial { background: #ffeeba; color: #856404; }
    .status-aspirational { background: #fff3cd; color: #856404; }
    .preview-content { border: 1px dashed #ccc; padding: 1em; margin-top: 1em; }
  </style>
</head>
<body>
  <div class="preview-meta">
    <h1>{{NAME_ESC}}</h1>
    <p><strong>Category:</strong> {{CATEGORY_ESC}}
       · <strong>Status:</strong> <span class="status status-{{STATUS}}">{{STATUS}}</span></p>
    <p>{{DESCRIPTION_ESC}}</p>
    <p><em>When to use:</em> {{WHEN_TO_USE_ESC}}</p>
{{NOTES_BLOCK}}
  </div>
  <h2>Rendered example</h2>
  <div class="preview-content">
{{EXAMPLE_HTML_RAW}}
  </div>
</body>
</html>
`;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildHtml(pattern: CatalogPattern, categoryName: string): string {
  const notesBlock = pattern.notes
    ? `    <p><strong>Note:</strong> ${escapeHtml(pattern.notes)}</p>`
    : '';

  return PAGE_TEMPLATE
    .replace(/\{\{TITLE_ESC\}\}/g, escapeHtml(pattern.name))
    .replace(/\{\{NAME_ESC\}\}/g, escapeHtml(pattern.name))
    .replace(/\{\{CATEGORY_ESC\}\}/g, escapeHtml(categoryName))
    .replace(/\{\{STATUS\}\}/g, pattern.supportStatus)
    .replace(/\{\{DESCRIPTION_ESC\}\}/g, escapeHtml(pattern.description))
    .replace(/\{\{WHEN_TO_USE_ESC\}\}/g, escapeHtml(pattern.whenToUse))
    .replace(/\{\{NOTES_BLOCK\}\}/g, notesBlock)
    .replace(/\{\{EXAMPLE_HTML_RAW\}\}/g, pattern.exampleHtml);
}

function getCacheDir(): string {
  return join(process.env.CC_HOME ?? join(homedir(), '.command-and-control'), 'showcase-previews');
}

export function renderPreview(catalog: CapabilityCatalog, patternId: string): RenderPreviewResult {
  const pattern = getPatternById(catalog, patternId);
  if (!pattern) {
    throw new Error(`PATTERN_NOT_FOUND: pattern "${patternId}" is not in the catalog`);
  }

  const category = catalog.categories.find((c) => c.id === pattern.category);
  const categoryName = category?.name ?? pattern.category;

  const html = buildHtml(pattern, categoryName);

  const dir = getCacheDir();
  mkdirSync(dir, { recursive: true });
  const previewPath = join(dir, `${patternId}.html`);
  const tmpPath = `${previewPath}.tmp`;
  writeFileSync(tmpPath, html, 'utf-8');
  renameSync(tmpPath, previewPath);

  return { patternId, previewPath };
}
