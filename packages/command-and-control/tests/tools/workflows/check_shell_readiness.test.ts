import { describe, it, expect } from 'vitest';
import { checkShellReadiness } from '../../../src/tools/workflows/check_shell_readiness.js';
import type { ShellGraph } from '../../../src/tools/shell_ready/fetch_graph.js';

function graphWithWeeks(): ShellGraph {
  return {
    courseId: 42,
    courseName: 'Example Course',
    modules: [
      { id: 1, name: 'Week 1', position: 1, published: true, items: [] },
      { id: 2, name: 'Week 2', position: 2, published: true, items: [] },
      {
        id: 3,
        name: 'Week 3',
        position: 3,
        published: true,
        items: [
          { id: 30, title: 'Quiz A', type: 'Quiz', published: true, contentId: 900 },
        ],
      },
    ],
    assignments: [],
    pages: [],
    hasFrontPage: true,
  };
}

const hermeticDeps = {
  loadCfg: () => ({ canvasUrl: 'https://example.instructure.com', apiToken: 'tok' }),
  fetchGraph: async () => graphWithWeeks(),
  loadPreference: () => null as null,
};

describe('checkShellReadiness', () => {
  it('manual run returns primary/secondary weeks with findings arrays', async () => {
    const result = await checkShellReadiness(
      {
        courseId: '42',
        asOfDate: '2026-08-29',
        termStartMonday: '2026-08-24',
        packs: [],
      },
      hermeticDeps,
    );
    expect('error' in result).toBe(false);
    if ('error' in result || 'preview' in result) return;
    expect(result.primaryWeek.index).toBe(3);
    expect(result.secondaryWeek.index).toBe(2);
    expect(result.primaryWeek.depth).toBe('thorough');
    expect(result.secondaryWeek.depth).toBe('lighter');
    expect(result.findings).toEqual([]);
    expect(Array.isArray(result.quizCallouts)).toBe(true);
    expect(result.trigger).toBe('manual');
    expect(result.preference).toEqual({ configured: false, enabled: false, day: null });
    expect(result.source).toBe('live-canvas');
    expect(result.framing).toBe('professor-week-map-hybrid');
    expect(result.text).toMatch(/Shell readiness/);
  });

  it('missing termStartMonday returns structured error', async () => {
    const result = await checkShellReadiness(
      { courseId: '42', asOfDate: '2026-08-29' },
      hermeticDeps,
    );
    expect('error' in result && result.error).toBe('TERM_START_REQUIRED');
  });

  it('emits quizCallouts for quizzes in primary week when packs run', async () => {
    const result = await checkShellReadiness(
      {
        courseId: '42',
        asOfDate: '2026-08-29',
        termStartMonday: '2026-08-24',
        packs: ['structure'],
      },
      hermeticDeps,
    );
    if ('error' in result || 'preview' in result) throw new Error('unexpected');
    expect(result.quizCallouts.some(c => c.weekRole === 'primary' && c.quizIds.includes(900))).toBe(true);
  });

  it('adds cadenceNote when weekly enabled but asOfDate is off-day', async () => {
    const result = await checkShellReadiness(
      {
        courseId: '42',
        asOfDate: '2026-08-26', // Wednesday
        termStartMonday: '2026-08-24',
        packs: [],
      },
      {
        ...hermeticDeps,
        loadPreference: () => ({
          weeklyCheckEnabled: true,
          weeklyCheckDay: 'saturday',
          updatedAt: '2026-08-01T00:00:00.000Z',
        }),
      },
    );
    if ('error' in result || 'preview' in result) throw new Error('unexpected');
    expect(result.cadenceNote).toMatch(/saturday/i);
  });
});
