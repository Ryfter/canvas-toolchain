import { describe, it, expect } from 'vitest';
import { isCanvasToolchainModule } from '@canvas-toolchain/module-contract';
import mod from '../src/index.js';

describe('oral-assessment module', () => {
  it('satisfies the module contract', () => {
    expect(isCanvasToolchainModule(mod)).toBe(true);
  });
  it('has the expected identity and handles rhetorix', () => {
    expect(mod.id).toBe('oral-assessment');
    expect(mod.name).toBe('Oral Assessment');
    expect(mod.handles).toContain('rhetorix');
    expect(mod.tools.map((t) => t.schema.name)).toContain('design_oral_assessment');
  });
});
