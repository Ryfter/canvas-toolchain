import { XMLParser } from 'fast-xml-parser';
import type { FeedItem } from '../types.js';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

export function parseFeed(xml: string, sourceId: string): FeedItem[] {
  let doc: unknown;
  try {
    doc = parser.parse(xml);
  } catch {
    return [];
  }

  if (isAtom(doc)) return parseAtom(doc as AtomDoc, sourceId);
  return parseRss(doc as RssDoc, sourceId);
}

// ── RSS 2.0 ──────────────────────────────────────────────────────────────────

interface RssDoc {
  rss?: { channel?: { item?: RssItem | RssItem[] } };
}
interface RssItem {
  title?: unknown;
  link?: unknown;
  pubDate?: unknown;
  description?: unknown;
  summary?: unknown;
}

function parseRss(doc: RssDoc, sourceId: string): FeedItem[] {
  const rawItems = doc?.rss?.channel?.item;
  if (!rawItems) return [];
  const items = Array.isArray(rawItems) ? rawItems : [rawItems];
  return items.map((item) => ({
    title: str(item.title),
    url: str(item.link),
    publishedAt: parseDate(str(item.pubDate)),
    summary: str(item.description ?? item.summary),
    sourceId,
  })).filter((i) => i.title && i.url);
}

// ── Atom ──────────────────────────────────────────────────────────────────────

interface AtomDoc {
  feed?: { entry?: AtomEntry | AtomEntry[] };
}
interface AtomEntry {
  title?: unknown;
  link?: unknown;
  published?: unknown;
  updated?: unknown;
  summary?: unknown;
  content?: unknown;
}

function isAtom(doc: unknown): boolean {
  return typeof doc === 'object' && doc !== null && 'feed' in (doc as object);
}

function parseAtom(doc: AtomDoc, sourceId: string): FeedItem[] {
  const rawEntries = doc?.feed?.entry;
  if (!rawEntries) return [];
  const entries = Array.isArray(rawEntries) ? rawEntries : [rawEntries];
  return entries.map((entry) => {
    const link = resolveAtomLink(entry.link);
    return {
      title: str(entry.title),
      url: link,
      publishedAt: parseDate(str(entry.published ?? entry.updated)),
      summary: str(entry.summary ?? entry.content),
      sourceId,
    };
  }).filter((i) => i.title && i.url);
}

function resolveAtomLink(link: unknown): string {
  if (typeof link === 'string') return link;
  if (Array.isArray(link)) {
    const alt = link.find((l) => typeof l === 'object' && l !== null && (l as Record<string, unknown>)['@_rel'] === 'alternate');
    if (alt) return str((alt as Record<string, unknown>)['@_href']);
    return str((link[0] as Record<string, unknown>)?.['@_href']);
  }
  if (typeof link === 'object' && link !== null) {
    return str((link as Record<string, unknown>)['@_href']);
  }
  return '';
}

// ── helpers ───────────────────────────────────────────────────────────────────

function str(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number') return String(v);
  if (typeof v === 'object' && '#text' in (v as object)) return str((v as Record<string, unknown>)['#text']);
  return '';
}

function parseDate(s: string): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}
