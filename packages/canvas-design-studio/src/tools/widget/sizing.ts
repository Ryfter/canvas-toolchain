// packages/canvas-design-studio/src/tools/widget/sizing.ts

import type { InteractiveSpec } from './types.js';

/** Render the CSS that goes on the widget's <body> to honour the spec dimensions.
 *  Used inside buildWidgetHtml's wrapper CSS. */
export function dimensionsToCss(d: InteractiveSpec['dimensions']): string {
  const parts = [
    `min-height: ${d.minHeight}px`,
    `max-height: ${d.maxHeight}px`,
  ];
  if (d.aspectRatio) parts.push(`aspect-ratio: ${d.aspectRatio}`);
  return parts.join('; ') + ';';
}

/** Render the iframe height attr + inline style for the embed code that publish_widget
 *  inserts into the host Canvas page. */
export function dimensionsToIframeAttrs(d: InteractiveSpec['dimensions']): { height: string; style: string } {
  return {
    height: String(d.maxHeight),
    style: `min-height: ${d.minHeight}px; border: 0;`,
  };
}
