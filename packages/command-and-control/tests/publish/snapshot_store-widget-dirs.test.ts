import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSnapshotDirFor } from '../../src/tools/publish/snapshot_store.js';

let ccHome: string;
let courseDir: string;
let originalEnv: string | undefined;

beforeEach(() => {
  ccHome = mkdtempSync(join(tmpdir(), 'cc-home-'));
  courseDir = mkdtempSync(join(tmpdir(), 'course-'));
  originalEnv = process.env.CC_HOME;
  process.env.CC_HOME = ccHome;
  writeFileSync(join(ccHome, 'canvas-config.json'), JSON.stringify({
    host: 'canvas.example', token: 'tk', configuredAt: '2026-06-04T00:00:00.000Z',
  }), 'utf-8');
});

afterEach(() => {
  process.env.CC_HOME = originalEnv;
  rmSync(ccHome, { recursive: true, force: true });
  rmSync(courseDir, { recursive: true, force: true });
});

describe('createSnapshotDirFor widget sub-dirs', () => {
  it('creates prior/widgets, new/widgets, diffs/widgets alongside the page dirs', () => {
    const dir = createSnapshotDirFor('snap-1', courseDir);
    expect(existsSync(join(dir, 'prior', 'widgets'))).toBe(true);
    expect(existsSync(join(dir, 'new', 'widgets'))).toBe(true);
    expect(existsSync(join(dir, 'diffs', 'widgets'))).toBe(true);
  });
});
