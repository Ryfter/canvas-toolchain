import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getCoursePath } from '../kb/course_state.js';
import type { CourseId, FeedItem } from '../types.js';
import type { Development } from './scan_recent_developments.js';

export interface SourceAttribution {
  kind: 'rss' | 'llm-scan';
  sourceId: string;
  title: string;
  url?: string;
  date?: string;
}

export interface TopicCandidate {
  topic: string;
  mentionCount: number;
  latestDate: string | null;
  relevance: 'high' | 'medium' | 'low';
  sources: SourceAttribution[];
}

export interface SuggestTopicsInput {
  courseId: CourseId;
  feedItems?: FeedItem[];
  scanDevelopments?: Development[];
}

export interface SuggestTopicsResult {
  courseId: CourseId;
  candidates: TopicCandidate[];
}

interface RawCandidate {
  topic: string;
  date: Date | null;
  relevance: 'high' | 'medium' | 'low';
  source: SourceAttribution;
}

export function suggestTopics(input: SuggestTopicsInput): SuggestTopicsResult {
  const raws: RawCandidate[] = [];

  // Feed items from inline param or news-cache.json
  const feedItems = input.feedItems ?? loadCachedFeedItems(input.courseId);
  for (const item of feedItems) {
    raws.push({
      topic: item.title,
      date: item.publishedAt,
      relevance: 'medium',
      source: { kind: 'rss', sourceId: item.sourceId, title: item.title, url: item.url },
    });
  }

  // Scan developments from inline param
  for (const dev of input.scanDevelopments ?? []) {
    raws.push({
      topic: dev.title,
      date: parseApproxDate(dev.publishedApprox),
      relevance: dev.relevance,
      source: { kind: 'llm-scan', sourceId: 'llm-scan', title: dev.title },
    });
  }

  // Group by normalised topic key
  const groups = new Map<string, RawCandidate[]>();
  for (const raw of raws) {
    const key = normalise(raw.topic);
    if (!groups.has(key)) {
      // Also check for fuzzy overlap with existing keys
      const overlap = findOverlappingKey(key, groups);
      const target = overlap ?? key;
      if (!groups.has(target)) groups.set(target, []);
      groups.get(target)!.push(raw);
    } else {
      groups.get(key)!.push(raw);
    }
  }

  const candidates: TopicCandidate[] = [];
  for (const [, members] of groups) {
    const dates = members.map((m) => m.date).filter((d): d is Date => d !== null);
    const latestDate = dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))) : null;
    const topRelevance = members.some((m) => m.relevance === 'high')
      ? 'high'
      : members.some((m) => m.relevance === 'medium')
      ? 'medium'
      : 'low';
    candidates.push({
      topic: members[0].topic,
      mentionCount: members.length,
      latestDate: latestDate ? latestDate.toISOString().slice(0, 10) : null,
      relevance: topRelevance,
      sources: members.map((m) => m.source),
    });
  }

  // Sort: high relevance first, then by mention count, then by recency
  candidates.sort((a, b) => {
    const rOrder = { high: 0, medium: 1, low: 2 };
    if (rOrder[a.relevance] !== rOrder[b.relevance]) return rOrder[a.relevance] - rOrder[b.relevance];
    if (b.mentionCount !== a.mentionCount) return b.mentionCount - a.mentionCount;
    if (a.latestDate && b.latestDate) return b.latestDate.localeCompare(a.latestDate);
    return 0;
  });

  return { courseId: input.courseId, candidates };
}

function loadCachedFeedItems(courseId: CourseId): FeedItem[] {
  const path = join(getCoursePath(courseId), 'news-cache.json');
  if (!existsSync(path)) return [];
  const data = JSON.parse(readFileSync(path, 'utf-8')) as {
    items: (Omit<FeedItem, 'publishedAt'> & { publishedAt: string | null })[];
  };
  return data.items.map((i) => ({
    ...i,
    publishedAt: i.publishedAt ? new Date(i.publishedAt) : null,
  }));
}

function normalise(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function findOverlappingKey(key: string, groups: Map<string, RawCandidate[]>): string | null {
  const words = new Set(key.split(' ').filter((w) => w.length >= 5));
  for (const existing of groups.keys()) {
    const existingWords = existing.split(' ').filter((w) => w.length >= 5);
    const overlap = existingWords.filter((w) => words.has(w));
    if (overlap.length >= 2) return existing;
  }
  return null;
}

function parseApproxDate(approx: string): Date | null {
  if (!approx) return null;
  const m = approx.match(/^(\d{4})(?:-(\d{2}))?/);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const month = m[2] ? parseInt(m[2], 10) - 1 : 0;
  return new Date(year, month, 1);
}
