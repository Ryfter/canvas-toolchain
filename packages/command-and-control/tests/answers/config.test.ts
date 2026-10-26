// packages/command-and-control/tests/answers/config.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, existsSync, statSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadLectureAnswersConfig, saveLectureAnswersConfig } from '../../src/tools/answers/config.js';
import { getCcHomePath, getCcSecretsPath } from '../../src/kb/config.js';
import { lectureAnswersConfigPath } from '../../src/tools/answers/paths.js';

let ccHome: string;
let originalEnv: string | undefined;

beforeEach(() => {
  ccHome = mkdtempSync(join(tmpdir(), 'cc-home-'));
  originalEnv = process.env.CC_HOME;
  process.env.CC_HOME = ccHome;
});

afterEach(() => {
  process.env.CC_HOME = originalEnv;
  rmSync(ccHome, { recursive: true, force: true });
});

describe('lecture answers config', () => {
  it('returns null when no config exists', () => {
    expect(loadLectureAnswersConfig()).toBeNull();
  });

  it('round-trips a config write + read', () => {
    saveLectureAnswersConfig({ provider: 'ollama', model: 'nomic-embed-text' });
    const loaded = loadLectureAnswersConfig();
    expect(loaded).toEqual({ provider: 'ollama', model: 'nomic-embed-text' });
  });

  it('writes with mode 0o600', () => {
    saveLectureAnswersConfig({ provider: 'voyage', voyageApiKey: 'secret' });
    const path = lectureAnswersConfigPath();
    expect(existsSync(path)).toBe(true);
    // On Windows mode bits are advisory but the test should still pass — skip on win32
    if (process.platform !== 'win32') {
      const mode = statSync(path).mode & 0o777;
      expect(mode).toBe(0o600);
    }
  });
});

// CT200-04d: on Windows the config root roams; the voyageApiKey file must live in secrets.
describe('lecture answers config on win32', () => {
  const realPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!;
  const KEYS = ['APPDATA', 'LOCALAPPDATA'];
  const saved: Record<string, string | undefined> = {};
  let fake: string;

  beforeEach(() => {
    delete process.env.CC_HOME;
    fake = mkdtempSync(join(tmpdir(), 'cc-win-'));
    for (const k of KEYS) saved[k] = process.env[k];
    process.env.APPDATA = join(fake, 'Roaming');
    process.env.LOCALAPPDATA = join(fake, 'Local');
    mkdirSync(join(fake, 'Roaming', 'CanvasToolchain', 'cc'), { recursive: true });
    Object.defineProperty(process, 'platform', { value: 'win32' });
  });
  afterEach(() => {
    Object.defineProperty(process, 'platform', realPlatform);
    for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
    rmSync(fake, { recursive: true, force: true });
    const stem = fake.replace(/\//g, '\\');
    for (const name of readdirSync(process.cwd())) {
      if (name.startsWith(stem)) rmSync(join(process.cwd(), name), { recursive: true, force: true });
    }
  });

  it('writer and reader agree on the secrets root, not the roaming config root', () => {
    expect(getCcSecretsPath()).not.toBe(getCcHomePath());
    expect(lectureAnswersConfigPath()).toBe(join(getCcSecretsPath(), 'lecture-answers-config.json'));
    saveLectureAnswersConfig({ provider: 'voyage', voyageApiKey: 'k' });
    expect(existsSync(join(getCcSecretsPath(), 'lecture-answers-config.json'))).toBe(true);
    expect(existsSync(join(getCcHomePath(), 'lecture-answers-config.json'))).toBe(false);
    expect(loadLectureAnswersConfig()).toEqual({ provider: 'voyage', voyageApiKey: 'k' });
  });
});
