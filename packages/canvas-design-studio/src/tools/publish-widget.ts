// packages/canvas-design-studio/src/tools/publish-widget.ts

import { readFileSync, existsSync } from 'node:fs';
import { uploadCanvasFile, type CanvasConfig } from './widget/canvas-files.js';
import { dimensionsToIframeAttrs } from './widget/sizing.js';
import type { InteractiveSpec } from './widget/types.js';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export interface PublishWidgetInput {
  htmlPath: string;
  courseId: number;
  canvasConfig: CanvasConfig;
  widgetSpec: InteractiveSpec;
}

export interface PublishWidgetResult {
  canvasFileId: number;
  embedSrc: string;
  embedHtml: string;
}

export async function publishWidget(input: PublishWidgetInput): Promise<PublishWidgetResult> {
  const { htmlPath, courseId, canvasConfig, widgetSpec } = input;

  if (!existsSync(htmlPath)) {
    throw new Error(`htmlPath does not exist: ${htmlPath}`);
  }
  const html = readFileSync(htmlPath, 'utf8');

  // The Canvas Files filename uses the spec id (so re-renders overwrite predictably by display_name).
  const filename = `${widgetSpec.id}.html`;

  const upload = await uploadCanvasFile(canvasConfig, {
    courseId,
    filename,
    contentType: 'text/html',
    body: html,
  });

  const { height, style } = dimensionsToIframeAttrs(widgetSpec.dimensions);
  const embedSrc = upload.previewUrl;
  const embedHtml = `<iframe src="${embedSrc}" width="100%" height="${height}" style="${style}" title="${escapeHtml(widgetSpec.name)}" sandbox="allow-scripts allow-same-origin allow-forms" loading="lazy">${escapeHtml(widgetSpec.accessibility.screenReaderSummary)}</iframe>`;

  return {
    canvasFileId: upload.fileId,
    embedSrc,
    embedHtml,
  };
}
