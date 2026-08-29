/**
 * Quiz generate + validate shared types (Phase 1 validate-first).
 * Spec: docs/superpowers/specs/2026-08-26-quiz-validation-engine-design.md
 */

export const QUIZ_DRAFT_SCHEMA = 'canvas-toolchain.quiz/v1' as const;

export type QuizPageType = 'weekly-quiz' | 'reading-quiz';
export type QuizItemType = 'multiple_choice' | 'true_false';
export type QuizFindingSeverity = 'error' | 'warning' | 'suggestion';
export type QuizValidationVerdict = 'ok' | 'needs-fixes' | 'needs-review';
export type QuizValidateSource = 'canvas' | 'local-draft';
export type QuizHorizonPass = 'primary' | 'secondary';
export type WeekProvenance = 'inferred' | 'override';

export interface DifficultyMix {
  easy: number;
  medium: number;
  hard: number;
}

export const DEFAULT_DIFFICULTY_MIX: DifficultyMix = {
  easy: 0.4,
  medium: 0.4,
  hard: 0.2,
};

export const DEFAULT_WEEKLY_CHECK_DAY = 'saturday' as const;

export type WeeklyCheckDay =
  | 'monday' | 'tuesday' | 'wednesday' | 'thursday'
  | 'friday' | 'saturday' | 'sunday';

/** Echo-only — shell persists; quiz never gates on this. */
export interface SpotCheckPreferenceEcho {
  weeklyCheckEnabled: boolean;
  weeklyCheckDay: WeeklyCheckDay;
}

export interface WeekMapOverride {
  index: number;
  label?: string;
  moduleIds?: number[];
  monday?: string;
  sunday?: string;
}

export interface QuizMeta {
  quizId?: string;
  title?: string;
  questionCount?: number | null;
  pointsPossible?: number | null;
  published?: boolean;
  dueAt?: string | null;
  lockAt?: string | null;
  unlockAt?: string | null;
  quizType?: string;
}

export interface QuizItem {
  id?: string;
  type?: string;
  stem: string;
  choices?: string[];
  /** Letter key(s) for MCQ (A/B/C/…) or true/false literal. */
  key?: string | string[];
  points?: number | null;
  difficulty?: 'easy' | 'medium' | 'hard';
}

export interface LiveQuizPayload {
  meta: QuizMeta;
  items: QuizItem[];
  itemsAvailable: boolean;
  /** True when Canvas signals New Quizzes / limited item API. */
  newQuizzesLimited?: boolean;
}

export interface QuizFinding {
  code: string;
  severity: QuizFindingSeverity;
  questionId?: string;
  message: string;
  fixHint?: string;
}

export interface QuizValidationReport {
  source: QuizValidateSource;
  courseId?: string;
  quizId?: string;
  path?: string;
  horizonPass?: QuizHorizonPass;
  asOfDate?: string;
  weekNumber?: number;
  weekStartMonday?: string;
  weekProvenance?: WeekProvenance;
  verdict: QuizValidationVerdict;
  findings: QuizFinding[];
  realizedMix?: DifficultyMix;
  summary: string;
}

export interface QuizDraftHeader {
  schema: typeof QUIZ_DRAFT_SCHEMA;
  week: number;
  title: string;
  pageType: QuizPageType;
  questionCount?: number;
  pointsPossible?: number;
  difficultyMix: DifficultyMix;
  sources?: string[];
  status: 'draft';
}
