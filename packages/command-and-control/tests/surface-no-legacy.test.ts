import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('legacy surface removal', () => {
  it('index.ts no longer hand-rolls a tool switch', () => {
    const src = readFileSync(join(pkgDir, 'src', 'index.ts'), 'utf8');
    expect(src).not.toContain('ALL_PASSTHROUGH');
    expect(src.split('\n').length).toBeLessThan(200);
  });
});
