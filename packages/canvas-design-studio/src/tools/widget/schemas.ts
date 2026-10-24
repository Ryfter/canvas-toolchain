import { z } from 'zod';

/** Convert a Zod schema (typically a renderer's contentSchema) into a plain JSON Schema
 *  object suitable for embedding into a prompt. The brainstorm tool's system prompt uses
 *  these schemas so the LLM produces well-formed initialContent for each kind. */
export function exportKindSchema(schema: z.ZodType): Record<string, unknown> {
  return z.toJSONSchema(schema, { reused: 'inline' }) as Record<string, unknown>;
}
