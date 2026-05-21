import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupCourse } from '../../src/tools/setup_course.js';
import { ingestCanvasArchive } from '../../src/tools/ingest_canvas_archive.js';
import { importPreviousShell } from '../../src/tools/import_previous_shell.js';
import { draftAssignmentBrief } from '../../src/tools/draft_assignment_brief.js';
import { parseBriefFile, serializeBriefFile } from '../../src/parsers/front_matter.js';
import type { LlmClient } from '../../src/llm/client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIX_ARCHIVE = join(__dirname, '..', 'fixtures', 'canvas-archive-tiny');

const MOCK_LLM: LlmClient = {
  complete: async () =>
    'This assignment introduces students to generative AI concepts through peer introductions.',
};

let tmpHome: string;
let firstBriefPath: string;

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

describe('draftAssignmentBrief', () => {
  test('overwrites brief body with LLM-generated content', async () => {
    await draftAssignmentBrief({
      courseId: 'TEST101',
      semesterId: 'Fall2025',
      briefPath: firstBriefPath,
      llmClient: MOCK_LLM,
    });
    const { body } = parseBriefFile(readFileSync(firstBriefPath, 'utf-8'));
    expect(body.trim()).toContain('generative AI');
  });

  test('preserves front matter after drafting', async () => {
    await draftAssignmentBrief({
      courseId: 'TEST101',
      semesterId: 'Fall2025',
      briefPath: firstBriefPath,
      llmClient: MOCK_LLM,
    });
    const { data } = parseBriefFile(readFileSync(firstBriefPath, 'utf-8'));
    expect(data['verdict']).toBeDefined();
    expect(data['due']).toBeDefined();
  });

  test('sets replacement_recommended when verdict is DROP', async () => {
    const content = readFileSync(firstBriefPath, 'utf-8');
    const { data, body } = parseBriefFile(content);
    data['verdict'] = 'DROP';
    writeFileSync(firstBriefPath, serializeBriefFile(data, body), 'utf-8');

    await draftAssignmentBrief({
      courseId: 'TEST101',
      semesterId: 'Fall2025',
      briefPath: firstBriefPath,
      llmClient: MOCK_LLM,
    });
    const { data: updated } = parseBriefFile(readFileSync(firstBriefPath, 'utf-8'));
    expect(updated['replacement_recommended']).toBe(true);
  });

  test('sets replacement_recommended when semestersSince >= 6', async () => {
    const content = readFileSync(firstBriefPath, 'utf-8');
    const { data, body } = parseBriefFile(content);
    data['semestersSince'] = 7;
    writeFileSync(firstBriefPath, serializeBriefFile(data, body), 'utf-8');

    await draftAssignmentBrief({
      courseId: 'TEST101',
      semesterId: 'Fall2025',
      briefPath: firstBriefPath,
      llmClient: MOCK_LLM,
    });
    const { data: updated } = parseBriefFile(readFileSync(firstBriefPath, 'utf-8'));
    expect(updated['replacement_recommended']).toBe(true);
  });
});
