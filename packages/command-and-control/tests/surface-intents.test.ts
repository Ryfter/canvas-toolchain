import { describe, expect, it } from 'vitest';
import { intentToolSchemas, runIntent, INTENT_TOOLS } from '../src/surface/intents/index.js';
import { buildRegistry } from '../src/surface/registry.js';

describe('intent tools', () => {
  it('produces exactly nine intent tools', () => {
    expect(intentToolSchemas(buildRegistry())).toHaveLength(9);
  });

  it('builds each action enum from the registry', () => {
    const setup = intentToolSchemas(buildRegistry()).find((t) => t.name === 'ct_setup')!;
    const actions = (setup.inputSchema as { properties: { action: { enum: string[] } } })
      .properties.action.enum;
    expect(actions).toContain('canvas');
    expect(actions).toContain('anthropic');
  });

  it('names its extending advanced section in every description', () => {
    for (const t of intentToolSchemas(buildRegistry())) {
      expect(t.description, `${t.name} should point at ct_advanced`).toContain('ct_advanced');
    }
  });

  it('returns a tool error listing valid actions for an unknown action', async () => {
    const res = await runIntent(buildRegistry(), 'ct_setup', { action: 'nope' });
    expect(res.isError).toBe(true);
    const body = JSON.parse(res.content[0].text as string);
    expect(body.validActions).toContain('canvas');
  });

  it('returns a clean tool error for an unknown tool name, with no "undefined" leakage', async () => {
    const res = await runIntent(buildRegistry(), 'not_a_real_tool', { action: 'nope' });
    expect(res.isError).toBe(true);
    const text = res.content[0].text as string;
    expect(text).not.toContain('undefined');
    const body = JSON.parse(text);
    expect(JSON.stringify(body)).not.toContain('undefined');
  });

  it('every registered intent action is reachable', async () => {
    const reg = buildRegistry();
    const schemas = intentToolSchemas(reg);
    for (const op of reg.values()) {
      if (op.exposure !== 'intent') continue;
      const tool = schemas.find((t) => t.name === op.intentTool);
      expect(tool, `${op.id} -> missing tool ${op.intentTool}`).toBeTruthy();
      const actions = (tool!.inputSchema as { properties: { action: { enum: string[] } } })
        .properties.action.enum;
      expect(actions, `${op.id} action not exposed`).toContain(op.intentAction);
    }
  });

  it('offers a describe action on every intent tool', () => {
    for (const t of intentToolSchemas(buildRegistry())) {
      const actions = (t.inputSchema as { properties: { action: { enum: string[] } } }).properties.action.enum;
      expect(actions, `${t.name}`).toContain('describe');
    }
  });

  it('describe returns the inputSchema for one action', async () => {
    const res = await runIntent(buildRegistry(), 'ct_publish', { action: 'describe', params: { of: 'publish' } });
    expect(res.isError).toBeFalsy();
    const body = JSON.parse(res.content[0].text as string);
    expect(body.operations.publish.inputSchema).toBeDefined();
    expect(JSON.stringify(body.operations.publish.inputSchema)).toContain('snapshotId');
  });

  it('describe with no target lists every action of that tool with its schema', async () => {
    const res = await runIntent(buildRegistry(), 'ct_ask', { action: 'describe' });
    const body = JSON.parse(res.content[0].text as string);
    expect(Object.keys(body.operations).length).toBeGreaterThan(0);
    for (const v of Object.values(body.operations) as { inputSchema?: unknown }[]) {
      expect(v.inputSchema).toBeDefined();
    }
  });

  it('rejects a non-object params', async () => {
    const res = await runIntent(buildRegistry(), 'ct_setup', { action: 'canvas', params: 7 as never });
    expect(res.isError).toBe(true);
  });

  it('rejects params missing a required field and returns the schema', async () => {
    const res = await runIntent(buildRegistry(), 'ct_setup', { action: 'canvas', params: {} });
    expect(res.isError).toBe(true);
    const body = JSON.parse(res.content[0].text as string);
    expect(JSON.stringify(body)).toMatch(/required/i);
    expect(body.inputSchema).toBeDefined();   // model self-corrects without a second round-trip
  });

  it('does not double-wrap a handler that already returns a CallToolResult', async () => {
    const reg = buildRegistry();
    reg.set('wrapped_op', {
      id: 'wrapped_op', section: 'admin', description: 'x', inputSchema: { type: 'object' },
      handler: async () => ({ content: [{ type: 'text' as const, text: 'inner failed' }], isError: true }),
      taskCategory: 'none', exposure: 'intent', intentTool: 'ct_setup', intentAction: 'wrapped',
    });
    const res = await runIntent(reg, 'ct_setup', { action: 'wrapped', params: {} });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toBe('inner failed');
  });
});
