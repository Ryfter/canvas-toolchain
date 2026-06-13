import { describe, it, expect } from 'vitest';
import { renderGroupsCsv, renderGroupsMarkdown } from '../../src/output/file.js';
import type { StudentRecord } from '../../src/types.js';

const recs: StudentRecord[] = [
  { canvasId: '1', pseudonym: 'SU26-001', metrics: {} },
  { canvasId: '2', pseudonym: 'SU26-002', metrics: {} },
  { canvasId: '3', pseudonym: 'SU26-003', metrics: {} },
];
const grouping = [['1', '2'], ['3']];

describe('output writers', () => {
  it('CSV has header + group,pseudonym,canvas_id rows', () => {
    const csv = renderGroupsCsv(grouping, recs);
    expect(csv.split('\n')[0]).toBe('group,pseudonym,canvas_id');
    expect(csv).toContain('1,SU26-001,1');
    expect(csv).toContain('2,SU26-003,3');
  });
  it('markdown lists groups with member pseudonyms', () => {
    const md = renderGroupsMarkdown(grouping, recs, { strategy: 'random', groupCount: 2, sizes: [2, 1], repeatPairs: [], seed: 7 });
    expect(md).toContain('## Group 1');
    expect(md).toContain('SU26-001');
    expect(md).toContain('Strategy: random');
  });
});
