import { describe, expect, test } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseCanvasArchive } from '../../src/parsers/canvas_archive.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURE = join(__dirname, '..', 'fixtures', 'canvas-archive-tiny');

describe('parseCanvasArchive', () => {
  test('reads the course manifest', () => {
    const map = parseCanvasArchive(FIXTURE, 'Spring2025');
    expect(map.semesterId).toBe('Spring2025');
    expect(map.course.canvasId).toBe(99999);
    expect(map.course.name).toBe('Sp25 | TEST 101 - Tiny Fixture Course');
    expect(map.course.courseCode).toBe('TEST101');
    expect(map.course.termName).toBe('Spring 2025');
  });

  test('reads modules with their items', () => {
    const map = parseCanvasArchive(FIXTURE, 'Spring2025');
    expect(map.modules).toHaveLength(2);

    const mod1 = map.modules[0];
    expect(mod1.name).toBe('Module 01 - Introductions');
    expect(mod1.position).toBe(1);
    expect(mod1.items).toHaveLength(2);
    expect(mod1.items[0].title).toBe('Week 1 At A Glance');
    expect(mod1.items[0].type).toBe('Page');
    expect(mod1.items[0].pageUrl).toBe('week-1-at-a-glance');
    expect(mod1.items[1].type).toBe('Assignment');
    expect(mod1.items[1].contentId).toBe(9001);
  });

  test('reads assignments with stripped-HTML description excerpts', () => {
    const map = parseCanvasArchive(FIXTURE, 'Spring2025');
    expect(map.assignments).toHaveLength(2);

    const a1 = map.assignments.find((a) => a.canvasId === 9001)!;
    expect(a1.name).toBe('Engage 1 - Introduce Yourself');
    expect(a1.dueAt).toBe('2025-01-20T05:59:00Z');
    expect(a1.pointsPossible).toBe(10);
    expect(a1.submissionTypes).toEqual(['online_text_entry']);
    expect(a1.descriptionExcerpt).not.toContain('<');
    expect(a1.descriptionExcerpt).toContain('generative AI');
  });

  test('reads pages and loads body excerpts when per-page json exists', () => {
    const map = parseCanvasArchive(FIXTURE, 'Spring2025');
    expect(map.pages).toHaveLength(2);

    const p1 = map.pages.find((p) => p.url === 'week-1-at-a-glance')!;
    expect(p1.title).toBe('Week 1 At A Glance');
    expect(p1.published).toBe(true);
    expect(p1.bodyExcerpt).toContain('introduction to AI literacy');
    expect(p1.bodyExcerpt).not.toContain('<');
  });

  test('reads discussions and quizzes from manifests', () => {
    const map = parseCanvasArchive(FIXTURE, 'Spring2025');
    expect(map.discussions).toHaveLength(1);
    expect(map.discussions[0].title).toBe('Discussion 1 - Your AI Origin Story');
    expect(map.discussions[0].messageExcerpt).not.toContain('<');

    expect(map.quizzes).toHaveLength(1);
    expect(map.quizzes[0].title).toBe('Week 1 Reading Quiz');
    expect(map.quizzes[0].questionCount).toBe(5);
  });

  test('extracts external resource links from page and assignment bodies', () => {
    const map = parseCanvasArchive(FIXTURE, 'Spring2025');

    const urls = map.resourceLinks.map((r) => r.url).sort();
    expect(urls).toContain('https://example.com/ai-intro');
    expect(urls).toContain('https://example.com/cot');
    expect(urls).toContain('https://example.com/prompting');

    const introLink = map.resourceLinks.find((r) => r.url === 'https://example.com/ai-intro')!;
    expect(introLink.source).toBe('page');
    expect(introLink.sourceTitle).toBe('Week 1 At A Glance');
  });

  test('throws a helpful error when the archive path is missing required manifests', () => {
    expect(() => parseCanvasArchive('/nonexistent/path', 'Spring2025')).toThrow();
  });
});
