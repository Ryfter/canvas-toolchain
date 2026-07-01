import { describe, it, expect } from 'vitest';
import { generateCanvasPage } from '../src/tools/generate.js';
import type { InstitutionConfig } from '../src/types.js';

const config: InstitutionConfig = {
  institution: 'Test University',
  colors: {
    primary: '#0033A0',
    primaryDark: '#002277',
    primaryLight: '#E6ECF9',
    secondary: '#D64309',
  },
  canvasUrl: 'https://test.instructure.com',
  apiToken: 'test-token',
};

const input = {
  assignmentBrief: 'Create a 5-minute video presentation about your passion project.\nInclude visuals and voiceover.\nUpload to YouTube when complete.',
  courseName: 'AI Augmented Projects',
  courseNumber: 'ITM 370',
  assignmentNumber: '16.06',
  professorName: 'Dr. Smith',
  semester: 'Fall 2026',
};

describe('generateCanvasPage', () => {
  it('returns html, heroImagePrompt, filename, warnings', async () => {
    const result = await generateCanvasPage(input, config);
    expect(result).toHaveProperty('html');
    expect(result).toHaveProperty('heroImagePrompt');
    expect(result).toHaveProperty('filename');
    expect(result).toHaveProperty('warnings');
  });

  it('injects institution primary color into html', async () => {
    const result = await generateCanvasPage(input, config);
    expect(result.html).toContain('#0033A0');
  });

  it('injects course number into html', async () => {
    const result = await generateCanvasPage(input, config);
    expect(result.html).toContain('ITM 370');
  });

  it('injects assignment number into html', async () => {
    const result = await generateCanvasPage(input, config);
    expect(result.html).toContain('16.06');
  });

  it('generates correct filename', async () => {
    const result = await generateCanvasPage(input, config);
    expect(result.filename).toBe('itm-370-16.06-page.html');
  });

  it('hero image prompt mentions course name', async () => {
    const result = await generateCanvasPage(input, config);
    expect(result.heroImagePrompt).toContain('AI Augmented Projects');
  });

  it('returns no warnings for clean generated html', async () => {
    const result = await generateCanvasPage(input, config);
    expect(result.warnings).toHaveLength(0);
  });

  it('does not contain <style> blocks', async () => {
    const result = await generateCanvasPage(input, config);
    expect(result.html).not.toMatch(/<style[\s>]/i);
  });

  it('does not contain opacity: property', async () => {
    const result = await generateCanvasPage(input, config);
    expect(result.html).not.toMatch(/(?:^|[;"\s])opacity\s*:/i);
  });

  it('appends a11y warning when secondary color fails contrast', async () => {
    const lowContrastConfig: InstitutionConfig = {
      ...config,
      colors: { ...config.colors, secondary: '#cccccc' },
    };
    const result = await generateCanvasPage(input, lowContrastConfig);
    expect(result.warnings.some(w => w.startsWith('a11y:'))).toBe(true);
  });

  it('attaches a conformance report to the generate result', async () => {
    const result = await generateCanvasPage(input, config);
    expect(result.conformance).toBeDefined();
    expect(['pass', 'borderline', 'fail']).toContain(result.conformance.verdict);
    expect(result.conformance.requiredLevel).toEqual({ version: '2.1', level: 'AA' });
  });
});
