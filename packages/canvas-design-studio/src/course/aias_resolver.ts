import type { AiasLevel, PageAias } from '@canvas-toolchain/shared-types';
import { CANONICAL_AIAS_NOTES } from './aias_canonical.js';

export interface CourseAiasDefaults {
  level?: AiasLevel;
  note?: string;
}

export interface PageAiasOverride {
  level: AiasLevel;
  note?: string;
}

export function resolveEffectiveAias(
  pageOverride: PageAiasOverride | undefined,
  courseDefaults: CourseAiasDefaults | undefined,
): PageAias | undefined {
  const level = pageOverride?.level ?? courseDefaults?.level;
  if (level === undefined) return undefined;

  const note =
    pageOverride?.note ??
    courseDefaults?.note ??
    CANONICAL_AIAS_NOTES[level];

  return { level, note };
}
