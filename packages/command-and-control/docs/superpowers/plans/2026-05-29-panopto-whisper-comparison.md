# Panopto Whisper Comparison Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **STATUS: DRAFT — awaiting Kevin's review of the spec AND this plan before execution. Do not execute until approved.**

**Goal:** Add an opt-in, off-by-default capability to transcribe Panopto lecture audio locally (faster-whisper, behind a swappable engine interface), compare it against Panopto's `.panopto.vtt`, and surface ranked disagreements the professor arbitrates into vocab corrections — plus a `transcriptSource` setting that lets enrichment use Whisper transcripts.

**Architecture:** Three-package split, matching the existing Panopto pipeline. Analysis (engine interface + comparison) in `curriculum-intelligence` (CI). Audio fetch in `canvas-design-studio` (CDS). Config + orchestration in `command-and-control` (C&C). The transcription engine is abstracted so swapping faster-whisper for whisper.cpp/cloud/future models is one new class.

**Tech Stack:** TypeScript (ESM, `.js` import specifiers), vitest (`vitest run`), Node `child_process` for the Python bridge, Python 3 + `faster-whisper` for the engine. Cross-package types reach CI via `curriculum-intelligence-mcp/dist/...`.

**Spec:** `packages/command-and-control/docs/superpowers/specs/2026-05-29-panopto-whisper-comparison-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/curriculum-intelligence/src/transcription/engine.ts` | `TranscriptionEngine` interface, `EngineStatus`, `TranscribeOptions`, re-export `TranscriptCue` |
| `packages/curriculum-intelligence/src/transcription/compare.ts` | Align two cue lists, word-diff, rank, suggest corrections, render `.comparison.md` |
| `packages/curriculum-intelligence/src/transcription/faster_whisper_engine.ts` | faster-whisper impl + `getTranscriptionEngine` factory |
| `packages/curriculum-intelligence/python/whisper_transcribe.py` | faster-whisper subprocess bridge → JSON cues |
| `packages/curriculum-intelligence/tests/transcription/compare.test.ts` | compare unit tests |
| `packages/curriculum-intelligence/tests/transcription/engine.test.ts` | factory + engine tests |
| `packages/canvas-design-studio/src/tools/panopto-audio.ts` | `fetchSessionAudio` (best-effort + manual fallback) |
| `packages/canvas-design-studio/tests/panopto-audio.test.ts` | audio fetch tests |
| `packages/command-and-control/src/tools/setup_transcript_source.ts` | `transcript-config.json` read/write + `loadTranscriptConfig` |
| `packages/command-and-control/src/tools/workflows/compare_transcripts.ts` | orchestration workflow |
| `packages/command-and-control/src/tools/workflows/enrich_panopto_transcripts.ts` | MODIFY — `transcriptSource` branch |
| `packages/command-and-control/src/index.ts` | MODIFY — register the two new tools |
| `packages/command-and-control/tests/tools/setup_transcript_source.test.ts` | config tests |
| `packages/command-and-control/tests/tools/workflows/compare_transcripts.test.ts` | workflow tests |

Build order respects dependencies: CI types → CI compare → CI Python bridge → CI engine+factory → CDS audio → C&C config → C&C workflow → C&C enrich change → register+verify.

---

## Task 1: CI — Transcription engine interface + types

**Files:**
- Create: `packages/curriculum-intelligence/src/transcription/engine.ts`
- Test: `packages/curriculum-intelligence/tests/transcription/engine.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/curriculum-intelligence/tests/transcription/engine.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type {
  TranscriptionEngine,
  EngineStatus,
  TranscribeOptions,
} from '../../src/transcription/engine.js';
import type { TranscriptCue } from '../../src/types.js';

describe('TranscriptionEngine interface', () => {
  it('a conforming object satisfies the interface shape', async () => {
    const fake: TranscriptionEngine = {
      name: 'fake',
      async isAvailable(): Promise<EngineStatus> {
        return { available: true, engine: 'fake', detail: 'ok' };
      },
      async transcribe(_audio: string, _opts: TranscribeOptions): Promise<TranscriptCue[]> {
        return [{ startSec: 0, endSec: 1, text: 'hi' }];
      },
    };
    expect(fake.name).toBe('fake');
    const status = await fake.isAvailable();
    expect(status.available).toBe(true);
    const cues = await fake.transcribe('/x.mp3', { model: 'small' });
    expect(cues[0].text).toBe('hi');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/curriculum-intelligence && npx vitest run tests/transcription/engine.test.ts`
Expected: FAIL — cannot find module `../../src/transcription/engine.js`.

- [ ] **Step 3: Write the engine module**

`packages/curriculum-intelligence/src/transcription/engine.ts`:

```ts
import type { TranscriptCue } from '../types.js';

export type { TranscriptCue };

export interface EngineStatus {
  available: boolean;
  engine: string;
  detail: string;
  setupSteps?: string[];
}

export interface TranscribeOptions {
  model: string;
  language?: string;
  vocabHints?: string[];
}

export interface TranscriptionEngine {
  readonly name: string;
  isAvailable(): Promise<EngineStatus>;
  transcribe(audioPath: string, opts: TranscribeOptions): Promise<TranscriptCue[]>;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/curriculum-intelligence && npx vitest run tests/transcription/engine.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/curriculum-intelligence/src/transcription/engine.ts packages/curriculum-intelligence/tests/transcription/engine.test.ts
git commit -m "feat(ci): TranscriptionEngine interface + types (refs #60)"
```

---

## Task 2: CI — compareTranscripts alignment + word diff

**Files:**
- Create: `packages/curriculum-intelligence/src/transcription/compare.ts`
- Test: `packages/curriculum-intelligence/tests/transcription/compare.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/curriculum-intelligence/tests/transcription/compare.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/curriculum-intelligence && npx vitest run tests/transcription/compare.test.ts`
Expected: FAIL — cannot find module `compare.js`.

- [ ] **Step 3: Write the alignment + diff implementation**

`packages/curriculum-intelligence/src/transcription/compare.ts`:

```ts
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

// Group whisper cue text overlapping a given panopto cue's time window.
function overlappingWhisperText(cue: TranscriptCue, whisper: TranscriptCue[]): string {
  const parts: string[] = [];
  for (const w of whisper) {
    if (w.endSec > cue.startSec && w.startSec < cue.endSec) parts.push(w.text);
  }
  return parts.join(' ');
}

// Standard LCS word alignment → substitution/insert/delete ops.
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
      // a[i] removed; check if it pairs with an inserted b token (substitution)
      if (j < m && lcs[i + 1][j + 1] >= lcs[i + 1][j] && a[i] !== b[j]) {
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/curriculum-intelligence && npx vitest run tests/transcription/compare.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/curriculum-intelligence/src/transcription/compare.ts packages/curriculum-intelligence/tests/transcription/compare.test.ts
git commit -m "feat(ci): timestamp-aligned word diff for transcript comparison (refs #60)"
```

---

## Task 3: CI — rank disagreements, filter trivia, suggest corrections

**Files:**
- Modify: `packages/curriculum-intelligence/src/transcription/compare.ts`
- Test: `packages/curriculum-intelligence/tests/transcription/compare.test.ts` (append)

- [ ] **Step 1: Write the failing test (append to compare.test.ts)**

```ts
import { rankDisagreements, type RankOptions } from '../../src/transcription/compare.js';

const RANK_OPTS: RankOptions = {
  knownTerms: ['COBE'],
  fillerWords: ['uh', 'um'],
};

describe('rankDisagreements', () => {
  it('collapses repeated identical substitutions and counts occurrences', () => {
    const diffs = Array.from({ length: 14 }, (_, k) => ({
      kind: 'sub' as const, panopto: 'KOBE', whisper: 'COBE', atSec: k * 10,
    }));
    const { ranked } = rankDisagreements(diffs, RANK_OPTS);
    const kobe = ranked.find((d) => d.panopto === 'KOBE');
    expect(kobe?.occurrences).toBe(14);
    expect(kobe?.firstAtSec).toBe(0);
    expect(kobe?.category === 'repeated' || kobe?.category === 'caps' || kobe?.category === 'known-term').toBe(true);
  });

  it('filters out filler-word disagreements', () => {
    const diffs = [
      { kind: 'sub' as const, panopto: 'uh', whisper: 'um', atSec: 1 },
      { kind: 'del' as const, panopto: 'um', atSec: 2 },
    ];
    const { ranked } = rankDisagreements(diffs, RANK_OPTS);
    expect(ranked).toHaveLength(0);
  });

  it('emits suggested corrections for high-signal substitutions', () => {
    const diffs = Array.from({ length: 8 }, () => ({
      kind: 'sub' as const, panopto: 'tableau', whisper: 'Tableau', atSec: 5,
    }));
    const { suggestedCorrections } = rankDisagreements(diffs, RANK_OPTS);
    expect(suggestedCorrections).toContainEqual(
      expect.objectContaining({ from: 'tableau', to: 'Tableau', occurrences: 8 }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/curriculum-intelligence && npx vitest run tests/transcription/compare.test.ts`
Expected: FAIL — `rankDisagreements` not exported.

- [ ] **Step 3: Append ranking implementation to compare.ts**

```ts
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

function isTrivial(word: string | undefined, fillers: Set<string>): boolean {
  if (!word) return true;
  const lower = word.toLowerCase();
  if (fillers.has(lower)) return true;
  if (STOPWORDS.has(lower)) return true;
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
    const key = `${d.panopto} ${d.whisper}`;
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/curriculum-intelligence && npx vitest run tests/transcription/compare.test.ts`
Expected: PASS (6 tests total).

- [ ] **Step 5: Commit**

```bash
git add packages/curriculum-intelligence/src/transcription/compare.ts packages/curriculum-intelligence/tests/transcription/compare.test.ts
git commit -m "feat(ci): rank transcript disagreements + suggest vocab corrections (refs #60)"
```

---

## Task 4: CI — top-level compareTranscripts + `.comparison.md` render

**Files:**
- Modify: `packages/curriculum-intelligence/src/transcription/compare.ts`
- Test: `packages/curriculum-intelligence/tests/transcription/compare.test.ts` (append)

- [ ] **Step 1: Write the failing test (append)**

```ts
import { compareTranscripts, renderComparisonMd } from '../../src/transcription/compare.js';

describe('compareTranscripts + renderComparisonMd', () => {
  const ctx = {
    knownTerms: ['COBE'],
    fillerWords: ['uh'],
    domain: 'bsu.hosted.panopto.com',
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
    expect(md).toContain('bsu.hosted.panopto.com/Panopto/Pages/Viewer.aspx?id=sess-1&start=');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/curriculum-intelligence && npx vitest run tests/transcription/compare.test.ts`
Expected: FAIL — `compareTranscripts`/`renderComparisonMd` not exported.

- [ ] **Step 3: Append top-level + renderer to compare.ts**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/curriculum-intelligence && npx vitest run tests/transcription/compare.test.ts`
Expected: PASS (9 tests total).

- [ ] **Step 5: Commit**

```bash
git add packages/curriculum-intelligence/src/transcription/compare.ts packages/curriculum-intelligence/tests/transcription/compare.test.ts
git commit -m "feat(ci): compareTranscripts report + .comparison.md renderer (refs #60)"
```

---

## Task 5: CI — Python bridge `whisper_transcribe.py`

**Files:**
- Create: `packages/curriculum-intelligence/python/whisper_transcribe.py`

No unit test (it's a Python script exercised via the engine in Task 6 with a mocked subprocess, and manually with real audio). The script's contract — JSON cues on stdout, JSON error + non-zero exit on failure — is what Task 6 tests against.

- [ ] **Step 1: Write the bridge script**

`packages/curriculum-intelligence/python/whisper_transcribe.py`:

```python
#!/usr/bin/env python3
"""faster-whisper bridge. Prints JSON cues to stdout, or a JSON error and exits non-zero."""
import argparse
import json
import sys


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--audio", required=True)
    parser.add_argument("--model", default="medium")
    parser.add_argument("--language", default="en")
    parser.add_argument("--initial-prompt", default=None)
    args = parser.parse_args()

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print(json.dumps({"error": "FASTER_WHISPER_NOT_INSTALLED"}), file=sys.stderr)
        return 2

    try:
        model = WhisperModel(args.model, device="cpu", compute_type="int8")
        segments, _info = model.transcribe(
            args.audio,
            language=args.language,
            initial_prompt=args.initial_prompt or None,
        )
        cues = [{"start": float(s.start), "end": float(s.end), "text": s.text.strip()} for s in segments]
        print(json.dumps(cues))
        return 0
    except Exception as exc:  # noqa: BLE001 — bridge surfaces any failure as JSON
        print(json.dumps({"error": "TRANSCRIBE_FAILED", "detail": str(exc)}), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 2: Sanity-check it parses (no faster-whisper needed for arg parsing)**

Run: `python packages/curriculum-intelligence/python/whisper_transcribe.py --help`
Expected: argparse usage text prints, exit 0.

- [ ] **Step 3: Commit**

```bash
git add packages/curriculum-intelligence/python/whisper_transcribe.py
git commit -m "feat(ci): faster-whisper Python bridge script (refs #60)"
```

---

## Task 6: CI — FasterWhisperEngine + factory

**Files:**
- Create: `packages/curriculum-intelligence/src/transcription/faster_whisper_engine.ts`
- Test: `packages/curriculum-intelligence/tests/transcription/engine.test.ts` (append)

- [ ] **Step 1: Write the failing test (append to engine.test.ts)**

```ts
import { vi } from 'vitest';

vi.mock('node:child_process', () => ({ spawn: vi.fn() }));
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { getTranscriptionEngine } from '../../src/transcription/faster_whisper_engine.js';

function fakeProc(stdout: string, code: number) {
  const proc = new EventEmitter() as any;
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  setTimeout(() => {
    if (stdout) proc.stdout.emit('data', Buffer.from(stdout));
    proc.emit('close', code);
  }, 0);
  return proc;
}

describe('getTranscriptionEngine', () => {
  it('returns the faster-whisper engine by name', () => {
    const engine = getTranscriptionEngine('faster-whisper');
    expect(engine.name).toBe('faster-whisper');
  });

  it('throws for an unknown engine name', () => {
    expect(() => getTranscriptionEngine('does-not-exist')).toThrow(/unknown transcription engine/i);
  });
});

describe('FasterWhisperEngine.transcribe', () => {
  it('parses JSON cues from the bridge stdout', async () => {
    vi.mocked(spawn).mockReturnValue(
      fakeProc(JSON.stringify([{ start: 0, end: 2.5, text: 'hello world' }]), 0),
    );
    const engine = getTranscriptionEngine('faster-whisper');
    const cues = await engine.transcribe('/tmp/a.mp3', { model: 'small' });
    expect(cues).toEqual([{ startSec: 0, endSec: 2.5, text: 'hello world' }]);
  });

  it('rejects when the bridge exits non-zero', async () => {
    vi.mocked(spawn).mockReturnValue(fakeProc('', 1));
    const engine = getTranscriptionEngine('faster-whisper');
    await expect(engine.transcribe('/tmp/a.mp3', { model: 'small' })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/curriculum-intelligence && npx vitest run tests/transcription/engine.test.ts`
Expected: FAIL — cannot find `faster_whisper_engine.js`.

- [ ] **Step 3: Write the engine + factory**

`packages/curriculum-intelligence/src/transcription/faster_whisper_engine.ts`:

```ts
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { EngineStatus, TranscribeOptions, TranscriptionEngine } from './engine.js';
import type { TranscriptCue } from '../types.js';

const PY_CANDIDATES = ['python3', 'python', 'py'];

function bridgePath(): string {
  // engine.ts compiles to dist/transcription/; the python/ dir sits at package root.
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, '..', '..', 'python', 'whisper_transcribe.py');
}

async function probe(cmd: string, args: string[]): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) => {
    let out = '';
    let proc;
    try {
      proc = spawn(cmd, args);
    } catch {
      resolve({ ok: false, out: '' });
      return;
    }
    proc.stdout?.on('data', (d) => (out += d.toString()));
    proc.stderr?.on('data', (d) => (out += d.toString()));
    proc.on('error', () => resolve({ ok: false, out: '' }));
    proc.on('close', (code) => resolve({ ok: code === 0, out }));
  });
}

async function resolvePython(): Promise<string | null> {
  for (const c of PY_CANDIDATES) {
    const r = await probe(c, ['--version']);
    if (r.ok) return c;
  }
  return null;
}

class FasterWhisperEngine implements TranscriptionEngine {
  readonly name = 'faster-whisper';

  async isAvailable(): Promise<EngineStatus> {
    const python = await resolvePython();
    if (!python) {
      return {
        available: false,
        engine: this.name,
        detail: 'Python 3 not found on PATH',
        setupSteps: ['Install Python 3', 'pip install faster-whisper', 'Install ffmpeg'],
      };
    }
    const imp = await probe(python, ['-c', 'import faster_whisper']);
    if (!imp.ok) {
      return {
        available: false,
        engine: this.name,
        detail: 'faster-whisper not installed',
        setupSteps: [`${python} -m pip install faster-whisper`, 'Install ffmpeg'],
      };
    }
    const ff = await probe('ffmpeg', ['-version']);
    if (!ff.ok) {
      return {
        available: false,
        engine: this.name,
        detail: 'ffmpeg not found on PATH',
        setupSteps: ['Install ffmpeg and ensure it is on PATH'],
      };
    }
    return { available: true, engine: this.name, detail: `Python ${python}, faster-whisper, ffmpeg present` };
  }

  async transcribe(audioPath: string, opts: TranscribeOptions): Promise<TranscriptCue[]> {
    const python = (await resolvePython()) ?? 'python';
    const args = [
      bridgePath(),
      '--audio', audioPath,
      '--model', opts.model,
      '--language', opts.language ?? 'en',
    ];
    if (opts.vocabHints && opts.vocabHints.length > 0) {
      args.push('--initial-prompt', opts.vocabHints.join(', '));
    }
    return new Promise<TranscriptCue[]>((resolve, reject) => {
      const proc = spawn(python, args);
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (d) => (stdout += d.toString()));
      proc.stderr.on('data', (d) => (stderr += d.toString()));
      proc.on('error', (err) => reject(err));
      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`whisper bridge exited ${code}: ${stderr.trim()}`));
          return;
        }
        try {
          const raw = JSON.parse(stdout) as Array<{ start: number; end: number; text: string }>;
          resolve(raw.map((c) => ({ startSec: c.start, endSec: c.end, text: c.text })));
        } catch (e) {
          reject(new Error(`whisper bridge produced invalid JSON: ${(e as Error).message}`));
        }
      });
    });
  }
}

const REGISTRY: Record<string, () => TranscriptionEngine> = {
  'faster-whisper': () => new FasterWhisperEngine(),
};

export function getTranscriptionEngine(name: string): TranscriptionEngine {
  const factory = REGISTRY[name];
  if (!factory) throw new Error(`unknown transcription engine: ${name}`);
  return factory();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/curriculum-intelligence && npx vitest run tests/transcription/engine.test.ts`
Expected: PASS.

- [ ] **Step 5: Build the package (exports must compile for cross-package import)**

Run: `cd packages/curriculum-intelligence && npm run build`
Expected: tsc succeeds; `dist/transcription/engine.js`, `compare.js`, `faster_whisper_engine.js` emitted.

- [ ] **Step 6: Commit**

```bash
git add packages/curriculum-intelligence/src/transcription/faster_whisper_engine.ts packages/curriculum-intelligence/tests/transcription/engine.test.ts
git commit -m "feat(ci): FasterWhisperEngine via Python bridge + engine factory (refs #60)"
```

---

## Task 7: CDS — `fetchSessionAudio` (best-effort + manual fallback)

**Files:**
- Create: `packages/canvas-design-studio/src/tools/panopto-audio.ts`
- Test: `packages/canvas-design-studio/tests/panopto-audio.test.ts`

> NOTE: the exact Panopto download URL is an Open Implementation Question in the spec. The code below uses the documented candidate and is structured so the URL is a single constant to adjust after verifying against a live Panopto.

- [ ] **Step 1: Write the failing test**

`packages/canvas-design-studio/tests/panopto-audio.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fetchSessionAudio } from '../src/tools/panopto-audio.js';
import type { PanoptoConfig } from '../src/types.js';

const CONFIG: PanoptoConfig = {
  domain: 'bsu.hosted.panopto.com',
  clientId: 'cid',
  clientSecret: 'secret',
} as PanoptoConfig;

const SESSION = {
  sessionId: 's1',
  title: 'Week 03',
  startTime: '2026-06-01T14:00:00Z',
  duration: 3600,
  filename: '2026-06-01_week-03.panopto.vtt',
};

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'audio-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); vi.restoreAllMocks(); });

describe('fetchSessionAudio', () => {
  it('falls back to a manually-supplied file when the download fails', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('', { status: 403 }));
    writeFileSync(join(dir, '2026-06-01_week-03.mp3'), 'audio-bytes');
    const res = await fetchSessionAudio(SESSION, CONFIG, dir);
    expect(res.ok).toBe(true);
    expect(res.source).toBe('manual');
    expect(res.path).toBe(join(dir, '2026-06-01_week-03.mp3'));
  });

  it('returns ok:false with guided web-download instructions when no audio is available', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('', { status: 404 }));
    const res = await fetchSessionAudio(SESSION, CONFIG, dir);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('MANUAL_MISSING');
    expect(res.viewerUrl).toContain('Viewer.aspx?id=s1');
    expect(res.manualInstructions?.join('\n')).toContain('2026-06-01_week-03');
    expect(res.manualInstructions?.join('\n')).toMatch(/Download/i);
  });

  it('writes audio and reports source panopto on a successful download', async () => {
    // token call, then audio bytes
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 't' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    const res = await fetchSessionAudio(SESSION, CONFIG, dir);
    expect(res.ok).toBe(true);
    expect(res.source).toBe('panopto');
    expect(existsSync(res.path!)).toBe(true);
  });

  it('manual mode skips the API entirely and uses a present manual file', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    writeFileSync(join(dir, '2026-06-01_week-03.m4a'), 'audio-bytes');
    const res = await fetchSessionAudio(SESSION, CONFIG, dir, 'manual');
    expect(res.ok).toBe(true);
    expect(res.source).toBe('manual');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/canvas-design-studio && npx vitest run tests/panopto-audio.test.ts`
Expected: FAIL — cannot find `panopto-audio.js`.

- [ ] **Step 3: Write the implementation**

`packages/canvas-design-studio/src/tools/panopto-audio.ts`:

```ts
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PanoptoConfig } from '../types.js';
import { getPanoptoToken, buildViewerUrl } from './panopto.js';
import type { SessionManifestEntry } from './panopto-enrich.js';

// VERIFY against a live Panopto before relying on auto-fetch (spec Open Question #1).
const DOWNLOAD_URL = (domain: string, sessionId: string) =>
  `https://${domain}/Panopto/Podcast/Download/${sessionId}.mp4?mediaTargetType=audioPodcast`;

const MANUAL_EXTS = ['mp3', 'm4a', 'mp4', 'wav'];

export type AudioMode = 'auto' | 'manual';

export interface AudioFetchResult {
  ok: boolean;
  path?: string;
  source?: 'panopto' | 'manual';
  reason?: 'DOWNLOAD_DISABLED' | 'NOT_FOUND' | 'NETWORK' | 'MANUAL_MISSING';
  viewerUrl?: string;
  manualInstructions?: string[];
}

function stem(filename: string): string {
  return filename.replace(/\.panopto\.vtt$/, '');
}

function findManual(dir: string, fileStem: string): string | null {
  for (const ext of MANUAL_EXTS) {
    const candidate = join(dir, `${fileStem}.${ext}`);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function guidedInstructions(
  config: PanoptoConfig,
  session: SessionManifestEntry,
  destDir: string,
  fileStem: string,
): { viewerUrl: string; manualInstructions: string[] } {
  const viewerUrl = buildViewerUrl(config.domain, session.sessionId);
  return {
    viewerUrl,
    manualInstructions: [
      `1. Open the recording: ${viewerUrl}`,
      `2. Click the settings/⋯ menu → "Download" (or the download icon below the player).`,
      `   If there is no Download option, your Panopto admin has downloads disabled —`,
      `   ask them to enable "Make available for download" for this folder.`,
      `3. Save the file and rename it to exactly: ${fileStem}.mp3  (.m4a/.mp4/.wav also accepted)`,
      `4. Place it in: ${destDir}`,
      `5. Re-run compare_transcripts.`,
    ],
  };
}

export async function fetchSessionAudio(
  session: SessionManifestEntry,
  config: PanoptoConfig,
  destDir: string,
  mode: AudioMode = 'auto',
): Promise<AudioFetchResult> {
  const fileStem = stem(session.filename);

  // 1. Best-effort Panopto download (skipped in manual mode).
  if (mode === 'auto') {
    try {
      const token = await getPanoptoToken(config);
      const res = await fetch(DOWNLOAD_URL(config.domain, session.sessionId), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        const outPath = join(destDir, `${fileStem}.audio.mp4`);
        writeFileSync(outPath, buf);
        return { ok: true, path: outPath, source: 'panopto' };
      }
      // fall through to manual on 403/404/etc.
    } catch {
      // network/token error → fall through to manual
    }
  }

  // 2. Manual file already present.
  const manual = findManual(destDir, fileStem);
  if (manual) return { ok: true, path: manual, source: 'manual' };

  // 3. Guided web-interface download instructions.
  return { ok: false, reason: 'MANUAL_MISSING', ...guidedInstructions(config, session, destDir, fileStem) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/canvas-design-studio && npx vitest run tests/panopto-audio.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Build CDS so the export is available to C&C**

Run: `cd packages/canvas-design-studio && npm run build`
Expected: tsc succeeds; `dist/tools/panopto-audio.js` emitted.

- [ ] **Step 6: Commit**

```bash
git add packages/canvas-design-studio/src/tools/panopto-audio.ts packages/canvas-design-studio/tests/panopto-audio.test.ts
git commit -m "feat(cds): on-demand Panopto session audio fetch with manual fallback (refs #60)"
```

---

## Task 8: C&C — `setup_transcript_source` + `loadTranscriptConfig`

**Files:**
- Create: `packages/command-and-control/src/tools/setup_transcript_source.ts`
- Test: `packages/command-and-control/tests/tools/setup_transcript_source.test.ts`

Follow the exact atomic-write + `getCcHomePath` pattern from `setup_panopto.ts`. Read that file first to match its structure.

- [ ] **Step 1: Write the failing test**

`packages/command-and-control/tests/tools/setup_transcript_source.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  setupTranscriptSource,
  loadTranscriptConfig,
} from '../../src/tools/setup_transcript_source.js';

let home: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'cc-home-'));
  process.env.CC_HOME = home;
});
afterEach(() => {
  rmSync(home, { recursive: true, force: true });
  delete process.env.CC_HOME;
});

describe('loadTranscriptConfig', () => {
  it('returns defaults when the file is absent', () => {
    expect(loadTranscriptConfig()).toEqual({ source: 'panopto', engine: 'faster-whisper', model: 'medium', audioMode: 'auto' });
  });

  it('throws TRANSCRIPT_CONFIG_CORRUPT on malformed JSON', () => {
    writeFileSync(join(home, 'transcript-config.json'), '{not json');
    expect(() => loadTranscriptConfig()).toThrow(/TRANSCRIPT_CONFIG_CORRUPT/);
  });
});

describe('setupTranscriptSource', () => {
  it('get returns defaults when absent', async () => {
    const r = await setupTranscriptSource({ action: 'get' });
    expect(r.config.source).toBe('panopto');
  });

  it('set writes provided fields and preserves others', async () => {
    await setupTranscriptSource({ action: 'set', source: 'whisper' });
    await setupTranscriptSource({ action: 'set', model: 'small' });
    const cfg = loadTranscriptConfig();
    expect(cfg.source).toBe('whisper');
    expect(cfg.model).toBe('small');
    expect(cfg.engine).toBe('faster-whisper');
    expect(existsSync(join(home, 'transcript-config.json'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/command-and-control && npx vitest run tests/tools/setup_transcript_source.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`packages/command-and-control/src/tools/setup_transcript_source.ts`:

```ts
import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { getCcHomePath } from '../kb/config.js';

export interface TranscriptConfig {
  source: 'panopto' | 'whisper';
  engine: string;
  model: string;
  audioMode: 'auto' | 'manual';
}

const DEFAULTS: TranscriptConfig = { source: 'panopto', engine: 'faster-whisper', model: 'medium', audioMode: 'auto' };

function configPath(): string {
  return join(getCcHomePath(), 'transcript-config.json');
}

export function loadTranscriptConfig(): TranscriptConfig {
  const p = configPath();
  if (!existsSync(p)) return { ...DEFAULTS };
  let parsed: Partial<TranscriptConfig>;
  try {
    parsed = JSON.parse(readFileSync(p, 'utf-8'));
  } catch {
    throw new Error('TRANSCRIPT_CONFIG_CORRUPT');
  }
  return { ...DEFAULTS, ...parsed };
}

function atomicWrite(cfg: TranscriptConfig): void {
  const p = configPath();
  mkdirSync(dirname(p), { recursive: true });
  const tmp = `${p}.tmp`;
  writeFileSync(tmp, JSON.stringify(cfg, null, 2), { mode: 0o600 });
  renameSync(tmp, p);
}

export interface SetupTranscriptSourceInput {
  action: 'get' | 'set';
  source?: 'panopto' | 'whisper';
  engine?: string;
  model?: string;
  audioMode?: 'auto' | 'manual';
}

export interface SetupTranscriptSourceResult {
  config: TranscriptConfig;
  message: string;
}

export async function setupTranscriptSource(
  input: SetupTranscriptSourceInput,
): Promise<SetupTranscriptSourceResult> {
  if (input.action === 'get') {
    return { config: loadTranscriptConfig(), message: 'Current transcript configuration.' };
  }
  const current = loadTranscriptConfig();
  const next: TranscriptConfig = {
    source: input.source ?? current.source,
    engine: input.engine ?? current.engine,
    model: input.model ?? current.model,
    audioMode: input.audioMode ?? current.audioMode,
  };
  atomicWrite(next);
  return { config: next, message: `transcriptSource set to ${next.source} (engine ${next.engine}, model ${next.model}, audioMode ${next.audioMode}).` };
}
```

> Verify `getCcHomePath` is exported from `../kb/config.js` — match the import used by `setup_panopto.ts`. Adjust the path if that file imports it from elsewhere.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/command-and-control && npx vitest run tests/tools/setup_transcript_source.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/command-and-control/src/tools/setup_transcript_source.ts packages/command-and-control/tests/tools/setup_transcript_source.test.ts
git commit -m "feat(cc): transcript-config.json + setup_transcript_source (refs #60)"
```

---

## Task 9: C&C — `compare_transcripts` workflow

**Files:**
- Create: `packages/command-and-control/src/tools/workflows/compare_transcripts.ts`
- Test: `packages/command-and-control/tests/tools/workflows/compare_transcripts.test.ts`

Read `enrich_panopto_transcripts.ts` first — mirror its manifest-reading, config-loading, per-session-failure structure.

- [ ] **Step 1: Write the failing test**

`packages/command-and-control/tests/tools/workflows/compare_transcripts.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Engine + audio fetch are injected, so no real Whisper/Panopto here.
const fakeEngine = {
  name: 'fake',
  isAvailable: vi.fn().mockResolvedValue({ available: true, engine: 'fake', detail: 'ok' }),
  transcribe: vi.fn().mockResolvedValue([{ startSec: 0, endSec: 5, text: 'welcome to COBE' }]),
};
vi.mock('curriculum-intelligence-mcp/dist/transcription/faster_whisper_engine.js', () => ({
  getTranscriptionEngine: () => fakeEngine,
}));
vi.mock('canvas-design-mcp/dist/tools/panopto-audio.js', () => ({
  fetchSessionAudio: vi.fn().mockResolvedValue({ ok: true, path: '/tmp/a.mp4', source: 'manual' }),
}));
vi.mock('../../../src/tools/setup_panopto.js', () => ({
  loadPanoptoConfig: () => ({ domain: 'bsu.hosted.panopto.com', clientId: 'c', clientSecret: 's' }),
}));

import { compareTranscriptsWorkflow } from '../../../src/tools/workflows/compare_transcripts.js';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'compare-'));
  process.env.CC_HOME = dir;
  writeFileSync(join(dir, '2026-06-01_w3.panopto.vtt'), 'WEBVTT\n\n00:00:00.000 --> 00:00:05.000\nwelcome to KOBE\n');
  writeFileSync(join(dir, '_sessions.json'), JSON.stringify({
    domain: 'bsu.hosted.panopto.com',
    generatedAt: '2026-06-01T20:00:00Z',
    sessions: [{ sessionId: 's1', title: 'W3', startTime: '2026-06-01T14:00:00Z', duration: 3600, filename: '2026-06-01_w3.panopto.vtt' }],
  }));
});
afterEach(() => { rmSync(dir, { recursive: true, force: true }); delete process.env.CC_HOME; vi.clearAllMocks(); });

describe('compareTranscriptsWorkflow', () => {
  it('returns MANIFEST_NOT_FOUND when _sessions.json is absent', async () => {
    rmSync(join(dir, '_sessions.json'));
    const r = await compareTranscriptsWorkflow({ transcriptsPath: dir });
    expect(r.error).toBe('MANIFEST_NOT_FOUND');
  });

  it('transcribes, compares, writes .comparison.md, and surfaces suggestions', async () => {
    const r = await compareTranscriptsWorkflow({ transcriptsPath: dir });
    expect(r.reports).toHaveLength(1);
    expect(existsSync(join(dir, '2026-06-01_w3.comparison.md'))).toBe(true);
    expect(existsSync(join(dir, '2026-06-01_w3.whisper.vtt'))).toBe(true);
    expect(r.suggestedCorrections.some((s) => s.from === 'KOBE' && s.to === 'COBE')).toBe(true);
  });

  it('short-circuits with setupSteps when the engine is unavailable', async () => {
    fakeEngine.isAvailable.mockResolvedValueOnce({ available: false, engine: 'fake', detail: 'no python', setupSteps: ['Install Python 3'] });
    const r = await compareTranscriptsWorkflow({ transcriptsPath: dir });
    expect(r.error).toBe('ENGINE_UNAVAILABLE');
    expect(r.setupSteps).toContain('Install Python 3');
    expect(r.reports).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/command-and-control && npx vitest run tests/tools/workflows/compare_transcripts.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the workflow**

`packages/command-and-control/src/tools/workflows/compare_transcripts.ts`:

```ts
import { existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { getTranscriptionEngine } from 'curriculum-intelligence-mcp/dist/transcription/faster_whisper_engine.js';
import { compareTranscripts, renderComparisonMd, type SuggestedCorrection } from 'curriculum-intelligence-mcp/dist/transcription/compare.js';
import { parseVtt } from 'curriculum-intelligence-mcp/dist/parsers/transcript_vtt.js';
import { fetchSessionAudio } from 'canvas-design-mcp/dist/tools/panopto-audio.js';
import { loadPanoptoConfig } from '../setup_panopto.js';
import { loadPanoptoVocab } from '../setup_panopto_vocab.js';
import { loadTranscriptConfig } from '../setup_transcript_source.js';

interface SessionEntry {
  sessionId: string;
  title: string;
  startTime: string;
  duration: number;
  filename: string;
}

export interface CompareTranscriptsInput {
  transcriptsPath: string;
  sessionIds?: string[];
  model?: string;
  keepAudio?: boolean;
}

export interface CompareTranscriptsResult {
  transcriptsPath: string;
  reports: { sessionId: string; title: string; divergenceRate: number; mdPath: string }[];
  failed: { sessionId: string; title: string; reason: string }[];
  suggestedCorrections: SuggestedCorrection[];
  error?: string;
  setupSteps?: string[];
  fix?: string[];
}

function vttToWhisperVtt(cues: { startSec: number; endSec: number; text: string }[]): string {
  const fmt = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = (s % 60).toFixed(3).padStart(6, '0');
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${sec}`;
  };
  const out = ['WEBVTT', ''];
  for (const c of cues) {
    out.push(`${fmt(c.startSec)} --> ${fmt(c.endSec)}`, c.text, '');
  }
  return out.join('\n');
}

export async function compareTranscriptsWorkflow(
  input: CompareTranscriptsInput,
): Promise<CompareTranscriptsResult> {
  const base: CompareTranscriptsResult = {
    transcriptsPath: input.transcriptsPath,
    reports: [],
    failed: [],
    suggestedCorrections: [],
  };

  const manifestPath = join(input.transcriptsPath, '_sessions.json');
  if (!existsSync(manifestPath)) {
    return { ...base, error: 'MANIFEST_NOT_FOUND', fix: ['Run bulk_fetch_panopto_transcripts first'] };
  }
  const panoptoConfig = loadPanoptoConfig();
  if (!panoptoConfig) {
    return { ...base, error: 'PANOPTO_NOT_CONFIGURED', fix: ['Run setup_panopto first'] };
  }
  const tconf = loadTranscriptConfig();
  const model = input.model ?? tconf.model;
  const engine = getTranscriptionEngine(tconf.engine);

  const status = await engine.isAvailable();
  if (!status.available) {
    return { ...base, error: 'ENGINE_UNAVAILABLE', setupSteps: status.setupSteps ?? [] };
  }

  const vocab = loadPanoptoVocab();
  const knownTerms = vocab.corrections.map((c) => c.to);
  const vocabHints = Array.from(new Set(knownTerms));

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as { sessions: SessionEntry[] };
  const wanted = input.sessionIds
    ? manifest.sessions.filter((s) => input.sessionIds!.includes(s.sessionId))
    : manifest.sessions;

  const merged = new Map<string, SuggestedCorrection>();

  for (const session of wanted) {
    const vttPath = join(input.transcriptsPath, session.filename);
    if (!existsSync(vttPath)) {
      base.failed.push({ sessionId: session.sessionId, title: session.title, reason: 'VTT missing' });
      continue;
    }
    const audio = await fetchSessionAudio(session, panoptoConfig, input.transcriptsPath, tconf.audioMode);
    if (!audio.ok || !audio.path) {
      const reason = audio.manualInstructions ? audio.manualInstructions.join('\n') : 'audio unavailable';
      base.failed.push({ sessionId: session.sessionId, title: session.title, reason });
      continue;
    }
    try {
      const whisperCues = await engine.transcribe(audio.path, { model, language: 'en', vocabHints });
      const stem = session.filename.replace(/\.panopto\.vtt$/, '');
      writeFileSync(join(input.transcriptsPath, `${stem}.whisper.vtt`), vttToWhisperVtt(whisperCues), 'utf-8');

      const panoptoCues = parseVtt(readFileSync(vttPath, 'utf-8'));
      const report = compareTranscripts(panoptoCues, whisperCues, {
        knownTerms,
        fillerWords: vocab.fillerWords,
        domain: panoptoConfig.domain,
        sessionId: session.sessionId,
        title: session.title,
      });
      const mdPath = join(input.transcriptsPath, `${stem}.comparison.md`);
      writeFileSync(mdPath, renderComparisonMd(report), 'utf-8');

      base.reports.push({ sessionId: session.sessionId, title: session.title, divergenceRate: report.divergenceRate, mdPath });
      for (const s of report.suggestedCorrections) {
        const ex = merged.get(`${s.from} ${s.to}`);
        if (ex) ex.occurrences += s.occurrences;
        else merged.set(`${s.from} ${s.to}`, { ...s });
      }
    } catch (err) {
      base.failed.push({ sessionId: session.sessionId, title: session.title, reason: err instanceof Error ? err.message : String(err) });
    } finally {
      if (!input.keepAudio && audio.source === 'panopto' && audio.path && existsSync(audio.path)) {
        rmSync(audio.path, { force: true });
      }
    }
  }

  base.suggestedCorrections = Array.from(merged.values()).sort((a, b) => b.occurrences - a.occurrences);
  return base;
}
```

> Verify the dist import paths for the CI and CDS packages match how `enrich_panopto_transcripts.ts` imports them (package name + `dist/...`). Adjust if the existing code uses a different specifier.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/command-and-control && npx vitest run tests/tools/workflows/compare_transcripts.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/command-and-control/src/tools/workflows/compare_transcripts.ts packages/command-and-control/tests/tools/workflows/compare_transcripts.test.ts
git commit -m "feat(cc): compare_transcripts workflow — fetch, transcribe, diff, suggest (refs #60)"
```

---

## Task 10: C&C — enrichment honors `transcriptSource`

**Files:**
- Modify: `packages/command-and-control/src/tools/workflows/enrich_panopto_transcripts.ts`
- Test: `packages/command-and-control/tests/tools/workflows/enrich_panopto_transcripts.test.ts` (append)

- [ ] **Step 1: Read the current enrichment workflow**

Read `packages/command-and-control/src/tools/workflows/enrich_panopto_transcripts.ts` fully. Locate the line that resolves each session's VTT path (`join(transcriptsPath, session.filename)`). That single resolution point is what changes.

- [ ] **Step 2: Write the failing test (append)**

```ts
import { loadTranscriptConfig } from '../../../src/tools/setup_transcript_source.js';

describe('enrich honors transcriptSource', () => {
  it('reads .whisper.vtt when source is whisper and the file exists', async () => {
    // setup: a folder with _sessions.json, a .panopto.vtt, and a .whisper.vtt for one session;
    // set transcript-config.json source=whisper via setupTranscriptSource;
    // run enrich; assert the enriched markdown reflects the WHISPER text, not the Panopto text.
    // (Use distinct sentinel text in each VTT, e.g. "PANOPTO_ONLY" vs "WHISPER_ONLY",
    //  and assert the enriched output contains WHISPER_ONLY.)
  });

  it('falls back to .panopto.vtt with a note when no .whisper.vtt exists', async () => {
    // source=whisper but only .panopto.vtt present → enriched output uses Panopto text;
    // per-session status notes the fallback.
  });
});
```

> Fill these two tests with the same fixture-folder setup pattern used by the existing `enrich_panopto_transcripts.test.ts` (copy its `beforeEach` scaffolding). Use sentinel strings so the assertion proves which VTT was read.

- [ ] **Step 3: Run test to verify it fails**

Run: `cd packages/command-and-control && npx vitest run tests/tools/workflows/enrich_panopto_transcripts.test.ts`
Expected: FAIL — enrichment still reads `.panopto.vtt` unconditionally.

- [ ] **Step 4: Modify the VTT resolution**

At the top of the workflow, add:

```ts
import { loadTranscriptConfig } from '../setup_transcript_source.js';
```

Replace the per-session VTT path resolution with source-aware resolution + fallback note:

```ts
const tconf = loadTranscriptConfig();
// ...inside the per-session loop, where vttPath was `join(transcriptsPath, session.filename)`:
let vttPath = join(transcriptsPath, session.filename);
let sourceNote = '';
if (tconf.source === 'whisper') {
  const whisperPath = join(transcriptsPath, session.filename.replace(/\.panopto\.vtt$/, '.whisper.vtt'));
  if (existsSync(whisperPath)) {
    vttPath = whisperPath;
  } else {
    sourceNote = 'no .whisper.vtt — fell back to Panopto';
  }
}
```

Thread `sourceNote` into that session's entry in the result (add a `note?: string` field to the enriched-entry shape if absent). Keep everything else unchanged.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/command-and-control && npx vitest run tests/tools/workflows/enrich_panopto_transcripts.test.ts`
Expected: PASS (existing tests + 2 new).

- [ ] **Step 6: Commit**

```bash
git add packages/command-and-control/src/tools/workflows/enrich_panopto_transcripts.ts packages/command-and-control/tests/tools/workflows/enrich_panopto_transcripts.test.ts
git commit -m "feat(cc): enrichment reads Whisper transcript when transcriptSource=whisper (refs #60)"
```

---

## Task 11: C&C — register tools + full verification

**Files:**
- Modify: `packages/command-and-control/src/index.ts`

- [ ] **Step 1: Read how existing Panopto tools register**

Read `packages/command-and-control/src/index.ts`; find the registration block for `setup_panopto_vocab` and `enrich_panopto_transcripts`. Match its exact shape (tool name, input schema, handler wiring).

- [ ] **Step 2: Register `setup_transcript_source` and `compare_transcripts`**

Add registrations mirroring the existing pattern. Tool names: `setup_transcript_source`, `compare_transcripts`. Wire handlers to `setupTranscriptSource` and `compareTranscriptsWorkflow`. Use the same input-schema style (zod or JSON schema — whatever the neighboring tools use).

- [ ] **Step 3: Build all three packages in dependency order**

Run:
```bash
cd packages/curriculum-intelligence && npm run build
cd ../canvas-design-studio && npm run build
cd ../command-and-control && npm run build
```
Expected: all three compile.

- [ ] **Step 4: Run the full test suites**

Run:
```bash
cd packages/curriculum-intelligence && npx vitest run
cd ../canvas-design-studio && npx vitest run
cd ../command-and-control && npx vitest run
```
Expected: all green.

- [ ] **Step 5: Smoke the C&C integration contract**

Run: `cd packages/command-and-control && npm run smoke:integration`
Expected: passes (this feature doesn't touch the analyze/import/generate contract, but confirm no regression).

- [ ] **Step 6: Commit**

```bash
git add packages/command-and-control/src/index.ts
git commit -m "feat(cc): register setup_transcript_source + compare_transcripts (refs #60, closes #60)"
```

---

## Manual Verification (post-implementation, real Whisper)

Not automated — requires Python + faster-whisper + ffmpeg + a real lecture audio file.

1. `pip install faster-whisper`; confirm `ffmpeg -version`.
2. Drop a real lecture audio next to a `.panopto.vtt` (manual fallback path).
3. Call `compare_transcripts` with `transcriptsPath` pointing at that folder.
4. Confirm `.whisper.vtt` + `.comparison.md` are written, the report's ranked table looks sane, and suggested corrections match obvious vocab errors.
5. `setup_transcript_source --action set --source whisper`; run `enrich_panopto_transcripts`; confirm the enriched markdown derives from the Whisper transcript.

---

## Self-Review

**Spec coverage:** Engine interface + factory (Task 1, 6) ✓ · Python bridge / faster-whisper (Task 5, 6) ✓ · `vocabHints` initial_prompt (Task 6 transcribe + Task 9 wiring) ✓ · on-demand audio fetch + manual fallback (Task 7) ✓ · alignment/divergence/ranking/filtering (Task 2, 3) ✓ · suggested corrections, no auto-write (Task 3, 9 — workflow only returns them) ✓ · `.comparison.md` with deep links (Task 4) ✓ · `transcript-config.json` + setup tool + defaults + corrupt handling (Task 8) ✓ · orchestration with per-session failure + audio cleanup + merged suggestions (Task 9) ✓ · enrichment `transcriptSource` branch + fallback note (Task 10) ✓ · registration (Task 11) ✓ · error-handling table cases covered across Tasks 7-9 ✓.

**Placeholder scan:** Task 10's two test bodies are described rather than fully written — intentional, because they must reuse the existing `enrich_panopto_transcripts.test.ts` fixture scaffolding which the implementer has in front of them; the sentinel-string assertion strategy is specified exactly. All other steps contain complete code.

**Type consistency:** `TranscriptCue {startSec,endSec,text}` consistent across CI parser, engine, compare. `SuggestedCorrection {from,to,occurrences,confidence}` consistent between compare.ts (Task 3) and the workflow merge (Task 9). `AudioFetchResult` fields consistent between Task 7 definition and Task 9 consumption (`ok`, `path`, `source`, `manualInstructions`); `fetchSessionAudio` 4th param `mode: AudioMode` threaded from `tconf.audioMode` in Task 9. `TranscriptConfig {source,engine,model,audioMode}` consistent between Task 8 and Tasks 9/10.

**Known verification points flagged for the implementer:** (1) Panopto download URL — verify against live Panopto (spec Open Q#1); (2) `getCcHomePath` import path — match `setup_panopto.ts`; (3) cross-package `dist/...` import specifiers — match `enrich_panopto_transcripts.ts`; (4) tool-registration schema style in `index.ts` — match neighbors.
