import { describe, it, expect } from 'vitest';
import { routePages, type RoutedPages } from '../../../src/tools/publish/route_pages.js';
import type { GenerateCourseResult, GeneratePageResult } from 'canvas-design-mcp/dist/course-types.js';

function page(pageType: GeneratePageResult['pageType'], filename: string): GeneratePageResult {
  return { html: '<p>x</p>', filename, weekNumber: 1, pageType, savedTo: `/tmp/${filename}` };
}

describe('routePages', () => {
  it('routes page-like types to pages bucket', () => {
    const result: GenerateCourseResult = {
      totalPages: 4, outputDir: '/tmp', warnings: [],
      weekResults: [{
        weekNumber: 1, outputDir: '/tmp', warnings: [],
        pages: [
          page('front-page', 'front.html'),
          page('overview', 'wk1-overview.html'),
          page('resources', 'wk1-resources.html'),
          page('custom', 'wk1-custom.html'),
        ],
      }],
    };
    const routed = routePages(result);
    expect(routed.pages.map(p => p.filename)).toEqual(['front.html', 'wk1-overview.html', 'wk1-resources.html', 'wk1-custom.html']);
    expect(routed.assignments).toEqual([]);
    expect(routed.skipped).toEqual([]);
  });

  it('routes assignment-like types to assignments bucket', () => {
    const result: GenerateCourseResult = {
      totalPages: 4, outputDir: '/tmp', warnings: [],
      weekResults: [{
        weekNumber: 1, outputDir: '/tmp', warnings: [],
        pages: [
          page('assignment', 'wk1-asn.html'),
          page('engage-assignment', 'wk1-eng.html'),
          page('proj-assignment', 'wk1-proj.html'),
          page('tech-assignment', 'wk1-tech.html'),
        ],
      }],
    };
    const routed = routePages(result);
    expect(routed.assignments.map(p => p.filename)).toEqual([
      'wk1-asn.html', 'wk1-eng.html', 'wk1-proj.html', 'wk1-tech.html',
    ]);
    expect(routed.pages).toEqual([]);
  });

  it('routes quiz and discussion types to skipped with out-of-scope reason', () => {
    const result: GenerateCourseResult = {
      totalPages: 3, outputDir: '/tmp', warnings: [],
      weekResults: [{
        weekNumber: 1, outputDir: '/tmp', warnings: [],
        pages: [
          page('reading-quiz', 'wk1-rq.html'),
          page('weekly-quiz', 'wk1-wq.html'),
          page('discussion-board', 'wk1-db.html'),
        ],
      }],
    };
    const routed = routePages(result);
    expect(routed.skipped).toHaveLength(3);
    expect(routed.skipped.every(s => s.reason === 'out-of-scope-v0.9')).toBe(true);
    expect(routed.pages).toEqual([]);
    expect(routed.assignments).toEqual([]);
  });

  it('flattens across all weeks', () => {
    const result: GenerateCourseResult = {
      totalPages: 4, outputDir: '/tmp', warnings: [],
      weekResults: [
        { weekNumber: 1, outputDir: '/tmp', warnings: [], pages: [page('overview', 'wk1-ov.html'), page('assignment', 'wk1-asn.html')] },
        { weekNumber: 2, outputDir: '/tmp', warnings: [], pages: [page('overview', 'wk2-ov.html'), page('assignment', 'wk2-asn.html')] },
      ],
    };
    const routed = routePages(result);
    expect(routed.pages).toHaveLength(2);
    expect(routed.assignments).toHaveLength(2);
  });
});
