import type { CourseId, SemesterId, Verdict, TrajectoryFlag } from '../types.js';
import { semestersBetween, type CurrencyClass } from './score_topic_currency.js';

export interface RecommendForTopicInput {
  courseId: CourseId;
  semesterId: SemesterId;
  topic: string;
  currencyClass: CurrencyClass;
  lastTaughtSemesterId: string | null;
  newsHits: number;
  includeDetails?: boolean;
  trajectoryFlag?: TrajectoryFlag;
  verdictHistory?: Verdict[];
}

export interface VerdictDetails {
  currencyClass: CurrencyClass;
  newsHits: number;
  semestersSinceLastTaught: number;
  lastTaughtSemesterId: string | null;
}

export interface RecommendForTopicResult {
  topic: string;
  verdict: Verdict;
  rationale: string;
  details?: VerdictDetails;
}

export function recommendForTopic(input: RecommendForTopicInput): RecommendForTopicResult {
  const semestersSince = semestersBetween(input.lastTaughtSemesterId, input.semesterId);
  const verdict = computeVerdict(input.currencyClass, input.lastTaughtSemesterId, input.newsHits, semestersSince);
  const baseRationale = buildRationale(verdict, input.topic, input.currencyClass, semestersSince, input.newsHits);
  const rationale = baseRationale + trajectoryAnnotation(input.trajectoryFlag, input.verdictHistory);

  const result: RecommendForTopicResult = { topic: input.topic, verdict, rationale };

  if (input.includeDetails) {
    result.details = {
      currencyClass: input.currencyClass,
      newsHits: input.newsHits,
      semestersSinceLastTaught: semestersSince,
      lastTaughtSemesterId: input.lastTaughtSemesterId,
    };
  }

  return result;
}

function computeVerdict(
  currencyClass: CurrencyClass,
  lastTaught: string | null,
  newsHits: number,
  semestersSince: number
): Verdict {
  if (lastTaught === null) return 'ADD';
  if (currencyClass === 'dated' && newsHits === 0) return 'DROP';
  if (currencyClass === 'evergreen' && semestersSince <= 4) return 'KEEP';
  if (currencyClass === 'current' && semestersSince <= 1 && newsHits <= 3) return 'KEEP';
  return 'UPDATE';
}

function buildRationale(
  verdict: Verdict,
  topic: string,
  currencyClass: CurrencyClass,
  semestersSince: number,
  newsHits: number
): string {
  switch (verdict) {
    case 'ADD':
      return `"${topic}" has never been covered but has ${newsHits} recent news hits — worth adding.`;
    case 'DROP':
      return `"${topic}" is ${currencyClass} with no recent news signal and hasn't been taught in ${semestersSince} semester(s).`;
    case 'KEEP':
      return `"${topic}" is ${currencyClass}, was taught ${semestersSince} semester(s) ago, and remains relevant.`;
    case 'UPDATE':
      return (
        `"${topic}" was taught ${semestersSince} semester(s) ago; ` +
        (newsHits >= 4
          ? `${newsHits} recent news hits suggest meaningful updates are available.`
          : `it is ${currencyClass} and may benefit from fresh examples or context.`)
      );
  }
}

function trajectoryAnnotation(flag: TrajectoryFlag | undefined, history: Verdict[] | undefined): string {
  if (!flag || flag === 'new' || flag === 'stable' || flag === 'stabilising') return '';
  if (flag === 'unstable') {
    const pattern = history ? history.slice(-4).join('→') : '';
    return ` Trajectory note: this topic has flipped (${pattern}) over the last ${history?.length ?? 'few'} semesters — consider a structural review rather than another incremental update.`;
  }
  if (flag === 'true-evergreen') {
    return ` Trajectory note: KEEP for ${history?.length ?? '4+'} consecutive semesters — strong evergreen signal.`;
  }
  return '';
}
