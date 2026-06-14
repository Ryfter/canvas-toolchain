import { describe, it, expect } from 'vitest';
import { isCanvasToolchainModule } from '@canvas-toolchain/module-contract';
import mod from '../src/index.js';

describe('module-peerassessment default export', () => {
  it('satisfies the module contract', () => {
    expect(isCanvasToolchainModule(mod)).toBe(true);
  });
  it('has id "peerassessment" and exposes its tool', () => {
    expect(mod.id).toBe('peerassessment');
    expect(mod.tools.map((t) => t.schema.name)).toEqual(['build_peerassessment_import']);
  });
});
