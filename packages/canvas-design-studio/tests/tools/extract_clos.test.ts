import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractClosFromFile } from '../../src/tools/extract_clos.js';

let tmpDir: string;
beforeEach(() => { tmpDir = mkdtempSync(join(tmpdir(), 'extract-clos-')); });
afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

describe('extractClosFromFile', () => {
  it('returns the IDs as strings when clos array present', () => {
    const f = join(tmpDir, 'p.md');
    writeFileSync(f, `---\ntitle: T\nclos: ['1', '2', '3']\n---\n\nbody\n`);
    expect(extractClosFromFile(f)).toEqual(['1', '2', '3']);
  });

  it('coerces numeric IDs to strings', () => {
    const f = join(tmpDir, 'p.md');
    writeFileSync(f, `---\ntitle: T\nclos: [1, 2]\n---\n`);
    expect(extractClosFromFile(f)).toEqual(['1', '2']);
  });

  it('returns [] when no clos field', () => {
    const f = join(tmpDir, 'p.md');
    writeFileSync(f, `---\ntitle: T\n---\n`);
    expect(extractClosFromFile(f)).toEqual([]);
  });

  it('returns [] when front matter absent', () => {
    const f = join(tmpDir, 'p.md');
    writeFileSync(f, `## body\n`);
    expect(extractClosFromFile(f)).toEqual([]);
  });

  it('returns [] when clos value is not an array', () => {
    const f = join(tmpDir, 'p.md');
    writeFileSync(f, `---\ntitle: T\nclos: "1"\n---\n`);
    expect(extractClosFromFile(f)).toEqual([]);
  });
});
