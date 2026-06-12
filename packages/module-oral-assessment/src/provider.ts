export interface RubricCriterion {
  name: string;
  description: string;
  points: number;
}

export interface AssessmentQuestion {
  prompt: string;
}

export type AttemptsPolicy = number | 'unlimited';

export interface AssessmentDefaults {
  prepSeconds: number;
  responseSeconds: number;
  randomization: { pick: number; of: number };
  attempts: AttemptsPolicy;
}

export interface AssessmentSpec {
  title: string;
  promptSummary: string;
  questions: AssessmentQuestion[];
  prepSeconds: number;
  responseSeconds: number;
  randomization: { pick: number; of: number };
  attempts: AttemptsPolicy;
  rubricCriteria: RubricCriterion[];
}

/** A pluggable oral/video-assessment provider. Rhetorix is provider #1. */
export interface OralAssessmentProvider {
  id: string;
  name: string;
  /** True for the best-of-breed default provider surfaced as the recommendation. */
  recommended: boolean;
  /** Human-readable "why this provider" rationale. */
  recommendation(): string;
  /** Default timing/randomization, optionally tuned to an intent keyword. */
  defaults(intent?: string): AssessmentDefaults;
  /** Paste-ready setup text for the provider's own assignment creator. */
  formatAssessment(spec: AssessmentSpec): string;
  /** Build the LTI launch URL from a stored institution domain, or null. */
  buildLaunchUrl(domain: string | undefined): string | null;
}
