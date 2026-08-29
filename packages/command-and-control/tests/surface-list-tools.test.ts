import { describe, expect, it } from 'vitest';
import { listTools } from '../src/surface/list_tools.js';
import { buildRegistry } from '../src/surface/registry.js';
import { adaptModuleTools } from '../src/surface/module_adapter.js';
import { runAdvanced } from '../src/surface/advanced.js';

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

  it('makes every non-internal operation reachable through the exposed surface', async () => {
    const reg = buildRegistry();
    const tools = listTools(reg);

    // The sidecar's own catalogue — the only way an advanced op is reachable.
    const cat = await runAdvanced(reg, { action: 'describe' });
    const sections = JSON.parse(cat.content[0].text as string).sections as
      Record<string, { operations: string[] }>;
    const advertised = new Set(Object.values(sections).flatMap((s) => s.operations));

    const unreachable: string[] = [];
    for (const op of reg.values()) {
      if (op.exposure === 'internal') continue;
      if (op.exposure === 'intent') {
        const tool = tools.find((t) => t.name === op.intentTool);
        const actions =
          (tool?.inputSchema as { properties?: { action?: { enum?: string[] } } })
            ?.properties?.action?.enum ?? [];
        if (!actions.includes(op.intentAction as string)) unreachable.push(op.id);
      } else if (!advertised.has(op.id)) {
        unreachable.push(op.id);
      }
    }
    expect(unreachable, `unreachable: ${unreachable.join(', ')}`).toEqual([]);
  });
});
