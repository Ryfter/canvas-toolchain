// packages/canvas-design-studio/src/tools/widget/types.ts

import type { z } from 'zod';

/** Closed enum of v1 catalog widget kinds. Brainstorm tool's prompt is steered toward
 *  these; novel kinds reach the renderer only via --allowExperimental. */
export const WIDGET_KINDS = [
  'card-flip-reveal',
  'sortable-ordering',
  'drag-to-categorize',
  'branching-scenario',
  'multi-step-reveal',
  'hotspot-image',
] as const;

export type WidgetKind = typeof WIDGET_KINDS[number];

/** Loose-typed match for the InteractiveSpec shape produced by brainstorm_interactive.
 *  We import structurally rather than via shared-types to avoid coupling CDS to a C&C type. */
export interface InteractiveSpec {
  id: string;
  name: string;
  kind: string;
  purpose: string;
  contentSchema: Record<string, unknown>;
  initialContent: Record<string, unknown>;
  dimensions: { minHeight: number; maxHeight: number; aspectRatio?: string };
  accessibility: { keyboardEquivalent: string; screenReaderSummary: string; minTouchTarget: number };
}

/** Discriminated-union result type used by Renderer.validateContent. */
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/** A single renderer in the catalog. Each handles one kind and exposes the
 *  zod schema for its initialContent shape (re-used by the brainstorm prompt). */
export interface Renderer<TContent = unknown> {
  readonly kind: WidgetKind;
  readonly contentSchema: z.ZodSchema<TContent>;
  validateContent(content: Record<string, unknown>): Result<TContent>;
  render(content: TContent, spec: InteractiveSpec): {
    body: string;
    css: string;
    js: string;
  };
}

/** Input + output shapes for the render_widget MCP tool. */
export interface RenderWidgetInput {
  specPath: string;
  allowExperimental?: boolean;
}

export interface RenderWidgetResult {
  outputPath: string;
  kind: string;
  experimental: boolean;
}

/** Error codes from render_widget — keep stable; emitted in MCP responses. */
export type RenderErrorCode =
  | 'SPEC_NOT_FOUND'
  | 'SPEC_PARSE_ERROR'
  | 'KIND_NOT_IN_CATALOG'
  | 'CONTENT_SCHEMA_INVALID'
  | 'LLM_RENDER_FAILED'
  | 'LLM_OUTPUT_UNSAFE'
  | 'FILE_WRITE_ERROR';

export class RenderError extends Error {
  constructor(public code: RenderErrorCode, public detail: Record<string, unknown>) {
    super(`${code}: ${JSON.stringify(detail)}`);
    this.name = 'RenderError';
  }
}
