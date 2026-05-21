import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import {
  loadTemplate,
  loadTheme,
  loadPromptSet,
  loadBundle,
  resolveResourcePath
} from '../src/utils/registry.js';

describe('Registry Loader', () => {
  let tmpHome: string;
  let originalCcHome: string | undefined;

  beforeEach(() => {
    originalCcHome = process.env.CC_HOME;
    tmpHome = mkdtempSync(join(tmpdir(), 'cds-registry-test-'));
    process.env.CC_HOME = tmpHome;
  });

  afterEach(() => {
    if (originalCcHome !== undefined) {
      process.env.CC_HOME = originalCcHome;
    } else {
      delete process.env.CC_HOME;
    }
    rmSync(tmpHome, { recursive: true, force: true });
  });

  it('falls back to local seed templates when registry home is empty', () => {
    // Should successfully load seed 'overview' template
    const template = loadTemplate('overview');
    expect(template).toBeDefined();
    expect(template.manifest.id).toBe('overview');
    expect(template.manifest.version).toBe('1.0.0');
    expect(template.structureHtml).toContain('{{slot:hero}}');
    expect(template.slotsJson.hero).toBeDefined();
    expect(template.slotsJson.hero.required).toBe(true);

    // Should successfully load default theme
    const theme = loadTheme('cds-default');
    expect(theme).toBeDefined();
    expect(theme.manifest.id).toBe('cds-default');
    expect(theme.themeJson.colors.primary).toBe('#002F6C');

    // Should successfully load default prompt set
    const promptSet = loadPromptSet('cds-default');
    expect(promptSet).toBeDefined();
    expect(promptSet.manifest.id).toBe('cds-default');
    expect(promptSet.promptsJson.hero).toBeDefined();
  });

  it('loads from custom CC_HOME registry with priority over seed templates', () => {
    // Create a custom overview template under CC_HOME
    const customTemplateDir = join(tmpHome, 'registry', 'template', 'overview@2.0.0');
    mkdirSync(customTemplateDir, { recursive: true });

    const manifest = {
      schemaVersion: 1,
      kind: 'template',
      id: 'overview',
      version: '2.0.0',
      tier: 'free',
      slots: ['hero', 'callout'],
      tags: ['custom'],
      files: ['structure.html', 'slots.json']
    };
    const structureHtml = 'Custom structure: {{slot:hero}} {{slot:callout}}';
    const slotsJson = { hero: { required: true }, callout: { required: false } };

    writeFileSync(join(customTemplateDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
    writeFileSync(join(customTemplateDir, 'structure.html'), structureHtml);
    writeFileSync(join(customTemplateDir, 'slots.json'), JSON.stringify(slotsJson, null, 2));

    // Load template overview (which should resolve version 2.0.0 because it is in CC_HOME and has latest version prefix)
    const template = loadTemplate('overview');
    expect(template).toBeDefined();
    expect(template.manifest.version).toBe('2.0.0');
    expect(template.structureHtml).toBe(structureHtml);
    expect(template.slotsJson.callout.required).toBe(false);

    // Load with explicit version
    const seedTemplate = loadTemplate('overview', '1.0.0');
    expect(seedTemplate).toBeDefined();
    expect(seedTemplate.manifest.version).toBe('1.0.0');
  });

  it('throws an error if the resource is completely missing', () => {
    expect(() => loadTemplate('nonexistent-template')).toThrow(/not found/);
    expect(() => loadTheme('nonexistent-theme')).toThrow(/not found/);
    expect(() => loadPromptSet('nonexistent-prompt')).toThrow(/not found/);
    expect(() => loadBundle('nonexistent-bundle')).toThrow(/not found/);
  });
});
