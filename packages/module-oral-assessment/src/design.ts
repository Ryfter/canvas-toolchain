import type { LlmClient } from '@canvas-toolchain/shared-llm';
import type { AttemptsPolicy } from './provider.js';

export interface DesignOralAssessmentInput {
  assignmentBrief?: string;
  topic?: string;
  learningGoal?: string;
  courseContext?: string;
  questionCount?: number;
  prepSeconds?: number;
  responseSeconds?: number;
  attempts?: AttemptsPolicy;
  aiasLevel?: number;
  week?: number;
  title?: string;
  outputPath: string;
  launchDomain?: string;
  provider?: string;
}

export interface DesignOralAssessmentHooks {
  llm?: LlmClient;
}

export interface DesignOralAssessmentResult {
  pagePath: string;
  specPath: string;
  providerSpec: string;
  recommendation: string;
  questionCount: number;
  usage?: { inputTokens: number; outputTokens: number };
}

// Full implementation added in Task 9.
export async function designOralAssessment(
  _input: DesignOralAssessmentInput,
  _hooks: DesignOralAssessmentHooks = {},
): Promise<DesignOralAssessmentResult> {
  throw new Error('not implemented');
}
