// src/tools/workflows/review_canvas_rubric.ts
import { readFileSync, existsSync } from 'node:fs';
import type { LlmClient } from '@canvas-toolchain/shared-llm';
import type { PulledRubric, ReviewReport } from '../rubric/sync_types.js';
import { pullRubric, type PullRubricInput } from '../rubric/canvas_fetch.js';
import { loadInstitutionConfig } from '../publish/canvas_config_bridge.js';
import { detectRubricChange } from '../rubric/change_detect.js';
import { triageRubric } from '../rubric/triage.js';

export interface ReviewCanvasRubricInput {
  courseId: string;
  assignmentId?: string;
  rubricId?: string;
  /** Path to the last rendered rubric .md, for change detection. */
  priorRenderedPath?: string;
  /** Overrides the pulled assignment description as the triage signal. */
  assignmentBrief?: string;
}

/** Injectable seams for tests. Production defaults wire real Canvas + LLM. */
export interface ReviewCanvasRubricDeps {
  pull?: (input: PullRubricInput) => Promise<PulledRubric>;
  readPriorMd?: (path?: string) => string | undefined;
  llm?: LlmClient;
}

/** Pick-list path returns source+choices with no change/triage. */
export type ReviewCanvasRubricResult = ReviewReport | (Pick<ReviewReport, 'source'> & { choices: NonNullable<PulledRubric['choices']>; change?: undefined; triage?: undefined });

function defaultReadPriorMd(path?: string): string | undefined {
  if (!path || !existsSync(path)) return undefined;
  return readFileSync(path, 'utf-8');
}

export async function reviewCanvasRubric(
  input: ReviewCanvasRubricInput,
  deps: ReviewCanvasRubricDeps = {},
): Promise<ReviewCanvasRubricResult> {
  const pull = deps.pull ?? ((i: PullRubricInput) => {
    const cfg = loadInstitutionConfig();
    return pullRubric(i, { cfg });
  });

  const pulled = await pull({ courseId: input.courseId, assignmentId: input.assignmentId, rubricId: input.rubricId });

  // List-fallback: hand back the pick-list, no triage.
  if (pulled.choices && pulled.criteria.length === 0) {
    return { source: pulled.source, choices: pulled.choices };
  }

  const priorMd = (deps.readPriorMd ?? defaultReadPriorMd)(input.priorRenderedPath);
  const change = detectRubricChange(pulled, priorMd);
  const assignmentSignal = input.assignmentBrief ?? pulled.assignmentBrief ?? '';
  const triage = await triageRubric({ pulled, change, assignmentSignal }, { llm: deps.llm });

  return { source: pulled.source, change, triage };
}
