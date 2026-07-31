import {
  loadCatalog,
  getPatternById,
  type SupportStatus,
} from '@canvas-toolchain/canvas-design-studio/dist/tools/showcase/catalog.js';
import { renderPreview } from '@canvas-toolchain/canvas-design-studio/dist/tools/showcase/render_preview.js';

export interface PreviewCanvasPatternInput {
  patternId: string;
}

export type PreviewCanvasPatternResult =
  | {
      ok: true;
      patternId: string;
      previewPath: string;
      openInstruction: string;
      catalogEntry: {
        name: string;
        category: string;
        supportStatus: SupportStatus;
      };
    }
  | {
      ok: false;
      error: 'PATTERN_NOT_FOUND' | 'CATALOG_NOT_FOUND' | 'CATALOG_INVALID' | 'PREVIEW_WRITE_FAILED';
      message: string;
      fix: string[];
    };

function classifyCatalogError(err: unknown): { error: 'CATALOG_NOT_FOUND' | 'CATALOG_INVALID'; message: string } {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.startsWith('CATALOG_NOT_FOUND')) return { error: 'CATALOG_NOT_FOUND', message: msg };
  return { error: 'CATALOG_INVALID', message: msg };
}

export async function previewCanvasPattern(
  input: PreviewCanvasPatternInput,
): Promise<PreviewCanvasPatternResult> {
  let catalog;
  try {
    catalog = loadCatalog();
  } catch (err) {
    const classified = classifyCatalogError(err);
    return {
      ok: false,
      ...classified,
      fix:
        classified.error === 'CATALOG_NOT_FOUND'
          ? ['Reinstall canvas-toolchain or pull the latest']
          : ['Open packages/canvas-design-studio/data/canvas-capabilities.yaml and check syntax'],
    };
  }

  const pattern = getPatternById(catalog, input.patternId);
  if (!pattern) {
    return {
      ok: false,
      error: 'PATTERN_NOT_FOUND',
      message: `Pattern "${input.patternId}" is not in the catalog`,
      fix: ['Run show_canvas_capabilities to see valid pattern IDs'],
    };
  }

  let rendered;
  try {
    rendered = renderPreview(catalog, input.patternId);
  } catch (err) {
    return {
      ok: false,
      error: 'PREVIEW_WRITE_FAILED',
      message: err instanceof Error ? err.message : String(err),
      fix: ['Check ~/.command-and-control/showcase-previews/ is writable'],
    };
  }

  return {
    ok: true,
    patternId: rendered.patternId,
    previewPath: rendered.previewPath,
    openInstruction: `Open file://${rendered.previewPath} in your browser to view the rendered pattern.`,
    catalogEntry: {
      name: pattern.name,
      category: pattern.category,
      supportStatus: pattern.supportStatus,
    },
  };
}
