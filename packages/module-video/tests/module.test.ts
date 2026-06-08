import { describe, it, expect } from 'vitest';
import videoModule from '../src/index.js';
import { isCanvasToolchainModule } from '@canvas-toolchain/module-contract';

describe('video module', () => {
  it('satisfies the module contract', () => {
    expect(isCanvasToolchainModule(videoModule)).toBe(true);
    expect(videoModule.id).toBe('video');
    expect(videoModule.handles).toContain('panopto');
    expect(videoModule.tools.length).toBeGreaterThanOrEqual(8);
  });
});
