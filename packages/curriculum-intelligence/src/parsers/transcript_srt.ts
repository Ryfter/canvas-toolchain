import type { TranscriptCue } from '../types.js';

// SRT timestamps use comma decimal separator: HH:MM:SS,mmm
const SRT_TIME_RE = /^(\d{2}):(\d{2}):(\d{2}),(\d{3})\s+-->\s+(\d{2}):(\d{2}):(\d{2}),(\d{3})/;

export function parseSrt(content: string): TranscriptCue[] {
  const lines = content.split(/\r?\n/);
  const cues: TranscriptCue[] = [];

  let i = 0;
  while (i < lines.length) {
    // Skip blanks.
    while (i < lines.length && lines[i].trim() === '') i++;
    if (i >= lines.length) break;

    // Index line (integer) — skip if present.
    if (/^\d+$/.test(lines[i].trim())) i++;
    if (i >= lines.length) break;

    const m = lines[i].match(SRT_TIME_RE);
    if (!m) {
      i++;
      continue;
    }
    const startSec =
      Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000;
    const endSec =
      Number(m[5]) * 3600 + Number(m[6]) * 60 + Number(m[7]) + Number(m[8]) / 1000;
    i++;

    const textLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== '') {
      textLines.push(lines[i]);
      i++;
    }
    cues.push({ startSec, endSec, text: textLines.join(' ').replace(/\s+/g, ' ').trim() });
  }

  return cues;
}
