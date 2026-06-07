import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractAiasFromFile } from '../../src/tools/extract_aias.js';

let tmpDir: string;
beforeEach(() => { tmpDir = mkdtempSync(join(tmpdir(), 'extract-aias-')); });
afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

describe('extractAiasFromFile', () => {
  it('returns level + note when both set', () => {
    const f = join(tmpDir, 'p.md');
    writeFileSync(f, '---\ntitle: Exam\naiasLevel: 1\naiasNote: Closed book.\n---\n\nbody\n');
    const a = extractAiasFromFile(f);
    expect(a).toEqual({ level: 1, note: 'Closed book.' });
  });

  it('returns level only when note absent', () => {
    const f = join(tmpDir, 'p.md');
    writeFileSync(f, '---\ntitle: T\naiasLevel: 3\n---\n');
    expect(extractAiasFromFile(f)).toEqual({ level: 3 });
  });

  it('returns undefined when no aias fields', () => {
    const f = join(tmpDir, 'p.md');
    writeFileSync(f, '---\ntitle: T\n---\n');
    expect(extractAiasFromFile(f)).toBeUndefined();
  });

  it('ignores invalid level (not 1-5)', () => {
    const f = join(tmpDir, 'p.md');
    writeFileSync(f, '---\ntitle: T\naiasLevel: 9\n---\n');
    expect(extractAiasFromFile(f)).toBeUndefined();
  });
});
