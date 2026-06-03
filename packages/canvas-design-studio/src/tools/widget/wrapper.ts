// packages/canvas-design-studio/src/tools/widget/wrapper.ts

import type { InteractiveSpec } from './types.js';
import { WRAPPER_A11Y_CSS, WRAPPER_BOOTSTRAP_JS, SR_REGION_HTML } from './a11y.js';
import { dimensionsToCss } from './sizing.js';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const BASE_CSS = `
html, body { margin: 0; padding: 0; }
body {
  font-family: Lato, sans-serif;
  color: #1A1A1A;
  background: #ffffff;
  box-sizing: border-box;
}
*, *::before, *::after { box-sizing: inherit; }
`.trim();

export function buildWidgetHtml(input: {
  body: string;
  css: string;
  js: string;
  spec: InteractiveSpec;
}): string {
  const { body, css, js, spec } = input;
  const dimCss = dimensionsToCss(spec.dimensions);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(spec.name)}</title>
<style>
${BASE_CSS}
body { ${dimCss} }
${WRAPPER_A11Y_CSS}
${css}
</style>
</head>
<body>
${SR_REGION_HTML(spec.accessibility.screenReaderSummary)}
${body}
<script>
${WRAPPER_BOOTSTRAP_JS}
${js}
</script>
</body>
</html>
`;
}
