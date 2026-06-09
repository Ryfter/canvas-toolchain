import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saveInstitutionProfile } from '../../src/tools/save_institution_profile.js';
import { loadProfile, getProfilePath } from '../../src/discovery/profile.js';

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

const t = (id: string, over = {}) => ({ id, name: id, source: 'detected' as const, ...over });

describe('saveInstitutionProfile', () => {
  it('writes a new profile and reports added ids', async () => {
    const res = await saveInstitutionProfile({
      identifiers: { canvas: 'bsu.instructure.com' },
      tools: [t('panopto', { module: 'video' }), t('iclicker')],
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.added.sort()).toEqual(['iclicker', 'panopto']);
      expect(res.profilePath).toBe(getProfilePath());
    }
    expect(loadProfile().tools.length).toBe(2);
  });

  it('merges accretively on a second call (preserves prior, reports updated)', async () => {
    await saveInstitutionProfile({ tools: [t('panopto', { module: 'video' })] });
    const res = await saveInstitutionProfile({ tools: [t('panopto', { module: 'video' }), t('gradescope')] });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.added).toEqual(['gradescope']);
      expect(res.updated).toEqual(['panopto']);
    }
    expect(loadProfile().tools.map((x) => x.id).sort()).toEqual(['gradescope', 'panopto']);
  });

  it('writes per-class deltas and reports COURSE_NOT_FOUND for a bad dir while still saving the master', async () => {
    const courseDir = join(ccHomeDir, 'ITM370');
    mkdirSync(courseDir, { recursive: true });
    writeFileSync(join(courseDir, 'course-config.md'), '# Course\nsemester: Fall 2026\n');
    const res = await saveInstitutionProfile({
      tools: [t('gradescope')],
      perClass: [
        { courseDir, uses: ['gradescope'] },
        { courseDir: join(ccHomeDir, 'missing'), uses: ['x'] },
      ],
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.classesWritten).toEqual([courseDir]);
      expect(res.classErrors.length).toBe(1);
    }
    expect(readFileSync(join(courseDir, 'course-config.md'), 'utf-8')).toContain('gradescope');
  });

  it('returns INVALID_INPUT when tools is missing/not an array', async () => {
    const res = await saveInstitutionProfile({ tools: undefined as never });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('INVALID_INPUT');
  });
});
