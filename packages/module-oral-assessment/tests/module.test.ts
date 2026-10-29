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

import { setModuleCtx } from '../src/ctx.js';

describe('contract v2', () => {
  it('declares v2 with a required anthropic credential', () => {
    expect(mod.contractVersion).toBe(2);
    expect(mod.credentials).toEqual([
      expect.objectContaining({ kind: 'anthropic', required: true }),
    ]);
  });
  it('tool fails with MODULE_NOT_INITIALIZED before init', async () => {
    setModuleCtx(undefined);
    await expect(
      mod.tools[0].handler({ assignmentBrief: 'x', outputPath: '/tmp/x.md' }),
    ).rejects.toThrow(/MODULE_NOT_INITIALIZED/);
  });
  it('init stores ctx so the tool gets past the init check', async () => {
    const ctx = {
      moduleId: 'oral-assessment',
      paths: { config: '/c', data: '/d', designStudioData: '/ds', secrets: '/s' },
      credentials: { get: async () => ({}), tryGet: async () => null },
    } as never;
    await mod.init!(ctx);
    await expect(
      mod.tools[0].handler({ assignmentBrief: 'x', outputPath: '/tmp/x.md' }),
    ).rejects.toThrow(/ANTHROPIC_NOT_CONFIGURED/);
    setModuleCtx(undefined);
  });
});
