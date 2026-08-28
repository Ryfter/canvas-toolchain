import { describe, expect, it } from 'vitest';
import { adaptModuleTools } from '../src/surface/module_adapter.js';

const fakeTool = {
  schema: { name: 'fetch_transcripts', description: 'Fetch them.', inputSchema: { type: 'object' } },
  handler: async () => ({ content: [{ type: 'text' as const, text: 'ok' }] }),
};

describe('module adapter', () => {
  it('namespaces the operation id with the module id', () => {
    const [op] = adaptModuleTools('video', [fakeTool as never]);
    expect(op.id).toBe('video.fetch_transcripts');
  });

  it('places module operations in the modules section as advanced', () => {
    const [op] = adaptModuleTools('video', [fakeTool as never]);
    expect(op.section).toBe('modules');
    expect(op.exposure).toBe('advanced');
  });

  it('preserves the original handler', async () => {
    const [op] = adaptModuleTools('video', [fakeTool as never]);
    await expect(op.handler({})).resolves.toEqual({ content: [{ type: 'text', text: 'ok' }] });
  });

  it('returns an empty array for a module with no tools', () => {
    expect(adaptModuleTools('roster', [])).toEqual([]);
  });

  it('throws on duplicate tool names within one module', () => {
    const t = (name: string) => ({
      schema: { name, description: 'd', inputSchema: { type: 'object' } },
      handler: async () => ({ content: [] }),
    });
    expect(() => adaptModuleTools('video', [t('dup'), t('dup')] as never)).toThrow(/dup/);
  });
});
