import type { BrandAdapter, BrandKit, BrandKitInput } from './brand_adapter.js';
import { ManualAdapter } from './manual_adapter.js';

export const POMELLI_NO_API_MESSAGE = 'Pomelli API not yet available. Using ManualAdapter as fallback.';

export class PomelliAdapter implements BrandAdapter {
  constructor(private readonly fallback: BrandAdapter = new ManualAdapter()) {}

  async generateBrandKit(input: BrandKitInput): Promise<BrandKit> {
    console.warn(POMELLI_NO_API_MESSAGE);
    return this.fallback.generateBrandKit(input);
  }
}
