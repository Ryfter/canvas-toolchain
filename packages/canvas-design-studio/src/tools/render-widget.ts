// packages/canvas-design-studio/src/tools/render-widget.ts

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { CATALOG } from './widget/catalog/index.js';
import { buildWidgetHtml } from './widget/wrapper.js';
import {
  RenderError,
  WIDGET_KINDS,
  type InteractiveSpec,
  type RenderWidgetInput,
  type RenderWidgetResult,
  type WidgetKind,
} from './widget/types.js';

export async function renderWidget(input: RenderWidgetInput): Promise<RenderWidgetResult> {
  const { specPath, allowExperimental = false } = input;

  if (!existsSync(specPath)) {
    throw new RenderError('SPEC_NOT_FOUND', { specPath });
  }

  let raw: string;
  try {
    raw = readFileSync(specPath, 'utf8');
  } catch (e) {
    throw new RenderError('SPEC_NOT_FOUND', { specPath, cause: String(e) });
  }

  let spec: InteractiveSpec;
  try {
    spec = JSON.parse(raw) as InteractiveSpec;
  } catch (e) {
    throw new RenderError('SPEC_PARSE_ERROR', { specPath, cause: String(e) });
  }

  const kind = spec.kind as WidgetKind;
  const renderer = CATALOG[kind];

  if (!renderer) {
    if (!allowExperimental) {
      throw new RenderError('KIND_NOT_IN_CATALOG', {
        kind: spec.kind,
        allowedKinds: WIDGET_KINDS,
        hint: 'Pass allowExperimental: true to render via the LLM path (Plan C).',
      });
    }
    // Experimental path lands in Plan C.
    throw new RenderError('LLM_RENDER_FAILED', {
      kind: spec.kind,
      reason: 'Experimental renderer not yet implemented (lands in Plan C).',
    });
  }

  const validated = renderer.validateContent(spec.initialContent);
  if (!validated.ok) {
    throw new RenderError('CONTENT_SCHEMA_INVALID', { kind: spec.kind, error: validated.error });
  }

  const { body, css, js } = renderer.render(validated.value, spec);
  const html = buildWidgetHtml({ body, css, js, spec });

  const specName = basename(specPath, '.spec.json');
  const outputPath = join(dirname(specPath), `${specName}.html`);

  try {
    writeFileSync(outputPath, html, 'utf8');
  } catch (e) {
    throw new RenderError('FILE_WRITE_ERROR', { outputPath, cause: String(e) });
  }

  return { outputPath, kind: spec.kind, experimental: false };
}
