import { describe, expect, it, vi } from 'vitest';
import { StitchAdapter } from '../../src/layout/stitch_adapter.js';

describe('StitchAdapter', () => {
  it('logs no-api status and points callers to paste_layout', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    try {
      await expect(
        new StitchAdapter().generateLayout({
          intent: 'Create a comparison page for AI strategy frameworks.',
          desiredSlots: ['hero', 'comparison'],
        }),
      ).rejects.toThrow('paste_layout MCP tool');

      expect(warnSpy).toHaveBeenCalledWith(
        'Stitch API not yet available. Use paste_layout tool instead.',
      );
    } finally {
      warnSpy.mockRestore();
    }
  });
});
