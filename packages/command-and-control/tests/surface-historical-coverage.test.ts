import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRegistry } from '../src/surface/registry.js';

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The 82 pre-migration core tool names, frozen from the legacy list in
 * src/index.ts plus the three src/passthrough/*_tools.ts files before those
 * literals were deleted. `list_modules` appears twice: plug-in modules (C&C)
 * and Canvas course modules (CI). The registry splits them into
 * `list_modules` and `list_canvas_modules`.
 */
const HISTORICAL = JSON.parse(
  readFileSync(join(pkgDir, 'tests', 'fixtures', 'historical-core-tools.json'), 'utf8'),
) as string[];

describe('registry coverage of the pre-migration surface', () => {
  it('covers every historical core tool name (with list_modules split)', () => {
    expect(HISTORICAL).toHaveLength(82);
    const reg = buildRegistry();
    const expected = new Set(HISTORICAL);
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
