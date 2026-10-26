import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { getAppConfigPath, getAppHome, getDefaultCourseRoot, loadAppConfig } from '../src/config.js';

describe('Curriculum Intelligence app paths (CT200-06)', () => {
  const saved = process.env.CURRICULUM_INTELLIGENCE_HOME;
  afterEach(() => {
    if (saved === undefined) delete process.env.CURRICULUM_INTELLIGENCE_HOME;
    else process.env.CURRICULUM_INTELLIGENCE_HOME = saved;
  });

  it.each(['', '   '])('treats blank override %j as unset', (blank) => {
    process.env.CURRICULUM_INTELLIGENCE_HOME = blank;
    if (process.platform === 'win32') return; // Windows default is host-dependent
    const legacy = join(homedir(), '.curriculum-intelligence');
    expect(getAppHome()).toBe(legacy);
    expect(getAppConfigPath()).toBe(join(legacy, 'config.json'));
    expect(getDefaultCourseRoot()).toBe(join(legacy, 'courses'));
  });

  it('non-blank override wins for config and courses (one folder for everything)', () => {
    process.env.CURRICULUM_INTELLIGENCE_HOME = '/tmp/ci-override';
    expect(getAppHome()).toBe('/tmp/ci-override');
    expect(getAppConfigPath()).toBe(join('/tmp/ci-override', 'config.json'));
    expect(getDefaultCourseRoot()).toBe(join('/tmp/ci-override', 'courses'));
  });

  it('unset resolves to ~/.curriculum-intelligence on POSIX', () => {
    delete process.env.CURRICULUM_INTELLIGENCE_HOME;
    if (process.platform === 'win32') return;
    expect(getAppHome()).toBe(join(homedir(), '.curriculum-intelligence'));
  });
});

describe('stored courseRoot is remapped on read (CT200-07, spec Q7)', () => {
  const saved = process.env.CURRICULUM_INTELLIGENCE_HOME;
  let dir: string;
  const legacyRoot = 'C:\\Users\\Prof\\.curriculum-intelligence\\courses';
  const custom = 'D:\\Teaching\\courses';
  const migratedWindows = {
    platform: 'win32' as const,
    env: { APPDATA: 'C:\\Users\\Prof\\AppData\\Roaming', LOCALAPPDATA: 'C:\\Users\\Prof\\AppData\\Local' },
    homedir: 'C:\\Users\\Prof',
    legacyExists: false,
    newExists: true,
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ci-remap-'));
    process.env.CURRICULUM_INTELLIGENCE_HOME = dir;
    writeFileSync(join(dir, 'config.json'), JSON.stringify({
      version: 1,
      courses: {
        ITM370: { id: 'ITM370', title: 'A', courseRoot: legacyRoot, registeredAt: '2026-01-01T00:00:00Z' },
        ITM380: { id: 'ITM380', title: 'B', courseRoot: custom, registeredAt: '2026-01-01T00:00:00Z' },
      },
    }, null, 2));
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.CURRICULUM_INTELLIGENCE_HOME;
    else process.env.CURRICULUM_INTELLIGENCE_HOME = saved;
    rmSync(dir, { recursive: true, force: true });
  });

  it('maps a legacy courseRoot to the new data root on a migrated Windows install', () => {
    const before = readFileSync(join(dir, 'config.json'), 'utf-8');
    const config = loadAppConfig(migratedWindows);
    expect(config.courses.ITM370.courseRoot)
      .toBe('C:\\Users\\Prof\\AppData\\Local\\CanvasToolchain\\CurriculumIntelligence\\courses');
    expect(config.courses.ITM380.courseRoot).toBe(custom);
    // Remap on read only: the file on disk is never rewritten.
    expect(readFileSync(join(dir, 'config.json'), 'utf-8')).toBe(before);
  });

  it('leaves stored paths unchanged on POSIX', () => {
    const config = loadAppConfig({ platform: 'darwin', env: {}, homedir: '/Users/prof' });
    expect(config.courses.ITM370.courseRoot).toBe(legacyRoot);
  });

  it('tolerates a course entry with no courseRoot and a config with no courses', () => {
    writeFileSync(join(dir, 'config.json'), JSON.stringify({ version: 1, courses: { X: { id: 'X' } } }));
    expect(loadAppConfig(migratedWindows).courses.X).toEqual({ id: 'X' });
    writeFileSync(join(dir, 'config.json'), JSON.stringify({ version: 1 }));
    expect(loadAppConfig(migratedWindows)).toEqual({ version: 1 });
  });
});
