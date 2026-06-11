import { describe, it, expect, vi } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { renderPageDecoupled } from '../src/utils/render-engine.js';
import type { LlmClient } from '../src/course-types.js';

describe('renderPageDecoupled', () => {
  it('correctly compiles slots using mock LlmClient', async () => {
    const mockLlm: LlmClient = {
      complete: vi.fn().mockImplementation(async (prompt: string) => {
        if (prompt.includes('hero')) {
          return JSON.stringify({ title: 'Dynamic Title', subtitle: 'Dynamic Subtitle' });
        }
        return JSON.stringify({ content: 'Dynamic slot content compiled successfully' });
      }),
    };

    const config = {
      institution: 'University',
      courseName: 'Cloud Computing',
      courseNumber: 'CS 401',
      professor: 'Dr. Cloud',
      semester: 'Fall 2026',
      weeks: 15,
      pageTypes: ['overview', 'assignment'],
      layoutFixed: true,
      colors: {
        primary: '#002F6C',
        primaryDark: '#001E44',
        primaryLight: '#EBF2FA',
        secondary: '#FF6B6B',
      },
      heroImages: {},
      weekOutline: [],
    };

    const content = {
      pageType: 'overview' as const,
      frontMatter: {
        week: 1,
        title: 'Introduction to Cloud',
      },
      sections: {
        'Learning Objectives': 'Learn basic cloud concepts',
      },
    };

    const result = await renderPageDecoupled({
      templateId: 'overview',
      themeId: 'cds-default',
      promptSetId: 'cds-default',
      content,
      llmClient: mockLlm,
      config,
    });

    expect(result.finalHtml).toContain('Dynamic Title');
    expect(result.finalHtml).toContain('Dynamic slot content compiled successfully');
    expect(result.finalHtml).not.toContain('<script>');
  });

  it('correctly handles unresolved image prompts and asset overrides', async () => {
    const mockLlm: LlmClient = {
      complete: vi.fn().mockResolvedValue(JSON.stringify({ content: 'Mock' })),
    };

    const config = {
      institution: 'University',
      courseName: 'Cloud Computing',
      courseNumber: 'CS 401',
      professor: 'Dr. Cloud',
      semester: 'Fall 2026',
      weeks: 15,
      pageTypes: ['overview'],
      layoutFixed: true,
      colors: {
        primary: '#002F6C',
        primaryDark: '#001E44',
        primaryLight: '#EBF2FA',
        secondary: '#FF6B6B',
      },
      heroImages: {},
      weekOutline: [],
    };

    const content = {
      pageType: 'overview' as const,
      frontMatter: {
        week: 1,
        title: 'Introduction to Cloud',
      },
      sections: {},
    };

    // Render with no overrides, should return unresolved prompts for the hero image slot
    const result = await renderPageDecoupled({
      templateId: 'overview',
      themeId: 'cds-default',
      promptSetId: 'cds-default',
      content,
      llmClient: mockLlm,
      config,
    });

    expect(result.unresolvedImagePrompts).toBeDefined();
    expect(result.unresolvedImagePrompts['hero']).toBeDefined();

    // Render with override, should resolve the image slot and have no unresolved image prompt for 'hero'
    const resultOverride = await renderPageDecoupled({
      templateId: 'overview',
      themeId: 'cds-default',
      promptSetId: 'cds-default',
      content,
      llmClient: mockLlm,
      config,
      options: {
        imageAssets: {
          hero: 'http://example.com/custom-hero.png',
        },
      },
    });

    expect(resultOverride.unresolvedImagePrompts['hero']).toBeUndefined();
    expect(resultOverride.finalHtml).toContain('http://example.com/custom-hero.png');
  });
});
