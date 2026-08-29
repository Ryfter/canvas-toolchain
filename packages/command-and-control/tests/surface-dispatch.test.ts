import { describe, expect, it } from 'vitest';
import { dispatchSurface } from '../src/surface/dispatch.js';
import { buildRegistry } from '../src/surface/registry.js';

describe('dispatch', () => {
  it('routes an unknown tool name to a tool error, not a throw', async () => {
    const res = await dispatchSurface(buildRegistry(), 'nope', {});
    expect(res.isError).toBe(true);
    const body = JSON.parse(res.content[0].text as string);
    expect(body.validTools).toContain('ct_advanced');
  });

  it('routes ct_advanced to the sidecar', async () => {
    const res = await dispatchSurface(buildRegistry(), 'ct_advanced', { action: 'describe' });
    expect(res.isError).toBeFalsy();
  });

  it('surfaces a handler throw as a tool error rather than propagating', async () => {
    const reg = buildRegistry();
    reg.set('boom', {
      id: 'boom', section: 'admin', description: 'x', inputSchema: { type: 'object' },
      handler: () => { throw new Error('kaboom'); },
      taskCategory: 'none', exposure: 'intent', intentTool: 'ct_setup', intentAction: 'boom',
    });
    const res = await dispatchSurface(reg, 'ct_setup', { action: 'boom', params: {} });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('kaboom');
  });

  // Added on controller instruction beyond the brief's 3-test scope: the
  // catch boundary in dispatchSurface protects both the intent path (above)
  // and the advanced path (here) — a mechanism-level guarantee should have
  // a committed regression test on each path it protects.
  it('surfaces a handler throw via ct_advanced as a tool error rather than propagating', async () => {
    const reg = buildRegistry();
    reg.set('boom-adv', {
      id: 'boom-adv', section: 'admin', description: 'x', inputSchema: { type: 'object' },
      handler: () => { throw new Error('kaboom-adv'); },
      taskCategory: 'none', exposure: 'advanced',
    });
    const res = await dispatchSurface(reg, 'ct_advanced', { action: 'run', operation: 'boom-adv', params: {} });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('kaboom-adv');
  });

  // Controller-directed fix verification (2026-08-28 review, Minor finding):
  // `name in INTENT_TOOLS` on a plain object literal matches inherited
  // Object.prototype keys ('toString', 'constructor', 'hasOwnProperty', ...).
  // dispatchSurface is the boundary that receives arbitrary, untrusted tool
  // names, so a prototype-chain hole here must not route into runIntent.
  it.each(['toString', 'constructor'])(
    'treats prototype key %s as an unknown tool, not a routable one',
    async (name) => {
      const res = await dispatchSurface(buildRegistry(), name, {});
      expect(res.isError).toBe(true);
      const text = res.content[0].text as string;
      const body = JSON.parse(text);
      expect(body.validTools).toBeDefined();
      expect(text).not.toContain('undefined');
    },
  );
});
