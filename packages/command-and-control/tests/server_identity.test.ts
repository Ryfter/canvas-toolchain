import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('server identity', () => {
  it('registers as canvas-toolchain at the package version', () => {
    const src = readFileSync(join(pkgDir, 'src', 'index.ts'), 'utf8');
    const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
    expect(src).toContain("name: 'canvas-toolchain'");
    expect(src).not.toContain("name: 'command-and-control'");
    expect(src).toContain('pkg.version'); // version comes from package.json, not a literal
    // Exact version-to-tag matching is enforced by the release workflow's guard.
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
