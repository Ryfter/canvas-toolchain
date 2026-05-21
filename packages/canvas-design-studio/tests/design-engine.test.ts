import { describe, it, expect } from 'vitest';
import { resolveTokens } from '../src/design-engine.js';
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

describe('resolveTokens', () => {
  it('replaces institution name token', () => {
    const result = resolveTokens('Welcome to {{institution.name}}', config);
    expect(result).toBe('Welcome to Test University');
  });

  it('replaces all color tokens', () => {
    const template = 'background:{{colors.primary}};border:{{colors.primaryDark}};bg:{{colors.primaryLight}};accent:{{colors.secondary}}';
    const result = resolveTokens(template, config);
    expect(result).toBe('background:#0033A0;border:#002277;bg:#E6ECF9;accent:#D64309');
  });

  it('replaces multiple occurrences of the same token', () => {
    const result = resolveTokens('{{colors.primary}} and {{colors.primary}}', config);
    expect(result).toBe('#0033A0 and #0033A0');
  });

  it('leaves unknown tokens unchanged', () => {
    const result = resolveTokens('{{unknown.token}}', config);
    expect(result).toBe('{{unknown.token}}');
  });
});
