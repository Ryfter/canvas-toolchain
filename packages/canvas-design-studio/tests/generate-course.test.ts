import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { generateCourse } from '../src/tools/generate-course.js';

const fixturesDir = join(import.meta.dirname, 'fixtures/course-input');

describe('generateCourse', () => {
  it('generates pages for all weeks in the course', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'gc-'));
    const result = generateCourse({ courseDir: fixturesDir, outputDir: outDir });
    expect(result.weekResults.length).toBe(2);
    expect(result.totalPages).toBeGreaterThan(0);
  });

  it('generates front-page.html when front-page type is active', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'gc-'));
    generateCourse({ courseDir: fixturesDir, outputDir: outDir });
    expect(existsSync(join(outDir, 'front-page.html'))).toBe(true);
  });

  it('creates week subfolder for each week', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'gc-'));
    generateCourse({ courseDir: fixturesDir, outputDir: outDir });
    expect(existsSync(join(outDir, 'week-01'))).toBe(true);
    expect(existsSync(join(outDir, 'week-02'))).toBe(true);
  });

  it('returns total page count across all weeks', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'gc-'));
    const result = generateCourse({ courseDir: fixturesDir, outputDir: outDir });
    expect(result.totalPages).toBeGreaterThanOrEqual(5);
  });

  it('collects warnings from all weeks', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'gc-'));
    const result = generateCourse({ courseDir: fixturesDir, outputDir: outDir });
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  it('sets outputDir in result', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'gc-'));
    const result = generateCourse({ courseDir: fixturesDir, outputDir: outDir });
    expect(result.outputDir).toBe(outDir);
  });
});
