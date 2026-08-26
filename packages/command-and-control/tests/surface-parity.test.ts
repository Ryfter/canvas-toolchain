import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRegistry } from '../src/surface/registry.js';

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), '..');

function namesIn(relPath: string, indent: string): string[] {
  const src = readFileSync(join(pkgDir, relPath), 'utf8');
  const re = new RegExp(`^${indent}name: '([a-z_0-9]+)'`, 'gm');
  return [...src.matchAll(re)].map((m) => m[1]);
}

/** Every tool the server exposes today, from source. */
function currentCoreTools(): string[] {
  return [
    ...namesIn('src/index.ts', '      '),
    ...namesIn('src/passthrough/ci_tools.ts', '    '),
    ...namesIn('src/passthrough/downloader_tools.ts', '    '),
    ...namesIn('src/passthrough/design_tools.ts', '    '),
  ];
}

describe('registry parity with the current surface', () => {
  it('registers every tool that exists today', () => {
    const reg = buildRegistry();
    // `list_modules` is registered twice today with two distinct meanings; the
    // registry splits them into `list_modules` (plug-ins) and
    // `list_canvas_modules` (Canvas course modules).
    const expected = new Set(currentCoreTools());
    expected.delete('list_modules');
    const missing = [...expected].filter((n) => !reg.has(n));
    expect(missing, `not in registry: ${missing.join(', ')}`).toEqual([]);
    expect(reg.has('list_modules')).toBe(true);
    expect(reg.has('list_canvas_modules')).toBe(true);
  });

  it('registers 82 core operations', () => {
    expect(buildRegistry().size).toBe(82);
  });

  it('marks internal exactly the three pre-approved operations', () => {
    const internal = [...buildRegistry().values()]
      .filter((o) => o.exposure === 'internal')
      .map((o) => o.id);
    expect(internal.sort()).toEqual([
      'map_transcripts_to_weeks', 'reembed_course_index', 'snapshot_course',
    ]);
  });
});
