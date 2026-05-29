import { describe, it, expect } from 'vitest';
import { diffAlignedWords, type WordDiff } from '../../src/transcription/compare.js';
import type { TranscriptCue } from '../../src/types.js';

const panopto: TranscriptCue[] = [
  { startSec: 0, endSec: 5, text: 'welcome to KOBE supply chain' },
  { startSec: 5, endSec: 10, text: 'today we cover tableau basics' },
];
const whisper: TranscriptCue[] = [
  { startSec: 0, endSec: 5, text: 'welcome to COBE supply chain' },
  { startSec: 5, endSec: 10, text: 'today we cover Tableau basics' },
];

describe('diffAlignedWords', () => {
  it('finds substitutions within timestamp-overlapping windows', () => {
    const diffs: WordDiff[] = diffAlignedWords(panopto, whisper);
    const subs = diffs.filter((d) => d.kind === 'sub');
    expect(subs).toContainEqual(
      expect.objectContaining({ kind: 'sub', panopto: 'KOBE', whisper: 'COBE', atSec: 0 }),
    );
    expect(subs).toContainEqual(
      expect.objectContaining({ kind: 'sub', panopto: 'tableau', whisper: 'Tableau', atSec: 5 }),
    );
  });

  it('reports no substitutions when transcripts match', () => {
    const diffs = diffAlignedWords(panopto, panopto);
    expect(diffs.filter((d) => d.kind === 'sub')).toHaveLength(0);
  });

  it('returns empty for empty inputs without throwing', () => {
    expect(diffAlignedWords([], [])).toEqual([]);
  });
});
