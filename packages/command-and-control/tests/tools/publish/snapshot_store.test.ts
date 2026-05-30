import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createSnapshotDir,
  writeManifest,
  readManifest,
  writePriorHtml,
  readPriorHtml,
  writeNewHtml,
  writeFullDiff,
  writeState,
  readState,
  findStaleSnapshot,
} from '../../../src/tools/publish/snapshot_store.js';
import type { PreviewManifest, PublishState } from '../../../src/tools/publish/manifest_types.js';

let cc: string;
beforeEach(() => {
  cc = mkdtempSync(join(tmpdir(), 'snap-'));
  process.env.CC_HOME = cc;
});
afterEach(() => {
  rmSync(cc, { recursive: true, force: true });
  delete process.env.CC_HOME;
});

function fakeManifest(snapshotId: string, courseId = 1): PreviewManifest {
  return {
    snapshotId, courseId, courseDir: '/x', generatedAt: '2026-05-30T00:00:00Z',
    git: { isRepo: false }, entries: [], summary: {
      total: 0, pages: 0, assignments: 0, skipped: 0, warningsCount: 0, ferpaCount: 0, collisionsCount: 0,
    },
  };
}

describe('snapshot_store', () => {
  it('round-trips a manifest', () => {
    const dir = createSnapshotDir('abc');
    const m = fakeManifest('abc');
    writeManifest(dir, m);
    expect(readManifest(dir)).toEqual(m);
  });

  it('round-trips per-entry prior/new/diff files', () => {
    const dir = createSnapshotDir('abc');
    writePriorHtml(dir, 'w1.html', '<p>old</p>');
    writeNewHtml(dir, 'w1.html', '<p>new</p>');
    writeFullDiff(dir, 'w1.html', '- old\n+ new\n');
    expect(readPriorHtml(dir, 'w1.html')).toBe('<p>old</p>');
    expect(existsSync(join(dir, 'new', 'w1.html'))).toBe(true);
    expect(existsSync(join(dir, 'diffs', 'w1.html.diff'))).toBe(true);
  });

  it('writes and reads state.json', () => {
    const dir = createSnapshotDir('abc');
    const s: PublishState = { phase: 'partial', published: [], lastUpdatedAt: '2026-05-30T00:00:00Z' };
    writeState(dir, s);
    expect(readState(dir)).toEqual(s);
  });

  it('findStaleSnapshot returns latest partial state for a courseId', () => {
    const dir = createSnapshotDir('snap-1');
    writeManifest(dir, fakeManifest('snap-1', 42));
    writeState(dir, {
      phase: 'partial', lastUpdatedAt: '2026-05-30T00:01:00Z',
      published: [], failed: { filename: 'wk4.html', type: 'page', reason: '429', code: 'CANVAS_RATE_LIMITED', failedAt: '2026-05-30T00:01:00Z' },
    });
    const stale = findStaleSnapshot(42);
    expect(stale?.snapshotId).toBe('snap-1');
    expect(stale?.lastFailedFile).toBe('wk4.html');
  });

  it('findStaleSnapshot returns undefined when no partial snapshot exists', () => {
    expect(findStaleSnapshot(99)).toBeUndefined();
  });
});
