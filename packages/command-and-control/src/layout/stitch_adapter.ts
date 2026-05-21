import type { LayoutAdapter, LayoutAdapterInput, RawLayoutOutput } from './layout_adapter.js';
import { PasteAdapter } from './paste_adapter.js';

export const STITCH_NO_API_MESSAGE = 'Stitch API not yet available. Use paste_layout tool instead.';

export class StitchAdapter implements LayoutAdapter {
  constructor(private readonly fallback: LayoutAdapter = new PasteAdapter()) {}

  async generateLayout(input: LayoutAdapterInput): Promise<RawLayoutOutput> {
    console.warn(STITCH_NO_API_MESSAGE);

    /*
     * Future API shape:
     * Request: { prompt: composePrompt(input.intent, input.desiredSlots, input.brandContext), format: 'html-css' }
     * Response: { html: string, css: string }
     * Return: RawLayoutOutput with source.adapter = 'stitch' and source.rawInput = input.
     */
    return this.fallback.generateLayout(input);
  }
}
