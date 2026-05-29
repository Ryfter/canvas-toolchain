import { describe, it, expect } from 'vitest';
import {
  diffAlignedWords,
  rankDisagreements,
  type WordDiff,
  type RankOptions,
} from '../../src/transcription/compare.js';
import type { TranscriptCue } from '../../src/types.js';

const RANK_OPTS: RankOptions = {
  knownTerms: ['COBE'],
  fillerWords: ['uh', 'um'],
};

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

describe('rankDisagreements', () => {
  it('collapses repeated identical substitutions and counts occurrences', () => {
    const diffs: WordDiff[] = Array.from({ length: 14 }, (_, k) => ({
      kind: 'sub' as const, panopto: 'KOBE', whisper: 'COBE', atSec: k * 10,
    }));
    const { ranked } = rankDisagreements(diffs, RANK_OPTS);
    const kobe = ranked.find((d) => d.panopto === 'KOBE');
    expect(kobe?.occurrences).toBe(14);
    expect(kobe?.firstAtSec).toBe(0);
    expect(
      kobe?.category === 'repeated' || kobe?.category === 'caps' || kobe?.category === 'known-term',
    ).toBe(true);
  });

  it('filters out filler-word disagreements', () => {
    const diffs: WordDiff[] = [
      { kind: 'sub', panopto: 'uh', whisper: 'um', atSec: 1 },
      { kind: 'del', panopto: 'um', atSec: 2 },
    ];
    const { ranked } = rankDisagreements(diffs, RANK_OPTS);
    expect(ranked).toHaveLength(0);
  });

  it('emits suggested corrections for high-signal substitutions', () => {
    const diffs: WordDiff[] = Array.from({ length: 8 }, () => ({
      kind: 'sub' as const, panopto: 'tableau', whisper: 'Tableau', atSec: 5,
    }));
    const { suggestedCorrections } = rankDisagreements(diffs, RANK_OPTS);
    expect(suggestedCorrections).toContainEqual(
      expect.objectContaining({ from: 'tableau', to: 'Tableau', occurrences: 8 }),
    );
  });
});
