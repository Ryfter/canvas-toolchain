import { describe, expect, it } from 'vitest';
import { listTools } from '../src/surface/list_tools.js';
import { buildRegistry } from '../src/surface/registry.js';
import { adaptModuleTools } from '../src/surface/module_adapter.js';

describe('tools/list', () => {
  it('returns exactly ten tools', () => {
    expect(listTools(buildRegistry())).toHaveLength(10);
  });

  it('returns unique tool names', () => {
    const names = listTools(buildRegistry()).map((t) => t.name);
    expect(names.length).toBe(new Set(names).size);
  });

  it('stays at ten tools when modules are loaded', () => {
    const reg = buildRegistry();
    for (const op of adaptModuleTools('video', [{
      schema: { name: 'fetch', description: 'd', inputSchema: { type: 'object' } },
      handler: async () => ({ content: [] }),
    } as never])) {
      reg.set(op.id, op);
    }
    expect(listTools(reg)).toHaveLength(10);
  });

  it('leaves no operation orphaned', () => {
    const reg = buildRegistry();
    const orphans = [...reg.values()].filter(
      (o) => o.exposure !== 'intent' && o.exposure !== 'advanced' && o.exposure !== 'internal',
    );
    expect(orphans).toEqual([]);
    for (const op of reg.values()) {
      if (op.exposure === 'intent') expect(op.intentTool).toBeTruthy();
    }
  });
});
