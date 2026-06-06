import { describe, expect, it } from 'vitest';
import { showCanvasCapabilities } from '../../../src/tools/showcase/show_canvas_capabilities.js';

describe('showCanvasCapabilities', () => {
  it('returns the catalog as markdown with two top-level sections', async () => {
    const result = await showCanvasCapabilities({});

    expect(result.catalogVersion).toBeGreaterThanOrEqual(1);
    expect(result.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.catalog).toContain('# Canvas Capabilities');
    expect(result.catalog).toContain('Currently Supported');
    expect(result.catalog).toContain('Aspirational');
    expect(result.patternIds.length).toBeGreaterThanOrEqual(8);
  });

  it('groups patterns by category within each section', async () => {
    const result = await showCanvasCapabilities({});
    expect(result.catalog).toMatch(/### Information/);
    expect(result.catalog).toMatch(/### Interactive/);
    expect(result.catalog).toMatch(/### Pedagogical/);
  });

  it('includes pattern IDs in monospace inside the markdown', async () => {
    const result = await showCanvasCapabilities({});
    expect(result.catalog).toMatch(/`comparison-card`/);
    expect(result.catalog).toMatch(/`accordion-details`/);
  });

  it('mentions preview_canvas_pattern as the next-step instruction', async () => {
    const result = await showCanvasCapabilities({});
    expect(result.catalog).toMatch(/preview_canvas_pattern/);
  });

  it('filters by category', async () => {
    const result = await showCanvasCapabilities({ category: 'information' });
    expect(result.patternIds).toContain('comparison-card');
    expect(result.patternIds).toContain('callout-box');
    expect(result.patternIds).toContain('vocab-table');
    expect(result.patternIds).not.toContain('accordion-details');
  });

  it('filters by supportStatus', async () => {
    const result = await showCanvasCapabilities({ supportStatus: 'aspirational' });
    expect(result.patternIds).toContain('tabbed-layout-target');
    expect(result.patternIds).not.toContain('comparison-card');
    expect(result.catalog).not.toContain('Currently Supported');
  });

  it('returns flat patternIds matching what is shown in markdown', async () => {
    const result = await showCanvasCapabilities({});
    for (const id of result.patternIds) {
      expect(result.catalog).toContain(`\`${id}\``);
    }
  });
});
