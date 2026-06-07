import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readClosCatalog } from '../../src/course/clos_catalog.js';

let tmpDir: string;
let configPath: string;
beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'clos-cat-'));
  configPath = join(tmpDir, 'course-config.md');
});
afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

describe('readClosCatalog', () => {
  it('parses a well-formed clos block from front matter', () => {
    writeFileSync(configPath, `---
title: ITM 370
clos:
  - id: '1'
    name: Analyzing
    statement: Students analyze business data.
    tag: core
  - id: '2'
    name: Communicating
    statement: Students communicate insights.
---
`);
    const result = readClosCatalog(configPath);
    expect(result.warnings).toEqual([]);
    expect(result.clos).toHaveLength(2);
    expect(result.clos[0]).toEqual({ id: '1', name: 'Analyzing', statement: 'Students analyze business data.', tag: 'core' });
    expect(result.clos[1]).toEqual({ id: '2', name: 'Communicating', statement: 'Students communicate insights.' });
  });

  it('returns empty clos + no warnings when no clos block present', () => {
    writeFileSync(configPath, `---\ntitle: T\n---\n`);
    const result = readClosCatalog(configPath);
    expect(result.clos).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('skips entries with missing required fields and accumulates warnings', () => {
    writeFileSync(configPath, `---
title: T
clos:
  - id: '1'
    name: Good
    statement: Valid entry.
  - id: '2'
    name: Bad
    # missing statement
  - name: NoId
    statement: Missing id.
---
`);
    const result = readClosCatalog(configPath);
    expect(result.clos).toHaveLength(1);
    expect(result.clos[0].id).toBe('1');
    expect(result.warnings.length).toBeGreaterThanOrEqual(2);
  });

  it('rejects invalid tag values (skips entry + warns)', () => {
    writeFileSync(configPath, `---
title: T
clos:
  - id: '1'
    name: Bad
    statement: Has bad tag.
    tag: peripheral
---
`);
    const result = readClosCatalog(configPath);
    expect(result.clos).toEqual([]);
    expect(result.warnings.length).toBeGreaterThanOrEqual(1);
  });
});
