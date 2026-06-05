// packages/command-and-control/src/tools/answers/paths.ts

import { join } from 'node:path';
import { getCcHomePath } from '../../kb/config.js';

export const LECTURE_ANSWERS_CONFIG = 'lecture-answers-config.json';

export function lectureAnswersConfigPath(): string {
  return join(getCcHomePath(), LECTURE_ANSWERS_CONFIG);
}

export function answersIndexRoot(courseDir: string): string {
  return join(courseDir, '.canvas-toolchain', 'answers-index');
}

export function chunksDbPath(courseDir: string): string {
  return join(answersIndexRoot(courseDir), 'chunks.sqlite');
}

export function vectorsDbPath(courseDir: string): string {
  return join(answersIndexRoot(courseDir), 'vectors.sqlite');
}

export function indexMetaPath(courseDir: string): string {
  return join(answersIndexRoot(courseDir), 'index-meta.json');
}

export function chunkBodiesDir(courseDir: string): string {
  return join(answersIndexRoot(courseDir), 'chunks');
}

export function defaultSlidesDir(courseDir: string): string {
  return join(courseDir, 'slides');
}

export function defaultCanonicalFaqPath(courseDir: string): string {
  return join(courseDir, 'answers', 'canonical.md');
}
