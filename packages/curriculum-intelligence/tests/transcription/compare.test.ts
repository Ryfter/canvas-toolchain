import { describe, it, expect } from 'vitest';
import {
  diffAlignedWords,
  rankDisagreements,
  compareTranscripts,
  renderComparisonMd,
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

  it('filters fillers regardless of capitalization or trailing punctuation', () => {
    // Real Panopto/Whisper output capitalizes sentence-initial fillers and trails
    // commas/periods. Without normalization these slipped through and corrupted
    // the ranked list (caught during #60 verification on ITM310 Week 16).
    const diffs: WordDiff[] = [
      { kind: 'sub', panopto: 'Uh,', whisper: 'So', atSec: 1 },
      { kind: 'sub', panopto: 'Um.', whisper: 'I', atSec: 2 },
      { kind: 'sub', panopto: 'uh.', whisper: 'and', atSec: 3 },
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

describe('compareTranscripts + renderComparisonMd', () => {
  const ctx = {
    knownTerms: ['COBE'],
    fillerWords: ['uh'],
    domain: 'example.hosted.panopto.com',
    sessionId: 'sess-1',
    title: 'Week 03 — Tableau Intro',
  };

  it('produces a report with divergence rate and suggestions', () => {
    const report = compareTranscripts(panopto, whisper, ctx);
    expect(report.sessionId).toBe('sess-1');
    expect(report.divergenceRate).toBeGreaterThan(0);
    expect(report.divergenceRate).toBeLessThanOrEqual(1);
    expect(report.suggestedCorrections.length).toBeGreaterThan(0);
  });

  it('divergence rate is 0 for identical transcripts', () => {
    const report = compareTranscripts(panopto, panopto, ctx);
    expect(report.divergenceRate).toBe(0);
    expect(report.ranked).toHaveLength(0);
  });

  it('renders markdown with title, divergence line, table, and suggestions', () => {
    const report = compareTranscripts(panopto, whisper, ctx);
    const md = renderComparisonMd(report);
    expect(md).toContain('# Comparison: Week 03 — Tableau Intro');
    expect(md).toContain('Divergence:');
    expect(md).toContain('| # | Panopto | Whisper |');
    expect(md).toContain('## Suggested corrections');
    expect(md).toContain('example.hosted.panopto.com/Panopto/Pages/Viewer.aspx?id=sess-1&start=');
  });
});
