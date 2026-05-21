import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { generatePage } from '../src/tools/generate-page.js';

const fixturesDir = join(import.meta.dirname, 'fixtures/course-input');

describe('generatePage', () => {
  it('generates HTML file from overview.md', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'gp-'));
    const result = generatePage({
      mdPath: join(fixturesDir, 'week-01/overview.md'),
      courseDir: fixturesDir,
      outputDir: outDir,
    });
    expect(result.pageType).toBe('overview');
    expect(result.weekNumber).toBe(1);
    expect(result.filename).toBe('overview.html');
    expect(existsSync(result.savedTo)).toBe(true);
  });

  it('saved HTML contains learning objectives content', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'gp-'));
    const result = generatePage({
      mdPath: join(fixturesDir, 'week-01/overview.md'),
      courseDir: fixturesDir,
      outputDir: outDir,
    });
    const html = readFileSync(result.savedTo, 'utf-8');
    expect(html).toContain('Learning Objectives');
    expect(html).toContain('AI augmentation');
  });

  it('saves to output/week-01/overview.html by default', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'gp-'));
    const result = generatePage({
      mdPath: join(fixturesDir, 'week-01/overview.md'),
      courseDir: fixturesDir,
      outputDir: outDir,
    });
    expect(result.savedTo).toContain(join('week-01', 'overview.html'));
  });

  it('generates HTML file from assignment.md', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'gp-'));
    const result = generatePage({
      mdPath: join(fixturesDir, 'week-01/assignment.md'),
      courseDir: fixturesDir,
      outputDir: outDir,
    });
    expect(result.pageType).toBe('assignment');
    expect(existsSync(result.savedTo)).toBe(true);
  });

  it('generates HTML file from front-page.md', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'gp-'));
    const result = generatePage({
      mdPath: join(fixturesDir, 'front-page.md'),
      courseDir: fixturesDir,
      outputDir: outDir,
    });
    expect(result.pageType).toBe('front-page');
    expect(result.weekNumber).toBe(0);
    expect(result.filename).toBe('front-page.html');
    expect(existsSync(result.savedTo)).toBe(true);
  });

  it('generated HTML passes basic Canvas compliance (no <style>, no <h1>)', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'gp-'));
    const result = generatePage({
      mdPath: join(fixturesDir, 'week-01/overview.md'),
      courseDir: fixturesDir,
      outputDir: outDir,
    });
    const html = readFileSync(result.savedTo, 'utf-8');
    expect(html).not.toContain('<style');
    expect(html).not.toContain('<h1');
    expect(html).not.toContain('box-shadow');
  });

  it('supports custom templateId parameter', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'gp-'));
    const result = generatePage({
      mdPath: join(fixturesDir, 'week-01/overview.md'),
      courseDir: fixturesDir,
      outputDir: outDir,
      templateId: 'overview',
    });
    expect(result.pageType).toBe('overview');
    expect(existsSync(result.savedTo)).toBe(true);
    const html = readFileSync(result.savedTo, 'utf-8');
    expect(html).toContain('Learning Objectives');
  });
});
