import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { exportKindSchema } from '../../src/tools/widget/schemas.js';

describe('exportKindSchema', () => {
  it('converts a zod object to a JSON Schema object with $schema and type:object', () => {
    const schema = z.object({ a: z.string(), b: z.number() });
    const json = exportKindSchema(schema);
    expect(json.type).toBe('object');
    expect((json as { properties: { a: { type: string } } }).properties.a.type).toBe('string');
    expect((json as { properties: { b: { type: string } } }).properties.b.type).toBe('number');
  });

  it('preserves required fields', () => {
    const schema = z.object({ a: z.string(), b: z.string().optional() });
    const json = exportKindSchema(schema);
    expect((json as { required: string[] }).required).toEqual(['a']);
  });

  it('handles arrays', () => {
    const schema = z.object({ items: z.array(z.string()) });
    const json = exportKindSchema(schema);
    const items = (json as { properties: { items: { type: string; items: { type: string } } } }).properties.items;
    expect(items.type).toBe('array');
    expect(items.items.type).toBe('string');
  });
});
