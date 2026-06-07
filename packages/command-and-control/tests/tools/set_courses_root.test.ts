import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setCoursesRoot } from '../../src/tools/set_courses_root.js';

let ccHomeDir: string;
let coursesDir: string;
const ORIGINAL_CC_HOME = process.env.CC_HOME;

beforeEach(() => {
  ccHomeDir = mkdtempSync(join(tmpdir(), 'cc-home-'));
  coursesDir = mkdtempSync(join(tmpdir(), 'courses-'));
  process.env.CC_HOME = ccHomeDir;
});

afterEach(() => {
  rmSync(ccHomeDir, { recursive: true, force: true });
  rmSync(coursesDir, { recursive: true, force: true });
  if (ORIGINAL_CC_HOME === undefined) delete process.env.CC_HOME;
  else process.env.CC_HOME = ORIGINAL_CC_HOME;
});

describe('setCoursesRoot', () => {
  it('happy path: writes coursesRoot into config.json', async () => {
    const result = await setCoursesRoot({ coursesRoot: coursesDir });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.coursesRoot).toBe(coursesDir);

    const config = JSON.parse(readFileSync(join(ccHomeDir, 'config.json'), 'utf-8'));
    expect(config.coursesRoot).toBe(coursesDir);
  });

  it('returns PATH_NOT_FOUND when path does not exist', async () => {
    const result = await setCoursesRoot({ coursesRoot: join(coursesDir, 'nonexistent') });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('PATH_NOT_FOUND');
  });

  it('returns NOT_A_DIRECTORY when path points to a file', async () => {
    const filePath = join(coursesDir, 'file.txt');
    writeFileSync(filePath, 'hi');

    const result = await setCoursesRoot({ coursesRoot: filePath });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('NOT_A_DIRECTORY');
  });
});
