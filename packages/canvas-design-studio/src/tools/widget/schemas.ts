import { zodToJsonSchema } from 'zod-to-json-schema';
import type { z } from 'zod';

/** Convert a Zod schema (typically a renderer's contentSchema) into a plain JSON Schema
 *  object suitable for embedding into a prompt. The brainstorm tool's system prompt uses
 *  these schemas so the LLM produces well-formed initialContent for each kind. */
export function exportKindSchema(schema: z.ZodSchema): Record<string, unknown> {
  return zodToJsonSchema(schema, { $refStrategy: 'none' }) as Record<string, unknown>;
}
