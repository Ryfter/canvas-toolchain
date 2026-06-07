import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  CANONICAL_AIAS_NOTES,
} from 'canvas-design-mcp/dist/course/aias_canonical.js';
import { writeAiasDefaults } from 'canvas-design-mcp/dist/course/aias_config.js';
import type { AiasLevel } from '@canvas-toolchain/shared-types';

export interface SetCourseAiasDefaultInput {
  courseDir: string;
  level: AiasLevel;
  note?: string;
}

export type SetCourseAiasDefaultResult =
  | { ok: true; courseDir: string; level: AiasLevel; effectiveNote: string; configPath: string }
  | { ok: false; error: 'COURSE_CONFIG_NOT_FOUND' | 'INVALID_LEVEL'; message: string; fix: string[] };

function isAiasLevel(v: unknown): v is AiasLevel {
  return v === 1 || v === 2 || v === 3 || v === 4 || v === 5;
}

export async function setCourseAiasDefault(input: SetCourseAiasDefaultInput): Promise<SetCourseAiasDefaultResult> {
  if (!isAiasLevel(input.level)) {
    return {
      ok: false,
      error: 'INVALID_LEVEL',
      message: `Level must be 1-5, got ${String(input.level)}`,
      fix: ['level must be 1, 2, 3, 4, or 5'],
    };
  }

  const configPath = join(input.courseDir, 'course-config.md');
  if (!existsSync(configPath)) {
    return {
      ok: false,
      error: 'COURSE_CONFIG_NOT_FOUND',
      message: `course-config.md not found at ${configPath}`,
      fix: ['Check that courseDir is a CDS course folder containing course-config.md'],
    };
  }

  writeAiasDefaults(configPath, input.level, input.note);

  const effectiveNote = input.note ?? CANONICAL_AIAS_NOTES[input.level];

  return {
    ok: true,
    courseDir: input.courseDir,
    level: input.level,
    effectiveNote,
    configPath,
  };
}
