import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupCourse } from 'curriculum-intelligence-mcp/dist/tools/setup_course.js';
import { importCourse } from 'canvas-design-mcp/dist/tools/import-course.js';
import { generateCourse } from 'canvas-design-mcp/dist/tools/generate-course.js';
import { analyzeCourse } from '../src/tools/workflows/analyze_course.js';
import { ingestCourse } from '../src/tools/answers/ingest/orchestrator.js';
import { askCourse } from '../src/tools/workflows/ask_course.js';
import { setupOllama } from '../src/tools/setup_ollama.js';
import { setActiveLlmProvider } from '../src/tools/set_active_llm_provider.js';
import { generateAnswer } from '../src/tools/answers/retrieval/answer.js';
import type { EmbeddingProvider } from '../src/tools/answers/provider/types.js';
import type { LlmResponse } from '@canvas-toolchain/shared-llm';
import type { Chunk } from '../src/tools/answers/types.js';

class SmokeProvider implements EmbeddingProvider {
  readonly info = { kind: 'ollama' as const, model: 'smoke', dimension: 4 };
  async embed(texts: string[]) { return texts.map(() => new Float32Array([1, 0, 0, 0])); }
}

async function smokeAnswersOllama(): Promise<void> {
  console.log('› Smoke: answers bot via Ollama (stub server) …');

  const server: Server = await new Promise((resolve, reject) => {
    const s = createServer((req, res) => {
      if (req.url === '/api/tags') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ models: [{ name: 'qwen2.5:14b' }] }));
        return;
      }
      if (req.url === '/api/generate' && req.method === 'POST') {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({
            response: 'Stub Ollama answer citing source [1].',
            done: true,
            prompt_eval_count: 5,
            eval_count: 8,
          }));
        });
        return;
      }
      res.writeHead(404);
      res.end();
    });
    s.listen(0, '127.0.0.1', () => resolve(s));
    s.on('error', reject);
  });

  const address = server.address();
  if (typeof address === 'string' || address === null) {
    throw new Error('Could not bind smoke stub server');
  }
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    // Seed configs through the real tools so we exercise the real write path.
    const ollamaSetup = await setupOllama({ baseUrl, model: 'qwen2.5:14b' });
    if (ollamaSetup.mode !== 'commit') {
      throw new Error(`setup_ollama returned unexpected mode in smoke: ${JSON.stringify(ollamaSetup)}`);
    }
    if (!ollamaSetup.ok) {
      throw new Error(`setup_ollama failed in smoke: ${JSON.stringify(ollamaSetup)}`);
    }

    const switchResult = await setActiveLlmProvider({ provider: 'ollama' });
    if (!switchResult.ok) {
      throw new Error(`set_active_llm_provider failed: ${JSON.stringify(switchResult)}`);
    }

    const sampleChunks: Chunk[] = [
      {
        content: 'VLOOKUP is supplied in week 1 as the primary spreadsheet function.',
        source: 'cds',
        sourcePath: 'week-01/overview.md',
        sourceRef: 'week-01/overview.md#goals',
        deepLink: null,
      },
    ];

    const result = await generateAnswer('What is supplied?', sampleChunks);
    if (!result.answer.includes('Stub Ollama answer')) {
      throw new Error(`Unexpected smoke answer: ${result.answer}`);
    }
    console.log('  ✓ Answers bot returned canned Ollama response');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

const COURSE_ID = 'ITM370';
const SEMESTER_ID = 'Fixture2026';
// The fixture lives in the monorepo's canvas-design-studio package — resolve it
// relative to this script so the smoke runs on any checkout, not one dev box.
const ARCHIVE_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '..', '..', 'canvas-design-studio', 'tests', 'fixtures', 'canvas-backup', 'ITM370',
);

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

  // ── Step: Answers bot via Ollama path (stub server)
  // Validates that the resolver routes through OllamaLlmClient end-to-end.
  await smokeAnswersOllama();

  console.log('Integration smoke passed.');
} finally {
  rmSync(tmpHome, { recursive: true, force: true });
  delete process.env.CC_HOME;
  delete process.env.CURRICULUM_INTELLIGENCE_HOME;
}
