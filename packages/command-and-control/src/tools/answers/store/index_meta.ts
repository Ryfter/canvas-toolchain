// packages/command-and-control/src/tools/answers/store/index_meta.ts

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { indexMetaPath } from '../paths.js';
import type { IndexMeta } from '../types.js';

export function readIndexMeta(courseDir: string): IndexMeta | null {
  const path = indexMetaPath(courseDir);
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, 'utf-8')) as IndexMeta; }
  catch { return null; }
}

export function writeIndexMeta(courseDir: string, meta: IndexMeta): void {
  const path = indexMetaPath(courseDir);
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(meta, null, 2), 'utf-8');
  renameSync(tmp, path);
}
