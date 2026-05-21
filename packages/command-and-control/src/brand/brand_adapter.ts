import type { BrandKit, BrandKitInput } from '@canvas-toolchain/shared-types';

export type { BrandKit, BrandKitInput };

export interface BrandAdapter {
  generateBrandKit(input: BrandKitInput): Promise<BrandKit>;
}
