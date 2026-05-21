import { describe, expect, it } from 'vitest';
import { validateThemeResource, type ThemeResource } from '../../src/resources/theme.js';

const validTheme: ThemeResource = {
  manifest: {
    schemaVersion: 1,
    kind: 'theme',
    id: 'academic-modern',
    version: '1.0.0',
    compatibleSlots: ['hero', 'intro', 'comparison', 'x-business-case'],
    tags: ['academic', 'modern'],
    tier: 'free',
  },
  themeJson: {
    colors: {
      primary: '#184e77',
      accent: '#f9c74f',
    },
    typography: {
      headingFontStack: 'Inter, sans-serif',
      bodyFontStack: 'Source Sans 3, sans-serif',
    },
    slotStyles: {
      hero: {
        css: '.hero { color: var(--primary); }',
        imagePrompt: 'AI course hero image about {{topic}} for {{semester}} using {{colors.primary}}.',
      },
      intro: {
        css: '.intro { max-width: 72ch; }',
        imagePrompt: 'Intro image about {{topic}}.',
      },
    },
    globalCss: ':root { --primary: #184e77; }',
    imageAssets: {
      hero: 'assets/hero.png',
    },
  },
};

describe('theme schema validator', () => {
  it('accepts a valid theme resource', () => {
    expect(validateThemeResource(validTheme)).toEqual([]);
  });

  it('rejects missing manifest fields', () => {
    const invalid = {
      ...validTheme,
      manifest: { ...validTheme.manifest, compatibleSlots: [], tags: 'academic', tier: 'enterprise' },
    } as unknown as ThemeResource;

    expect(validateThemeResource(invalid)).toEqual(
      expect.arrayContaining([
        'manifest.compatibleSlots must be a non-empty array',
        'manifest.tags must be an array',
        'manifest.tier must be free or premium',
      ]),
    );
  });

  it('rejects slot styles outside compatibleSlots', () => {
    const invalid: ThemeResource = {
      ...validTheme,
      themeJson: {
        ...validTheme.themeJson,
        slotStyles: {
          ...validTheme.themeJson.slotStyles,
          footer: { css: '.footer {}', imagePrompt: 'Footer image for {{topic}}.' },
        },
      },
    };

    expect(validateThemeResource(invalid)).toContain(
      'theme.json.slotStyles key footer must be declared in manifest.compatibleSlots',
    );
  });

  it('requires css and imagePrompt for every slot style', () => {
    const invalid: ThemeResource = {
      ...validTheme,
      themeJson: {
        ...validTheme.themeJson,
        slotStyles: {
          hero: { css: '', imagePrompt: '' },
        },
      },
    };

    expect(validateThemeResource(invalid)).toEqual(
      expect.arrayContaining([
        'theme.json.slotStyles.hero.css must be a non-empty string',
        'theme.json.slotStyles.hero.imagePrompt must be a non-empty string',
      ]),
    );
  });

  it('validates image prompt placeholders and asset paths', () => {
    const invalid: ThemeResource = {
      ...validTheme,
      themeJson: {
        ...validTheme.themeJson,
        slotStyles: {
          hero: { css: '.hero {}', imagePrompt: 'Use {{courseName}} and {{colors.missing}}.' },
        },
        imageAssets: {
          hero: '../escape.png',
        },
      },
    };

    expect(validateThemeResource(invalid)).toEqual(
      expect.arrayContaining([
        'theme.json.slotStyles.hero.imagePrompt contains unsupported placeholder courseName',
        'theme.json.slotStyles.hero.imagePrompt references unknown color colors.missing',
        'theme.json.imageAssets.hero must be a safe relative asset path',
      ]),
    );
  });
});
