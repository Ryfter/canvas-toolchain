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

export interface Disagreement {
  panopto: string;
  whisper: string;
  occurrences: number;
  firstAtSec: number;
  category: 'repeated' | 'caps' | 'known-term' | 'proper-noun' | 'other';
  score: number;
}

export interface SuggestedCorrection {
  from: string;
  to: string;
  occurrences: number;
  confidence: 'high' | 'medium' | 'low';
}

export interface RankOptions {
  knownTerms: string[];
  fillerWords: string[];
}

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'to', 'of', 'in', 'on', 'is', 'it', 'we', 'you',
]);

/** Lowercase + strip leading/trailing non-alphanumerics so "Uh," and "uh." both
 *  match the filler-word entry "uh". Without this, the per-word LCS diff sees
 *  punctuated/capitalized variants as substantive disagreements. */
function normalizeWord(word: string): string {
  return word.toLowerCase().replace(/^[^a-z0-9]+/, '').replace(/[^a-z0-9]+$/, '');
}

function isTrivial(word: string | undefined, fillers: Set<string>): boolean {
  if (!word) return true;
  const norm = normalizeWord(word);
  if (fillers.has(norm)) return true;
  if (STOPWORDS.has(norm)) return true;
  if (!/[a-z0-9]/i.test(word)) return true; // pure punctuation
  return false;
}

function categorize(p: string, w: string, occ: number, known: Set<string>): Disagreement['category'] {
  if (occ >= 3) return 'repeated';
  if (p.toUpperCase() === p && p !== p.toLowerCase()) return 'caps';
  if (w.toUpperCase() === w && w !== w.toLowerCase()) return 'caps';
  if (known.has(w) || known.has(p)) return 'known-term';
  if (/^[A-Z][a-z]+$/.test(w)) return 'proper-noun';
  return 'other';
}

function scoreFor(cat: Disagreement['category'], occ: number): number {
  const base = { repeated: 100, caps: 80, 'known-term': 70, 'proper-noun': 50, other: 10 }[cat];
  return base + Math.min(occ, 20);
}

export function rankDisagreements(
  diffs: WordDiff[],
  opts: RankOptions,
): { ranked: Disagreement[]; suggestedCorrections: SuggestedCorrection[] } {
  const fillers = new Set(opts.fillerWords.map((f) => f.toLowerCase()));
  const known = new Set(opts.knownTerms);

  const groups = new Map<string, { panopto: string; whisper: string; occ: number; first: number }>();
  for (const d of diffs) {
    if (d.kind !== 'sub') continue; // ins/del are segmentation noise
    if (isTrivial(d.panopto, fillers) || isTrivial(d.whisper, fillers)) continue;
    const key = `${d.panopto} ${d.whisper}`;
    const g = groups.get(key);
    if (g) {
      g.occ++;
      g.first = Math.min(g.first, d.atSec);
    } else {
      groups.set(key, { panopto: d.panopto!, whisper: d.whisper!, occ: 1, first: d.atSec });
    }
  }

  const ranked: Disagreement[] = [];
  for (const g of groups.values()) {
    const category = categorize(g.panopto, g.whisper, g.occ, known);
    ranked.push({
      panopto: g.panopto,
      whisper: g.whisper,
      occurrences: g.occ,
      firstAtSec: g.first,
      category,
      score: scoreFor(category, g.occ),
    });
  }
  ranked.sort((a, b) => b.score - a.score);

  const suggestedCorrections: SuggestedCorrection[] = ranked
    .filter((d) => d.score >= 70)
    .map((d) => ({
      from: d.panopto,
      to: d.whisper,
      occurrences: d.occurrences,
      confidence: d.score >= 100 ? 'high' : d.score >= 80 ? 'medium' : 'low',
    }));

  return { ranked, suggestedCorrections };
}

export interface ComparisonReport {
  sessionId: string;
  title: string;
  divergenceRate: number;
  totalDisagreements: number;
  likelyVocabCount: number;
  ranked: Disagreement[];
  suggestedCorrections: SuggestedCorrection[];
  domain: string;
}

export interface CompareContext {
  knownTerms: string[];
  fillerWords: string[];
  domain: string;
  sessionId: string;
  title: string;
}

function totalAlignedWords(panopto: TranscriptCue[]): number {
  return panopto.reduce((n, c) => n + c.text.split(/\s+/).filter(Boolean).length, 0);
}

export function compareTranscripts(
  panopto: TranscriptCue[],
  whisper: TranscriptCue[],
  ctx: CompareContext,
): ComparisonReport {
  const diffs = diffAlignedWords(panopto, whisper);
  const { ranked, suggestedCorrections } = rankDisagreements(diffs, {
    knownTerms: ctx.knownTerms,
    fillerWords: ctx.fillerWords,
  });
  const totalWords = totalAlignedWords(panopto);
  const differingWords = diffs.filter((d) => d.kind === 'sub').length;
  const divergenceRate = totalWords === 0 ? 0 : differingWords / totalWords;
  return {
    sessionId: ctx.sessionId,
    title: ctx.title,
    divergenceRate,
    totalDisagreements: ranked.length,
    likelyVocabCount: ranked.filter((d) => d.score >= 70).length,
    ranked,
    suggestedCorrections,
    domain: ctx.domain,
  };
}

function mmss(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function renderComparisonMd(report: ComparisonReport): string {
  const pct = (report.divergenceRate * 100).toFixed(1);
  const lines: string[] = [];
  lines.push(`# Comparison: ${report.title}`);
  lines.push(
    `Divergence: ${pct}% of words · ${report.totalDisagreements} disagreements · ${report.likelyVocabCount} likely vocabulary`,
  );
  lines.push('');
  lines.push('| # | Panopto | Whisper | × | When | Category |');
  lines.push('|---|---------|---------|---|------|----------|');
  report.ranked.forEach((d, idx) => {
    const start = Math.floor(d.firstAtSec);
    const url = `https://${report.domain}/Panopto/Pages/Viewer.aspx?id=${report.sessionId}&start=${start}`;
    lines.push(
      `| ${idx + 1} | ${d.panopto} | ${d.whisper} | ${d.occurrences} | [→ ${mmss(d.firstAtSec)}](${url}) | ${d.category} |`,
    );
  });
  lines.push('');
  lines.push('## Suggested corrections (you approve these — nothing is written automatically)');
  if (report.suggestedCorrections.length === 0) {
    lines.push('_None above the confidence threshold._');
  } else {
    for (const s of report.suggestedCorrections) {
      lines.push(`- \`${s.from} → ${s.to}\` (${s.occurrences}×, ${s.confidence})`);
    }
  }
  lines.push('');
  return lines.join('\n');
}
