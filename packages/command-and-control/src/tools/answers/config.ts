// packages/command-and-control/src/tools/answers/config.ts

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { lectureAnswersConfigPath } from './paths.js';
import type { LectureAnswersConfig } from './types.js';

export function loadLectureAnswersConfig(): LectureAnswersConfig | null {
  const path = lectureAnswersConfigPath();
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, 'utf-8')) as LectureAnswersConfig; }
  catch { return null; }
}

export function saveLectureAnswersConfig(cfg: LectureAnswersConfig): void {
  const path = lectureAnswersConfigPath();
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(cfg, null, 2), { encoding: 'utf-8', mode: 0o600 });
  // atomic rename
  const { renameSync } = require('node:fs') as typeof import('node:fs');
  renameSync(tmp, path);
}
