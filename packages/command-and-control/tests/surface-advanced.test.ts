import { describe, expect, it } from 'vitest';
import { advancedToolSchema, runAdvanced } from '../src/surface/advanced.js';
import { buildRegistry } from '../src/surface/registry.js';

describe('ct_advanced', () => {
  it('lists section and operation names in its description but no schemas', () => {
    const schema = advancedToolSchema(buildRegistry());
    expect(schema.description).toContain('accessibility');
    expect(schema.description).toContain('wave_deep_check');
    expect(schema.description).not.toContain('inputSchema');
  });

  it('describe with no arguments returns sections and operation names', async () => {
    const res = await runAdvanced(buildRegistry(), { action: 'describe' });
    const body = JSON.parse(res.content[0].text as string);
    expect(Object.keys(body.sections)).toContain('research');
    expect(res.isError).toBeFalsy();
  });

  it('describe with a section returns full schemas for that section', async () => {
    const res = await runAdvanced(buildRegistry(), { action: 'describe', section: 'accessibility' });
    const body = JSON.parse(res.content[0].text as string);
    expect(body.operations.wave_deep_check.inputSchema).toBeDefined();
  });

  it('run on an unknown operation returns a tool error listing valid operations', async () => {
    const res = await runAdvanced(buildRegistry(), { action: 'run', operation: 'nope', params: {} });
    expect(res.isError).toBe(true);
    const body = JSON.parse(res.content[0].text as string);
    expect(Array.isArray(body.validOperations)).toBe(true);
    expect(body.validOperations.length).toBeGreaterThan(0);
  });

  it('refuses to run an internal operation', async () => {
    const res = await runAdvanced(buildRegistry(), {
      action: 'run', operation: 'reembed_course_index', params: {},
    });
    expect(res.isError).toBe(true);
  });
});
