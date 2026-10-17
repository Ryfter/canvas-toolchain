import { describe, expect, it } from 'vitest';
import { buildRegistry } from '../src/surface/registry.js';
import { listTools } from '../src/surface/list_tools.js';
import { dispatchSurface } from '../src/surface/dispatch.js';

/**
 * Post-bump smoke for the public surface: the server must still advertise its
 * ten public tools, each with a usable input schema, and each must still answer
 * `action: "describe"` through the same entrypoints the ListTools/CallTool
 * handlers use. A renamed, dropped, or schema-broken tool fails here.
 */
const PUBLIC_TOOLS = [
  'ct_setup', 'ct_import', 'ct_inspect', 'ct_analyze', 'ct_plan',
  'ct_build', 'ct_review', 'ct_publish', 'ct_ask', 'ct_advanced',
];

interface InputSchema {
  type?: string;
  required?: string[];
  properties?: Record<string, { type?: string; enum?: string[] } | undefined>;
}

const registry = buildRegistry();
const tools = listTools(registry);

describe('public tool surface smoke', () => {
  it('advertises exactly the ten public tools', () => {
    expect(tools.map((t) => t.name)).toEqual(PUBLIC_TOOLS);
  });

  it('gives every public tool a valid input schema', () => {
    const broken: string[] = [];
    for (const { name, description, inputSchema } of tools) {
      const schema = inputSchema as InputSchema;
      const action = schema.properties?.action;
      if (!description) broken.push(`${name}: no description`);
      if (schema.type !== 'object') broken.push(`${name}: schema.type is ${String(schema.type)}`);
      if (!schema.required?.includes('action')) broken.push(`${name}: "action" is not required`);
      if (action?.type !== 'string') broken.push(`${name}: action is not a string`);
      if (!action?.enum?.length) broken.push(`${name}: action has no enum`);
      else if (!action.enum.includes('describe')) broken.push(`${name}: action enum omits "describe"`);
    }
    expect(broken).toEqual([]);
  });

  it('answers "describe" on every public tool without a tool error', async () => {
    const failed: string[] = [];
    for (const { name } of tools) {
      const result = await dispatchSurface(registry, name, { action: 'describe' });
      const first = result.content?.[0];
      const text = first?.type === 'text' ? first.text : '';
      if (result.isError) {
        failed.push(`${name}: ${text}`);
        continue;
      }
      const payload = JSON.parse(text) as {
        operations?: Record<string, unknown>;
        sections?: Record<string, unknown>;
      };
      if (Object.keys(payload.operations ?? payload.sections ?? {}).length === 0) {
        failed.push(`${name}: describe returned nothing to call`);
      }
    }
    expect(failed).toEqual([]);
  });
});
