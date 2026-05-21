import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { analyzeCourse } from '../../../src/tools/workflows/analyze_course.js';

let tmpHome: string;

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'cc-home-'));
  process.env.CC_HOME = tmpHome;
  process.env.CURRICULUM_INTELLIGENCE_HOME = tmpHome;
});

afterEach(() => {
  delete process.env.CC_HOME;
  delete process.env.CURRICULUM_INTELLIGENCE_HOME;
  rmSync(tmpHome, { recursive: true, force: true });
  vi.restoreAllMocks();
});

vi.mock('curriculum-intelligence-mcp/dist/tools/ingest_canvas_archive.js', () => ({
  ingestCanvasArchive: vi.fn().mockReturnValue({ moduleCount: 5, assignmentCount: 20, pageCount: 30, resourceLinkCount: 10 }),
}));

describe('analyzeCourse', () => {
  it('runs ingest and returns complete status', async () => {
    const result = await analyzeCourse({ courseId: 'ITM370', semesterId: 'Spring2025', archivePath: '/fake/path' });
    expect(result.ingest.assignmentCount).toBe(20);
    expect(result.status).toBe('complete');
  });
});
