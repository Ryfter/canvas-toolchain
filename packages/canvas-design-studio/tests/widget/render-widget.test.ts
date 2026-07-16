import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderWidget } from '../../src/tools/render-widget.js';
import { RenderError } from '../../src/tools/widget/types.js';

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'render-widget-test-'));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function writeSpec(filename: string, spec: unknown): string {
  const path = join(tmp, filename);
  writeFileSync(path, JSON.stringify(spec), 'utf8');
  return path;
}

const goodSpec = {
  id: 'vocab-1',
  name: 'Vocab 1',
  kind: 'card-flip-reveal',
  purpose: 'recall',
  contentSchema: {},
  initialContent: { cards: [{ front: 'ETL', back: 'Extract, Transform, Load' }] },
  dimensions: { minHeight: 300, maxHeight: 600 },
  accessibility: { keyboardEquivalent: 'Tab+Enter', screenReaderSummary: 'flip cards', minTouchTarget: 44 },
};

describe('renderWidget', () => {
  it('writes <id>.html next to the spec for a catalog kind', async () => {
    const specPath = writeSpec('vocab-1.spec.json', goodSpec);

    const result = await renderWidget({ specPath });

    expect(result.kind).toBe('card-flip-reveal');
    expect(result.experimental).toBe(false);
    expect(result.outputPath).toBe(join(tmp, 'vocab-1.html'));
    expect(existsSync(result.outputPath)).toBe(true);
    const html = readFileSync(result.outputPath, 'utf8');
    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html).toContain('ETL');
  });

  it('throws SPEC_NOT_FOUND when spec path is missing', async () => {
    await expect(renderWidget({ specPath: join(tmp, 'nope.spec.json') }))
      .rejects.toThrow(/SPEC_NOT_FOUND/);
  });

  it('throws SPEC_PARSE_ERROR on malformed JSON', async () => {
    const path = join(tmp, 'bad.spec.json');
    writeFileSync(path, '{not json', 'utf8');
    await expect(renderWidget({ specPath: path })).rejects.toThrow(/SPEC_PARSE_ERROR/);
  });

  it('throws KIND_NOT_IN_CATALOG when kind unknown and allowExperimental not set', async () => {
    const specPath = writeSpec('weird.spec.json', { ...goodSpec, kind: 'card-stack-zoom' });
    await expect(renderWidget({ specPath })).rejects.toThrow(/KIND_NOT_IN_CATALOG/);
    await expect(renderWidget({ specPath })).rejects.toThrow(/card-flip-reveal/); // error lists allowed kinds
  });

  it('throws CONTENT_SCHEMA_INVALID when initialContent does not match the kind schema', async () => {
    const specPath = writeSpec('bad-content.spec.json', { ...goodSpec, initialContent: { cards: [] } });
    await expect(renderWidget({ specPath })).rejects.toThrow(/CONTENT_SCHEMA_INVALID/);
  });

  it('error code is accessible on the thrown RenderError', async () => {
    try {
      await renderWidget({ specPath: join(tmp, 'nope.spec.json') });
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(RenderError);
      if (e instanceof RenderError) expect(e.code).toBe('SPEC_NOT_FOUND');
    }
  });

  // Cleanup
});
