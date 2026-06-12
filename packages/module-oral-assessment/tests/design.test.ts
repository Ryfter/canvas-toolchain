import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { designOralAssessment } from '../src/design.js';
import type { LlmClient, LlmResponse } from '@canvas-toolchain/shared-llm';

function fakeLlm(json: object): LlmClient & { calls: Array<{ system: string; user: string }> } {
  const calls: Array<{ system: string; user: string }> = [];
  return {
    calls,
    async complete(system: string, user: string): Promise<LlmResponse> {
      calls.push({ system, user });
      return { text: JSON.stringify(json), usage: { inputTokens: 10, outputTokens: 20 } };
    },
  };
}

const RESP = {
  title: 'Concept Check',
  promptSummary: 'Explain opportunity cost aloud.',
  questions: [{ prompt: 'What is opportunity cost?' }, { prompt: 'Give an example.' }, { prompt: 'Why does it matter?' }],
  rubricCriteria: [{ name: 'Accuracy', description: 'Correctness', points: 10 }],
};

let dir: string;
afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

describe('designOralAssessment', () => {
  it('writes the page .md and the rhetorix sidecar, returns recommendation', async () => {
    dir = mkdtempSync(join(tmpdir(), 'oa-design-'));
    const outputPath = join(dir, 'oral-assessment.md');
    const llm = fakeLlm(RESP);
    const result = await designOralAssessment(
      { assignmentBrief: 'Memo on pricing', week: 4, outputPath, launchDomain: 'rhetorixlab.boisestate.edu', aiasLevel: 3 },
      { llm },
    );
    expect(existsSync(result.pagePath)).toBe(true);
    expect(existsSync(result.specPath)).toBe(true);
    expect(result.specPath.endsWith('.rhetorix.md')).toBe(true);
    expect(result.questionCount).toBe(3);
    expect(result.recommendation.toLowerCase()).toContain('rhetorix');

    const page = readFileSync(result.pagePath, 'utf-8');
    expect(page).toContain('launch_url: "https://rhetorixlab.boisestate.edu/lti/launch"');
    expect(page).toContain('aiasLevel: 3');

    const sidecar = readFileSync(result.specPath, 'utf-8');
    expect(sidecar).toContain('paste into Rhetorix Lab');
    expect(sidecar).toContain('1. What is opportunity cost?');
  });

  it('rejects when neither brief nor topic+goal is provided', async () => {
    dir = mkdtempSync(join(tmpdir(), 'oa-design-'));
    await expect(
      designOralAssessment({ outputPath: join(dir, 'x.md') }, { llm: fakeLlm(RESP) }),
    ).rejects.toThrow(/assignmentBrief.*or.*topic/i);
  });

  it('passes provider default timing into the spec when caller omits overrides', async () => {
    dir = mkdtempSync(join(tmpdir(), 'oa-design-'));
    const result = await designOralAssessment(
      { topic: 'X', learningGoal: 'Y', outputPath: join(dir, 'p.md') },
      { llm: fakeLlm(RESP) },
    );
    const page = readFileSync(result.pagePath, 'utf-8');
    expect(page).toContain('prep_seconds: 30');
    expect(page).toContain('response_seconds: 120');
  });
});
