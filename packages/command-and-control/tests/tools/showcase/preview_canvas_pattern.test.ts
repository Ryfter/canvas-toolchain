import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { previewCanvasPattern } from '../../../src/tools/showcase/preview_canvas_pattern.js';

let tmpHome: string;
const ORIGINAL_CC_HOME = process.env.CC_HOME;

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'cc-preview-'));
  process.env.CC_HOME = tmpHome;
});

afterEach(() => {
  rmSync(tmpHome, { recursive: true, force: true });
  if (ORIGINAL_CC_HOME === undefined) delete process.env.CC_HOME;
  else process.env.CC_HOME = ORIGINAL_CC_HOME;
});

describe('previewCanvasPattern', () => {
  it('happy path: returns ok=true with previewPath, catalogEntry, openInstruction', async () => {
    const result = await previewCanvasPattern({ patternId: 'comparison-card' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.patternId).toBe('comparison-card');
    expect(result.previewPath).toBe(join(tmpHome, 'showcase-previews', 'comparison-card.html'));
    expect(existsSync(result.previewPath)).toBe(true);
    expect(result.openInstruction).toMatch(/file:\/\//);
    expect(result.catalogEntry.name).toBe('Comparison Card');
    expect(result.catalogEntry.category).toBe('information');
    expect(result.catalogEntry.supportStatus).toBe('supported');
  });

  it('returns PATTERN_NOT_FOUND for an unknown id and writes no file', async () => {
    const result = await previewCanvasPattern({ patternId: 'this-pattern-does-not-exist' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('PATTERN_NOT_FOUND');
    expect(result.fix).toEqual(expect.arrayContaining([expect.stringMatching(/show_canvas_capabilities/)]));
    expect(existsSync(join(tmpHome, 'showcase-previews', 'this-pattern-does-not-exist.html'))).toBe(false);
  });

  it('works for aspirational patterns too', async () => {
    const result = await previewCanvasPattern({ patternId: 'tabbed-layout-target' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.catalogEntry.supportStatus).toBe('aspirational');
  });

  it('openInstruction contains the absolute preview path', async () => {
    const result = await previewCanvasPattern({ patternId: 'callout-box' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.openInstruction).toContain(result.previewPath);
  });
});
