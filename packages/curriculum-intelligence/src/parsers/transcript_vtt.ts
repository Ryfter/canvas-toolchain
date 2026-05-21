import type { TranscriptCue } from '../types.js';

const CUE_TIME_RE = /^(\d{2}:\d{2}:\d{2}|\d{2}:\d{2})\.(\d{3})\s+-->\s+(\d{2}:\d{2}:\d{2}|\d{2}:\d{2})\.(\d{3})/;

export function parseVtt(content: string): TranscriptCue[] {
  const lines = content.split(/\r?\n/);
  const cues: TranscriptCue[] = [];

  let i = 0;
  // Skip header (WEBVTT line + any metadata until first blank line).
  if (lines[0]?.startsWith('WEBVTT')) {
    while (i < lines.length && lines[i].trim() !== '') i++;
  }

  while (i < lines.length) {
    // Skip blank lines and NOTE / STYLE / REGION blocks.
    while (i < lines.length && lines[i].trim() === '') i++;
    if (i >= lines.length) break;

    const head = lines[i].trim();
    if (head.startsWith('NOTE') || head.startsWith('STYLE') || head.startsWith('REGION')) {
      // Skip until next blank line.
      while (i < lines.length && lines[i].trim() !== '') i++;
      continue;
    }

    // Optional cue identifier line — if it doesn't contain "-->", skip past it.
    let timingLine = lines[i];
    if (!timingLine.includes('-->')) {
      i++;
      if (i >= lines.length) break;
      timingLine = lines[i];
    }

    const m = timingLine.match(CUE_TIME_RE);
    if (!m) {
      i++;
      continue;
    }
    const startSec = timeToSeconds(`${m[1]}.${m[2]}`);
    const endSec = timeToSeconds(`${m[3]}.${m[4]}`);
    i++;

    // Consume text lines until blank.
    const textLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== '') {
      textLines.push(lines[i]);
      i++;
    }
    cues.push({ startSec, endSec, text: textLines.join(' ').replace(/\s+/g, ' ').trim() });
  }

  return cues;
}

function timeToSeconds(timestamp: string): number {
  // Accepts HH:MM:SS.mmm or MM:SS.mmm
  const [hms, ms] = timestamp.split('.');
  const parts = hms.split(':').map(Number);
  let total = 0;
  if (parts.length === 3) total = parts[0] * 3600 + parts[1] * 60 + parts[2];
  else if (parts.length === 2) total = parts[0] * 60 + parts[1];
  return total + (Number(ms || 0) / 1000);
}
