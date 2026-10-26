/**
 * CT200-07 / spec Q7 (recommendation A): absolute paths stored inside config
 * files are remapped on read. Pure; every case injects platform, env, homedir
 * and the upgrade-window probes, so it runs identically on any OS.
 */
import { describe, expect, it } from 'vitest';
import { remapLegacyPath } from '../src/legacy-path-remap.js';
import type { PathEnv } from '../src/app-paths.js';

const HOME = 'C:\\Users\\Prof';
const ROAMING = 'C:\\Users\\Prof\\AppData\\Roaming';
const LOCAL = 'C:\\Users\\Prof\\AppData\\Local';
const CI_CONFIG = `${ROAMING}\\CanvasToolchain\\CurriculumIntelligence`;
const CI_DATA = `${LOCAL}\\CanvasToolchain\\CurriculumIntelligence`;
const CC_CONFIG = `${ROAMING}\\CanvasToolchain\\CommandAndControl`;
const CC_SECRETS = `${LOCAL}\\CanvasToolchain\\CommandAndControl\\secrets`;

/** A migrated Windows machine: legacy renamed away, new config home present. */
const win = (extra: Partial<PathEnv> = {}): PathEnv => ({
  platform: 'win32',
  env: { APPDATA: ROAMING, LOCALAPPDATA: LOCAL },
  homedir: HOME,
  legacyExists: false,
  newExists: true,
  ...extra,
});

describe('remapLegacyPath on a migrated Windows install', () => {
  it('maps a legacy data path (CI courses) to the new data root', () => {
    expect(remapLegacyPath(`${HOME}\\.curriculum-intelligence\\courses\\ITM370`, 'ci', win()))
      .toBe(`${CI_DATA}\\courses\\ITM370`);
  });

  it('maps a legacy config path to the new config root', () => {
    expect(remapLegacyPath(`${HOME}\\.curriculum-intelligence\\notes\\a.md`, 'ci', win()))
      .toBe(`${CI_CONFIG}\\notes\\a.md`);
  });

  it('maps a legacy secrets entry to the secrets root', () => {
    expect(remapLegacyPath(`${HOME}\\.command-and-control\\canvas-config.json`, 'cc', win()))
      .toBe(`${CC_SECRETS}\\canvas-config.json`);
    expect(remapLegacyPath(`${HOME}\\.command-and-control\\modules.json`, 'cc', win()))
      .toBe(`${CC_CONFIG}\\modules.json`);
  });

  it('maps the legacy folder itself to the config home', () => {
    expect(remapLegacyPath(`${HOME}\\.curriculum-intelligence`, 'ci', win())).toBe(CI_CONFIG);
  });

  it('maps a path under the renamed .migrated-* folder', () => {
    expect(remapLegacyPath(
      `${HOME}\\.curriculum-intelligence.migrated-20261020-142233\\courses\\ITM370`, 'ci', win(),
    )).toBe(`${CI_DATA}\\courses\\ITM370`);
    expect(remapLegacyPath(
      `${HOME}\\.curriculum-intelligence.migrated-20261020-142233-3\\courses\\ITM370`, 'ci', win(),
    )).toBe(`${CI_DATA}\\courses\\ITM370`);
  });

  it('compares case-insensitively and accepts forward slashes', () => {
    expect(remapLegacyPath('c:/users/prof/.Curriculum-Intelligence/Courses/ITM370', 'ci', win()))
      .toBe(`${CI_DATA}\\Courses\\ITM370`);
  });

  it('keeps a trailing separator', () => {
    expect(remapLegacyPath(`${HOME}\\.curriculum-intelligence\\courses\\`, 'ci', win()))
      .toBe(`${CI_DATA}\\courses\\`);
    expect(remapLegacyPath(`${HOME}\\.curriculum-intelligence\\`, 'ci', win()))
      .toBe(`${CI_CONFIG}\\`);
  });

  it('accepts a homedir given with a trailing separator', () => {
    expect(remapLegacyPath(`${HOME}\\.curriculum-intelligence\\courses\\X`, 'ci', win({ homedir: `${HOME}\\` })))
      .toBe(`${CI_DATA}\\courses\\X`);
  });

  it('leaves an already-new path unchanged', () => {
    const p = `${CI_DATA}\\courses\\ITM370`;
    expect(remapLegacyPath(p, 'ci', win())).toBe(p);
  });

  it('leaves unrelated paths unchanged, including look-alike folder names', () => {
    for (const p of [
      'D:\\Courses\\ITM370',
      `${HOME}\\Documents\\courses`,
      `${HOME}\\.curriculum-intelligence-old\\courses`,
      `${HOME}\\.curriculum-intelligence.migrated-junk\\courses`,
      `${HOME}\\.command-and-control\\courses`, // another app's legacy folder
      `C:\\Users\\Other\\.curriculum-intelligence\\courses`,
      'relative\\.curriculum-intelligence\\courses',
      '',
    ]) {
      expect(remapLegacyPath(p, 'ci', win())).toBe(p);
    }
  });

  it('is a no-op inside the upgrade window (legacy still authoritative)', () => {
    const p = `${HOME}\\.curriculum-intelligence\\courses\\ITM370`;
    expect(remapLegacyPath(p, 'ci', win({ legacyExists: true, newExists: false }))).toBe(p);
  });

  it('is a no-op when the env override is set', () => {
    const p = `${HOME}\\.curriculum-intelligence\\courses\\ITM370`;
    expect(remapLegacyPath(p, 'ci', win({
      env: { APPDATA: ROAMING, LOCALAPPDATA: LOCAL, CURRICULUM_INTELLIGENCE_HOME: 'D:\\ci' },
    }))).toBe(p);
  });

  it('treats a blank env override as unset', () => {
    expect(remapLegacyPath(`${HOME}\\.curriculum-intelligence\\courses\\X`, 'ci', win({
      env: { APPDATA: ROAMING, LOCALAPPDATA: LOCAL, CURRICULUM_INTELLIGENCE_HOME: '  ' },
    }))).toBe(`${CI_DATA}\\courses\\X`);
  });
});

describe('remapLegacyPath on POSIX', () => {
  it.each(['darwin', 'linux'] as const)('is a no-op on %s', (platform) => {
    for (const p of [
      '/Users/prof/.curriculum-intelligence/courses/ITM370',
      '/Users/prof/.curriculum-intelligence.migrated-20261020-142233/courses/ITM370',
    ]) {
      expect(remapLegacyPath(p, 'ci', { platform, env: {}, homedir: '/Users/prof' })).toBe(p);
    }
  });
});
