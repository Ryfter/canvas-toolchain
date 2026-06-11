import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { tmpdir, platform } from 'node:os';
import { join } from 'node:path';
import { parse } from 'yaml';
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
    const path = saveProfile({ identifiers: { canvas: 'example.instructure.com' }, tools: [tool('panopto', { module: 'video' })] });
    expect(path).toBe(getProfilePath());
    if (platform() !== 'win32') expect(statSync(path).mode & 0o777).toBe(0o600);
    const reloaded = loadProfile();
    expect(reloaded.identifiers.canvas).toBe('example.instructure.com');
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
  // The front-matter parser every consumer (dashboard, gray-matter, #77) uses.
  const FM = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;

  it('writes the tools delta INSIDE the front matter, preserving other fm keys and the body', () => {
    const courseDir = join(ccHomeDir, 'ITM370');
    mkdirSync(courseDir, { recursive: true });
    writeFileSync(
      join(courseDir, 'course-config.md'),
      '---\ncourse_number: ITM 370\nsemester: Fall 2026\n---\n# Body heading\n\nProse.\n',
    );
    writeClassDelta(courseDir, { uses: ['gradescope'], skips: ['google-forms'] });

    const txt = readFileSync(join(courseDir, 'course-config.md'), 'utf-8');
    const m = txt.match(FM)!;
    expect(m).toBeTruthy();
    const fm = parse(m[1]) as Record<string, unknown>;
    // delta is readable from the front matter — not stranded after it
    expect(fm.tools).toEqual({ uses: ['gradescope'], skips: ['google-forms'] });
    // sibling fm keys and the body survive
    expect(fm.semester).toBe('Fall 2026');
    expect(fm.course_number).toBe('ITM 370');
    expect(m[2]).toContain('# Body heading');
    expect(m[2]).toContain('Prose.');
  });

  it('replaces a prior delta cleanly on a second run (no orphaned fragments)', () => {
    const courseDir = join(ccHomeDir, 'ITM310');
    mkdirSync(courseDir, { recursive: true });
    writeFileSync(join(courseDir, 'course-config.md'), '---\nsemester: Fall 2026\n---\nbody\n');
    writeClassDelta(courseDir, { uses: ['gradescope'] });
    writeClassDelta(courseDir, { uses: ['turnitin'], skips: ['google-forms'] });

    const txt = readFileSync(join(courseDir, 'course-config.md'), 'utf-8');
    const fm = parse(txt.match(FM)![1]) as Record<string, unknown>;
    expect(fm.tools).toEqual({ uses: ['turnitin'], skips: ['google-forms'] });
    expect(txt).not.toContain('gradescope'); // prior delta fully gone, not duplicated
    // exactly one tools: key
    expect((txt.match(/^tools:/gm) ?? []).length).toBe(1);
  });

  it('prepends front matter when the file has none', () => {
    const courseDir = join(ccHomeDir, 'BusApp105');
    mkdirSync(courseDir, { recursive: true });
    writeFileSync(join(courseDir, 'course-config.md'), '# Just a heading\n');
    writeClassDelta(courseDir, { uses: ['iclicker'] });
    const txt = readFileSync(join(courseDir, 'course-config.md'), 'utf-8');
    const m = txt.match(FM)!;
    expect((parse(m[1]) as Record<string, unknown>).tools).toEqual({ uses: ['iclicker'] });
    expect(m[2]).toContain('# Just a heading');
  });

  it('throws COURSE_NOT_FOUND for a missing course dir', () => {
    expect(() => writeClassDelta(join(ccHomeDir, 'nope'), { uses: ['x'] })).toThrow(/COURSE_NOT_FOUND/);
  });
});
