import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setupCourse } from 'curriculum-intelligence-mcp/dist/tools/setup_course.js';
import { importCourse } from 'canvas-design-mcp/dist/tools/import-course.js';
import { generateCourse } from 'canvas-design-mcp/dist/tools/generate-course.js';
import { analyzeCourse } from '../src/tools/workflows/analyze_course.js';
import { ingestCourse } from '../src/tools/answers/ingest/orchestrator.js';
import { askCourse } from '../src/tools/workflows/ask_course.js';
import type { EmbeddingProvider } from '../src/tools/answers/provider/types.js';
import type { LlmResponse } from '@canvas-toolchain/shared-llm';

class SmokeProvider implements EmbeddingProvider {
  readonly info = { kind: 'ollama' as const, model: 'smoke', dimension: 4 };
  async embed(texts: string[]) { return texts.map(() => new Float32Array([1, 0, 0, 0])); }
}

const COURSE_ID = 'ITM370';
const SEMESTER_ID = 'Fixture2026';
const ARCHIVE_PATH = 'D:/Dev/canvas-design-studio/tests/fixtures/canvas-backup/ITM370';

const tmpHome = mkdtempSync(join(tmpdir(), 'cc-integration-'));
process.env.CC_HOME = tmpHome;
process.env.CURRICULUM_INTELLIGENCE_HOME = tmpHome;

try {
  console.log('Command & Control integration smoke');
  console.log(`Temp home: ${tmpHome}`);
  console.log(`Archive fixture: ${ARCHIVE_PATH}`);

  setupCourse({ id: COURSE_ID, title: 'ITM 370 Fixture Course' });

  const analysis = await analyzeCourse({
    courseId: COURSE_ID,
    semesterId: SEMESTER_ID,
    archivePath: ARCHIVE_PATH,
  });
  console.log(
    `analyze_course: status=${analysis.status} assignments=${analysis.trajectoryEntry.assignmentCount} verdicts=${JSON.stringify(analysis.trajectoryEntry.verdicts)}`,
  );

  const courseDir = join(tmpHome, 'cds-course');
  const imported = importCourse({ archivePath: ARCHIVE_PATH, outputDir: courseDir });
  console.log(
    `canvas-design import_course: files=${imported.filesCreated} weeks=${imported.weeksImported} warnings=${imported.warnings.length}`,
  );

  const generated = generateCourse({ courseDir, outputDir: join(tmpHome, 'html') });
  console.log(
    `canvas-design generate_course: pages=${generated.totalPages} warnings=${generated.warnings.length} output=${generated.outputDir}`,
  );

  if (analysis.status !== 'complete') throw new Error('analyze_course did not complete');
  if (imported.filesCreated === 0) throw new Error('import_course created no files');
  if (generated.totalPages === 0) throw new Error('generate_course created no pages');

  // Smoke: lecture answers bot end-to-end (uses a fake provider + fake LLM to avoid
  // hitting any external service in the smoke test).
  const smokeCourseDir = join(tmpHome, 'course-fixture');
  mkdirSync(join(smokeCourseDir, 'week-01'), { recursive: true });
  writeFileSync(
    join(smokeCourseDir, 'week-01', 'overview.md'),
    '# Week 1\n\n## Goals\n\nLearn VLOOKUP.',
    'utf-8',
  );

  const ingestResult = await ingestCourse({
    courseId: 1,
    courseDir: smokeCourseDir,
    transcriptSources: [],
    provider: new SmokeProvider(),
    rebuild: false,
  });
  console.log(
    `lecture answers: indexed chunks=${ingestResult.chunksAdded} files=${ingestResult.filesIndexed}`,
  );

  const askResult = await askCourse(
    {
      courseId: 1,
      courseDir: smokeCourseDir,
      transcriptSources: [],
      question: 'what should students learn this week?',
    },
    {
      provider: new SmokeProvider(),
      llm: {
        async complete(): Promise<LlmResponse> {
          return { text: 'Students learn VLOOKUP [1].', usage: { inputTokens: 100, outputTokens: 50 } };
        },
      },
    },
  );
  if (askResult.citations.length === 0) {
    throw new Error('lecture answers smoke: expected at least one citation');
  }
  console.log(
    `lecture answers: answer cites=${askResult.citations.length} mode=${askResult.retrievalMode}`,
  );

  console.log('Integration smoke passed.');
} finally {
  rmSync(tmpHome, { recursive: true, force: true });
  delete process.env.CC_HOME;
  delete process.env.CURRICULUM_INTELLIGENCE_HOME;
}
