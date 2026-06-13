import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Bucket } from './heuristic.js';

function courseDir(courseId: string): string {
  return join(process.env.CC_HOME ?? join(homedir(), '.command-and-control'), 'groups', courseId);
}
function bucketsPath(courseId: string): string { return join(courseDir(courseId), 'major-buckets.json'); }

export function loadMajorBuckets(courseId: string): Record<string, Bucket> | undefined {
  const p = bucketsPath(courseId);
  if (!existsSync(p)) return undefined;
  try { return JSON.parse(readFileSync(p, 'utf-8')) as Record<string, Bucket>; }
  catch { return undefined; }
}

export function saveMajorBuckets(courseId: string, map: Record<string, Bucket>): string {
  const dir = courseDir(courseId);
  mkdirSync(dir, { recursive: true });
  const p = bucketsPath(courseId);
  const tmp = `${p}.tmp`;
  writeFileSync(tmp, JSON.stringify(map, null, 2), { encoding: 'utf-8', mode: 0o600 });
  renameSync(tmp, p);
  return p;
}
