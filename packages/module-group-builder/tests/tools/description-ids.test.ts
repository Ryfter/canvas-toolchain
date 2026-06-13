import { describe, it, expect } from 'vitest';
import { STRATEGY_IDS } from '../../src/strategies/index.js';
import { groupBuilderTools } from '../../src/tools.js';

describe('create_groups description strategy ids', () => {
  const tool = groupBuilderTools.find((t) => t.schema.name === 'create_groups')!;
  const strategyProp = (tool.schema.inputSchema as {
    properties: { strategy: { description?: string } };
  }).properties.strategy;
  const combined = `${tool.schema.description ?? ''} ${strategyProp.description ?? ''}`;

  it('names every STRATEGY_IDS id (exact spelling) across the description + strategy prop', () => {
    for (const id of STRATEGY_IDS) {
      expect(combined).toContain(id);
    }
  });

  it('never uses the wrong camelCase id "majorDiversity"', () => {
    expect(combined).not.toContain('majorDiversity');
  });
});
