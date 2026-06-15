// tests/tools/rubric/change_detect.test.ts
import { describe, it, expect } from 'vitest';
import { detectRubricChange, parseFacultyBlocks } from '../../../src/tools/rubric/change_detect.js';
import type { PulledRubric } from '../../../src/tools/rubric/sync_types.js';

const pulled: PulledRubric = {
  source: { kind: 'assignment', courseId: '1', assignmentId: '2', title: 'A' },
  criteria: [
    { id: 'c1', name: 'Thesis', points: 10, description: 'Clear arguable thesis with a roadmap' },
    { id: 'c2', name: 'Evidence', points: 10, description: 'Cites at least three sources' },
  ],
};

const priorMd = `---
title: "Rubric"
---

## Criterion 1: Thesis — 10 pts

**For students:**
Say what you argue.

**Worked example:**
"This paper argues X because Y."

**Faculty rubric language:**
Clear arguable thesis with a roadmap

## Criterion 2: Evidence — 10 pts

**Faculty rubric language:**
Cites at least two sources
`;

describe('change_detect', () => {
  it('parses faculty blocks into name->text pairs', () => {
    expect(parseFacultyBlocks(priorMd)).toEqual({
      Thesis: 'Clear arguable thesis with a roadmap',
      Evidence: 'Cites at least two sources',
    });
  });

  it('reports first-draft when there is no prior markdown', () => {
    expect(detectRubricChange(pulled, undefined).status).toBe('first-draft');
  });

  it('reports unchanged when faculty text matches', () => {
    const onlyThesis: PulledRubric = { ...pulled, criteria: [pulled.criteria[0]] };
    const md = `## Criterion 1: Thesis — 10 pts\n\n**Faculty rubric language:**\nClear arguable thesis with a roadmap\n`;
    expect(detectRubricChange(onlyThesis, md).status).toBe('unchanged');
  });

  it('flags modified + added criteria', () => {
    const report = detectRubricChange(pulled, priorMd);
    expect(report.status).toBe('changed');
    expect(report.modified).toEqual([
      { name: 'Evidence', before: 'Cites at least two sources', after: 'Cites at least three sources' },
    ]);
    expect(report.added).toEqual([]);
    expect(report.removed).toEqual([]);
  });

  it('flags a removed criterion present in prior but not pulled', () => {
    const md = priorMd + `\n## Criterion 3: Style — 5 pts\n\n**Faculty rubric language:**\nUses APA\n`;
    const report = detectRubricChange(pulled, md);
    expect(report.removed).toEqual(['Style']);
  });
});
