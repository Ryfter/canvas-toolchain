import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractTiersFromFile } from '../../src/tools/extract_tiers.js';

let tmpDir: string;
beforeEach(() => { tmpDir = mkdtempSync(join(tmpdir(), 'extract-tiers-')); });
afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

describe('extractTiersFromFile', () => {
  it('returns the tiers block when present', () => {
    const f = join(tmpDir, 'p.md');
    writeFileSync(f, '---\ntitle: T\ntiers:\n  sections:\n    - heading: Due\n      tier: 1\n      summary: Oct 17\n---\n\nbody\n');
    const t = extractTiersFromFile(f);
    expect(t).toBeDefined();
    expect(t!.sections).toHaveLength(1);
    expect(t!.sections[0].tier).toBe(1);
  });

  it('returns undefined when there is no tiers block', () => {
    const f = join(tmpDir, 'p.md');
    writeFileSync(f, '---\ntitle: T\n---\n\nbody\n');
    expect(extractTiersFromFile(f)).toBeUndefined();
  });

  it('returns undefined when there is no front matter at all', () => {
    const f = join(tmpDir, 'p.md');
    writeFileSync(f, '## Heading\n\nbody\n');
    expect(extractTiersFromFile(f)).toBeUndefined();
  });

  it('returns undefined and does not throw on malformed tiers block', () => {
    const f = join(tmpDir, 'p.md');
    writeFileSync(f, '---\ntitle: T\ntiers:\n  sections:\n    - tier: not-a-number\n---\n\nbody\n');
    expect(extractTiersFromFile(f)).toBeUndefined();
  });
});
