import { describe, expect, it } from 'vitest';
import { PasteAdapter } from '../../src/layout/paste_adapter.js';

describe('PasteAdapter', () => {
  it('rejects direct layout generation and points callers to paste_layout', async () => {
    const adapter = new PasteAdapter();

    await expect(
      adapter.generateLayout({
        intent: 'Create a timeline for AI governance cases.',
        desiredSlots: ['hero', 'body'],
      }),
    ).rejects.toThrow(
      'PasteAdapter is fulfilled via the paste_layout MCP tool',
    );
  });
});
