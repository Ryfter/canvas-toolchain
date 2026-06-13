import { describe, it, expect } from 'vitest';
import type { StudentRecord, Grouping, StrategyId } from '../src/types.js';

describe('core types', () => {
  it('a StudentRecord is structurally usable', () => {
    const r: StudentRecord = { canvasId: '101', pseudonym: 'SU26-001', major: 'IT Management', metrics: { overallGrade: 91 } };
    expect(r.metrics.overallGrade).toBe(91);
  });
  it('a Grouping is an array of canvasId arrays', () => {
    const g: Grouping = [['101', '102'], ['103']];
    expect(g[0]).toContain('101');
  });
  it('StrategyId admits the six strategies', () => {
    const ids: StrategyId[] = ['random', 'alphabetical', 'weighted', 'heterogeneous', 'homogeneous', 'major-diversity'];
    expect(ids).toHaveLength(6);
  });
});
