import type { TranscriptCue } from '../types.js';

export interface WordDiff {
  kind: 'sub' | 'ins' | 'del';
  panopto?: string;
  whisper?: string;
  atSec: number;
}

function tokenize(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

function overlappingWhisperText(cue: TranscriptCue, whisper: TranscriptCue[]): string {
  const parts: string[] = [];
  for (const w of whisper) {
    if (w.endSec > cue.startSec && w.startSec < cue.endSec) parts.push(w.text);
  }
  return parts.join(' ');
}

function wordDiff(a: string[], b: string[], atSec: number): WordDiff[] {
  const n = a.length;
  const m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const out: WordDiff[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      // a[i] is not in the common subsequence here. If b[j] is also off-sequence,
      // treat the pair as a substitution; otherwise a pure deletion.
      if (lcs[i + 1][j + 1] >= lcs[i + 1][j] && lcs[i + 1][j + 1] >= lcs[i][j + 1]) {
        out.push({ kind: 'sub', panopto: a[i], whisper: b[j], atSec });
        i++;
        j++;
      } else {
        out.push({ kind: 'del', panopto: a[i], atSec });
        i++;
      }
    } else {
      out.push({ kind: 'ins', whisper: b[j], atSec });
      j++;
    }
  }
  while (i < n) out.push({ kind: 'del', panopto: a[i++], atSec });
  while (j < m) out.push({ kind: 'ins', whisper: b[j++], atSec });
  return out;
}

export function diffAlignedWords(panopto: TranscriptCue[], whisper: TranscriptCue[]): WordDiff[] {
  const diffs: WordDiff[] = [];
  for (const cue of panopto) {
    const pWords = tokenize(cue.text);
    const wWords = tokenize(overlappingWhisperText(cue, whisper));
    diffs.push(...wordDiff(pWords, wWords, cue.startSec));
  }
  return diffs;
}
