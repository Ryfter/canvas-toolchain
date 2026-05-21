import { describe, expect, it, vi } from 'vitest';
import { PomelliAdapter } from '../../src/brand/pomelli_adapter.js';
import type { BrandAdapter, BrandKit, BrandKitInput } from '../../src/brand/brand_adapter.js';

describe('PomelliAdapter', () => {
  it('logs no-api status and delegates to the fallback adapter', async () => {
    const fallbackResult: BrandKit = {
      name: 'fallback-kit',
      colors: {
        primary: '#111111',
        accent: '#222222',
        background: '#ffffff',
        text: '#333333',
        muted: '#666666',
      },
      typography: {
        headingFontStack: 'Inter, sans-serif',
        bodyFontStack: 'Inter, sans-serif',
        headingWeight: '700',
        bodyWeight: '400',
      },
      imageStyle: {
        descriptor: 'Editorial campus photography.',
        avoid: [],
      },
      voice: {
        tone: 'Direct',
        formality: 'mixed',
        avoid: [],
      },
      source: {
        adapter: 'manual',
        rawInput: {},
        fetchedAt: new Date('2026-05-21T00:00:00.000Z').toISOString(),
      },
    };
    const fallback: BrandAdapter = {
      generateBrandKit: vi.fn().mockResolvedValue(fallbackResult),
    };
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const input: BrandKitInput = { kit: { name: 'fallback-kit' } };

    try {
      const result = await new PomelliAdapter(fallback).generateBrandKit(input);

      expect(result).toBe(fallbackResult);
      expect(fallback.generateBrandKit).toHaveBeenCalledWith(input);
      expect(warnSpy).toHaveBeenCalledWith(
        'Pomelli API not yet available. Using ManualAdapter as fallback.',
      );
    } finally {
      warnSpy.mockRestore();
    }
  });
});
