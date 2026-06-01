import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('../../../src/tools/setup_canvas.js', () => ({
  loadCanvasConfig: vi.fn().mockReturnValue({
    host: 'example.instructure.com',
    token: 'TEST_TOKEN',
    configuredAt: '2026-06-01T00:00:00Z',
    lastValidatedAt: '2026-06-01T00:00:00Z',
  }),
}));

import { snapshotCourse } from '../../../src/tools/workflows/snapshot_course.js';
import type { CourseSnapshot } from '../../../src/tools/snapshot/types.js';

function fakeSnapshot(overrides: Partial<CourseSnapshot> = {}): CourseSnapshot {
  return {
    course: {
      id: 48894,
      title: 'BusApp 105 — Spreadsheet Topics',
      courseCode: 'BUSAPP-105-4001',
      workflowState: 'unpublished',
      startAt: '2026-06-01T00:00:00Z',
      endAt: '2026-08-30T00:00:00Z',
      termName: 'Summer 2026',
    },
    assignmentGroups: [
      { id: 1, name: 'Assignments',         position: 1, publishedCount: 0,  unpublishedCount: 0 },
      { id: 2, name: 'Simulation Trainings', position: 2, publishedCount: 8,  unpublishedCount: 0 },
      { id: 3, name: 'Grader Projects',     position: 3, publishedCount: 15, unpublishedCount: 0 },
    ],
    modules: [
      { id: 10, name: 'Week 1',                position: 1, itemCount: 13, itemTypes: ['Assignment','Page','SubHeader'] },
      { id: 11, name: 'Week 2',                position: 2, itemCount: 13, itemTypes: ['Assignment','Page','SubHeader'] },
      { id: 12, name: 'BusApp 105 Class Quiz', position: 3, itemCount: 1,  itemTypes: ['Quiz'] },
    ],
    ...overrides,
  };
}

let outDir: string;

beforeEach(() => {
  outDir = mkdtempSync(join(tmpdir(), 'snap-'));
});

describe('snapshotCourse — first run', () => {
  it('writes a new file when none exists', async () => {
    const outPath = join(outDir, 'BusApp 105 instructions.md');
    const result = await snapshotCourse(
      { courseId: 48894, outputPath: outPath, now: '2026-06-01T01:00:00Z' },
      { fetchSnapshot: async () => fakeSnapshot() },
    );
    expect(result.firstRun).toBe(true);
    expect(existsSync(outPath)).toBe(true);
    expect(result.sectionsWritten).toBe(4);
  });

  it('includes all four auto-managed section markers', async () => {
    const outPath = join(outDir, 'doc.md');
    await snapshotCourse(
      { courseId: 48894, outputPath: outPath, now: '2026-06-01T01:00:00Z' },
      { fetchSnapshot: async () => fakeSnapshot() },
    );
    const content = readFileSync(outPath, 'utf-8');
    expect(content).toContain('<!-- AUTO:start id="update-log" -->');
    expect(content).toContain('<!-- AUTO:start id="identifiers" -->');
    expect(content).toContain('<!-- AUTO:start id="assignment-groups" -->');
    expect(content).toContain('<!-- AUTO:start id="modules" -->');
    expect((content.match(/<!--\s*AUTO:end\s*-->/g) ?? []).length).toBe(4);
  });

  it('renders the course identifiers table with current state', async () => {
    const outPath = join(outDir, 'doc.md');
    await snapshotCourse(
      { courseId: 48894, outputPath: outPath, now: '2026-06-01T01:00:00Z' },
      { fetchSnapshot: async () => fakeSnapshot() },
    );
    const content = readFileSync(outPath, 'utf-8');
    expect(content).toContain('BusApp 105 — Spreadsheet Topics');
    expect(content).toContain('48894');
    expect(content).toContain('Summer 2026');
    expect(content).toContain('https://example.instructure.com/courses/48894');
  });

  it('renders assignment-groups and modules tables', async () => {
    const outPath = join(outDir, 'doc.md');
    await snapshotCourse(
      { courseId: 48894, outputPath: outPath, now: '2026-06-01T01:00:00Z' },
      { fetchSnapshot: async () => fakeSnapshot() },
    );
    const content = readFileSync(outPath, 'utf-8');
    expect(content).toContain('Simulation Trainings');
    expect(content).toContain('Grader Projects');
    expect(content).toContain('BusApp 105 Class Quiz');
    expect(content).toContain('Week 1');
    expect(content).toContain('Week 2');
  });

  it('seeds Update Log with the initial snapshot row', async () => {
    const outPath = join(outDir, 'doc.md');
    await snapshotCourse(
      { courseId: 48894, outputPath: outPath, now: '2026-06-01T01:00:00Z' },
      { fetchSnapshot: async () => fakeSnapshot() },
    );
    const content = readFileSync(outPath, 'utf-8');
    expect(content).toContain('| 2026-06-01 | Summer 2026 | Initial snapshot |');
  });
});

describe('snapshotCourse — re-run', () => {
  it('updates managed sections in place when file already exists', async () => {
    const outPath = join(outDir, 'doc.md');
    // First run
    await snapshotCourse(
      { courseId: 48894, outputPath: outPath, now: '2026-06-01T01:00:00Z' },
      { fetchSnapshot: async () => fakeSnapshot() },
    );
    // Mutate the Canvas state — add a group
    const mutated = fakeSnapshot();
    mutated.assignmentGroups.push({ id: 4, name: 'Learning Aids', position: 4, publishedCount: 8, unpublishedCount: 0 });

    const result = await snapshotCourse(
      { courseId: 48894, outputPath: outPath, now: '2026-06-02T01:00:00Z' },
      { fetchSnapshot: async () => mutated },
    );
    expect(result.firstRun).toBe(false);
    expect(result.updateLogAppended).toBe(true);
    const content = readFileSync(outPath, 'utf-8');
    expect(content).toContain('Learning Aids');
  });

  it('prepends a new row to the Update Log (newest at top)', async () => {
    const outPath = join(outDir, 'doc.md');
    await snapshotCourse(
      { courseId: 48894, outputPath: outPath, now: '2026-06-01T01:00:00Z' },
      { fetchSnapshot: async () => fakeSnapshot() },
    );
    await snapshotCourse(
      { courseId: 48894, outputPath: outPath, now: '2026-06-02T01:00:00Z' },
      { fetchSnapshot: async () => fakeSnapshot() },
    );
    const content = readFileSync(outPath, 'utf-8');
    // Pull just the Update Log block
    const m = content.match(/<!--\s*AUTO:start id="update-log"\s*-->([\s\S]*?)<!--\s*AUTO:end\s*-->/);
    expect(m).not.toBeNull();
    const log = m![1];
    const lines = log.split('\n').filter(l => l.startsWith('|'));
    // Header, separator, new row (2026-06-02), old row (2026-06-01)
    expect(lines.length).toBeGreaterThanOrEqual(4);
    // Newest row appears BEFORE the older row in the body
    const idx0602 = log.indexOf('2026-06-02');
    const idx0601 = log.indexOf('2026-06-01');
    expect(idx0602).toBeGreaterThan(-1);
    expect(idx0601).toBeGreaterThan(idx0602);
  });

  it('preserves hand-edited prose between managed sections', async () => {
    const outPath = join(outDir, 'doc.md');
    // First run, then hand-edit the prose around the modules section
    await snapshotCourse(
      { courseId: 48894, outputPath: outPath, now: '2026-06-01T01:00:00Z' },
      { fetchSnapshot: async () => fakeSnapshot() },
    );
    const original = readFileSync(outPath, 'utf-8');
    const handEdited = original.replace(
      '<!-- AUTO:start id="modules" -->',
      '\n## My hand-written note\nThis is critical context the prof added by hand.\n\n<!-- AUTO:start id="modules" -->',
    );
    writeFileSync(outPath, handEdited, 'utf-8');

    // Re-run
    await snapshotCourse(
      { courseId: 48894, outputPath: outPath, now: '2026-06-02T01:00:00Z' },
      { fetchSnapshot: async () => fakeSnapshot() },
    );
    const after = readFileSync(outPath, 'utf-8');
    expect(after).toContain('## My hand-written note');
    expect(after).toContain('This is critical context the prof added by hand.');
  });

  it('appends a missing required section at the bottom (recovery from user-deletion)', async () => {
    const outPath = join(outDir, 'doc.md');
    await snapshotCourse(
      { courseId: 48894, outputPath: outPath, now: '2026-06-01T01:00:00Z' },
      { fetchSnapshot: async () => fakeSnapshot() },
    );
    // Simulate the user deleting the modules section entirely
    const stripped = readFileSync(outPath, 'utf-8').replace(
      /<!--\s*AUTO:start id="modules"\s*-->[\s\S]*?<!--\s*AUTO:end\s*-->/,
      '',
    );
    writeFileSync(outPath, stripped, 'utf-8');

    await snapshotCourse(
      { courseId: 48894, outputPath: outPath, now: '2026-06-02T01:00:00Z' },
      { fetchSnapshot: async () => fakeSnapshot() },
    );
    const after = readFileSync(outPath, 'utf-8');
    expect(after).toContain('<!-- AUTO:start id="modules" -->');
    expect(after).toContain('Section "modules" was missing; appended on re-run.');
  });
});
