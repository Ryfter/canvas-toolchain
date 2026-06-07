import { readdirSync, statSync } from 'node:fs';
import { join, relative, extname, basename } from 'node:path';
import type { CourseId, SemesterId, TrajectoryEntry, TrajectoryDiff, PerTopicTrajectory, Verdict } from '../types.js';
import type { LlmClient } from '../llm/client.js';
import type { PageTiers } from '@canvas-toolchain/shared-types';
import { ingestCanvasArchive } from './ingest_canvas_archive.js';
import { diffSemesters, type DiffSemestersResult } from './diff_semesters.js';
import { scoreTopicCurrency } from './score_topic_currency.js';
import { recommendForTopic } from './recommend_for_topic.js';
import { loadCourseConfig } from '../kb/course_state.js';
import { loadTopicMap } from '../kb/topic_map.js';
import {
  appendEntry,
  readEntries,
  computeTrajectoryFlag,
  findSameSeasonPrior,
  findMostRecentPrior,
  getHistoryPath,
} from '../kb/trajectory.js';
import { extractCourseConcepts } from './extract_course_concepts.js';
import { assignTiers } from '../analyze/assign_tiers.js';
import { readPageFrontMatter, writePageTiers, splitSections } from '../analyze/page_front_matter.js';

export interface AnalyzeCourseInput {
  courseId: CourseId;
  semesterId: SemesterId;
  archivePath: string;
  extractConcepts?: boolean;
  llmClient?: LlmClient;
  /** CDS course folder — when provided, the tier-assignment phase runs over its pages. */
  courseDir?: string;
  /** Shared-llm-shape client used by the tier-assignment phase (#66). Required when courseDir is set. */
  tierLlm?: import('@canvas-toolchain/shared-llm').LlmClient;
}

export interface AnalyzeCourseReport {
  courseId: CourseId;
  semesterId: SemesterId;
  historyPath: string;
  perAssignment: PerTopicTrajectory[];
  perConcept?: PerTopicTrajectory[];
  trajectoryEntry: TrajectoryEntry;
  /** Present when input.courseDir was supplied. */
  tierAssignments?: Array<{ relPath: string; tiers: PageTiers }>;
  /** Present when input.courseDir was supplied. */
  tierWarnings?: string[];
}

export async function analyzeCourse(input: AnalyzeCourseInput): Promise<AnalyzeCourseReport> {
  const { courseId, semesterId, archivePath } = input;

  // 1. Ingest the archive (writes topic-map.json to disk, registers semester in config)
  ingestCanvasArchive({ courseId, semesterId, archivePath });

  // 2. Load config AFTER ingest so the current semester is registered
  const config = loadCourseConfig(courseId);
  const allSemesterIds = config.semesters.map((s) => s.id);
  const priorSemesterIds = allSemesterIds.filter((id) => id !== semesterId);

  // 3. Resolve prior-semester pointers
  const sameSeason = findSameSeasonPrior(semesterId, priorSemesterIds);
  const mostRecent = findMostRecentPrior(
    semesterId,
    config.semesters.filter((s) => s.id !== semesterId),
  );

  // 4. Load prior history to build verdict histories for each topic
  const priorEntries = readEntries(courseId);

  // Build a map: topic -> verdictHistory (chronological list, without current run)
  const priorVerdictsByTopic = new Map<string, Verdict[]>();
  for (const entry of priorEntries) {
    for (const row of entry.perAssignment) {
      const existing = priorVerdictsByTopic.get(row.topic) ?? [];
      existing.push(row.verdict);
      priorVerdictsByTopic.set(row.topic, existing);
    }
  }

  // 5. Load the topic map for the current semester
  const topicMap = loadTopicMap(courseId, semesterId);

  // 6. Score and recommend for each assignment
  const perAssignment: PerTopicTrajectory[] = [];

  for (const assignment of topicMap.assignments) {
    const topic = assignment.name;
    const priorHistory = priorVerdictsByTopic.get(topic) ?? [];

    // Determine lastTaughtSemesterId from priorEntries (last entry that had this topic)
    let lastTaughtSemesterId: string | null = null;
    for (let i = priorEntries.length - 1; i >= 0; i--) {
      const found = priorEntries[i].perAssignment.find((r) => r.topic === topic);
      if (found) {
        lastTaughtSemesterId = priorEntries[i].semesterId;
        break;
      }
    }

    const scoreResult = scoreTopicCurrency({
      courseId,
      semesterId,
      topic,
      newsHits: 0,
      lastTaughtSemesterId,
    });

    const recResult = recommendForTopic({
      courseId,
      semesterId,
      topic,
      currencyClass: scoreResult.currencyClass,
      lastTaughtSemesterId,
      newsHits: scoreResult.signals.newsHits,
    });

    const currentVerdict = recResult.verdict;
    const fullHistory = [...priorHistory, currentVerdict];
    const trajectoryFlag = computeTrajectoryFlag(fullHistory);
    const verdictPrior = priorHistory.length > 0 ? priorHistory[priorHistory.length - 1] : null;

    perAssignment.push({
      topic,
      verdict: currentVerdict,
      currencyClass: scoreResult.currencyClass,
      newsHitCount: scoreResult.signals.newsHits,
      trajectoryFlag,
      verdictPrior,
      verdictHistory: fullHistory.slice(-4),
    });
  }

  // 7. Count verdicts
  const verdicts: Record<Verdict, number> = { KEEP: 0, UPDATE: 0, DROP: 0, ADD: 0 };
  for (const row of perAssignment) {
    verdicts[row.verdict]++;
  }

  // 8. Compute diffs (null if prior semester not yet ingested)
  const diffSameSeason = tryDiff(courseId, sameSeason, semesterId);
  const diffMostRecent = mostRecent !== sameSeason
    ? tryDiff(courseId, mostRecent, semesterId)
    : diffSameSeason;

  // 8.5. Optional concept extraction
  let perConcept: PerTopicTrajectory[] | undefined;
  if (input.extractConcepts && input.llmClient) {
    try {
      const extraction = await extractCourseConcepts({
        assignments: topicMap.assignments.map((a) => ({ name: a.name })),
        modules: topicMap.modules.map((m) => ({ name: m.name })),
        llmClient: input.llmClient,
      });
      perConcept = extraction.concepts.map((c) => {
        const related = perAssignment.filter((p) => c.relatedAssignments.includes(p.topic));
        const verdict = pickMostUncertainVerdict(related);
        const priorVerdicts = buildConceptVerdictHistory(c.name, priorEntries);
        const fullHistory: Verdict[] = [...priorVerdicts, verdict];
        return {
          topic: c.name,
          verdict,
          currencyClass: related[0]?.currencyClass ?? ('current' as const),
          newsHitCount: 0,
          trajectoryFlag: computeTrajectoryFlag(fullHistory),
          verdictPrior: priorVerdicts.length > 0 ? priorVerdicts[priorVerdicts.length - 1] : null,
          verdictHistory: fullHistory.slice(-4),
          relatedAssignments: c.relatedAssignments,
        };
      });
    } catch (err) {
      process.stderr.write(`[analyze_course] concept extraction failed: ${err instanceof Error ? err.message : String(err)}\n`);
    }
  }

  // 9. Build trajectory entry
  const entry: TrajectoryEntry = {
    schemaVersion: 1,
    timestamp: new Date().toISOString(),
    courseId,
    semesterId,
    priorSemesters: {
      sameSeason,
      mostRecent,
    },
    assignmentCount: perAssignment.length,
    verdicts,
    perAssignment,
    ...(perConcept ? { perConcept } : {}),
    diff: {
      sameSeason: diffSameSeason,
      mostRecent: diffMostRecent,
    },
  };

  // 10. Persist entry
  appendEntry(entry);

  const baseReport: AnalyzeCourseReport = {
    courseId,
    semesterId,
    historyPath: getHistoryPath(courseId),
    perAssignment,
    ...(perConcept ? { perConcept } : {}),
    trajectoryEntry: entry,
  };

  if (input.courseDir && input.tierLlm) {
    const tierPhase = await runTierPhase({ courseDir: input.courseDir, llm: input.tierLlm });
    return {
      ...baseReport,
      tierAssignments: tierPhase.tierAssignments,
      tierWarnings: tierPhase.tierWarnings,
    };
  }

  return baseReport;
}

function pickMostUncertainVerdict(assignments: PerTopicTrajectory[]): Verdict {
  const rank: Record<Verdict, number> = { UPDATE: 0, ADD: 1, DROP: 2, KEEP: 3 };
  if (assignments.length === 0) return 'KEEP';
  return [...assignments].sort((a, b) => rank[a.verdict] - rank[b.verdict])[0].verdict;
}

function buildConceptVerdictHistory(name: string, priorEntries: TrajectoryEntry[]): Verdict[] {
  const verdicts: Verdict[] = [];
  for (const entry of priorEntries) {
    const found = entry.perConcept?.find((t) => t.topic === name);
    if (found) verdicts.push(found.verdict);
  }
  return verdicts;
}

function tryDiff(
  courseId: CourseId,
  leftSemesterId: string | null,
  rightSemesterId: SemesterId,
): TrajectoryDiff | null {
  if (!leftSemesterId) return null;
  try {
    const result: DiffSemestersResult = diffSemesters({
      courseId,
      leftSemesterId,
      rightSemesterId,
    });
    return diffResultToTrajectoryDiff(result);
  } catch {
    return null;
  }
}

function diffResultToTrajectoryDiff(result: DiffSemestersResult): TrajectoryDiff {
  return {
    baselineSemester: result.leftSemesterId,
    modules: result.modules,
    assignments: result.assignments,
    pages: result.pages,
    resources: result.resources,
  };
}

function walkMarkdown(root: string, out: string[]): void {
  for (const entry of readdirSync(root)) {
    const full = join(root, entry);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist' || entry === '.git') continue;
      walkMarkdown(full, out);
    } else if (extname(entry) === '.md' && basename(entry) !== 'course-config.md') {
      out.push(full);
    }
  }
}

export interface RunTierPhaseInput {
  courseDir: string;
  llm: import('@canvas-toolchain/shared-llm').LlmClient;
}

export async function runTierPhase(input: RunTierPhaseInput): Promise<{
  tierAssignments: Array<{ relPath: string; tiers: PageTiers }>;
  tierWarnings: string[];
}> {
  const { courseDir, llm } = input;
  const pages: string[] = [];
  walkMarkdown(courseDir, pages);

  const tierAssignments: Array<{ relPath: string; tiers: PageTiers }> = [];
  const tierWarnings: string[] = [];

  for (const filePath of pages) {
    const relPath = relative(courseDir, filePath);
    let fm, body;
    try {
      ({ fm, body } = readPageFrontMatter(filePath));
    } catch (err) {
      tierWarnings.push(`PAGE_FM_PARSE_FAILED: ${relPath}: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }

    const existing = (fm as any).tiers as PageTiers | undefined;
    if (existing && existing.locked === true) continue;

    const pageTitle = typeof (fm as any).title === 'string' ? (fm as any).title : relPath;
    const sections = splitSections(body);
    if (sections.length === 0) continue;

    let result;
    try {
      result = await assignTiers({ pageTitle, sections, llm });
    } catch (err) {
      tierWarnings.push(`${relPath}: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }

    if (result.warnings.length > 0) {
      for (const w of result.warnings) tierWarnings.push(`${relPath}: ${w}`);
    }

    try {
      writePageTiers(filePath, result.tiers);
      tierAssignments.push({ relPath, tiers: result.tiers });
    } catch (err) {
      tierWarnings.push(`PAGE_BODY_WRITE_FAILED: ${relPath}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { tierAssignments, tierWarnings };
}
