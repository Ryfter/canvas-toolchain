import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRegistry } from '../src/surface/registry.js';
import { listTools } from '../src/surface/list_tools.js';

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('server identity', () => {
  it('takes its version from package.json', () => {
    const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('exposes exactly the ten-tool surface', () => {
    const names = listTools(buildRegistry()).map((t) => t.name);
    expect(names).toHaveLength(10);
    expect(names).toContain('ct_advanced');
  });
});
