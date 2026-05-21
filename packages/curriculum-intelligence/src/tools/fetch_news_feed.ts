import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getCoursePath } from '../kb/course_state.js';
import { parseFeed } from '../parsers/rss.js';
import type { CourseId, FeedItem } from '../types.js';

export interface FetchNewsFeedInput {
  courseId: CourseId;
  feedUrls: string[];
  since?: Date;
}

export interface FetchNewsFeedResult {
  courseId: CourseId;
  feedCount: number;
  itemCount: number;
  items: FeedItem[];
  errors: { feedUrl: string; message: string }[];
  cachePath: string;
}

export async function fetchNewsFeed(input: FetchNewsFeedInput): Promise<FetchNewsFeedResult> {
  const items: FeedItem[] = [];
  const errors: { feedUrl: string; message: string }[] = [];

  for (const feedUrl of input.feedUrls) {
    try {
      const res = await fetch(feedUrl);
      if (!res.ok) {
        errors.push({ feedUrl, message: `HTTP ${res.status}` });
        continue;
      }
      const xml = await res.text();
      const feedItems = parseFeed(xml, feedUrl);
      items.push(...feedItems);
    } catch (err) {
      errors.push({ feedUrl, message: err instanceof Error ? err.message : String(err) });
    }
  }

  const filtered = input.since
    ? items.filter((i) => i.publishedAt !== null && i.publishedAt >= input.since!)
    : items;

  const cachePath = join(getCoursePath(input.courseId), 'news-cache.json');
  writeFileSync(
    cachePath,
    JSON.stringify({ fetchedAt: new Date().toISOString(), items: filtered }, null, 2),
    'utf-8'
  );

  return {
    courseId: input.courseId,
    feedCount: input.feedUrls.length,
    itemCount: filtered.length,
    items: filtered,
    errors,
    cachePath,
  };
}
