import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { snapshotsRootFor } from '../tools/publish/snapshot_store.js';

export type HealthClass = 'green' | 'yellow' | 'red';

export interface CourseHealth {
  name: string;
  shortName: string;
  semester: string;
  courseDir: string;
  pageCount: number;
  lastPublishedAt: string | null;
  transcriptCoverage: { withTranscript: number; totalWeeks: number };
  health: HealthClass;
}

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'output', 'publish-snapshots']);
const MAX_DEPTH = 5;

export function walkForCourses(root: string, depth = 0): string[] {
  if (!existsSync(root)) return [];
  if (depth > MAX_DEPTH) return [];

  const results: string[] = [];
  let entries: string[];
  try { entries = readdirSync(root); } catch { return results; }

  if (entries.includes('course-config.md')) {
    results.push(root);
    return results;
  }

  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(root, entry);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (!st.isDirectory()) continue;
    results.push(...walkForCourses(full, depth + 1));
  }
  return results;
}

function readFmFlatFields(filePath: string): Record<string, string> {
  const raw = readFileSync(filePath, 'utf-8');
  const m = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  const out: Record<string, string> = {};
  for (const line of m[1].split('\n')) {
    const fm = line.match(/^([a-z_]+):\s*"?([^"]*)"?\s*$/);
    if (fm) out[fm[1]] = fm[2].trim();
  }
  return out;
}

function countPages(courseDir: string): number {
  let count = 0;
  for (const entry of readdirSync(courseDir)) {
    if (extname(entry) !== '.md') continue;
    if (entry === 'course-config.md') continue;
    count++;
  }
  return count;
}

function computeTranscriptCoverage(courseDir: string): { withTranscript: number; totalWeeks: number } {
  let totalWeeks = 0;
  let withTranscript = 0;
  for (const entry of readdirSync(courseDir)) {
    if (!/^week-\d+$/.test(entry)) continue;
    const weekDir = join(courseDir, entry);
    let st;
    try { st = statSync(weekDir); } catch { continue; }
    if (!st.isDirectory()) continue;
    totalWeeks++;
    let weekEntries: string[];
    try { weekEntries = readdirSync(weekDir); } catch { continue; }
    if (weekEntries.some((e) => e.endsWith('.enriched.md'))) withTranscript++;
  }
  return { withTranscript, totalWeeks };
}

function findLastPublishedAt(courseDir: string): string | null {
  const root = snapshotsRootFor(courseDir);
  if (!existsSync(root)) return null;
  let latest = 0;
  for (const entry of readdirSync(root)) {
    const full = join(root, entry);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (!st.isDirectory()) continue;
    if (st.mtimeMs > latest) latest = st.mtimeMs;
  }
  return latest === 0 ? null : new Date(latest).toISOString();
}

export interface ClassifyHealthInput {
  lastPublishedAt: string | null;
  transcriptCoverage: { withTranscript: number; totalWeeks: number };
  now: Date;
}

export function classifyHealth(input: ClassifyHealthInput): HealthClass {
  const coverageRatio = input.transcriptCoverage.totalWeeks === 0
    ? 0
    : input.transcriptCoverage.withTranscript / input.transcriptCoverage.totalWeeks;

  let daysSincePublish = Infinity;
  if (input.lastPublishedAt) {
    daysSincePublish = (input.now.getTime() - new Date(input.lastPublishedAt).getTime()) / 86400_000;
  }

  if (daysSincePublish <= 30 && coverageRatio >= 0.8) return 'green';
  if (daysSincePublish <= 90 || coverageRatio >= 0.5) return 'yellow';
  return 'red';
}

export function buildCourseHealth(courseDir: string, now: Date = new Date()): CourseHealth {
  const fm = readFmFlatFields(join(courseDir, 'course-config.md'));
  const transcriptCoverage = computeTranscriptCoverage(courseDir);
  const lastPublishedAt = findLastPublishedAt(courseDir);
  return {
    name: fm.title ?? basename(courseDir),
    shortName: fm.short_name ?? basename(courseDir),
    semester: fm.semester ?? '',
    courseDir,
    pageCount: countPages(courseDir),
    lastPublishedAt,
    transcriptCoverage,
    health: classifyHealth({ lastPublishedAt, transcriptCoverage, now }),
  };
}
