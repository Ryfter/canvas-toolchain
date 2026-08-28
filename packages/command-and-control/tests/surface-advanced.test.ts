import { describe, expect, it } from 'vitest';
import { advancedToolSchema, runAdvanced } from '../src/surface/advanced.js';
import { adaptModuleTools } from '../src/surface/module_adapter.js';
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

  it('returns a tool error for an unknown section', async () => {
    const res = await runAdvanced(buildRegistry(), { action: 'describe', section: 'a11y' as never });
    expect(res.isError).toBe(true);
    const body = JSON.parse(res.content[0].text as string);
    expect(body.validSections).toContain('accessibility');
  });

  it('does not double-wrap a module handler result', async () => {
    const reg = buildRegistry();
    const failing = {
      schema: { name: 'boom', description: 'fails', inputSchema: { type: 'object' } },
      handler: async () => ({ content: [{ type: 'text' as const, text: 'module blew up' }], isError: true }),
    };
    for (const op of adaptModuleTools('video', [failing as never])) reg.set(op.id, op);
    const res = await runAdvanced(reg, { action: 'run', operation: 'video.boom', params: {} });
    expect(res.isError).toBe(true);                       // inner failure must surface
    expect(res.content[0].text).toBe('module blew up');   // not a stringified envelope
  });

  it('rejects a non-object params', async () => {
    const res = await runAdvanced(buildRegistry(), {
      action: 'run', operation: 'wave_deep_check', params: 'not an object' as never,
    });
    expect(res.isError).toBe(true);
  });

  it('rejects params missing a required field', async () => {
    const res = await runAdvanced(buildRegistry(), {
      action: 'run', operation: 'wave_deep_check', params: {},
    });
    expect(res.isError).toBe(true);
    const body = JSON.parse(res.content[0].text as string);
    expect(JSON.stringify(body)).toMatch(/required/i);
  });

  it('calls the operation handler with the given params', async () => {
    const reg = buildRegistry();
    let seen: unknown = null;
    reg.set('stub_op', {
      id: 'stub_op', section: 'admin', description: 'stub', inputSchema: { type: 'object' },
      handler: (args) => { seen = args; return { ok: true }; },
      taskCategory: 'none', exposure: 'advanced',
    });
    await runAdvanced(reg, { action: 'run', operation: 'stub_op', params: { a: 1 } });
    expect(seen).toEqual({ a: 1 });
  });
});
