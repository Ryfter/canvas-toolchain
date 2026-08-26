/** Types for shell readiness — see specs/2026-08-26-shell-readiness-engine-design.md */

export type ShellFindingSeverity = 'blocking' | 'warning' | 'suggestion';
export type ShellFindingPack = 'structure' | 'schedule' | 'links' | 'instructions' | 'mismatch';
export type ShellWeekRole = 'primary' | 'secondary';
export type ShellCheckDepth = 'thorough' | 'lighter';
export type ShellWeekday =
  | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
export type ShellWeekProvenance = 'inferred' | 'override';
export type ShellRunTrigger = 'manual' | 'weekly-suggested';

export interface SpotCheckPreference {
  weeklyCheckEnabled: boolean;
  weeklyCheckDay: ShellWeekday;
  updatedAt: string;
}

export interface ShellWeekMapOverride {
  index: number;
  label?: string;
  moduleIds?: number[];
  monday?: string;
  sunday?: string;
}

export interface CheckShellReadinessInput {
  courseId: string;
  asOfDate?: string;
  termStartMonday?: string;
  weekMapOverrides?: ShellWeekMapOverride[];
  packs?: ShellFindingPack[];
  senseCheck?: 'heuristics' | 'llm';
  confirm?: boolean;
  courseDir?: string;
  linkProbeBudget?: number;
  secondaryLinkProbeBudget?: number;
  moduleIds?: number[];
  forceWeekRole?: ShellWeekRole;
  trigger?: ShellRunTrigger;
}

export interface SetupSpotCheckInput {
  enabled: boolean;
  day?: ShellWeekday;
}

export interface CourseWeekResolved {
  index: number;
  label: string;
  monday: string;
  sunday: string;
  moduleIds: number[];
  provenance: ShellWeekProvenance;
}

export interface ShellResolvedWeek {
  role: ShellWeekRole;
  depth: ShellCheckDepth;
  index: number;
  label: string;
  monday: string;
  sunday: string;
  moduleIds: number[];
  provenance: ShellWeekProvenance;
}

export interface ShellWeekResolutionSummary {
  termStartMonday: string;
  method: 'hybrid';
  inferredWeekCount: number;
  overrideWeekCount: number;
  inferencePattern: string;
  notes?: string[];
}

export interface ShellFinding {
  id: string;
  pack: ShellFindingPack;
  severity: ShellFindingSeverity;
  message: string;
  weekRole: ShellWeekRole;
  depth: ShellCheckDepth;
  weekIndex?: number;
  weekProvenance?: ShellWeekProvenance;
  moduleId?: number;
  moduleName?: string;
  itemId?: number;
  itemTitle?: string;
  url?: string;
  canvasDates?: {
    due_at?: string | null;
    unlock_at?: string | null;
    lock_at?: string | null;
  };
  confidence?: 'high' | 'low';
}

export interface ShellQuizCallout {
  weekRole: ShellWeekRole;
  weekIndex: number;
  quizIds: number[];
  hint: string;
}

export interface ShellReadinessReport {
  courseId: number;
  courseName: string;
  source: 'live-canvas';
  framing: 'professor-week-map-hybrid';
  trigger: ShellRunTrigger;
  asOfDate: string;
  preference: {
    configured: boolean;
    enabled: boolean;
    day: ShellWeekday | null;
  };
  cadenceNote?: string;
  weekResolution: ShellWeekResolutionSummary;
  primaryWeek: ShellResolvedWeek;
  secondaryWeek: ShellResolvedWeek;
  quizCallouts: ShellQuizCallout[];
  summary: {
    primary: { modules: number; items: number; blocking: number; warning: number; suggestion: number };
    secondary: { modules: number; items: number; blocking: number; warning: number; suggestion: number };
    mismatches: number;
    linksProbed: number;
    packsRun: ShellFindingPack[];
  };
  findings: ShellFinding[];
  text: string;
}

export const WEEK_TITLE_PATTERN = '(?i)week\\s*0*(\\d+)';
export const WEEK_TITLE_RE = /week\s*0*(\d+)/i;
