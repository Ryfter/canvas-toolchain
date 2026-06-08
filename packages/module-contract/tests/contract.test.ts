import { describe, it, expect } from 'vitest';
import { isCanvasToolchainModule } from '../src/index.js';

describe('isCanvasToolchainModule', () => {
  it('accepts a well-formed module', () => {
    const m = { id: 'video', name: 'Lecture Video', description: 'd', version: '1.0.0', tools: [] };
    expect(isCanvasToolchainModule(m)).toBe(true);
  });
  it('rejects an object missing tools', () => {
    const m = { id: 'video', name: 'Lecture Video', description: 'd', version: '1.0.0' };
    expect(isCanvasToolchainModule(m)).toBe(false);
  });
});
