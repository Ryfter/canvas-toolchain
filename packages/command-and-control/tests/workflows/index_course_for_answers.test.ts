import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { indexCourseForAnswers } from '../../src/tools/workflows/index_course_for_answers.js';
import type { EmbeddingProvider } from '../../src/tools/answers/provider/types.js';

class FakeProvider implements EmbeddingProvider {
  readonly info = { kind: 'ollama' as const, model: 'f', dimension: 4 };
  async embed(t: string[]) { return t.map(() => new Float32Array([0.1, 0.2, 0.3, 0.4])); }
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

describe('indexCourseForAnswers', () => {
  it('returns ok=true with provider + duration when ingestion succeeds', async () => {
    mkdirSync(join(courseDir, 'week-01'), { recursive: true });
    writeFileSync(join(courseDir, 'week-01', 'overview.md'), '# Week 1\nstuff');
    const r = await indexCourseForAnswers(
      { courseId: 1, courseDir, transcriptSources: [transcriptDir] },
      { provider: new FakeProvider() },
    );
    expect(r.ok).toBe(true);
    expect(r.provider).toBe('ollama');
    expect(r.durationMs).toBeGreaterThanOrEqual(0);
    expect(r.chunksAdded).toBeGreaterThan(0);
  });
});
