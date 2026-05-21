import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getSemesterPath } from '../kb/course_state.js';
import { loadTopicMap } from '../kb/topic_map.js';
import { loadTranscripts } from '../kb/transcripts.js';
import type { CourseId, SemesterId, TopicMap } from '../types.js';

export interface FindOffSyllabusInput {
  courseId: CourseId;
  semesterId: SemesterId;
  topN?: number;                    // top novel tokens per lecture (default 20)
  minTokenLength?: number;          // skip tokens shorter than this (default 4)
}

export interface NovelToken {
  token: string;
  count: number;
}

export interface CueSample {
  startSec: number;
  text: string;
}

export interface OffSyllabusLecture {
  transcriptId: string;
  week: number | null;
  novelTokens: NovelToken[];
  sampleCues: CueSample[];
  notes: string;
}

export interface FindOffSyllabusResult {
  courseId: CourseId;
  semesterId: SemesterId;
  lectures: OffSyllabusLecture[];
  reportPath: string;
}

export function findOffSyllabusTopics(input: FindOffSyllabusInput): FindOffSyllabusResult {
  const transcripts = loadTranscripts(input.courseId, input.semesterId);
  const map = loadTopicMap(input.courseId, input.semesterId);

  // Load week map.
  const weekMapPath = join(getSemesterPath(input.courseId, input.semesterId), 'week-map.json');
  const weekByTranscript = new Map<string, number | null>();
  if (existsSync(weekMapPath)) {
    const data = JSON.parse(readFileSync(weekMapPath, 'utf-8')) as {
      mappings: { transcriptId: string; week: number | null }[];
    };
    for (const m of data.mappings) weekByTranscript.set(m.transcriptId, m.week);
  }

  const topN = input.topN ?? 20;
  const minLen = input.minTokenLength ?? 4;

  const lectures: OffSyllabusLecture[] = transcripts.map((t) => {
    const week = weekByTranscript.get(t.id) ?? t.weekHint;
    const pageText = collectPageTextForWeek(map, week);
    const pageTokens = tokenSet(pageText, minLen);
    const lectureCounts = tokenCounts(t.fullText, minLen);

    const novel: NovelToken[] = [];
    for (const [token, count] of lectureCounts) {
      if (!pageTokens.has(token)) novel.push({ token, count });
    }
    novel.sort((a, b) => b.count - a.count);
    const topNovel = novel.slice(0, topN);
    const novelSet = new Set(topNovel.map((n) => n.token));

    const sampleCues: CueSample[] = [];
    for (const c of t.cues) {
      if (sampleCues.length >= 3) break;
      const cueTokens = tokenSet(c.text, minLen);
      let hit = false;
      for (const n of novelSet) {
        if (cueTokens.has(n)) {
          hit = true;
          break;
        }
      }
      if (hit) sampleCues.push({ startSec: c.startSec, text: c.text });
    }

    let notes = '';
    if (week == null) {
      notes = 'No mapped week for this transcript; novel-token comparison used the empty set.';
    } else if (pageText === '') {
      notes = `Mapped week ${week} but no module/page text was found for that week — every lecture token will look novel.`;
    }

    return { transcriptId: t.id, week, novelTokens: topNovel, sampleCues, notes };
  });

  const reportPath = join(getSemesterPath(input.courseId, input.semesterId), 'off-syllabus.json');
  writeFileSync(reportPath, JSON.stringify({ lectures }, null, 2), 'utf-8');

  return {
    courseId: input.courseId,
    semesterId: input.semesterId,
    lectures,
    reportPath,
  };
}

/**
 * Collect page-body text for all pages whose owning module name contains the
 * given week number. Modules are matched loosely (e.g. "Module 02 - ..." matches
 * week=2, and "Week 2 At A Glance" item titles also match).
 */
function collectPageTextForWeek(map: TopicMap, week: number | null): string {
  if (week == null) return '';
  const weekStr = String(week);
  const weekPad = weekStr.padStart(2, '0');
  const matchesWeek = (s: string): boolean => {
    const lower = s.toLowerCase();
    return (
      lower.includes(`module ${weekStr}`) ||
      lower.includes(`module ${weekPad}`) ||
      lower.includes(`week ${weekStr}`) ||
      lower.includes(`week-${weekStr}`) ||
      lower.includes(`week ${weekPad}`) ||
      lower.startsWith(`${weekPad}.`) ||
      lower.startsWith(`${weekStr}.`)
    );
  };

  const pageUrls = new Set<string>();
  for (const m of map.modules) {
    if (!matchesWeek(m.name)) continue;
    for (const item of m.items) {
      if (item.pageUrl) pageUrls.add(item.pageUrl);
    }
  }
  // Also scan all pages whose title looks week-shaped (Week N or NN.NN prefixed).
  for (const p of map.pages) {
    if (matchesWeek(p.title)) pageUrls.add(p.url);
  }

  let text = '';
  for (const p of map.pages) {
    if (pageUrls.has(p.url)) text += ' ' + p.bodyExcerpt;
  }
  return text;
}

const STOP_WORDS = new Set([
  'about','above','after','again','against','all','also','and','any','are','because','been','before','being','below','between','both','but','can','did','does','doing','down','during','each','few','for','from','further','had','has','have','having','here','how','its','itself','just','more','most','not','now','off','once','only','other','our','out','over','own','same','should','some','such','than','that','the','their','them','then','there','these','they','this','those','through','too','under','until','very','was','were','what','when','where','which','while','who','whom','why','will','with','you','your','yours','yourself','yourselves','about','okay','ok','yeah','like','well','really','going','want','think','know','said','say','look','see','one','two','three','first','second','last','also','still','even','make','made','need','because','around','sort','kind','thing','things','little','lot','lots','this','that','those','these'
]);

function tokenize(text: string, minLen: number): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= minLen && !STOP_WORDS.has(t));
}

function tokenSet(text: string, minLen: number): Set<string> {
  return new Set(tokenize(text, minLen));
}

function tokenCounts(text: string, minLen: number): Map<string, number> {
  const counts = new Map<string, number>();
  for (const t of tokenize(text, minLen)) {
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return counts;
}
