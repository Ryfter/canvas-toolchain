import { afterEach, describe, expect, it } from 'vitest';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { getAppConfigPath, getAppHome, getDefaultCourseRoot } from '../src/config.js';

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
