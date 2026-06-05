import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, readFileSync, existsSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { draftStudentRubric } from '../../../src/tools/workflows/draft_student_rubric.js';
import type { LlmClient, LlmResponse } from '../../../src/tools/rubric/llm_client.js';

/** Build a mock LLM that returns a fixed JSON response, capturing the
 *  prompts it was called with for inspection. */
function makeFakeLlm(responseJson: object | string): LlmClient & { calls: Array<{ system: string; user: string }> } {
  const calls: Array<{ system: string; user: string }> = [];
  return {
    calls,
    async complete(system: string, user: string): Promise<LlmResponse> {
      calls.push({ system, user });
      const text = typeof responseJson === 'string' ? responseJson : JSON.stringify(responseJson);
      return { text, usage: { inputTokens: 100, outputTokens: 200 } };
    },
  };
}

let outDir: string;
beforeEach(() => {
  outDir = mkdtempSync(join(tmpdir(), 'rb-draft-'));
});

const SAMPLE_FACULTY = `1. Formula Correctness (30 pts): Formulas are syntactically correct, use appropriate functions, and produce expected outcomes. Excel error codes are absent.
2. Visual Formatting (20 pts): Workbook follows CoBE visual conventions. Headers bolded, columns formatted consistently.
3. Documentation (10 pts): Each sheet labeled, formulas commented where non-obvious.`;

describe('draftStudentRubric', () => {
  it('writes a markdown file at outputPath matching the rubric schema', async () => {
    const llm = makeFakeLlm({
      criteria: [
        {
          number: '1',
          name: 'Formula Correctness',
          points: 30,
          studentFacing: 'Your formulas point at the right cells, use the right functions, and produce the right numbers. No #VALUE!, #REF!, or #DIV/0!.',
          workedExample: 'For "total revenue per region," cell F2 contains =SUM(C2:E2). Copy down — every row computes its own total.',
          facultyFacing: 'Formulas are syntactically correct, use appropriate functions, and produce expected outcomes. Excel error codes are absent.',
        },
      ],
    });

    const outPath = join(outDir, 'rubric.md');
    const result = await draftStudentRubric(
      { facultyRubricText: SAMPLE_FACULTY, outputPath: outPath, week: 5, assignmentNumber: '7.3', totalPoints: 100 },
      { llm },
    );

    expect(result.criteriaCount).toBe(1);
    expect(result.criteria[0].name).toBe('Formula Correctness');
    expect(existsSync(outPath)).toBe(true);
    const md = readFileSync(outPath, 'utf-8');
    expect(md.startsWith('---\n')).toBe(true);
    expect(md).toContain('week: 5');
    expect(md).toContain('assignment_number: "7.3"');
    expect(md).toContain('points: 100');
    expect(md).toContain('## Criterion 1: Formula Correctness — 30 pts');
    expect(md).toContain('**For students:**');
    expect(md).toContain('No #VALUE!');
    expect(md).toContain('**Worked example:**');
    expect(md).toContain('=SUM(C2:E2)');
    expect(md).toContain('**Faculty rubric language:**');
    expect(md).toContain('Excel error codes are absent.');
    expect(md).toContain('## Notes for students');
  });

  it('sends the faculty rubric + optional brief + course context to the LLM', async () => {
    const llm = makeFakeLlm({
      criteria: [{
        number: '1', name: 'X', points: 100,
        studentFacing: 's', workedExample: 'w', facultyFacing: 'f',
      }],
    });
    await draftStudentRubric(
      {
        facultyRubricText: 'FAC',
        assignmentBrief: 'BRIEF',
        courseContext: 'CTX',
        outputPath: join(outDir, 'r.md'),
        totalPoints: 50,
      },
      { llm },
    );
    expect(llm.calls).toHaveLength(1);
    expect(llm.calls[0].user).toContain('FACULTY RUBRIC:');
    expect(llm.calls[0].user).toContain('FAC');
    expect(llm.calls[0].user).toContain('ASSIGNMENT BRIEF');
    expect(llm.calls[0].user).toContain('BRIEF');
    expect(llm.calls[0].user).toContain('COURSE CONTEXT');
    expect(llm.calls[0].user).toContain('CTX');
    expect(llm.calls[0].user).toContain('Total points for this assignment: 50');
    expect(llm.calls[0].system).toContain('studentFacing');
    expect(llm.calls[0].system).toContain('workedExample');
    expect(llm.calls[0].system).toContain('facultyFacing');
  });

  it('multi-criteria rubric round-trips through render correctly', async () => {
    const llm = makeFakeLlm({
      criteria: [
        { number: '1', name: 'A', points: 30, studentFacing: 'sa', workedExample: 'wa', facultyFacing: 'fa' },
        { number: '2', name: 'B', points: 20, studentFacing: 'sb', workedExample: 'wb', facultyFacing: 'fb' },
        { number: '3', name: 'C', points: 10, studentFacing: 'sc', workedExample: 'wc', facultyFacing: 'fc' },
      ],
    });
    const outPath = join(outDir, 'rubric.md');
    const result = await draftStudentRubric(
      { facultyRubricText: SAMPLE_FACULTY, outputPath: outPath, week: 5, totalPoints: 60 },
      { llm },
    );
    expect(result.criteriaCount).toBe(3);
    const md = readFileSync(outPath, 'utf-8');
    expect(md).toContain('## Criterion 1: A — 30 pts');
    expect(md).toContain('## Criterion 2: B — 20 pts');
    expect(md).toContain('## Criterion 3: C — 10 pts');
    // All three criteria's blocks present
    expect(md).toContain('sa'); expect(md).toContain('wa'); expect(md).toContain('fa');
    expect(md).toContain('sb'); expect(md).toContain('wb'); expect(md).toContain('fb');
    expect(md).toContain('sc'); expect(md).toContain('wc'); expect(md).toContain('fc');
  });

  it('strips ```json code fences from LLM responses', async () => {
    const llm = makeFakeLlm(
      '```json\n' +
      JSON.stringify({
        criteria: [{
          number: '1', name: 'X', points: 50,
          studentFacing: 's', workedExample: 'w', facultyFacing: 'f',
        }],
      }) +
      '\n```'
    );
    const outPath = join(outDir, 'r.md');
    const result = await draftStudentRubric(
      { facultyRubricText: SAMPLE_FACULTY, outputPath: outPath, totalPoints: 50 },
      { llm },
    );
    expect(result.criteriaCount).toBe(1);
    expect(existsSync(outPath)).toBe(true);
  });

  it('throws a clear error when the LLM returns non-JSON prose', async () => {
    const llm = makeFakeLlm("I'm sorry, I can't generate a rubric without seeing the actual assignment.");
    await expect(
      draftStudentRubric(
        { facultyRubricText: SAMPLE_FACULTY, outputPath: join(outDir, 'r.md'), totalPoints: 50 },
        { llm },
      ),
    ).rejects.toThrow(/LLM did not return valid JSON/);
  });

  it('throws when criteria is empty or missing required fields', async () => {
    const llmEmpty = makeFakeLlm({ criteria: [] });
    await expect(
      draftStudentRubric({ facultyRubricText: 'x', outputPath: join(outDir, 'r1.md') }, { llm: llmEmpty }),
    ).rejects.toThrow(/criteria.*not a non-empty array/);

    const llmMissingField = makeFakeLlm({
      criteria: [{ number: '1', name: 'X', points: 30 /* missing studentFacing etc */ }],
    });
    await expect(
      draftStudentRubric({ facultyRubricText: 'x', outputPath: join(outDir, 'r2.md') }, { llm: llmMissingField }),
    ).rejects.toThrow(/missing required field/);
  });

  it('returns usage metadata from the LLM', async () => {
    const llm = makeFakeLlm({
      criteria: [{
        number: '1', name: 'X', points: 50,
        studentFacing: 's', workedExample: 'w', facultyFacing: 'f',
      }],
    });
    const result = await draftStudentRubric(
      { facultyRubricText: SAMPLE_FACULTY, outputPath: join(outDir, 'r.md'), totalPoints: 50 },
      { llm },
    );
    expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 200 });
  });

  it('uses resolveActiveLlmClient when no LlmClient hook is supplied', async () => {
    const ccHome = mkdtempSync(join(tmpdir(), 'cc-home-rubric-'));
    const originalHome = process.env.CC_HOME;
    process.env.CC_HOME = ccHome;
    try {
      writeFileSync(join(ccHome, 'anthropic-config.json'), JSON.stringify({ apiKey: 'sk-test', model: 'claude' }));
      writeFileSync(join(ccHome, 'llm-provider.json'), JSON.stringify({ provider: 'anthropic' }));

      const { resolveActiveLlmClient } = await import('../../../src/llm/resolve.js');
      const client = resolveActiveLlmClient();
      expect(client).toBeDefined();
    } finally {
      rmSync(ccHome, { recursive: true, force: true });
      if (originalHome === undefined) delete process.env.CC_HOME;
      else process.env.CC_HOME = originalHome;
    }
  });
});
