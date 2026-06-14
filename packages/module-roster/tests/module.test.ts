import { describe, it, expect } from 'vitest';
import mod from '../src/index.js';
import { isCanvasToolchainModule } from '@canvas-toolchain/module-contract';

describe('module-roster', () => {
  it('default-exports a valid CanvasToolchainModule', () => {
    expect(isCanvasToolchainModule(mod)).toBe(true);
    expect(mod.id).toBe('roster');
  });

  it('exposes propose_roster, commit_roster, resolve_identity', () => {
    const names = mod.tools.map((t) => t.schema.name).sort();
    expect(names).toEqual(['commit_roster', 'propose_roster', 'resolve_identity']);
  });

  it('every tool description references that only commit_roster writes', () => {
    const propose = mod.tools.find((t) => t.schema.name === 'propose_roster')!;
    expect(propose.schema.description.toLowerCase()).toContain('writes nothing');
  });
});
