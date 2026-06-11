import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { InstitutionConfig } from '../src/types.js';

vi.mock('../src/config.js', () => ({
  configExists: vi.fn(),
  loadConfig: vi.fn(),
}));

import { configExists, loadConfig } from '../src/config.js';
import { getStarted } from '../src/tools/get-started.js';

const baseConfig: InstitutionConfig = {
  institution: 'Example University',
  colors: {
    primary: '#0033A0',
    primaryDark: '#002277',
    primaryLight: '#E6ECF9',
    secondary: '#D64309',
  },
  canvasUrl: 'https://example.instructure.com',
  apiToken: 'test-token-longerthantwenty',
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe('getStarted', () => {
  it('returns no-config text when institution.json is missing', () => {
    vi.mocked(configExists).mockReturnValue(false);
    const result = getStarted();
    expect(result).toContain('No institution config found');
    expect(result).toContain('setup_institution');
  });

  it('no-config text lists tools that work without setup', () => {
    vi.mocked(configExists).mockReturnValue(false);
    expect(getStarted()).toContain('generate_canvas_page');
    expect(getStarted()).toContain('setup_course');
  });

  it('returns partial-config text when API token is absent', () => {
    vi.mocked(configExists).mockReturnValue(true);
    vi.mocked(loadConfig).mockReturnValue({ ...baseConfig, apiToken: '' });
    const result = getStarted();
    expect(result).toContain('Add a Canvas API token');
    expect(result).not.toContain('fully configured');
  });

  it('partial-config text shows publishing tools as inactive', () => {
    vi.mocked(configExists).mockReturnValue(true);
    vi.mocked(loadConfig).mockReturnValue({ ...baseConfig, apiToken: '' });
    expect(getStarted()).toContain('⚪ list_canvas_courses');
    expect(getStarted()).toContain('⚪ publish_to_canvas');
  });

  it('returns full-config text when API token is present', () => {
    vi.mocked(configExists).mockReturnValue(true);
    vi.mocked(loadConfig).mockReturnValue(baseConfig);
    const result = getStarted();
    expect(result).toContain('fully configured');
    expect(result).toContain('Example University');
  });

  it('full-config text shows publishing tools as active', () => {
    vi.mocked(configExists).mockReturnValue(true);
    vi.mocked(loadConfig).mockReturnValue(baseConfig);
    expect(getStarted()).toContain('publish_to_canvas');
    expect(getStarted()).not.toContain('⚪ list_canvas_courses');
  });

  it('shows Panopto as active when configured', () => {
    vi.mocked(configExists).mockReturnValue(true);
    vi.mocked(loadConfig).mockReturnValue({
      ...baseConfig,
      panopto: { domain: 'example.hosted.panopto.com', iframeWhitelisted: true },
    });
    expect(getStarted()).toContain('✓ Panopto');
  });

  it('marks Panopto as optional when not configured', () => {
    vi.mocked(configExists).mockReturnValue(true);
    vi.mocked(loadConfig).mockReturnValue(baseConfig);
    expect(getStarted()).toContain('⚪ Panopto');
  });

  it('always includes a Context7 hint in all three states', () => {
    vi.mocked(configExists).mockReturnValue(false);
    expect(getStarted()).toContain('Context7');

    vi.mocked(configExists).mockReturnValue(true);
    vi.mocked(loadConfig).mockReturnValue({ ...baseConfig, apiToken: '' });
    expect(getStarted()).toContain('Context7');

    vi.mocked(loadConfig).mockReturnValue(baseConfig);
    expect(getStarted()).toContain('Context7');
  });

  it('no-config text mentions get_setup_worksheet', () => {
    vi.mocked(configExists).mockReturnValue(false);
    expect(getStarted()).toContain('get_setup_worksheet');
  });

  it('partial-config text mentions get_setup_worksheet', () => {
    vi.mocked(configExists).mockReturnValue(true);
    vi.mocked(loadConfig).mockReturnValue({ ...baseConfig, apiToken: '' });
    expect(getStarted()).toContain('get_setup_worksheet');
  });

  it('full-config text does not mention get_setup_worksheet', () => {
    vi.mocked(configExists).mockReturnValue(true);
    vi.mocked(loadConfig).mockReturnValue(baseConfig);
    expect(getStarted()).not.toContain('get_setup_worksheet');
  });
});
