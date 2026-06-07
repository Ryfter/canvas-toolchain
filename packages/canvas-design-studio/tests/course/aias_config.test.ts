import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readAiasDefaults, writeAiasDefaults } from '../../src/course/aias_config.js';

let tmpDir: string;
beforeEach(() => { tmpDir = mkdtempSync(join(tmpdir(), 'aias-cfg-')); });
afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

describe('readAiasDefaults', () => {
  it('returns level + note when both present', () => {
    const f = join(tmpDir, 'course-config.md');
    writeFileSync(f, '---\ntitle: ITM 370\ndefaultAiasLevel: 3\ndefaultAiasNote: A custom note.\n---\n');
    const result = readAiasDefaults(f);
    expect(result.level).toBe(3);
    expect(result.note).toBe('A custom note.');
  });

  it('returns level only when note absent', () => {
    const f = join(tmpDir, 'course-config.md');
    writeFileSync(f, '---\ntitle: ITM 370\ndefaultAiasLevel: 2\n---\n');
    const result = readAiasDefaults(f);
    expect(result.level).toBe(2);
    expect(result.note).toBeUndefined();
  });

  it('returns undefined level when not set', () => {
    const f = join(tmpDir, 'course-config.md');
    writeFileSync(f, '---\ntitle: ITM 370\n---\n');
    const result = readAiasDefaults(f);
    expect(result.level).toBeUndefined();
    expect(result.note).toBeUndefined();
  });

  it('ignores invalid level (not 1-5)', () => {
    const f = join(tmpDir, 'course-config.md');
    writeFileSync(f, '---\ntitle: ITM 370\ndefaultAiasLevel: 9\n---\n');
    const result = readAiasDefaults(f);
    expect(result.level).toBeUndefined();
  });
});

describe('writeAiasDefaults', () => {
  it('writes level + note into course-config.md preserving other fields', () => {
    const f = join(tmpDir, 'course-config.md');
    writeFileSync(f, '---\ntitle: ITM 370\nshort_name: ITM370\nsemester: F26\n---\n\n# body\n');
    writeAiasDefaults(f, 3, 'You may draft with AI.');
    const raw = readFileSync(f, 'utf-8');
    expect(raw).toContain('title: ITM 370');
    expect(raw).toContain('short_name: ITM370');
    expect(raw).toContain('defaultAiasLevel: 3');
    expect(raw).toContain('You may draft with AI.');
    expect(raw).toContain('# body');
  });

  it('writes level only when note undefined', () => {
    const f = join(tmpDir, 'course-config.md');
    writeFileSync(f, '---\ntitle: ITM 370\n---\n');
    writeAiasDefaults(f, 1);
    const raw = readFileSync(f, 'utf-8');
    expect(raw).toContain('defaultAiasLevel: 1');
    expect(raw).not.toContain('defaultAiasNote:');
  });

  it('overwrites an existing default', () => {
    const f = join(tmpDir, 'course-config.md');
    writeFileSync(f, '---\ntitle: ITM 370\ndefaultAiasLevel: 2\ndefaultAiasNote: old\n---\n');
    writeAiasDefaults(f, 4, 'new');
    const raw = readFileSync(f, 'utf-8');
    expect(raw).toContain('defaultAiasLevel: 4');
    expect(raw).toContain('new');
    expect(raw).not.toContain('defaultAiasLevel: 2');
    expect(raw).not.toContain('note: old');
  });
});
