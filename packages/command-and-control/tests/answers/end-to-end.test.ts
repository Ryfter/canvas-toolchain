import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { indexCourseForAnswers } from '../../src/tools/workflows/index_course_for_answers.js';
import { askCourse } from '../../src/tools/workflows/ask_course.js';
import type { EmbeddingProvider } from '../../src/tools/answers/provider/types.js';
import type { LlmClient, LlmResponse } from '@canvas-toolchain/shared-llm';

const FIXTURE_ROOT = join(__dirname, '..', 'fixtures', 'answers');

class FakeProvider implements EmbeddingProvider {
  readonly info = { kind: 'ollama' as const, model: 'fake', dimension: 4 };
  async embed(t: string[]) { return t.map(() => new Float32Array([1, 0, 0, 0])); }
}

function fakeLlm(text: string): LlmClient {
  return { async complete(): Promise<LlmResponse> { return { text, usage: { inputTokens: 100, outputTokens: 50 } }; } };
}

let courseDir: string;
let transcriptDir: string;

beforeEach(() => {
  courseDir = mkdtempSync(join(tmpdir(), 'e2e-course-'));
  transcriptDir = mkdtempSync(join(tmpdir(), 'e2e-tx-'));
  cpSync(join(FIXTURE_ROOT, 'course'), courseDir, { recursive: true });
  cpSync(join(FIXTURE_ROOT, 'transcripts'), transcriptDir, { recursive: true });
});
afterEach(() => {
  rmSync(courseDir, { recursive: true, force: true });
  rmSync(transcriptDir, { recursive: true, force: true });
});

describe('end-to-end: index → ask → answer with citations', () => {
  it('indexes every source type and answers with citations spanning sources', async () => {
    const provider = new FakeProvider();
    const indexResult = await indexCourseForAnswers(
      { courseId: 20244, courseDir, transcriptSources: [transcriptDir] },
      { provider },
    );
    expect(indexResult.ok).toBe(true);
    expect(indexResult.chunksAdded).toBeGreaterThanOrEqual(3);

    const askResult = await askCourse(
      { courseId: 20244, courseDir, transcriptSources: [transcriptDir], question: 'what is VLOOKUP and how is the final project graded?' },
      { provider, llm: fakeLlm('VLOOKUP looks up values [1]. The final project is 40% rubric, 60% peer eval [2].') },
    );
    expect(askResult.answer).toMatch(/VLOOKUP/);
    expect(askResult.citations).toHaveLength(2);
    expect(askResult.citations.some(c => c.source === 'canonical')).toBe(true);
    expect(askResult.retrievalMode).toBe('hybrid');
  });

  it('incremental re-index on second ask_course picks up canonical edits', async () => {
    const provider = new FakeProvider();
    await indexCourseForAnswers(
      { courseId: 20244, courseDir, transcriptSources: [transcriptDir] }, { provider });

    // Mutate canonical FAQ
    const canonicalPath = join(courseDir, 'answers', 'canonical.md');
    const { writeFileSync } = await import('node:fs');
    writeFileSync(canonicalPath, `## What is the late policy?\n\n10% per day, max 3 days.`, 'utf-8');

    const r = await askCourse(
      { courseId: 20244, courseDir, transcriptSources: [transcriptDir], question: 'late policy?' },
      { provider, llm: fakeLlm('Late policy: 10% per day [1].') },
    );
    // Should retrieve the new canonical chunk (it was indexed incrementally during the askCourse call).
    expect(r.citations.some(c => c.source === 'canonical' && c.snippet.includes('10%'))).toBe(true);
  });
});
