import type { CourseId, SemesterId } from '../types.js';
import type { LlmClient } from '../llm/client.js';

export type CurrencyClass = 'evergreen' | 'current' | 'dated';

export interface NewsHit {
  source?: string;
  date: string;
  title: string;
}

export interface ScoreTopicCurrencyInput {
  courseId: CourseId;
  semesterId: SemesterId;
  topic: string;
  newsHits: number | NewsHit[];
  lastTaughtSemesterId: string | null;
  semanticVerify?: boolean;
  llmClient?: LlmClient;
}

export interface CurrencySignals {
  newsHits: number;
  semestersSinceLastTaught: number;
  lastTaughtSemesterId: string | null;
}

export interface ScoreTopicCurrencyResult {
  courseId: CourseId;
  semesterId: SemesterId;
  topic: string;
  currencyClass: CurrencyClass;
  signals: CurrencySignals;
  semanticRelevanceVerified?: boolean;
  semanticRationale?: string;
}

export function scoreTopicCurrency(input: ScoreTopicCurrencyInput & { semanticVerify?: false }): ScoreTopicCurrencyResult;
export function scoreTopicCurrency(input: ScoreTopicCurrencyInput & { semanticVerify: true }): ScoreTopicCurrencyResult | Promise<ScoreTopicCurrencyResult>;
export function scoreTopicCurrency(input: ScoreTopicCurrencyInput): ScoreTopicCurrencyResult | Promise<ScoreTopicCurrencyResult> {
  const semestersSince = semestersBetween(input.lastTaughtSemesterId, input.semesterId);
  const newsHitCount = newsHitCountFor(input.newsHits);
  const currencyClass = classify(newsHitCount, semestersSince);

  const result: ScoreTopicCurrencyResult = {
    courseId: input.courseId,
    semesterId: input.semesterId,
    topic: input.topic,
    currencyClass,
    signals: {
      newsHits: newsHitCount,
      semestersSinceLastTaught: semestersSince,
      lastTaughtSemesterId: input.lastTaughtSemesterId,
    },
  };

  if (!input.semanticVerify || !input.llmClient || !Array.isArray(input.newsHits) || input.newsHits.length === 0) {
    return result;
  }

  return verifySemanticRelevance(result, input.topic, input.newsHits, input.llmClient);
}

// ── helpers ───────────────────────────────────────────────────────────────────

function newsHitCountFor(newsHits: number | NewsHit[]): number {
  return Array.isArray(newsHits) ? newsHits.length : newsHits;
}

async function verifySemanticRelevance(
  result: ScoreTopicCurrencyResult,
  topic: string,
  newsHits: NewsHit[],
  llmClient: LlmClient
): Promise<ScoreTopicCurrencyResult> {
  const prompt =
    `Are the following news headlines relevant to teaching "${topic}" in a university AI or technology course?\n` +
    `Headlines:\n` +
    newsHits.map(h => `- ${h.title} (${h.date})`).join('\n') +
    `\nAnswer with YES or NO on the first line, then one sentence explaining why.`;

  try {
    const raw = await llmClient.complete(prompt);
    const [firstLine = '', ...rest] = raw.split(/\r?\n/);
    return {
      ...result,
      semanticRelevanceVerified: firstLine.trim().toUpperCase() === 'YES',
      semanticRationale: rest.join(' ').trim(),
    };
  } catch {
    return result;
  }
}

function semesterIndex(s: string): number | null {
  const m = s.match(/^(Spring|Summer|Fall)(\d{4})$/i);
  if (!m) return null;
  const year = parseInt(m[2], 10);
  const term = m[1].toLowerCase();
  return year * 3 + (term === 'spring' ? 0 : term === 'summer' ? 1 : 2);
}

export function semestersBetween(from: string | null, to: string): number {
  if (from === null) return 999;
  const a = semesterIndex(from);
  const b = semesterIndex(to);
  if (a === null || b === null) return 0;
  return Math.max(0, b - a);
}

function classify(newsHits: number, semestersSince: number): CurrencyClass {
  if (newsHits >= 3) return 'current';
  if (newsHits === 0 && semestersSince >= 6) return 'dated';
  if (newsHits >= 1) return 'current';
  return 'evergreen';
}
