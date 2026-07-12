import { describe, it, expect } from 'vitest';
import { dispatchCallTool, type CallToolDispatchDeps } from '../../src/lib/call_tool_dispatch.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

function deps(overrides: Partial<CallToolDispatchDeps> = {}): CallToolDispatchDeps {
  return {
    moduleHandlers: new Map(),
    runCoreTool: async () => ({ handled: false }),
    getNotice: () => '',
    ...overrides,
  };
}

describe('dispatchCallTool (#123)', () => {
  it('returns a module handler result untouched (no notice appended)', async () => {
    const moduleResult: CallToolResult = { content: [{ type: 'text', text: 'module says hi' }] };
    const res = await dispatchCallTool('mod_tool', {}, deps({
      moduleHandlers: new Map([['mod_tool', async () => moduleResult]]),
      getNotice: () => '\n\nUpdate available!',
    }));
    expect(res).toBe(moduleResult);
  });

  it('degrades a throwing module tool to a structured error, not a protocol error', async () => {
    const res = await dispatchCallTool('mod_tool', {}, deps({
      moduleHandlers: new Map([['mod_tool', async () => { throw new Error('CANVAS_NOT_CONFIGURED: run setup_canvas'); }]]),
    }));
    expect(res.isError).toBe(true);
    expect(JSON.parse((res.content[0] as { text: string }).text).error).toContain('CANVAS_NOT_CONFIGURED');
  });

  it('appends the notice to core tool results', async () => {
    const res = await dispatchCallTool('core_tool', {}, deps({
      runCoreTool: async () => ({ handled: true, result: { ok: true } }),
      getNotice: () => '\n\nUpdate available!',
    }));
    expect(res.isError).toBeUndefined();
    const text = (res.content[0] as { text: string }).text;
    expect(text).toContain('"ok": true');
    expect(text.endsWith('Update available!')).toBe(true);
  });

  it('returns a structured Unknown tool error without the notice', async () => {
    const res = await dispatchCallTool('nope', {}, deps({ getNotice: () => 'NOTICE' }));
    expect(res.isError).toBe(true);
    const text = (res.content[0] as { text: string }).text;
    expect(JSON.parse(text).error).toBe('Unknown tool: nope');
    expect(text).not.toContain('NOTICE');
  });

  it('degrades a throwing core tool to a structured error', async () => {
    const res = await dispatchCallTool('core_tool', {}, deps({
      runCoreTool: async () => { throw new Error('boom'); },
    }));
    expect(res.isError).toBe(true);
    expect(JSON.parse((res.content[0] as { text: string }).text).error).toBe('boom');
  });

  it('passes name and args through to the core switch', async () => {
    const seen: Array<[string, unknown]> = [];
    await dispatchCallTool('core_tool', { a: 1 }, deps({
      runCoreTool: async (name, args) => { seen.push([name, args]); return { handled: true, result: null }; },
    }));
    expect(seen).toEqual([['core_tool', { a: 1 }]]);
  });
});
