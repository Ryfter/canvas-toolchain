import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { checkShellReadiness } from '../../../src/tools/workflows/check_shell_readiness.js';
import { collectQuizCallouts } from '../../../src/tools/shell_ready/format_report.js';
import { runMismatchPack } from '../../../src/tools/shell_ready/packs/structure_schedule.js';
import type { ShellGraph } from '../../../src/tools/shell_ready/fetch_graph.js';
import type { ShellResolvedWeek } from '../../../src/tools/shell_ready/types.js';

function week3(): ShellResolvedWeek {
  return {
    role: 'primary',
    depth: 'thorough',
    index: 3,
    label: 'Week 3',
    monday: '2026-09-07',
    sunday: '2026-09-13',
    moduleIds: [3],
    provenance: 'inferred',
  };
}

describe('PR #164 review fixes', () => {
  it('loads weekMapOverrides from course-config.md via courseDir', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'shell-ready-cfg-'));
    try {
      writeFileSync(
        join(dir, 'course-config.md'),
        `---
termStartMonday: '2026-08-24'
weekMapOverrides:
  - index: 3
    label: Override week
    moduleIds: [99]
---
# Example course
`,
        'utf-8',
      );
      const result = await checkShellReadiness(
        {
          courseId: '42',
          asOfDate: '2026-08-29',
          courseDir: dir,
          packs: [],
        },
        {
          loadCfg: () => ({ canvasUrl: 'https://example.instructure.com', apiToken: 'tok' }),
          fetchGraph: async () => ({
            courseId: 42,
            courseName: 'Example',
            hasFrontPage: true,
            modules: [
              { id: 1, name: 'Week 1', position: 1, published: true, items: [] },
              { id: 2, name: 'Week 2', position: 2, published: true, items: [] },
              { id: 3, name: 'Week 3', position: 3, published: true, items: [] },
              { id: 99, name: 'Special', position: 9, published: true, items: [] },
            ],
            assignments: [],
            pages: [],
          }),
          loadPreference: () => null,
        },
      );
      if ('error' in result || 'preview' in result) throw new Error(JSON.stringify(result));
      expect(result.primaryWeek.index).toBe(3);
      expect(result.primaryWeek.moduleIds).toEqual([99]);
      expect(result.primaryWeek.provenance).toBe('override');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('scopes primary link bodies to week module pages (not all course pages)', async () => {
    const probedTitles: string[] = [];
    const result = await checkShellReadiness(
      {
        courseId: '42',
        asOfDate: '2026-08-29',
        termStartMonday: '2026-08-24',
        packs: ['links'],
        linkProbeBudget: 10,
      },
      {
        loadCfg: () => ({ canvasUrl: 'https://example.instructure.com', apiToken: 'tok' }),
        fetchGraph: async () => ({
          courseId: 42,
          courseName: 'Example',
          hasFrontPage: true,
          modules: [
            { id: 1, name: 'Week 1', position: 1, published: true, items: [] },
            { id: 2, name: 'Week 2', position: 2, published: true, items: [] },
            {
              id: 3,
              name: 'Week 3',
              position: 3,
              published: true,
              items: [{ id: 1, title: 'Week 3 Intro', type: 'Page', published: true }],
            },
          ],
          assignments: [],
          pages: [
            {
              url: 'week-3-intro',
              title: 'Week 3 Intro',
              published: true,
              frontPage: false,
              body: '<a href="https://example.edu/in-scope">in</a>',
            },
            {
              url: 'other-week',
              title: 'Other Week Page',
              published: true,
              frontPage: false,
              body: '<a href="https://example.edu/out-of-scope">out</a>',
            },
          ],
        }),
        loadPreference: () => null,
        fetchFn: async (input: RequestInfo | URL) => {
          const url = String(input);
          probedTitles.push(url);
          return new Response('', { status: 200 });
        },
      },
    );
    if ('error' in result || 'preview' in result) throw new Error(JSON.stringify(result));
    expect(probedTitles.some(u => u.includes('in-scope'))).toBe(true);
    expect(probedTitles.some(u => u.includes('out-of-scope'))).toBe(false);
  });

  it('quizCallouts use Quiz module contentId only (not assignment ids)', () => {
    const graph: ShellGraph = {
      courseId: 1,
      courseName: 'Ex',
      hasFrontPage: true,
      modules: [
        {
          id: 3,
          name: 'Week 3',
          position: 3,
          published: true,
          items: [{ id: 1, title: 'Q', type: 'Quiz', published: true, contentId: 900 }],
        },
      ],
      assignments: [
        {
          id: 555,
          name: 'Q',
          published: true,
          isQuiz: true,
          dueAt: '2026-09-10T00:00:00Z',
        },
      ],
      pages: [],
    };
    const callouts = collectQuizCallouts(graph, week3(), {
      ...week3(),
      role: 'secondary',
      depth: 'lighter',
      index: 2,
      moduleIds: [],
    });
    const primary = callouts.find(c => c.weekRole === 'primary');
    expect(primary?.quizIds).toEqual([900]);
    expect(primary?.quizIds.includes(555)).toBe(false);
  });

  it('orphans on unlock_at / lock_at in window even without due_at', () => {
    const w = week3();
    const graph: ShellGraph = {
      courseId: 1,
      courseName: 'Ex',
      hasFrontPage: true,
      modules: [],
      assignments: [
        {
          id: 77,
          name: 'Unlock only',
          published: true,
          dueAt: null,
          unlockAt: '2026-09-08T00:00:00Z',
          lockAt: null,
        },
      ],
      pages: [],
    };
    const findings = runMismatchPack(w, graph, new Set());
    expect(findings.some(f => f.id === 'orphan-dated:77:w3')).toBe(true);
  });
});
