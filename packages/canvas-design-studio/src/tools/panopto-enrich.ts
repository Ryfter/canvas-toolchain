/**
 * Panopto VTT enrichment engine.
 *
 * Converts raw machine-generated VTT transcripts into readable markdown with:
 * - Filler-word removal (built-in list + professor additions)
 * - Vocabulary corrections (literal find-replace, e.g. KOBE → COBE)
 * - Key-statement detection → blockquote rendering
 * - 5-minute bucket structure with Panopto deep links between sections
 * - Session header with UTC date and duration
 *
 * Lives in CDS (not C&C) because it depends on CI's VTT parser and produces
 * markdown content — both are design/content concerns, not coordinator concerns.
 */
import { readFileSync } from 'node:fs';
import { parseVtt } from 'curriculum-intelligence-mcp/dist/parsers/transcript_vtt.js';

// Exported so callers can spread it with professor additions without mutating this constant.
export const BUILTIN_FILLER_WORDS: string[] = [
  'uh', 'um', 'umm', 'like', 'right', 'you know', 'uh-huh', 'so', 'basically', 'actually',
];

const KEY_STATEMENT_TRIGGERS: string[] = [
  // Causal
  'the reason', 'the reason is', "that's why", 'because of this',
  // Emphasis
  'i want you to remember', "don't forget", 'remember that', 'keep in mind',
  // Summary
  'in summary', 'to summarize', 'the key point', 'the key idea', 'the main idea',
  // Definition
  'is defined as', 'means that', 'what we mean by',
  // Imperative
  'make sure', 'you need to', 'you must', 'always', 'never',
];

export interface EnrichVttOptions {
  fillerWords: string[];
  corrections: { from: string; to: string }[];
  domain: string;
}

export interface SessionManifestEntry {
  sessionId: string;
  title: string;
  startTime: string;
  duration: number;
  filename: string;
}

export interface SessionsManifest {
  domain: string;
  generatedAt: string;
  sessions: SessionManifestEntry[];
}

function formatDuration(seconds: number): string {
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Enrich a VTT transcript string into structured markdown.
 *
 * Pipeline: parse → strip fillers → apply corrections → classify key statements
 * → bucket by 5-minute windows → render header + prose/blockquotes + deep links.
 */
export function enrichVtt(
  vttContent: string,
  session: SessionManifestEntry,
  options: EnrichVttOptions,
): string {
  const rawCues = parseVtt(vttContent);

  // Empty-list guard: compiling \b()\b throws a runtime error.
  // [,]? eats a trailing comma left stranded after filler removal (e.g. "So, the" → "the").
  const fillerRegex =
    options.fillerWords.length > 0
      ? new RegExp('\\b(' + options.fillerWords.join('|') + ')\\b[,]?', 'gi')
      : null;

  const processedCues = rawCues.map((cue) => {
    let text = cue.text;
    if (fillerRegex) {
      text = text.replace(fillerRegex, '');
    }
    // replaceAll not regex: corrections are literal strings (acronyms like KOBE→COBE).
    // Regex would require callers to escape metacharacters in their correction strings.
    for (const correction of options.corrections) {
      text = text.replaceAll(correction.from, correction.to);
    }
    text = text.replace(/  +/g, ' ').trim();

    const lower = text.toLowerCase();
    const isKeyStatement = KEY_STATEMENT_TRIGGERS.some((trigger) => lower.includes(trigger));

    return { startSec: cue.startSec, text, isKeyStatement };
  });

  // Group into 5-minute buckets
  const bucketMap = new Map<number, typeof processedCues>();
  for (const cue of processedCues) {
    const bucketIndex = Math.floor(cue.startSec / 300);
    if (!bucketMap.has(bucketIndex)) bucketMap.set(bucketIndex, []);
    bucketMap.get(bucketIndex)!.push(cue);
  }

  // UTC timezone: session.startTime is an ISO UTC string from the Panopto API.
  // Local timezone would shift the displayed date for professors outside UTC.
  const date = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(session.startTime));

  const lines: string[] = [
    `# ${session.title}`,
    `**Date:** ${date} | **Duration:** ${formatDuration(session.duration)}`,
    '',
    '---',
    '',
  ];

  const sortedBuckets = [...bucketMap.keys()].sort((a, b) => a - b);

  for (let i = 0; i < sortedBuckets.length; i++) {
    const bucketIndex = sortedBuckets[i];
    const bucketCues = bucketMap.get(bucketIndex)!;
    const isLast = i === sortedBuckets.length - 1;

    // Render cues: flush prose before each blockquote, collect trailing prose
    const proseParts: string[] = [];
    for (const cue of bucketCues) {
      if (cue.text === '') continue;
      if (cue.isKeyStatement) {
        if (proseParts.length > 0) {
          lines.push(proseParts.join(' '));
          lines.push('');
          proseParts.length = 0;
        }
        lines.push(`> ${cue.text}`);
        lines.push('');
      } else {
        proseParts.push(cue.text);
      }
    }
    if (proseParts.length > 0) {
      lines.push(proseParts.join(' '));
      lines.push('');
    }

    // Deep link points to the START of the next bucket — a forward-navigation aid.
    // Panopto viewer accepts &start=<seconds> to jump directly to that timestamp.
    if (!isLast) {
      const nextBucket = sortedBuckets[i + 1];
      const startSec = nextBucket * 300;
      const mm = Math.floor(startSec / 60);
      const ss = String(startSec % 60).padStart(2, '0');
      const url = `https://${options.domain}/Panopto/Pages/Viewer.aspx?id=${session.sessionId}&start=${startSec}`;
      lines.push(`[→ ${mm}:${ss}](${url})`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

export function enrichVttFile(
  vttPath: string,
  session: SessionManifestEntry,
  options: EnrichVttOptions,
): string {
  const vttContent = readFileSync(vttPath, 'utf-8');
  return enrichVtt(vttContent, session, options);
}
