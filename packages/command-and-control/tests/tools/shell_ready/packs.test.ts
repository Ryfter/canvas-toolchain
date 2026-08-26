import { describe, it, expect } from 'vitest';
import {
  runStructurePack,
  runSchedulePack,
  runMismatchPack,
} from '../../../src/tools/shell_ready/packs/structure_schedule.js';
import type { ShellGraph } from '../../../src/tools/shell_ready/fetch_graph.js';
import type { ShellResolvedWeek } from '../../../src/tools/shell_ready/types.js';

const week: ShellResolvedWeek = {
  role: 'primary',
  depth: 'thorough',
  index: 3,
  label: 'Week 3',
  monday: '2026-09-07',
  sunday: '2026-09-13',
  moduleIds: [1],
  provenance: 'inferred',
};

function baseGraph(over: Partial<ShellGraph> = {}): ShellGraph {
  return {
    courseId: 1,
    courseName: 'Example',
    modules: [],
    assignments: [],
    pages: [],
    hasFrontPage: true,
    ...over,
  };
}

describe('structure pack', () => {
  it('flags ghost published item in unpublished module as blocking', () => {
    const graph = baseGraph();
    const modules = [{
      id: 1,
      name: 'Week 3',
      position: 3,
      published: false,
      items: [{ id: 9, title: 'Hidden', type: 'Assignment', published: true }],
    }];
    const findings = runStructurePack(graph, week, modules);
    expect(findings.some(f => f.id.startsWith('ghost-item:') && f.severity === 'blocking')).toBe(true);
  });
});

describe('schedule pack', () => {
  it('flags graded item missing due_at as blocking', () => {
    const graph = baseGraph({
      assignments: [{
        id: 50,
        name: 'Essay',
        published: true,
        pointsPossible: 100,
        dueAt: null,
      }],
    });
    const findings = runSchedulePack(graph, week, new Set([50]));
    expect(findings.find(f => f.id === 'missing-due:50')?.severity).toBe('blocking');
  });
});

describe('mismatch pack', () => {
  it('flags mapped assignment with dates outside Mon–Sun window', () => {
    const graph = baseGraph({
      assignments: [{
        id: 50,
        name: 'Essay',
        published: true,
        dueAt: '2026-09-20T23:59:00Z',
        pointsPossible: 10,
      }],
    });
    const findings = runMismatchPack(week, graph, new Set([50]));
    expect(findings.find(f => f.id.startsWith('mismatch-dates:'))?.severity).toBe('warning');
  });

  it('flags orphan dated in window but not on map', () => {
    const graph = baseGraph({
      assignments: [{
        id: 77,
        name: 'Orphan HW',
        published: true,
        dueAt: '2026-09-10T23:59:00Z',
        pointsPossible: 5,
      }],
    });
    const findings = runMismatchPack(week, graph, new Set());
    expect(findings.find(f => f.id.startsWith('orphan-dated:'))?.severity).toBe('suggestion');
  });
});
