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
});
