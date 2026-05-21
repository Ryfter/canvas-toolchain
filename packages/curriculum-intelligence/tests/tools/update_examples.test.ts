import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupCourse } from '../../src/tools/setup_course.js';
import { ingestCanvasArchive } from '../../src/tools/ingest_canvas_archive.js';
import { importPreviousShell } from '../../src/tools/import_previous_shell.js';
import { updateExamples } from '../../src/tools/update_examples.js';
import { parseBriefFile, serializeBriefFile } from '../../src/parsers/front_matter.js';
import type { LlmClient } from '../../src/llm/client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIX_ARCHIVE = join(__dirname, '..', 'fixtures', 'canvas-archive-tiny');

const MOCK_LLM: LlmClient = {
  complete: async () => '[{"section": "intro", "proposed": "Updated example using 2026 tools."}]',
};

let tmpHome: string;
let firstBriefPath: string;

function injectBody(briefPath: string, newBody: string): void {
  const content = readFileSync(briefPath, 'utf-8');
  const { data } = parseBriefFile(content);
  writeFileSync(briefPath, serializeBriefFile(data, `\n${newBody}\n`), 'utf-8');
}

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'ci-home-'));
  process.env.CURRICULUM_INTELLIGENCE_HOME = tmpHome;
  setupCourse({ id: 'TEST101', title: 'Tiny Fixture Course' });
  ingestCanvasArchive({ courseId: 'TEST101', semesterId: 'Spring2025', archivePath: FIX_ARCHIVE });
  const { briefPaths } = importPreviousShell({ courseId: 'TEST101', sourceSemesterId: 'Spring2025', newSemesterId: 'Fall2025', source: 'archive' });
  firstBriefPath = briefPaths[0];
});

afterEach(() => {
  delete process.env.CURRICULUM_INTELLIGENCE_HOME;
  rmSync(tmpHome, { recursive: true, force: true });
});

describe('updateExamples — Pass 1 (mechanical)', () => {
  test('replaces stale year references older than current year', () => {
    injectBody(firstBriefPath, 'In 2022, ChatGPT was new. In 2023, AI exploded.');
    const result = updateExamples({ courseId: 'TEST101', semesterId: 'Fall2025', briefPath: firstBriefPath });
    expect(result.substitutions.length).toBeGreaterThan(0);
    const body = parseBriefFile(readFileSync(firstBriefPath, 'utf-8')).body;
    expect(body).not.toContain('2022');
    expect(body).not.toContain('2023');
  });

  test('replaces stale tool name patterns', () => {
    injectBody(firstBriefPath, 'Use GPT-3.5 to summarize text. Also try Bard for comparison.');
    updateExamples({ courseId: 'TEST101', semesterId: 'Fall2025', briefPath: firstBriefPath });
    const body = parseBriefFile(readFileSync(firstBriefPath, 'utf-8')).body;
    expect(body).not.toContain('GPT-3.5');
    expect(body).not.toContain('Bard');
  });

  test('returns list of substitutions made', () => {
    injectBody(firstBriefPath, 'In 2021, transformers changed NLP.');
    const result = updateExamples({ courseId: 'TEST101', semesterId: 'Fall2025', briefPath: firstBriefPath });
    expect(result.substitutions.some((s) => s.original.includes('2021'))).toBe(true);
  });
});

describe('updateExamples — Pass 2 (LLM, optional)', () => {
  test('returns proposed rewrites without writing to disk', async () => {
    injectBody(firstBriefPath, 'Discuss the ChatGPT launch of 2022 as a turning point.');
    const result = await updateExamples({
      courseId: 'TEST101',
      semesterId: 'Fall2025',
      briefPath: firstBriefPath,
      llmPass: true,
      llmClient: MOCK_LLM,
    });
    expect(result.proposedRewrites).toBeDefined();
    expect(Array.isArray(result.proposedRewrites)).toBe(true);
  });
});
