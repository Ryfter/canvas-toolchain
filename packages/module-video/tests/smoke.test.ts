import { describe, it, expect } from 'vitest';
import { MODULE_ID } from '../src/index.js';

describe('module-video', () => {
  it('exposes its module id', () => {
    expect(MODULE_ID).toBe('video');
  });
});
