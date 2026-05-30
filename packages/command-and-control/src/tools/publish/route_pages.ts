import type { GenerateCourseResult, GeneratePageResult, PageType } from 'canvas-design-mcp/dist/course-types.js';
import type { SkippedEntry } from './manifest_types.js';

const PAGE_LIKE: ReadonlySet<PageType> = new Set<PageType>([
  'front-page', 'overview', 'resources', 'slides', 'videos',
  'reading', 'lab', 'extra-credit', 'custom',
]);

const ASSIGNMENT_LIKE: ReadonlySet<PageType> = new Set<PageType>([
  'assignment', 'engage-assignment', 'proj-assignment', 'tech-assignment',
]);

const SKIPPED_RECOMMENDATIONS: Partial<Record<PageType, string>> = {
  'reading-quiz': 'Quiz publishing arrives in v1.x. For now, create the quiz manually in Canvas.',
  'weekly-quiz': 'Quiz publishing arrives in v1.x. For now, create the quiz manually in Canvas.',
  'discussion-board': 'Discussion publishing arrives in v1.x. For now, create the discussion manually in Canvas.',
};

export interface RoutedPages {
  pages: GeneratePageResult[];
  assignments: GeneratePageResult[];
  skipped: SkippedEntry[];
}

export function routePages(result: GenerateCourseResult): RoutedPages {
  const pages: GeneratePageResult[] = [];
  const assignments: GeneratePageResult[] = [];
  const skipped: SkippedEntry[] = [];

  for (const week of result.weekResults) {
    for (const p of week.pages) {
      if (PAGE_LIKE.has(p.pageType)) {
        pages.push(p);
      } else if (ASSIGNMENT_LIKE.has(p.pageType)) {
        assignments.push(p);
      } else {
        skipped.push({
          filename: p.filename,
          pageType: p.pageType,
          reason: 'out-of-scope-v0.9',
          recommendation: SKIPPED_RECOMMENDATIONS[p.pageType] ?? `${p.pageType} publishing not yet supported in v0.9.`,
        });
      }
    }
  }

  return { pages, assignments, skipped };
}
