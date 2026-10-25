import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ciDataHome, cdsConfigHome } from '@canvas-toolchain/shared-types';
import type { TopicMap, TrajectoryEntry } from '@canvas-toolchain/curriculum-intelligence/dist/types.js';

export type { TrajectoryEntry, TopicMap };

export interface BridgedKb {
  /** Professor's philosophy and pedagogy notes. Null if the file doesn't exist. */
  philosophyKb(): string | null;
  /** Student persona descriptions. Null if the file doesn't exist. */
  studentPersonas(): string | null;
  /** All trajectory entries for a course, in append order. Null if history.jsonl is absent. */
  courseTrajectory(courseId: string): TrajectoryEntry[] | null;
  /** The topic-map for a specific semester. Null if the file is absent. */
  courseTopicMap(courseId: string, semesterId: string): TopicMap | null;
  /** Absolute path to the CDS course design folder, or null if it doesn't exist. */
  courseDesignFolder(courseId: string): string | null;
}

function getCiHome(): string {
  // courses/ is data-class (spec 2.2)
  return ciDataHome();
}

function getCdsHome(): string {
  // philosophy-kb.md, student-personas.md and course/ are config-class (spec 2.2)
  return cdsConfigHome();
}

function safeReadFile(filePath: string): string | null {
  try {
    if (!existsSync(filePath)) return null;
    return readFileSync(filePath, 'utf-8');
  } catch {
    process.stderr.write(`kb-bridge: failed to read ${filePath}\n`);
    return null;
  }
}

function safeParseJson<T>(raw: string, filePath: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    process.stderr.write(`kb-bridge: failed to parse JSON at ${filePath}\n`);
    return null;
  }
}

/**
 * Returns a lazy, per-call-cached bridge over the three app KBs.
 * Each accessor reads from disk on first call and caches the result.
 * Never throws — returns null on any file system or parse error.
 */
export function loadKb(): BridgedKb {
  const ciHome = getCiHome();
  const cdsHome = getCdsHome();

  // Per-instance caches — undefined = not yet fetched
  let philCache: string | null | undefined;
  let personasCache: string | null | undefined;

  return {
    philosophyKb(): string | null {
      if (philCache !== undefined) return philCache;
      philCache = safeReadFile(join(cdsHome, 'philosophy-kb.md'));
      return philCache;
    },

    studentPersonas(): string | null {
      if (personasCache !== undefined) return personasCache;
      personasCache = safeReadFile(join(cdsHome, 'student-personas.md'));
      return personasCache;
    },

    courseTrajectory(courseId: string): TrajectoryEntry[] | null {
      const filePath = join(ciHome, 'courses', courseId, 'history.jsonl');
      const raw = safeReadFile(filePath);
      if (raw === null) return null;
      try {
        return raw
          .trim()
          .split('\n')
          .filter((line) => line.trim().length > 0)
          .map((line) => JSON.parse(line) as TrajectoryEntry);
      } catch {
        process.stderr.write(`kb-bridge: failed to parse JSONL at ${filePath}\n`);
        return null;
      }
    },

    courseTopicMap(courseId: string, semesterId: string): TopicMap | null {
      const filePath = join(ciHome, 'courses', courseId, 'semesters', semesterId, 'topic-map.json');
      const raw = safeReadFile(filePath);
      if (raw === null) return null;
      return safeParseJson<TopicMap>(raw, filePath);
    },

    courseDesignFolder(courseId: string): string | null {
      const folderPath = join(cdsHome, 'course', courseId);
      return existsSync(folderPath) ? folderPath : null;
    },
  };
}
