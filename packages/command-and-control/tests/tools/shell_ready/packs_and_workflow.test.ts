import { describe, it, expect } from 'vitest';
import type { ShellGraph } from '../../../src/tools/shell_ready/fetch_graph.js';
import type { ShellResolvedWeek } from '../../../src/tools/shell_ready/types.js';
import {
  runMismatchPack,
  runSchedulePack,
  runStructurePack,
} from '../../../src/tools/shell_ready/packs/structure_schedule.js';
import { runInstructionsPack } from '../../../src/tools/shell_ready/packs/links_instructions.js';
import { checkShellReadiness } from '../../../src/tools/workflows/check_shell_readiness.js';

function week(partial: Partial<ShellResolvedWeek> & Pick<ShellResolvedWeek, 'index' | 'role' | 'depth'>): ShellResolvedWeek {
  return {
    label: `Week ${partial.index}`,
    monday: '2026-09-07',
    sunday: '2026-09-13',
    moduleIds: [1],
    provenance: 'inferred',
    ...partial,
  };
}

const baseGraph: ShellGraph = {
  courseId: 42,
  courseName: 'Example Course',
  hasFrontPage: true,
  modules: [
    {
      id: 1,
      name: 'Week 3',
      position: 3,
      published: false,
      items: [{ id: 9, title: 'Quiz A', type: 'Quiz', published: true, contentId: 100 }],
    },
  ],
  assignments: [
    {
      id: 100,
      name: 'Quiz A',
      published: true,
      dueAt: null,
      pointsPossible: 10,
      description: 'TODO finish this',
      isQuiz: true,
    },
  ],
  pages: [],
};

describe('structure/schedule/mismatch packs', () => {
  const w = week({ index: 3, role: 'primary', depth: 'thorough', moduleIds: [1] });

  it('flags ghost items as blocking', () => {
    const findings = runStructurePack(baseGraph, w, baseGraph.modules);
    expect(findings.some(f => f.id.startsWith('ghost-item:') && f.severity === 'blocking')).toBe(true);
  });

  it('flags missing due_at on graded work', () => {
    const findings = runSchedulePack(baseGraph, w, new Set([100]));
    expect(findings.some(f => f.id === 'missing-due:100')).toBe(true);
  });

  it('flags date mismatch outside week window', () => {
    const g: ShellGraph = {
      ...baseGraph,
      assignments: [{
        id: 100,
        name: 'Quiz A',
        published: true,
        dueAt: '2026-08-01T00:00:00Z',
        pointsPossible: 10,
        description: 'ok',
      }],
    };
    const findings = runMismatchPack(w, g, new Set([100]));
    expect(findings.some(f => f.pack === 'mismatch' && f.id.includes('mismatch-dates'))).toBe(true);
  });
});

describe('instructions pack', () => {
  it('flags TODO placeholders', () => {
    const w = week({ index: 3, role: 'primary', depth: 'thorough' });
    const findings = runInstructionsPack({
      week: w,
      items: [{ id: 1, title: 'HW', body: 'TODO replace me', points: 5 }],
    });
    expect(findings.some(f => f.id.startsWith('placeholder:'))).toBe(true);
  });
});

describe('checkShellReadiness orchestration', () => {
  it('returns report with quiz callouts using injected graph', async () => {
    const result = await checkShellReadiness(
      {
        courseId: '42',
        termStartMonday: '2026-08-24',
        asOfDate: '2026-08-29',
        packs: ['structure', 'schedule', 'mismatch', 'instructions'],
      },
      {
        loadCfg: () => ({ canvasUrl: 'https://example.instructure.com', apiToken: 'tok' }),
        fetchGraph: async () => ({
          ...baseGraph,
          modules: [
            { id: 1, name: 'Week 1', position: 1, published: true, items: [] },
            { id: 2, name: 'Week 2', position: 2, published: true, items: [] },
            {
              id: 3,
              name: 'Week 3',
              position: 3,
              published: false,
              items: [{ id: 9, title: 'Quiz A', type: 'Quiz', published: true, contentId: 100 }],
            },
          ],
        }),
        loadPreference: () => null,
      },
    );
    expect('error' in result).toBe(false);
    if ('error' in result || 'preview' in result) return;
    expect(result.source).toBe('live-canvas');
    expect(result.primaryWeek.index).toBe(3);
    expect(result.secondaryWeek.index).toBe(2);
    expect(Array.isArray(result.quizCallouts)).toBe(true);
    expect(result.findings.some(f => f.severity === 'blocking')).toBe(true);
    expect(result.text).toContain('Shell readiness');
    expect(JSON.stringify(result)).not.toContain('tok');
  });

  it('errors when termStartMonday missing', async () => {
    const result = await checkShellReadiness({ courseId: '1' });
    expect('error' in result && result.error).toBe('TERM_START_REQUIRED');
  });
});
