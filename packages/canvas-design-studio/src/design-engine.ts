import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { InstitutionConfig } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function resolveTokens(template: string, config: InstitutionConfig): string {
  const tokens: Record<string, string> = {
    '{{institution.name}}': config.institution,
    '{{colors.primary}}': config.colors.primary,
    '{{colors.primaryDark}}': config.colors.primaryDark,
    '{{colors.primaryLight}}': config.colors.primaryLight,
    '{{colors.secondary}}': config.colors.secondary,
  };
  return Object.entries(tokens).reduce(
    (html, [token, value]) => html.replaceAll(token, value),
    template
  );
}

export function loadTemplate(name: string): string {
  const templatePath = join(__dirname, 'templates', `${name}.html`);
  return readFileSync(templatePath, 'utf-8');
}

export function applyTemplate(templateName: string, config: InstitutionConfig): string {
  const template = loadTemplate(templateName);
  return resolveTokens(template, config);
}
