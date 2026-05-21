import type { CourseId, SemesterId, TrajectoryEntry, TrajectoryDiff, PerTopicTrajectory, Verdict } from '../types.js';
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

export interface AnalyzeCourseInput {
  courseId: CourseId;
  semesterId: SemesterId;
  archivePath: string;
}

export interface AnalyzeCourseReport {
  courseId: CourseId;
  semesterId: SemesterId;
  historyPath: string;
  perAssignment: PerTopicTrajectory[];
  perConcept?: PerTopicTrajectory[];
  trajectoryEntry: TrajectoryEntry;
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
    diff: {
      sameSeason: diffSameSeason,
      mostRecent: diffMostRecent,
    },
  };

  // 10. Persist entry
  appendEntry(entry);

  return {
    courseId,
    semesterId,
    historyPath: getHistoryPath(courseId),
    perAssignment,
    trajectoryEntry: entry,
  };
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
