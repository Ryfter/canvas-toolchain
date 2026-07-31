import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('../../../src/lib/page-renderer.js', () => ({
  renderPageWithA11y: vi.fn(),
}));
vi.mock('../../../src/lib/kb-bridge.js', () => ({
  loadKb: vi.fn(),
}));
vi.mock('../../../src/lib/verdict-template-resolver.js', () => ({
  resolveResources: vi.fn(),
}));
vi.mock('@canvas-toolchain/curriculum-intelligence/dist/tools/export_course_folder.js', () => ({
  exportCourseFolder: vi.fn(),
}));

import { renderPageWithA11y } from '../../../src/lib/page-renderer.js';
import { loadKb } from '../../../src/lib/kb-bridge.js';
import { resolveResources } from '../../../src/lib/verdict-template-resolver.js';
import { exportCourseFolder } from '@canvas-toolchain/curriculum-intelligence/dist/tools/export_course_folder.js';
import { updateCourseMaterials } from '../../../src/tools/workflows/update_course_materials.js';

const mockRenderPage = vi.mocked(renderPageWithA11y);
const mockLoadKb = vi.mocked(loadKb);
const mockResolveResources = vi.mocked(resolveResources);
const mockExportCourseFolder = vi.mocked(exportCourseFolder);

const RESOLVED = {
  templateId: 'assignment',
  templateVersion: '1.0.0',
  themeId: 'cds-default',
  themeVersion: '1.0.0',
  promptSetId: 'cds-default',
  promptSetVersion: '1.0.0',
};

const CLEAN_PAGE = {
  assignmentName: 'test-assignment',
  verdict: 'KEEP' as const,
  templateUsed: { id: 'assignment', version: '1.0.0' },
  themeUsed: { id: 'cds-default', version: '1.0.0' },
  promptSetUsed: { id: 'cds-default', version: '1.0.0' },
  htmlPath: '/tmp/output/assignment.html',
  status: 'clean' as const,
};

function makeKb(verdicts: Array<{ topic: string; verdict: string }> = []) {
  return {
    philosophyKb: () => null,
    studentPersonas: () => null,
    courseTrajectory: () =>
      verdicts.length === 0
        ? null
        : [
            {
              schemaVersion: 1 as const,
              timestamp: '2026-01-01T00:00:00.000Z',
              courseId: 'ITM370',
              semesterId: 'Fall2026',
              priorSemesters: { sameSeason: null, mostRecent: null },
              assignmentCount: verdicts.length,
              verdicts: { KEEP: 0, UPDATE: 0, DROP: 0, ADD: 0 },
              perAssignment: verdicts.map((v) => ({
                topic: v.topic,
                verdict: v.verdict as never,
                currencyClass: 'evergreen' as const,
                newsHitCount: 0,
                trajectoryFlag: 'stable' as const,
                verdictPrior: null,
                verdictHistory: [],
              })),
              diff: { sameSeason: null, mostRecent: null },
            },
          ],
    courseTopicMap: () => null,
    courseDesignFolder: () => null,
  };
}

let tmpHome: string;

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'cc-ucm-'));
  process.env.CURRICULUM_INTELLIGENCE_HOME = tmpHome;
  mockLoadKb.mockReturnValue(makeKb());
  mockResolveResources.mockReturnValue(RESOLVED);
  mockRenderPage.mockReturnValue(CLEAN_PAGE);
  mockExportCourseFolder.mockReturnValue({
    courseId: 'ITM370',
    semesterId: 'Fall2026',
    outputPaths: ['/tmp/export'],
    sectionCount: 1,
  });
});

afterEach(() => {
  delete process.env.CURRICULUM_INTELLIGENCE_HOME;
  rmSync(tmpHome, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function makeBrief(courseId: string, semesterId: string, name: string): string {
  const weekDir = join(tmpHome, 'courses', courseId, 'semesters', semesterId, 'next-plan', 'week-01');
  mkdirSync(weekDir, { recursive: true });
  const briefPath = join(weekDir, `${name}.md`);
  writeFileSync(briefPath, `---\ntitle: ${name}\n---\nbody`);
  return briefPath;
}

describe('updateCourseMaterials', () => {
  describe('auto mode (default)', () => {
    it('renders each brief and returns complete status', async () => {
      makeBrief('ITM370', 'Fall2026', 'test-assignment');
      const result = await updateCourseMaterials({ courseId: 'ITM370', semesterId: 'Fall2026' });

      expect(result.status).toBe('complete');
      expect(result.pages).toHaveLength(1);
      expect(result.pages[0].status).toBe('clean');
      expect(result.summary.totalAssignments).toBe(1);
      expect(result.summary.cleanCount).toBe(1);
    });

    it('defaults verdict to KEEP when no trajectory exists', async () => {
      makeBrief('ITM370', 'Fall2026', 'no-traj-assignment');
      await updateCourseMaterials({ courseId: 'ITM370', semesterId: 'Fall2026' });

      expect(mockResolveResources).toHaveBeenCalledWith('KEEP', 'no-traj-assignment', expect.anything());
    });

    it('uses verdict from trajectory perAssignment for each brief', async () => {
      makeBrief('ITM370', 'Fall2026', 'brief-a');
      mockLoadKb.mockReturnValue(makeKb([{ topic: 'brief-a', verdict: 'UPDATE' }]));

      await updateCourseMaterials({ courseId: 'ITM370', semesterId: 'Fall2026' });

      expect(mockResolveResources).toHaveBeenCalledWith('UPDATE', 'brief-a', expect.anything());
    });

    it('adds DROP briefs to droppedAssignments, skips rendering', async () => {
      makeBrief('ITM370', 'Fall2026', 'old-topic');
      mockLoadKb.mockReturnValue(makeKb([{ topic: 'old-topic', verdict: 'DROP' }]));

      const result = await updateCourseMaterials({ courseId: 'ITM370', semesterId: 'Fall2026' });

      expect(result.droppedAssignments).toHaveLength(1);
      expect(result.droppedAssignments[0].name).toBe('old-topic');
      expect(result.pages).toHaveLength(0);
      expect(mockRenderPage).not.toHaveBeenCalled();
    });

    it('catches render errors and records as skipped page', async () => {
      makeBrief('ITM370', 'Fall2026', 'broken-brief');
      mockRenderPage.mockImplementation(() => { throw new Error('template not found'); });

      const result = await updateCourseMaterials({ courseId: 'ITM370', semesterId: 'Fall2026' });

      expect(result.pages).toHaveLength(1);
      expect(result.pages[0].status).toBe('skipped');
      expect(result.pages[0].needsReviewReasons![0]).toContain('template not found');
      expect(result.summary.skippedCount).toBe(1);
    });

    it('returns empty pages and zero counts when no briefs exist', async () => {
      const result = await updateCourseMaterials({ courseId: 'ITM370', semesterId: 'Fall2026' });
      expect(result.pages).toHaveLength(0);
      expect(result.droppedAssignments).toHaveLength(0);
      expect(result.summary.totalAssignments).toBe(0);
      expect(result.status).toBe('complete');
    });

    it('includes export path from exportCourseFolder', async () => {
      const result = await updateCourseMaterials({ courseId: 'ITM370', semesterId: 'Fall2026' });
      expect(result.export.exportPath).toBe('/tmp/export');
    });
  });

  describe('review mode — first call (no selections)', () => {
    it('returns pending-selections status with candidates', async () => {
      makeBrief('ITM370', 'Fall2026', 'test-assignment');

      const result = await updateCourseMaterials({
        courseId: 'ITM370',
        semesterId: 'Fall2026',
        mode: 'review',
      });

      expect(result.status).toBe('pending-selections');
      expect(result.pendingSelections).toHaveLength(1);
      expect(result.pendingSelections![0].assignmentName).toBe('test-assignment');
      expect(result.pendingSelections![0].candidates).toHaveLength(1);
      expect(result.pages).toHaveLength(0);
    });

    it('excludes DROP assignments from pendingSelections', async () => {
      makeBrief('ITM370', 'Fall2026', 'dropped');
      makeBrief('ITM370', 'Fall2026', 'kept');
      mockLoadKb.mockReturnValue(
        makeKb([
          { topic: 'dropped', verdict: 'DROP' },
          { topic: 'kept', verdict: 'KEEP' },
        ]),
      );

      const result = await updateCourseMaterials({
        courseId: 'ITM370',
        semesterId: 'Fall2026',
        mode: 'review',
      });

      expect(result.status).toBe('pending-selections');
      expect(result.pendingSelections!.map((s) => s.assignmentName)).not.toContain('dropped');
      expect(result.pendingSelections!.map((s) => s.assignmentName)).toContain('kept');
    });

    it('does not call renderPageWithA11y on first review call', async () => {
      makeBrief('ITM370', 'Fall2026', 'test-assignment');
      await updateCourseMaterials({ courseId: 'ITM370', semesterId: 'Fall2026', mode: 'review' });
      expect(mockRenderPage).not.toHaveBeenCalled();
    });
  });

  describe('review mode — second call (with selections)', () => {
    it('overrides template from selections when provided', async () => {
      makeBrief('ITM370', 'Fall2026', 'test-assignment');

      await updateCourseMaterials({
        courseId: 'ITM370',
        semesterId: 'Fall2026',
        mode: 'review',
        selections: [{ assignmentName: 'test-assignment', templateId: 'custom-tpl', templateVersion: '2.0.0' }],
      });

      expect(mockRenderPage).toHaveBeenCalledWith(
        expect.objectContaining({
          resolved: expect.objectContaining({ templateId: 'custom-tpl', templateVersion: '2.0.0' }),
        }),
      );
    });

    it('falls back to resolved template for assignments not in selections', async () => {
      makeBrief('ITM370', 'Fall2026', 'test-assignment');

      await updateCourseMaterials({
        courseId: 'ITM370',
        semesterId: 'Fall2026',
        mode: 'review',
        selections: [],
      });

      expect(mockRenderPage).toHaveBeenCalledWith(
        expect.objectContaining({
          resolved: expect.objectContaining({ templateId: 'assignment' }),
        }),
      );
    });

    it('returns complete status when selections provided', async () => {
      makeBrief('ITM370', 'Fall2026', 'test-assignment');
      const result = await updateCourseMaterials({
        courseId: 'ITM370',
        semesterId: 'Fall2026',
        mode: 'review',
        selections: [{ assignmentName: 'test-assignment', templateId: 't', templateVersion: '1.0.0' }],
      });
      expect(result.status).toBe('complete');
    });
  });
});
