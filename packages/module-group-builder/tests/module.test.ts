import { describe, it, expect } from 'vitest';
import { isCanvasToolchainModule } from '@canvas-toolchain/module-contract';
import mod from '../src/index.js';

describe('group-builder module', () => {
  it('satisfies the contract', () => { expect(isCanvasToolchainModule(mod)).toBe(true); });
  it('id, name, and the three tools', () => {
    expect(mod.id).toBe('group-builder');
    const names = mod.tools.map((t) => t.schema.name);
    expect(names).toEqual(expect.arrayContaining(['create_groups', 'record_groups', 'propose_major_buckets']));
  });
});
