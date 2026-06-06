import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderPreview } from '../../src/tools/showcase/render_preview.js';
import { loadCatalogFromPath } from '../../src/tools/showcase/catalog.js';

let tmpHome: string;
let yamlPath: string;
const ORIGINAL_CC_HOME = process.env.CC_HOME;

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'showcase-render-'));
  process.env.CC_HOME = tmpHome;
  yamlPath = join(tmpHome, 'cat.yaml');
});

afterEach(() => {
  rmSync(tmpHome, { recursive: true, force: true });
  if (ORIGINAL_CC_HOME === undefined) delete process.env.CC_HOME;
  else process.env.CC_HOME = ORIGINAL_CC_HOME;
});

const YAML = `
version: 1
updated: "2026-06-05"
categories:
  - id: information
    name: Information
    description: facts
patterns:
  - id: comparison-card
    name: Comparison Card
    category: information
    supportStatus: supported
    description: Side-by-side comparison.
    whenToUse: X vs Y content.
    notes: Uses inline CSS only.
    exampleHtml: |
      <table style="width:100%;"><tr><td>A</td><td>B</td></tr></table>
  - id: tabbed-layout-target
    name: Tabs
    category: information
    supportStatus: aspirational
    description: Tabs via CSS :target.
    whenToUse: 3-5 parallel sections.
    exampleHtml: |
      <p>tabs go here</p>
`;

describe('renderPreview', () => {
  it('writes preview HTML to ~/.command-and-control/showcase-previews/<id>.html', () => {
    writeFileSync(yamlPath, YAML);
    const catalog = loadCatalogFromPath(yamlPath);

    const result = renderPreview(catalog, 'comparison-card');

    expect(result.patternId).toBe('comparison-card');
    expect(result.previewPath).toBe(join(tmpHome, 'showcase-previews', 'comparison-card.html'));
    expect(existsSync(result.previewPath)).toBe(true);
  });

  it('HTML contains the pattern name, description, whenToUse, and exampleHtml', () => {
    writeFileSync(yamlPath, YAML);
    const catalog = loadCatalogFromPath(yamlPath);

    const result = renderPreview(catalog, 'comparison-card');
    const html = readFileSync(result.previewPath, 'utf-8');

    expect(html).toContain('<title>Comparison Card');
    expect(html).toContain('<h1>Comparison Card</h1>');
    expect(html).toContain('Side-by-side comparison.');
    expect(html).toContain('X vs Y content.');
    expect(html).toContain('Uses inline CSS only.');
    expect(html).toContain('<table style="width:100%;"><tr><td>A</td><td>B</td></tr></table>');
  });

  it('applies the status-supported class for supported patterns', () => {
    writeFileSync(yamlPath, YAML);
    const catalog = loadCatalogFromPath(yamlPath);

    const result = renderPreview(catalog, 'comparison-card');
    const html = readFileSync(result.previewPath, 'utf-8');

    expect(html).toMatch(/class="status status-supported"/);
  });

  it('applies the status-aspirational class for aspirational patterns', () => {
    writeFileSync(yamlPath, YAML);
    const catalog = loadCatalogFromPath(yamlPath);

    const result = renderPreview(catalog, 'tabbed-layout-target');
    const html = readFileSync(result.previewPath, 'utf-8');

    expect(html).toMatch(/class="status status-aspirational"/);
  });

  it('omits the notes block when the pattern has no notes field', () => {
    writeFileSync(yamlPath, YAML);
    const catalog = loadCatalogFromPath(yamlPath);

    const result = renderPreview(catalog, 'tabbed-layout-target');
    const html = readFileSync(result.previewPath, 'utf-8');

    expect(html).not.toMatch(/<strong>Note:<\/strong>/);
  });

  it('overwrites cleanly on repeated render', () => {
    writeFileSync(yamlPath, YAML);
    const catalog = loadCatalogFromPath(yamlPath);

    const first = renderPreview(catalog, 'comparison-card');
    const second = renderPreview(catalog, 'comparison-card');

    expect(first.previewPath).toBe(second.previewPath);
    expect(existsSync(first.previewPath)).toBe(true);
  });

  it('throws PATTERN_NOT_FOUND when patternId is not in the catalog', () => {
    writeFileSync(yamlPath, YAML);
    const catalog = loadCatalogFromPath(yamlPath);

    expect(() => renderPreview(catalog, 'no-such-pattern')).toThrow(/PATTERN_NOT_FOUND/);
  });

  it('escapes HTML special characters in metadata fields (description, whenToUse, name) but passes exampleHtml through raw', () => {
    const yamlWithSpecials = `
version: 1
updated: "2026-06-05"
categories:
  - id: information
    name: Information
    description: facts
patterns:
  - id: xss-test
    name: 'Name <with> "quotes" & ampersand'
    category: information
    supportStatus: supported
    description: 'Description with <em>tags</em> in it'
    whenToUse: 'When you want & cool things'
    exampleHtml: |
      <strong>raw html should pass through</strong>
`;
    writeFileSync(yamlPath, yamlWithSpecials);
    const catalog = loadCatalogFromPath(yamlPath);

    const result = renderPreview(catalog, 'xss-test');
    const html = readFileSync(result.previewPath, 'utf-8');

    expect(html).toContain('Name &lt;with&gt; &quot;quotes&quot; &amp; ampersand');
    expect(html).toContain('Description with &lt;em&gt;tags&lt;/em&gt; in it');
    expect(html).toContain('When you want &amp; cool things');
    expect(html).toContain('<strong>raw html should pass through</strong>');
  });
});
