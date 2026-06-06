import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadCatalog, getPatternById, loadCatalogFromPath } from '../../src/tools/showcase/catalog.js';

let tmpDir: string;
let yamlPath: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'showcase-catalog-'));
  yamlPath = join(tmpDir, 'canvas-capabilities.yaml');
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

const VALID_YAML = `
version: 1
updated: "2026-06-05"
categories:
  - id: information
    name: Information
    description: facts and definitions
patterns:
  - id: comparison-card
    name: Comparison Card
    category: information
    supportStatus: supported
    description: Side-by-side comparison.
    whenToUse: X vs Y content.
    exampleHtml: |
      <table><tr><td>A</td><td>B</td></tr></table>
`;

describe('loadCatalogFromPath', () => {
  it('parses a valid YAML catalog and returns typed structure', () => {
    writeFileSync(yamlPath, VALID_YAML);
    const catalog = loadCatalogFromPath(yamlPath);
    expect(catalog.version).toBe(1);
    expect(catalog.updated).toBe('2026-06-05');
    expect(catalog.categories).toHaveLength(1);
    expect(catalog.categories[0].id).toBe('information');
    expect(catalog.patterns).toHaveLength(1);
    expect(catalog.patterns[0].id).toBe('comparison-card');
    expect(catalog.patterns[0].supportStatus).toBe('supported');
    expect(catalog.patterns[0].exampleHtml).toContain('<table>');
  });

  it('throws CATALOG_NOT_FOUND when file is absent', () => {
    expect(() => loadCatalogFromPath(join(tmpDir, 'missing.yaml')))
      .toThrow(/CATALOG_NOT_FOUND/);
  });

  it('throws CATALOG_INVALID on YAML parse failure', () => {
    writeFileSync(yamlPath, 'this: is: not: valid: yaml: structure');
    expect(() => loadCatalogFromPath(yamlPath)).toThrow(/CATALOG_INVALID/);
  });

  it('throws CATALOG_INVALID when pattern.category references an undefined category', () => {
    writeFileSync(yamlPath, `
version: 1
updated: "2026-06-05"
categories:
  - id: information
    name: Information
    description: facts
patterns:
  - id: orphan
    name: Orphan
    category: nonexistent
    supportStatus: supported
    description: x
    whenToUse: x
    exampleHtml: |
      <p>x</p>
`);
    expect(() => loadCatalogFromPath(yamlPath)).toThrow(/CATALOG_INVALID/);
  });

  it('throws CATALOG_INVALID when pattern.supportStatus is not in the allowed set', () => {
    writeFileSync(yamlPath, `
version: 1
updated: "2026-06-05"
categories:
  - id: information
    name: Information
    description: facts
patterns:
  - id: weird-status
    name: Weird
    category: information
    supportStatus: pondering
    description: x
    whenToUse: x
    exampleHtml: |
      <p>x</p>
`);
    expect(() => loadCatalogFromPath(yamlPath)).toThrow(/CATALOG_INVALID/);
  });

  it('throws CATALOG_INVALID when a required field is missing', () => {
    writeFileSync(yamlPath, `
version: 1
updated: "2026-06-05"
categories:
  - id: information
    name: Information
    description: facts
patterns:
  - id: missing-fields
    name: Missing
    category: information
    supportStatus: supported
`);
    expect(() => loadCatalogFromPath(yamlPath)).toThrow(/CATALOG_INVALID/);
  });
});

describe('getPatternById', () => {
  it('returns the matching pattern', () => {
    writeFileSync(yamlPath, VALID_YAML);
    const catalog = loadCatalogFromPath(yamlPath);
    const p = getPatternById(catalog, 'comparison-card');
    expect(p).not.toBeNull();
    expect(p!.name).toBe('Comparison Card');
  });

  it('returns null when id is not in the catalog', () => {
    writeFileSync(yamlPath, VALID_YAML);
    const catalog = loadCatalogFromPath(yamlPath);
    expect(getPatternById(catalog, 'nonexistent')).toBeNull();
  });
});

describe('loadCatalog', () => {
  it('uses the default packaged path and parses the shipped yaml', () => {
    const catalog = loadCatalog();
    expect(catalog.version).toBeGreaterThanOrEqual(1);
    expect(catalog.patterns.length).toBeGreaterThanOrEqual(8);
    // Sanity-check the canonical IDs ship as expected
    expect(getPatternById(catalog, 'comparison-card')).not.toBeNull();
    expect(getPatternById(catalog, 'rubric-help-callout')).not.toBeNull();
  });
});
