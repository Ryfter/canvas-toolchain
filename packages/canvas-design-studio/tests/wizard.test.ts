import { describe, expect, it } from 'vitest';
import { formatSetupSummary, formatWorksheetSummary } from '../src/wizard.js';
import type { InstitutionConfig } from '../src/types.js';
import type { WizardDefaults } from '../src/utils/worksheet.js';

const baseConfig: InstitutionConfig = {
  institution: 'Boise State University',
  colors: {
    primary: '#0033A0',
    primaryDark: '#002277',
    primaryLight: '#E6ECF9',
    secondary: '#D64309',
  },
  canvasUrl: 'https://boisestate.instructure.com',
  apiToken: 'test-token-abcdefg',
};

describe('formatSetupSummary', () => {
  it('includes the institution name in the heading', () => {
    expect(formatSetupSummary(baseConfig)).toContain('Boise State University');
  });

  it('shows API token as configured when present', () => {
    expect(formatSetupSummary(baseConfig)).toContain('✓ configured');
  });

  it('shows API token as not configured when empty', () => {
    const config = { ...baseConfig, apiToken: '' };
    expect(formatSetupSummary(config)).toContain('not configured');
  });

  it('shows Panopto as not configured when absent', () => {
    expect(formatSetupSummary(baseConfig)).toContain('⚪ Panopto');
  });

  it('shows Panopto domain when configured', () => {
    const config = {
      ...baseConfig,
      panopto: { domain: 'bsu.hosted.panopto.com', iframeWhitelisted: true as const },
    };
    expect(formatSetupSummary(config)).toContain('bsu.hosted.panopto.com');
  });

  it('includes the brand URL row when set', () => {
    const config = { ...baseConfig, brandUrl: 'https://www.boisestate.edu/brand/' };
    expect(formatSetupSummary(config)).toContain('https://www.boisestate.edu/brand/');
  });

  it('omits the brand URL row when not set', () => {
    expect(formatSetupSummary(baseConfig)).not.toContain('Brand URL');
  });

  it('includes the save-to-file tip', () => {
    expect(formatSetupSummary(baseConfig)).toContain('my-canvas-setup.md');
  });

  it('shows publish tool as active when API token is set', () => {
    expect(formatSetupSummary(baseConfig)).toContain('✓ Publish directly to Canvas');
  });

  it('shows publish tool as inactive when API token is absent', () => {
    const config = { ...baseConfig, apiToken: undefined };
    expect(formatSetupSummary(config)).toContain('⚪ Publish directly to Canvas');
  });
});

describe('formatWorksheetSummary', () => {
  it('includes the "Values from your setup worksheet" header', () => {
    const result = formatWorksheetSummary({ institution: 'Boise State University' });
    expect(result).toContain('Values from your setup worksheet');
  });

  it('shows API token as ✓ (provided), not the raw value', () => {
    const result = formatWorksheetSummary({ apiToken: 'supersecrettoken' });
    expect(result).toContain('✓ (provided)');
    expect(result).not.toContain('supersecrettoken');
  });

  it('omits fields that are not present in defaults', () => {
    const result = formatWorksheetSummary({ institution: 'BSU' });
    expect(result).not.toContain('Brand URL');
    expect(result).not.toContain('Canvas URL');
    expect(result).not.toContain('Panopto');
  });

  it('shows all provided fields', () => {
    const result = formatWorksheetSummary({
      institution: 'Boise State University',
      primaryColor: '#0033A0',
      canvasUrl: 'https://boisestate.instructure.com',
    });
    expect(result).toContain('Boise State University');
    expect(result).toContain('#0033A0');
    expect(result).toContain('boisestate.instructure.com');
  });

  it('includes the "Press Enter to accept" instruction', () => {
    const result = formatWorksheetSummary({ institution: 'BSU' });
    expect(result).toContain('Press Enter to accept each value');
  });

  it('shows panoptoClientId when provided', () => {
    const result = formatWorksheetSummary({ panoptoClientId: 'myclientid123' });
    expect(result).toContain('myclientid123');
  });

  it('does not leak panoptoClientSecret in the summary', () => {
    const result = formatWorksheetSummary({ panoptoClientSecret: 'topsecret' });
    expect(result).not.toContain('topsecret');
  });
});
