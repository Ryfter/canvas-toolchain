import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setupCourse } from '../../src/tools/setup_course.js';
import { ingestCanvasArchive } from '../../src/tools/ingest_canvas_archive.js';
import { scoreTopicCurrency } from '../../src/tools/score_topic_currency.js';
import { recommendForTopic } from '../../src/tools/recommend_for_topic.js';
import type { LlmClient } from '../../src/llm/client.js';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ARCHIVE = join(__dirname, '..', 'fixtures', 'canvas-archive-tiny');

let tmpHome: string;

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'ci-home-'));
  process.env.CURRICULUM_INTELLIGENCE_HOME = tmpHome;
  setupCourse({ id: 'TEST101', title: 'Test Course' });
  ingestCanvasArchive({ courseId: 'TEST101', semesterId: 'Spring2025', archivePath: ARCHIVE });
});

afterEach(() => {
  delete process.env.CURRICULUM_INTELLIGENCE_HOME;
  rmSync(tmpHome, { recursive: true, force: true });
});

describe('score_topic_currency', () => {
  test('classifies a recently-mentioned topic as current or evergreen', () => {
    const result = scoreTopicCurrency({
      courseId: 'TEST101',
      semesterId: 'Spring2025',
      topic: 'Chain-of-thought prompting',
      newsHits: 3,
      lastTaughtSemesterId: 'Spring2025',
    });
    expect(['evergreen', 'current']).toContain(result.currencyClass);
    expect(result.topic).toBe('Chain-of-thought prompting');
    expect(result.signals).toBeDefined();
  });

  test('classifies a topic with no news hits and taught 3+ years ago as dated', () => {
    const result = scoreTopicCurrency({
      courseId: 'TEST101',
      semesterId: 'Spring2025',
      topic: 'COBOL batch processing',
      newsHits: 0,
      lastTaughtSemesterId: 'Spring2021',
    });
    expect(result.currencyClass).toBe('dated');
  });

  test('returns signals object with expected keys', () => {
    const result = scoreTopicCurrency({
      courseId: 'TEST101',
      semesterId: 'Spring2025',
      topic: 'Prompt injection',
      newsHits: 5,
      lastTaughtSemesterId: 'Fall2024',
    });
    expect(result.signals).toHaveProperty('newsHits');
    expect(result.signals).toHaveProperty('semestersSinceLastTaught');
  });

  test('returns semanticRelevanceVerified when semanticVerify is true and newsHits present', async () => {
    const mockClient: LlmClient = {
      complete: vi.fn().mockResolvedValue('YES\nThese headlines are directly about prompt injection curriculum.'),
    };
    const result = await scoreTopicCurrency({
      courseId: 'ITM370',
      semesterId: 'Spring2026',
      topic: 'Prompt injection attacks',
      newsHits: [{ source: 'rss:simonwillison', date: '2026-02-11', title: 'Agent prompt injection' }],
      lastTaughtSemesterId: 'Fall2024',
      semanticVerify: true,
      llmClient: mockClient,
    });
    expect(result.semanticRelevanceVerified).toBe(true);
    expect(result.semanticRationale).toContain('prompt injection');
  });

  test('omits semanticRelevanceVerified when semanticVerify is false', async () => {
    const result = await scoreTopicCurrency({
      courseId: 'ITM370',
      semesterId: 'Spring2026',
      topic: 'Prompt injection attacks',
      newsHits: [{ source: 'rss:simonwillison', date: '2026-02-11', title: 'Agent prompt injection' }],
      lastTaughtSemesterId: 'Fall2024',
      semanticVerify: false,
    });
    expect(result.semanticRelevanceVerified).toBeUndefined();
  });

  test('gracefully skips stage 2 when LLM throws', async () => {
    const mockClient: LlmClient = { complete: vi.fn().mockRejectedValue(new Error('network')) };
    const result = await scoreTopicCurrency({
      courseId: 'ITM370',
      semesterId: 'Spring2026',
      topic: 'Prompt injection attacks',
      newsHits: [{ source: 'rss:simonwillison', date: '2026-02-11', title: 'Agent prompt injection' }],
      lastTaughtSemesterId: 'Fall2024',
      semanticVerify: true,
      llmClient: mockClient,
    });
    expect(result.currencyClass).toBeDefined();
    expect(result.semanticRelevanceVerified).toBeUndefined();
  });
});

describe('recommend_for_topic', () => {
  test('returns verdict KEEP for evergreen topic with recent teaching', () => {
    const result = recommendForTopic({
      courseId: 'TEST101',
      semesterId: 'Spring2025',
      topic: 'Chain-of-thought prompting',
      currencyClass: 'evergreen',
      lastTaughtSemesterId: 'Fall2024',
      newsHits: 2,
    });
    expect(['KEEP', 'UPDATE']).toContain(result.verdict);
    expect(result.rationale).toBeTruthy();
  });

  test('returns verdict DROP for dated topic with no news hits', () => {
    const result = recommendForTopic({
      courseId: 'TEST101',
      semesterId: 'Spring2025',
      topic: 'Legacy batch processing',
      currencyClass: 'dated',
      lastTaughtSemesterId: 'Spring2020',
      newsHits: 0,
    });
    expect(result.verdict).toBe('DROP');
  });

  test('returns verdict ADD for a new topic never taught', () => {
    const result = recommendForTopic({
      courseId: 'TEST101',
      semesterId: 'Spring2025',
      topic: 'Agent tool poisoning',
      currencyClass: 'current',
      lastTaughtSemesterId: null,
      newsHits: 8,
    });
    expect(result.verdict).toBe('ADD');
  });

  test('returns UPDATE for current topic not taught recently', () => {
    const result = recommendForTopic({
      courseId: 'TEST101',
      semesterId: 'Spring2025',
      topic: 'Prompt injection defenses',
      currencyClass: 'current',
      lastTaughtSemesterId: 'Spring2022',
      newsHits: 4,
    });
    expect(['UPDATE', 'ADD']).toContain(result.verdict);
  });

  test('default output includes topic, verdict, and rationale only', () => {
    const result = recommendForTopic({
      courseId: 'TEST101',
      semesterId: 'Spring2025',
      topic: 'Retrieval-augmented generation',
      currencyClass: 'current',
      lastTaughtSemesterId: 'Fall2024',
      newsHits: 6,
    });
    expect(result).toHaveProperty('topic');
    expect(result).toHaveProperty('verdict');
    expect(result).toHaveProperty('rationale');
    // details not present unless requested
    expect(result).not.toHaveProperty('details');
  });

  test('includes details when includeDetails=true', () => {
    const result = recommendForTopic({
      courseId: 'TEST101',
      semesterId: 'Spring2025',
      topic: 'RAG patterns',
      currencyClass: 'current',
      lastTaughtSemesterId: 'Fall2024',
      newsHits: 3,
      includeDetails: true,
    });
    expect(result).toHaveProperty('details');
    expect(result.details).toHaveProperty('currencyClass');
    expect(result.details).toHaveProperty('newsHits');
  });
});
