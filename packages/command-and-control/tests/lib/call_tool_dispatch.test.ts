import { describe, it, expect } from 'vitest';
import { appendNotice } from '../../src/lib/append_notice.js';
import { dispatchSurface } from '../../src/surface/dispatch.js';
import { buildRegistry } from '../../src/surface/registry.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

describe('appendNotice (shipped CallTool notice)', () => {
  it('appends the notice as an extra content block on a success result, including module-tool results', () => {
    const result: CallToolResult = { content: [{ type: 'text', text: 'module says hi' }] };
    const out = appendNotice(result, '\n\nUpdate available!');
    expect(out).not.toBe(result);
    expect(out.isError).toBeUndefined();
    expect(out.content).toEqual([
      { type: 'text', text: 'module says hi' },
      { type: 'text', text: '\n\nUpdate available!' },
    ]);
  });

  it('appends the notice to an isError result, preserving isError', () => {
    const result: CallToolResult = {
      content: [{ type: 'text', text: JSON.stringify({ error: 'Unknown tool: nope' }) }],
      isError: true,
    };
    const out = appendNotice(result, 'NOTICE');
    expect(out.isError).toBe(true);
    expect((out.content[0] as { text: string }).text).toContain('Unknown tool: nope');
    expect(out.content[1]).toEqual({ type: 'text', text: 'NOTICE' });
  });

  it('returns the original result when there is no notice', () => {
    const result: CallToolResult = { content: [{ type: 'text', text: 'ok' }], isError: true };
    expect(appendNotice(result, '')).toBe(result);
  });

  it('an unknown-tool dispatchSurface result still receives the notice', async () => {
    const dispatched = await dispatchSurface(buildRegistry(), 'nope', {});
    expect(dispatched.isError).toBe(true);
    const out = appendNotice(dispatched, 'NOTICE');
    expect(out.isError).toBe(true);
    const texts = out.content.map((c) => ('text' in c ? c.text : ''));
    expect(texts.some((t) => t.includes('Unknown tool: nope'))).toBe(true);
    expect(texts[texts.length - 1]).toBe('NOTICE');
  });
});
