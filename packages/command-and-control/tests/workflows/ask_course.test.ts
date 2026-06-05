import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { askCourse } from '../../src/tools/workflows/ask_course.js';
import type { EmbeddingProvider } from '../../src/tools/answers/provider/types.js';
import type { LlmClient, LlmResponse } from '@canvas-toolchain/shared-llm';

class FakeProvider implements EmbeddingProvider {
  readonly info = { kind: 'ollama' as const, model: 'f', dimension: 4 };
  async embed(t: string[]) { return t.map(() => new Float32Array([1, 0, 0, 0])); }
}

function fakeLlm(text: string): LlmClient {
  return { async complete(): Promise<LlmResponse> { return { text, usage: { inputTokens: 1, outputTokens: 1 } }; } };
}

let courseDir: string;
let transcriptDir: string;

beforeEach(() => {
  courseDir = mkdtempSync(join(tmpdir(), 'course-'));
  transcriptDir = mkdtempSync(join(tmpdir(), 'tx-'));
});
afterEach(() => {
  rmSync(courseDir, { recursive: true, force: true });
  rmSync(transcriptDir, { recursive: true, force: true });
});

describe('askCourse', () => {
  it('end-to-end: ingest, retrieve, answer, citations', async () => {
    mkdirSync(join(courseDir, 'week-01'), { recursive: true });
    writeFileSync(join(courseDir, 'week-01', 'overview.md'),
      '# Week 1\nVLOOKUP looks up values in the leftmost column.');
    const result = await askCourse(
      { courseId: 1, courseDir, transcriptSources: [transcriptDir], question: 'what is VLOOKUP?' },
      { provider: new FakeProvider(), llm: fakeLlm('VLOOKUP is for vertical lookups [1].') },
    );
    expect(result.answer).toMatch(/VLOOKUP/);
    expect(result.citations.length).toBeGreaterThanOrEqual(1);
    expect(result.retrievalMode).toBe('hybrid');
  });
});
