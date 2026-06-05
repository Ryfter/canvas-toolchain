// packages/command-and-control/tests/answers/config.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadLectureAnswersConfig, saveLectureAnswersConfig } from '../../src/tools/answers/config.js';
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
