import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  resolveSnapshotsRoot,
  resolveSnapshotDir,
} from '../../src/tools/publish/snapshot_location.js';

let courseDir: string;
let legacyHome: string;

beforeEach(() => {
  courseDir = mkdtempSync(join(tmpdir(), 'course-'));
  legacyHome = mkdtempSync(join(tmpdir(), 'home-'));
});

afterEach(() => {
  rmSync(courseDir, { recursive: true, force: true });
  rmSync(legacyHome, { recursive: true, force: true });
});

describe('resolveSnapshotsRoot', () => {
  it('returns project-local path when location=project', () => {
    const root = resolveSnapshotsRoot({
      courseDir,
      location: 'project',
      legacyGlobalRoot: join(legacyHome, '.command-and-control', 'publish-snapshots'),
    });
    expect(root).toBe(join(courseDir, '.canvas-toolchain', 'publish-snapshots'));
  });

  it('returns legacy global path when location=global', () => {
    const root = resolveSnapshotsRoot({
      courseDir,
      location: 'global',
      legacyGlobalRoot: join(legacyHome, '.command-and-control', 'publish-snapshots'),
    });
    expect(root).toBe(join(legacyHome, '.command-and-control', 'publish-snapshots'));
  });

  it('creates the directory if missing', () => {
    const root = resolveSnapshotsRoot({
      courseDir,
      location: 'project',
      legacyGlobalRoot: join(legacyHome, '.command-and-control', 'publish-snapshots'),
    });
    expect(root).toBe(join(courseDir, '.canvas-toolchain', 'publish-snapshots'));
  });
});

describe('resolveSnapshotDir', () => {
  it('finds snapshot in project-local dir', () => {
    const snapshotsRoot = join(courseDir, '.canvas-toolchain', 'publish-snapshots');
    mkdirSync(join(snapshotsRoot, 'snap-1'), { recursive: true });
    writeFileSync(join(snapshotsRoot, 'snap-1', 'manifest.json'), '{}', 'utf-8');

    const dir = resolveSnapshotDir({
      snapshotId: 'snap-1',
      courseDir,
      location: 'project',
      legacyGlobalRoot: join(legacyHome, '.command-and-control', 'publish-snapshots'),
    });
    expect(dir).toBe(join(snapshotsRoot, 'snap-1'));
  });

  it('falls back to legacy global dir when not found in project location', () => {
    const legacyRoot = join(legacyHome, '.command-and-control', 'publish-snapshots');
    mkdirSync(join(legacyRoot, 'legacy-snap'), { recursive: true });
    writeFileSync(join(legacyRoot, 'legacy-snap', 'manifest.json'), '{}', 'utf-8');

    const dir = resolveSnapshotDir({
      snapshotId: 'legacy-snap',
      courseDir,
      location: 'project',
      legacyGlobalRoot: legacyRoot,
    });
    expect(dir).toBe(join(legacyRoot, 'legacy-snap'));
  });

  it('returns project path even when snapshot does not exist anywhere (for creation)', () => {
    const dir = resolveSnapshotDir({
      snapshotId: 'fresh-snap',
      courseDir,
      location: 'project',
      legacyGlobalRoot: join(legacyHome, '.command-and-control', 'publish-snapshots'),
    });
    expect(dir).toBe(join(courseDir, '.canvas-toolchain', 'publish-snapshots', 'fresh-snap'));
  });
});
