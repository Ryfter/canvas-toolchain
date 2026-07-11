import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ingestCourse } from '../../../src/tools/answers/ingest/orchestrator.js';
import { readIndexMeta } from '../../../src/tools/answers/store/index_meta.js';
import type { EmbeddingProvider } from '../../../src/tools/answers/provider/types.js';

class FakeProvider implements EmbeddingProvider {
  readonly info = { kind: 'ollama' as const, model: 'fake', dimension: 4 };
  async embed(texts: string[]) { return texts.map(() => new Float32Array([0.1, 0.2, 0.3, 0.4])); }
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

describe('ingestCourse', () => {
  it('indexes a fresh corpus end-to-end and writes index-meta', async () => {
    writeFileSync(join(transcriptDir, 'week01.enriched.md'), `---
sourcePlatform: panopto
sourceId: abc
deepLinkTemplate: "https://x/{sourceId}?t={startSeconds}"
---
[00:00:00] hello
[00:00:30] world
`);
    mkdirSync(join(courseDir, 'week-01'), { recursive: true });
    writeFileSync(join(courseDir, 'week-01', 'overview.md'), `# Week 1\n## Goals\nlearn things`);
    mkdirSync(join(courseDir, 'answers'), { recursive: true });
    writeFileSync(join(courseDir, 'answers', 'canonical.md'), `## How is grading done?\nWeighted average.`);

    const provider = new FakeProvider();
    const result = await ingestCourse({
      courseId: 20244, courseDir, transcriptSources: [transcriptDir],
      provider, rebuild: false,
    });

    expect(result.filesScanned).toBeGreaterThanOrEqual(3);
    expect(result.chunksAdded).toBeGreaterThanOrEqual(3);
    const meta = readIndexMeta(courseDir);
    expect(meta).not.toBeNull();
    expect(meta!.provider.dimension).toBe(4);
  });

  it('incremental re-index skips unchanged files', async () => {
    writeFileSync(join(transcriptDir, 'lec.enriched.md'),
      `---
sourcePlatform: panopto
sourceId: x
deepLinkTemplate: "https://x/{sourceId}?t={startSeconds}"
---
[00:00:00] hi
`);
    const provider = new FakeProvider();
    const first = await ingestCourse({
      courseId: 1, courseDir, transcriptSources: [transcriptDir],
      provider, rebuild: false,
    });
    const second = await ingestCourse({
      courseId: 1, courseDir, transcriptSources: [transcriptDir],
      provider, rebuild: false,
    });
    expect(second.filesIndexed).toBe(0);
    expect(second.chunksAdded).toBe(0);
    expect(second.chunksTotal).toBe(first.chunksTotal);
  });

  it('detects + removes chunks for deleted source files', async () => {
    const f = join(transcriptDir, 'gone.enriched.md');
    writeFileSync(f, `---
sourcePlatform: panopto
sourceId: x
deepLinkTemplate: "https://x/{sourceId}?t={startSeconds}"
---
[00:00:00] hi
`);
    const provider = new FakeProvider();
    await ingestCourse({ courseId: 1, courseDir, transcriptSources: [transcriptDir], provider, rebuild: false });
    rmSync(f);
    const second = await ingestCourse({ courseId: 1, courseDir, transcriptSources: [transcriptDir], provider, rebuild: false });
    expect(second.chunksRemoved).toBeGreaterThan(0);
  });

  it('rebuild=true wipes and re-indexes', async () => {
    writeFileSync(join(transcriptDir, 'a.enriched.md'),
      `---
sourcePlatform: panopto
sourceId: x
deepLinkTemplate: "https://x/{sourceId}?t={startSeconds}"
---
[00:00:00] hi
`);
    const provider = new FakeProvider();
    await ingestCourse({ courseId: 1, courseDir, transcriptSources: [transcriptDir], provider, rebuild: false });
    const second = await ingestCourse({
      courseId: 1, courseDir, transcriptSources: [transcriptDir],
      provider, rebuild: true,
    });
    expect(second.filesIndexed).toBeGreaterThan(0);
    expect(second.chunksAdded).toBeGreaterThan(0);
  });
});
