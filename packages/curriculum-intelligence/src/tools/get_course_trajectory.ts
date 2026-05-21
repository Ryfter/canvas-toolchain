import {
  computeChurnRate, identifyTrueEvergreens, identifyUnstableTopics, readEntries,
} from '../kb/trajectory.js';
import type { CourseId, TrajectoryEntry, Verdict } from '../types.js';

export interface GetCourseTrajectoryInput {
  courseId: CourseId;
  granularity?: 'summary' | 'standard' | 'granular';
  lookback?: number;
}

export interface VerdictCountSnapshot {
  semesterId: string;
  counts: Record<Verdict, number>;
}

export interface PerTopicTimeline {
  topic: string;
  verdicts: { semesterId: string; verdict: Verdict }[];
}

export interface CourseTrajectoryResult {
  courseId: CourseId;
  semesterCount: number;
  churnRate: number;
  unstableTopics: string[];
  trueEvergreens: string[];
  verdictCountsOverTime: VerdictCountSnapshot[];
  topicTimelines?: PerTopicTimeline[];
  rawEntries?: TrajectoryEntry[];
}

export async function getCourseTrajectory(input: GetCourseTrajectoryInput): Promise<CourseTrajectoryResult> {
  const { courseId, granularity = 'standard', lookback } = input;
  const entries = readEntries(courseId, lookback);

  const result: CourseTrajectoryResult = {
    courseId,
    semesterCount: entries.length,
    churnRate: computeChurnRate(entries),
    unstableTopics: identifyUnstableTopics(entries),
    trueEvergreens: identifyTrueEvergreens(entries),
    verdictCountsOverTime: entries.map((e) => ({ semesterId: e.semesterId, counts: e.verdicts })),
  };

  if (granularity === 'standard' || granularity === 'granular') {
    result.topicTimelines = buildTopicTimelines(entries);
  }

  if (granularity === 'granular') {
    result.rawEntries = entries;
  }

  return result;
}

function buildTopicTimelines(entries: TrajectoryEntry[]): PerTopicTimeline[] {
  const byTopic = new Map<string, { semesterId: string; verdict: Verdict }[]>();
  for (const entry of entries) {
    for (const t of entry.perAssignment) {
      const arr = byTopic.get(t.topic) ?? [];
      arr.push({ semesterId: entry.semesterId, verdict: t.verdict });
      byTopic.set(t.topic, arr);
    }
  }
  return Array.from(byTopic.entries()).map(([topic, verdicts]) => ({ topic, verdicts }));
}
