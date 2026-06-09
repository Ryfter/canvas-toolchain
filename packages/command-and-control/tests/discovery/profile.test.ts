import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { tmpdir, platform } from 'node:os';
import { join } from 'node:path';
import {
  loadProfile,
  mergeTools,
  saveProfile,
  getProfilePath,
  writeClassDelta,
  type ProfileTool,
} from '../../src/discovery/profile.js';

let ccHomeDir: string;
const ORIGINAL_CC_HOME = process.env.CC_HOME;

beforeEach(() => {
  ccHomeDir = mkdtempSync(join(tmpdir(), 'cc-home-'));
  process.env.CC_HOME = ccHomeDir;
});
afterEach(() => {
  rmSync(ccHomeDir, { recursive: true, force: true });
  if (ORIGINAL_CC_HOME === undefined) delete process.env.CC_HOME;
  else process.env.CC_HOME = ORIGINAL_CC_HOME;
});

const tool = (id: string, over: Partial<ProfileTool> = {}): ProfileTool => ({
  id,
  name: id,
  scope: 'global',
  module: 'none',
  source: 'detected',
  ...over,
});

describe('profile round-trip + merge', () => {
  it('saves and reloads a profile with identifiers and tools', () => {
    const path = saveProfile({ identifiers: { canvas: 'bsu.instructure.com' }, tools: [tool('panopto', { module: 'video' })] });
    expect(path).toBe(getProfilePath());
    if (platform() !== 'win32') expect(statSync(path).mode & 0o777).toBe(0o600);
    const reloaded = loadProfile();
    expect(reloaded.identifiers.canvas).toBe('bsu.instructure.com');
    expect(reloaded.tools.find((t) => t.id === 'panopto')?.module).toBe('video');
  });

  it('merge is accretive: adds new ids, updates existing, drops nothing', () => {
    const existing = [tool('panopto', { module: 'video' }), tool('iclicker')];
    const incoming = [tool('iclicker', { source: 'self-reported' }), tool('gradescope')];
    const { merged, added, updated } = mergeTools(existing, incoming);
    expect(merged.map((t) => t.id).sort()).toEqual(['gradescope', 'iclicker', 'panopto']);
    expect(added).toEqual(['gradescope']);
    expect(updated).toEqual(['iclicker']);
    expect(merged.find((t) => t.id === 'iclicker')?.source).toBe('self-reported');
  });

  it('tolerates a missing profile (empty library) and a corrupt one', () => {
    expect(loadProfile().tools).toEqual([]);
    writeFileSync(getProfilePath(), 'not a valid profile at all');
    expect(loadProfile().tools).toEqual([]);
  });
});

describe('writeClassDelta', () => {
  it('writes a tools: delta into an existing course-config.md without clobbering other content', () => {
    const courseDir = join(ccHomeDir, 'ITM370');
    mkdirSync(courseDir, { recursive: true });
    writeFileSync(join(courseDir, 'course-config.md'), '# Course\n\nsemester: Fall 2026\n');
    writeClassDelta(courseDir, { uses: ['gradescope'], skips: ['google-forms'] });
    const txt = readFileSync(join(courseDir, 'course-config.md'), 'utf-8');
    expect(txt).toContain('semester: Fall 2026');
    expect(txt).toMatch(/tools:/);
    expect(txt).toContain('gradescope');
    expect(txt).toContain('google-forms');
  });

  it('throws COURSE_NOT_FOUND for a missing course dir', () => {
    expect(() => writeClassDelta(join(ccHomeDir, 'nope'), { uses: ['x'] })).toThrow(/COURSE_NOT_FOUND/);
  });
});
