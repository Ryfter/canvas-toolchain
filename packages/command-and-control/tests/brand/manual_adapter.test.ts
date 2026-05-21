import { describe, expect, it } from 'vitest';
import { ManualAdapter } from '../../src/brand/manual_adapter.js';
import type { BrandKit } from '@canvas-toolchain/shared-types';

describe('ManualAdapter', () => {
  it('fills missing BrandKit fields with stable defaults', async () => {
    const adapter = new ManualAdapter();

    const kit = await adapter.generateBrandKit({
      kit: {
        name: 'Carthage AI',
        colors: {
          primary: '#a00000',
          accent: '#f2c94c',
        },
        voice: {
          tone: 'Direct and practical',
        },
      },
    });

    expect(kit).toMatchObject({
      name: 'Carthage AI',
      colors: {
        primary: '#a00000',
        accent: '#f2c94c',
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
        tone: 'Direct and practical',
        formality: 'mixed',
        avoid: ['unnecessary jargon', 'overly promotional language'],
      },
      source: {
        adapter: 'manual',
      },
    });
    expect(kit.source.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(kit.source.rawInput.kit?.name).toBe('Carthage AI');
  });

  it('requires a manual kit payload', async () => {
    const adapter = new ManualAdapter();

    await expect(adapter.generateBrandKit({ description: 'No pasted kit' })).rejects.toThrow(
      'ManualAdapter requires input.kit',
    );
  });

  it('rejects malformed manual kit fields', async () => {
    const adapter = new ManualAdapter();

    await expect(
      adapter.generateBrandKit({
        kit: {
          colors: { primary: 'red' },
          voice: { formality: 'academic' as BrandKit['voice']['formality'] },
        },
      }),
    ).rejects.toThrow('Invalid BrandKit');
  });
});
