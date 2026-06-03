import { zodToJsonSchema } from 'zod-to-json-schema';
import type { z } from 'zod';

/** Cast the imported function to a flat signature. The library's published overloads
 *  recurse into the Zod schema generic to predict the return shape, which trips
 *  TS2589 ("Type instantiation is excessively deep") under strict mode. We only need
 *  the runtime call; the return shape is documented as a JSON Schema object. */
const toJsonSchema = zodToJsonSchema as unknown as (
  schema: z.ZodTypeAny,
  opts?: { $refStrategy?: 'none' | 'root' | 'relative' | 'seen' },
) => Record<string, unknown>;

/** Convert a Zod schema (typically a renderer's contentSchema) into a plain JSON Schema
 *  object suitable for embedding into a prompt. The brainstorm tool's system prompt uses
 *  these schemas so the LLM produces well-formed initialContent for each kind. */
export function exportKindSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  return toJsonSchema(schema, { $refStrategy: 'none' });
}
