import type { BrandKit, BrandKitInput } from './brand_adapter.js';
import type { BrandAdapter } from './brand_adapter.js';

const DEFAULT_KIT: BrandKit = {
  name: 'manual-brand-kit',
  colors: {
    primary: '#1d4ed8',
    accent: '#f59e0b',
    background: '#ffffff',
    text: '#1f2937',
    muted: '#6b7280',
  },
  typography: {
    headingFontStack: 'Inter, Arial, sans-serif',
    bodyFontStack: 'Inter, Arial, sans-serif',
    headingWeight: '700',
    bodyWeight: '400',
  },
  imageStyle: {
    descriptor: 'Clean editorial education imagery with natural light and authentic classroom context.',
    avoid: ['generic stock photography', 'illegible text in images'],
  },
  voice: {
    tone: 'Clear, practical, and supportive',
    formality: 'mixed',
    avoid: ['unnecessary jargon', 'overly promotional language'],
  },
  source: {
    adapter: 'manual',
    rawInput: {},
    fetchedAt: new Date(0).toISOString(),
  },
};

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const FORMALITIES = new Set<BrandKit['voice']['formality']>(['casual', 'mixed', 'formal']);

export class ManualAdapter implements BrandAdapter {
  async generateBrandKit(input: BrandKitInput): Promise<BrandKit> {
    if (!input.kit || typeof input.kit !== 'object') {
      throw new Error('ManualAdapter requires input.kit');
    }

    const kit = mergeWithDefaults(input.kit, input);
    const errors = validateBrandKit(kit);

    if (errors.length > 0) {
      throw new Error(`Invalid BrandKit: ${errors.join('; ')}`);
    }

    return kit;
  }
}

export function mergeWithDefaults(partial: Partial<BrandKit>, rawInput: BrandKitInput): BrandKit {
  return {
    name: partial.name ?? DEFAULT_KIT.name,
    colors: {
      ...DEFAULT_KIT.colors,
      ...partial.colors,
    },
    typography: {
      ...DEFAULT_KIT.typography,
      ...partial.typography,
    },
    imageStyle: {
      descriptor: partial.imageStyle?.descriptor ?? DEFAULT_KIT.imageStyle.descriptor,
      avoid: partial.imageStyle?.avoid ?? DEFAULT_KIT.imageStyle.avoid,
    },
    voice: {
      tone: partial.voice?.tone ?? DEFAULT_KIT.voice.tone,
      formality: partial.voice?.formality ?? DEFAULT_KIT.voice.formality,
      avoid: partial.voice?.avoid ?? DEFAULT_KIT.voice.avoid,
    },
    source: {
      adapter: 'manual',
      rawInput,
      fetchedAt: new Date().toISOString(),
    },
  };
}

export function validateBrandKit(kit: BrandKit): string[] {
  const errors: string[] = [];

  if (!kit.name.trim()) {
    errors.push('name must be a non-empty string');
  }

  for (const [name, value] of Object.entries(kit.colors)) {
    if (!HEX_COLOR.test(value)) {
      errors.push(`colors.${name} must be a 6-digit hex color`);
    }
  }

  for (const [name, value] of Object.entries(kit.typography)) {
    if (!value.trim()) {
      errors.push(`typography.${name} must be a non-empty string`);
    }
  }

  if (!kit.imageStyle.descriptor.trim()) {
    errors.push('imageStyle.descriptor must be a non-empty string');
  }

  if (!Array.isArray(kit.imageStyle.avoid)) {
    errors.push('imageStyle.avoid must be an array');
  }

  if (!kit.voice.tone.trim()) {
    errors.push('voice.tone must be a non-empty string');
  }

  if (!FORMALITIES.has(kit.voice.formality)) {
    errors.push('voice.formality must be casual, mixed, or formal');
  }

  if (!Array.isArray(kit.voice.avoid)) {
    errors.push('voice.avoid must be an array');
  }

  return errors;
}
