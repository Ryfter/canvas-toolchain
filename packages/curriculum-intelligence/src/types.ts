/**
 * Core types shared across Curriculum Intelligence tools.
 *
 * v0.5/0.6 scope only. Types for deferred capabilities (planning, shell update)
 * are not declared here yet.
 */

export type CourseId = string;       // e.g. "ITM370"
export type SemesterId = string;     // e.g. "Spring2025"

/**
 * Source of a transcript file. Lets downstream tools compare Panopto-native
 * captions vs. Whisper-generated transcripts for the same lecture.
 */
export type TranscriptSource = 'panopto' | 'whisper' | 'unknown';

/**
 * App-level config persisted at <appHome>/config.json.
 * Maps each registered course id to its on-disk root so courses can live
 * anywhere on the filesystem and still be referenced by id alone.
 */
export interface AppConfig {
  version: 1;
  courses: Record<CourseId, RegisteredCourse>;
}

export interface RegisteredCourse {
  id: CourseId;
  title: string;
  courseRoot: string;      // absolute path to <courseRoot>/<id>/ — parent of the course folder
  registeredAt: string;    // ISO timestamp
}

/**
 * Per-course config persisted at <courseRoot>/<id>/config.json.
 */
export interface CourseConfig {
  version: 1;
  id: CourseId;
  title: string;
  semesters: SemesterRecord[];
  rssFeeds: string[];      // URLs configured for this course's topic area
}

export interface SemesterRecord {
  id: SemesterId;
  registeredAt: string;
  archivePath?: string;    // absolute path to the Canvas export folder
  lastIngestedAt?: string;
  lastTranscriptsIngestedAt?: string;
}

/**
 * `topic-map.json` shape. Produced by ingest_canvas_archive and consumed by
 * every downstream tool (list_*, diff_semesters, score_topic_currency, ...).
 */
export interface TopicMap {
  version: 1;
  semesterId: SemesterId;
  ingestedAt: string;
  course: CourseInfo;
  modules: ModuleInfo[];
  assignments: AssignmentInfo[];
  pages: PageInfo[];
  discussions: DiscussionInfo[];
  quizzes: QuizInfo[];
  resourceLinks: ResourceLink[];
}

export interface CourseInfo {
  canvasId: number | null;
  name: string;
  courseCode: string | null;
  termName: string | null;
  termStart: string | null;
  termEnd: string | null;
}

export interface ModuleInfo {
  canvasId: number;
  position: number;
  name: string;
  published: boolean;
  items: ModuleItem[];
}

export interface ModuleItem {
  canvasId: number;
  position: number;
  title: string;
  type: string;                // Page | Assignment | Quiz | Discussion | ExternalUrl | File | SubHeader | ...
  pageUrl?: string;
  contentId?: number;
  externalUrl?: string;
}

export interface AssignmentInfo {
  canvasId: number;
  name: string;
  position: number;
  dueAt: string | null;
  pointsPossible: number | null;
  submissionTypes: string[];
  published: boolean;
  descriptionExcerpt: string;  // plain-text first 400 chars
}

export interface PageInfo {
  canvasId: number;
  title: string;
  url: string;
  published: boolean;
  bodyExcerpt: string;         // plain-text first 400 chars (empty if body not loaded)
}

export interface DiscussionInfo {
  canvasId: number;
  title: string;
  published: boolean;
  messageExcerpt: string;
}

export interface QuizInfo {
  canvasId: number;
  title: string;
  published: boolean;
  questionCount: number | null;
  pointsPossible: number | null;
}

export interface ResourceLink {
  url: string;
  text: string;
  source: 'page' | 'assignment' | 'discussion';
  sourceTitle: string;
}

/**
 * One parsed transcript (a single lecture's captions).
 */
export interface Transcript {
  id: string;                       // derived from filename, no extension
  filename: string;
  source: TranscriptSource;         // panopto | whisper | unknown
  format: 'vtt' | 'srt' | 'md';
  durationSec: number | null;
  cues: TranscriptCue[];
  fullText: string;                 // all cue text joined with spaces (handy for search)
  weekHint: number | null;          // parsed from filename if it contains "wk03" / "week-3" / similar
  dateHint: string | null;          // ISO date if filename contains YYYY-MM-DD or similar
}

export interface TranscriptCue {
  startSec: number;
  endSec: number;
  text: string;
}

export interface FeedItem {
  title: string;
  url: string;
  publishedAt: Date | null;
  summary: string;
  sourceId: string;
}

// ── v1.0 planning types ──────────────────────────────────────────────────────

export type PlanSource = 'archive' | 'cds' | 'auto';
export type BreakCollision = 'bump-before' | 'bump-after' | 'flag';
export type Staleness = 'low' | 'moderate' | 'high';

export interface BreakRange {
  name: string;
  start: string;  // ISO date YYYY-MM-DD
  end: string;
}

export interface SemesterCalendar {
  semesterId: string;
  classesBegin: string;
  classesEnd: string;
  deadWeek?: { start: string; end: string };
  finals?: { start: string; end: string };
  breaks: BreakRange[];
  source: 'url' | 'manual' | 'pattern';
  partial: boolean;
  missing?: string[];
}

export interface SectionCalendarOverride {
  sectionId: string;
  calendarOverrides?: Partial<SemesterCalendar>;
}

export interface PlanConfig {
  courseId: CourseId;
  sourceSemesterId: SemesterId;
  targetSemesterId: SemesterId;
  source: PlanSource;
  sections: string[];
  status: 'draft' | 'approved';
  toolsRun: string[];
}

export interface BriefFrontMatter {
  title: string;
  week: number;
  type: string;
  points?: number;
  due: string;                          // "TBD" until shift_dates runs
  originalDue?: string;                 // ISO date from source archive
  due_sections?: Record<string, string>;
  verdict: 'KEEP' | 'UPDATE' | 'DROP' | 'ADD';
  currency: 'evergreen' | 'current' | 'dated';
  lastTaught: string;
  semestersSince: number;
  newsHits: number;
  staleness: Staleness;
  replacement_recommended: boolean;
}

// ── Verdict ──────────────────────────────────────────────────────────────────
// Defined here (not in recommend_for_topic.ts) to avoid circular imports.

export type Verdict = 'KEEP' | 'UPDATE' | 'DROP' | 'ADD';

// ── Trajectory log types ─────────────────────────────────────────────────────

export type TrajectoryFlag =
  | 'new'             // first time we've seen this topic
  | 'stable'          // unchanged over 2-3 runs (not yet 4)
  | 'stabilising'     // changed once over last 3 runs
  | 'unstable'        // changed >=2 times in last 4 runs
  | 'true-evergreen'; // KEEP for last 4+ consecutive runs

export interface PerTopicTrajectory {
  /** Either an assignment.name verbatim, or an LLM-extracted concept name. */
  topic: string;
  verdict: Verdict;
  currencyClass: 'evergreen' | 'current' | 'dated';
  newsHitCount: number;
  trajectoryFlag: TrajectoryFlag;
  verdictPrior: Verdict | null;
  verdictHistory: Verdict[];               // chronological, last up to 4
  /** Only present on perConcept entries. */
  relatedAssignments?: string[];
}

/**
 * Mirrors the SemesterDiff shape from diff_semesters.ts.
 * baselineSemester is the prior semester being compared against.
 */
export interface TrajectoryDiff {
  baselineSemester: SemesterId;
  modules: {
    added: { name: string; position: number }[];
    removed: { name: string; position: number }[];
    common: { leftName: string; rightName: string }[];
  };
  assignments: {
    added: { name: string; pointsPossible: number | null }[];
    removed: { name: string; pointsPossible: number | null }[];
    reusedVerbatim: { name: string; pointsPossible: number | null }[];
    rewritten: { name: string; leftExcerpt: string; rightExcerpt: string }[];
  };
  pages: {
    added: { url: string; title: string }[];
    removed: { url: string; title: string }[];
    commonCount: number;
  };
  resources: {
    added: string[];
    removed: string[];
  };
}

export interface TrajectoryEntry {
  schemaVersion: 1;
  timestamp: string;
  courseId: CourseId;
  semesterId: SemesterId;
  priorSemesters: {
    sameSeason: SemesterId | null;
    mostRecent: SemesterId | null;
  };
  assignmentCount: number;
  verdicts: Record<Verdict, number>;       // counts across perAssignment only
  perAssignment: PerTopicTrajectory[];     // always populated
  perConcept?: PerTopicTrajectory[];       // optional, only when concept extraction ran
  diff: {
    sameSeason: TrajectoryDiff | null;
    mostRecent: TrajectoryDiff | null;
  };
}
