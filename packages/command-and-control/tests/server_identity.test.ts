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

  // `canvas-toolchain` is the name every professor's mcp.json keys on, so a rename
  // to the package or directory name would silently break every existing client
  // config. `server` is not exported and `serverInfo` has no accessor, so the source
  // literal is the only cheap hook — tests/server_boot.test.ts asserts the same name
  // for real, off a live stdio handshake.
  it('registers as canvas-toolchain, not as the package or directory name', () => {
    const src = readFileSync(join(pkgDir, 'src', 'index.ts'), 'utf8');
    expect(src).toContain("name: 'canvas-toolchain'");
    expect(src).not.toContain("name: 'command-and-control'");
  });

  it('exposes exactly the ten-tool surface', () => {
    const names = listTools(buildRegistry()).map((t) => t.name);
    expect(names).toHaveLength(10);
    expect(names).toContain('ct_advanced');
  });
});
