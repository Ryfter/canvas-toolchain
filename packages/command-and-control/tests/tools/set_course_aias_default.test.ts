import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setCourseAiasDefault } from '../../src/tools/set_course_aias_default.js';

let tmpDir: string;
beforeEach(() => { tmpDir = mkdtempSync(join(tmpdir(), 'set-aias-')); });
afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

describe('setCourseAiasDefault', () => {
  it('happy path: writes defaultAiasLevel + note into course-config.md', async () => {
    writeFileSync(join(tmpDir, 'course-config.md'),
      '---\ntitle: ITM 370\nshort_name: ITM370\nsemester: F26\n---\n\n# body\n');

    const result = await setCourseAiasDefault({ courseDir: tmpDir, level: 3, note: 'Draft with AI.' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.level).toBe(3);
    expect(result.effectiveNote).toBe('Draft with AI.');

    const raw = readFileSync(join(tmpDir, 'course-config.md'), 'utf-8');
    expect(raw).toContain('defaultAiasLevel: 3');
    expect(raw).toContain('Draft with AI.');
    expect(raw).toContain('title: ITM 370');
  });

  it('uses canonical text when note omitted', async () => {
    writeFileSync(join(tmpDir, 'course-config.md'),
      '---\ntitle: T\n---\n');

    const result = await setCourseAiasDefault({ courseDir: tmpDir, level: 1 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.level).toBe(1);
    expect(result.effectiveNote).toContain('No AI permitted');
  });

  it('returns COURSE_CONFIG_NOT_FOUND when course-config.md is absent', async () => {
    const result = await setCourseAiasDefault({ courseDir: tmpDir, level: 3 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('COURSE_CONFIG_NOT_FOUND');
    expect(existsSync(join(tmpDir, 'course-config.md'))).toBe(false);
  });

  it('returns INVALID_LEVEL for out-of-range level', async () => {
    writeFileSync(join(tmpDir, 'course-config.md'), '---\ntitle: T\n---\n');

    const result = await setCourseAiasDefault({ courseDir: tmpDir, level: 7 as any });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('INVALID_LEVEL');
  });
});
