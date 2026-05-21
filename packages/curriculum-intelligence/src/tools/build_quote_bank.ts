import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getSemesterPath } from '../kb/course_state.js';
import { loadTranscripts } from '../kb/transcripts.js';
import type { CourseId, SemesterId, TranscriptSource } from '../types.js';

export interface BuildQuoteBankInput {
  courseId: CourseId;
  semesterId: SemesterId;
  minLength?: number;            // minimum quote length in chars (default 60)
  maxPerLecture?: number;        // cap per transcript (default 10)
}

export interface Quote {
  transcriptId: string;
  week: number | null;
  source: TranscriptSource;
  startSec: number;
  text: string;
  trigger: string;               // what marker matched
}

export interface BuildQuoteBankResult {
  courseId: CourseId;
  semesterId: SemesterId;
  quoteCount: number;
  quoteBankPath: string;
}

// Markers that suggest the speaker is making a deliberate, quotable point.
const TRIGGERS: { pattern: RegExp; label: string }[] = [
  { pattern: /\bthe (key|main|biggest|whole|real) (idea|point|takeaway|thing)\b/i, label: 'key idea' },
  { pattern: /\bwhat (i|you) (want|need) (you|to) (to )?(remember|understand|know)\b/i, label: 'want you to remember' },
  { pattern: /\b(in short|in summary|the takeaway|the bottom line|the point is)\b/i, label: 'summary phrase' },
  { pattern: /\b(this is why|that's why|the reason is)\b/i, label: 'causal claim' },
  { pattern: /\b(?:[A-Z][a-z]+(?: [A-Za-z]+)*) is (?:basically|essentially|really|just|the)\b/i, label: 'definitional' },
  { pattern: /\b(?:always|never) (?:do|use|trust|forget|assume)\b/i, label: 'imperative' },
];

export function buildQuoteBank(input: BuildQuoteBankInput): BuildQuoteBankResult {
  const transcripts = loadTranscripts(input.courseId, input.semesterId);
  const minLength = input.minLength ?? 60;
  const maxPerLecture = input.maxPerLecture ?? 10;

  // Load week map.
  const weekMapPath = join(getSemesterPath(input.courseId, input.semesterId), 'week-map.json');
  const weekByTranscript = new Map<string, number | null>();
  if (existsSync(weekMapPath)) {
    const data = JSON.parse(readFileSync(weekMapPath, 'utf-8')) as {
      mappings: { transcriptId: string; week: number | null }[];
    };
    for (const m of data.mappings) weekByTranscript.set(m.transcriptId, m.week);
  }

  const quotes: Quote[] = [];
  for (const t of transcripts) {
    const week = weekByTranscript.get(t.id) ?? t.weekHint;
    let count = 0;
    for (const c of t.cues) {
      if (count >= maxPerLecture) break;
      const text = c.text.trim();
      if (text.length < minLength) continue;
      const trigger = TRIGGERS.find((tg) => tg.pattern.test(text));
      if (!trigger) continue;
      quotes.push({
        transcriptId: t.id,
        week,
        source: t.source,
        startSec: c.startSec,
        text,
        trigger: trigger.label,
      });
      count++;
    }
    // If markdown transcript with no cues (single big cue), and no trigger matched,
    // still pull the first long-enough sentence so md transcripts contribute.
    if (count === 0 && t.format === 'md' && t.fullText.length >= minLength) {
      const sentences = t.fullText.split(/(?<=[.!?])\s+/);
      const firstLong = sentences.find((s) => s.length >= minLength) ?? t.fullText;
      if (firstLong.length >= minLength) {
        quotes.push({
          transcriptId: t.id,
          week,
          source: t.source,
          startSec: 0,
          text: firstLong,
          trigger: 'md-firstSentence',
        });
      }
    }
  }

  const quoteBankPath = join(getSemesterPath(input.courseId, input.semesterId), 'quote-bank.json');
  writeFileSync(quoteBankPath, JSON.stringify({ quotes }, null, 2), 'utf-8');

  return {
    courseId: input.courseId,
    semesterId: input.semesterId,
    quoteCount: quotes.length,
    quoteBankPath,
  };
}
