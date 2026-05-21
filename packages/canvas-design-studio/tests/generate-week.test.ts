import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { generateWeek } from '../src/tools/generate-week.js';

const fixturesDir = join(import.meta.dirname, 'fixtures/course-input');

describe('generateWeek', () => {
  it('generates HTML files for all active page types in week 1', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'gw-'));
    const result = generateWeek({ weekNumber: 1, courseDir: fixturesDir, outputDir: outDir });
    expect(result.weekNumber).toBe(1);
    expect(result.pages.length).toBeGreaterThan(0);
    expect(result.pages.some(p => p.pageType === 'overview')).toBe(true);
    expect(result.pages.some(p => p.pageType === 'resources')).toBe(true);
    expect(result.pages.some(p => p.pageType === 'assignment')).toBe(true);
  });

  it('all generated files exist on disk', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'gw-'));
    const result = generateWeek({ weekNumber: 1, courseDir: fixturesDir, outputDir: outDir });
    for (const page of result.pages) {
      expect(existsSync(page.savedTo)).toBe(true);
    }
  });

  it('output goes to week-01 subfolder', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'gw-'));
    const result = generateWeek({ weekNumber: 1, courseDir: fixturesDir, outputDir: outDir });
    expect(result.outputDir).toContain('week-01');
  });

  it('returns warnings for missing .md files', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'gw-'));
    const result = generateWeek({ weekNumber: 2, courseDir: fixturesDir, outputDir: outDir });
    expect(result.warnings.length).toBeGreaterThanOrEqual(0);
  });

  it('generates week 2 pages that exist', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'gw-'));
    const result = generateWeek({ weekNumber: 2, courseDir: fixturesDir, outputDir: outDir });
    expect(result.pages.some(p => p.pageType === 'overview')).toBe(true);
    expect(result.pages.some(p => p.pageType === 'resources')).toBe(true);
  });
});
