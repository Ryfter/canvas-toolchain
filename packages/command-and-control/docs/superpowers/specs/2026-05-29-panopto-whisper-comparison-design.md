# Panopto Whisper Comparison — Design Spec

**Date:** 2026-05-29
**Issue:** #60 (Panopto Sub-project 3 of 5)
**Scope:** An opt-in, off-by-default capability to transcribe Panopto lecture audio locally with a swappable transcription engine (first: `faster-whisper`), compare the result against Panopto's own `.panopto.vtt`, and surface ranked disagreements that the professor arbitrates into `panopto-vocab.json` corrections. Also adds a persistent `transcriptSource` setting so a professor can switch enrichment to use Whisper transcripts instead of Panopto's.

**Depends on:** Sub-project 1 (bulk caption download — ships `.panopto.vtt` + `_sessions.json`) and Sub-project 2 (enrichment + `panopto-vocab.json`). Both shipped.

**Universality (load-bearing):** canvas-toolchain is a universal tool, not a BSU tool. The author's institution (BSU) happens to grant Panopto API access AND enable recording downloads — **most institutions grant neither.** Therefore the baseline assumption for this feature is **no API audio access**: the manual / guided-web-download path (`audioMode`, Decision 6) is the path that must always work, and the API auto-fetch is a bonus accelerator for the minority who have it. Do not optimize for, or assume, the API download path. See `docs/institutions/boise-state.md` for why.

**Out of scope:** answers bot (#61), local LLM (#62), GPU tuning, streaming/real-time transcription, non-English languages, true accuracy scoring (impossible without a human-verified reference — see "No Ground Truth" below).

---

## Design Decisions (from brainstorm 2026-05-29)

1. **Opt-in, off by default.** The normal flow stays caption-download → enrich. Whisper runs only when the professor explicitly invokes it. No Whisper dependency is imposed on anyone who never opts in.
2. **Output is both** a comparison report AND a usable alternative transcript. The professor can stay on Panopto (using the comparison only to harvest vocab corrections) or flip the source to Whisper.
3. **On-demand audio fetch with manual fallback.** Audio is downloaded only for the sessions being transcribed. Panopto's download/podcast capability is admin-gated, so the fetch is best-effort. **Why on-demand:** lecture audio is large (hundreds of MB/hour); storing every session's audio permanently is wasteful when Whisper is an occasional, opt-in step. Fetched audio is deleted after transcription; manually-supplied audio is left alone.
4. **No ground truth → arbitration, not auto-scoring.** Neither transcript is "correct." The tool finds where they disagree, ranks disagreements by how vocabulary-error-shaped they are, and returns suggested corrections for the professor to approve. It never declares an accuracy percentage and never writes to the vocab file on its own. **Why:** without a human-verified reference, any accuracy number would be fiction; the honest, useful output is "here's where they differ — you judge." The professor's judgment is the only authority, and it feeds the existing vocab-correction system rather than a new one.
5. **Local `faster-whisper` via Python bridge, behind a swappable engine interface.** Reuses the existing Python-bridge pattern (Canvas Backup) and the installer's optional Python 3. **Why local over cloud:** lectures may contain student voices (FERPA), $0 cost, and Kevin specified local. **Why the interface:** Kevin's explicit requirement — newer transcription models should swap in without touching the pipeline. The engine is abstracted so `whisper.cpp`, a cloud engine, or a future model is a one-class swap.
6. **`audioMode` setting: `auto` (default) or `manual`, with guided web-interface download.** Because Panopto's API/podcast download is admin-gated and may be blocked entirely at an institution, the manual fallback is a first-class path, not just a degraded one. When audio can't be auto-fetched (or when `audioMode: manual` skips the API attempt entirely), the tool returns **step-by-step instructions to download the recording through the Panopto web viewer** — the direct viewer URL for that session, where the Download control lives, and the exact filename to save it as in the transcripts folder. **Why:** "drop a file named X here" is useless to a professor who doesn't know Panopto exposes downloads or where; a guided per-session walkthrough (with the clickable link) turns the fallback into something a non-technical user can actually complete. `manual` mode is for institutions where the professor already knows the API is blocked and doesn't want the tool wasting a round-trip attempting it.

---

## Architecture

Follows the established three-package split. Panopto domain logic in CDS, analysis in CI, orchestration + config in C&C.

```
C&C: setup_transcript_source        → reads/writes transcript-config.json {source, engine, model}
C&C: compare_transcripts (workflow) → orchestrates an opt-in comparison run
       │
       ├─ CDS: fetchSessionAudio(session, config)         → best-effort Panopto audio download
       │         (on failure → manual-drop fallback path)
       │
       ├─ CI:  TranscriptionEngine.transcribe(audioPath)  → TranscriptCue[]   ← SWAPPABLE
       │         FasterWhisperEngine → Python bridge (whisper_transcribe.py)
       │         writes <stem>.whisper.vtt
       │
       └─ CI:  compareTranscripts(panoptoCues, whisperCues) → ComparisonReport
                 writes <stem>.comparison.md
                 returns suggestedCorrections[] in the MCP result

professor reviews result → approves corrections → C&C setup_panopto_vocab add-correction (existing)
                          → optionally setup_transcript_source --source whisper

C&C: enrich_panopto_transcripts (existing, small change)
       → if transcriptSource == whisper: read <stem>.whisper.vtt (fallback .panopto.vtt + note)
```

No new packages. The transcription engine and comparison logic live in `curriculum-intelligence` (analysis is CI's domain, and issue #60 is CI-labeled). Audio fetch lives in CDS alongside the rest of the Panopto domain code. Orchestration and config lifecycle live in C&C, matching `bulk_fetch_panopto_transcripts` and `enrich_panopto_transcripts`.

---

## The Swappable Transcription Engine (CI)

Mirrors the existing brand-adapter / layout-adapter pattern.

```ts
// packages/curriculum-intelligence/src/transcription/engine.ts

export interface TranscriptCue {
  startSec: number;
  endSec: number;
  text: string;
}

export interface EngineStatus {
  available: boolean;
  engine: string;
  detail: string;          // human-readable status
  setupSteps?: string[];   // shown when available === false
}

export interface TranscribeOptions {
  model: string;           // "tiny" | "base" | "small" | "medium" | "large-v3"
  language?: string;       // default "en"
  vocabHints?: string[];   // fed to faster-whisper initial_prompt to bias recognition
}

export interface TranscriptionEngine {
  readonly name: string;
  isAvailable(): Promise<EngineStatus>;
  transcribe(audioPath: string, opts: TranscribeOptions): Promise<TranscriptCue[]>;
}

// Factory: name → engine. Adding an engine = implement interface + register here.
export function getTranscriptionEngine(name: string): TranscriptionEngine;
```

First (and only initial) implementation: `FasterWhisperEngine` in `src/transcription/faster_whisper_engine.ts`.

- `isAvailable()` — resolves a Python interpreter (`python3`/`python`/`py`, same discovery as the installer's `DetectPython`), checks `faster-whisper` importable and `ffmpeg` on PATH. Returns `setupSteps` when missing (e.g. `["Install Python 3", "pip install faster-whisper", "Install ffmpeg"]`).
- `transcribe()` — spawns the Python bridge:
  ```
  <python> packages/curriculum-intelligence/python/whisper_transcribe.py \
    --audio <audioPath> --model <model> --language en [--initial-prompt "<vocabHints joined>"]
  ```
  The script runs faster-whisper and prints JSON cues to stdout: `[{"start": 4.1, "end": 9.2, "text": "..."}]`. The engine parses that into `TranscriptCue[]`.

`vocabHints` are sourced from the existing `panopto-vocab.json` `corrections[].to` values (the *correct* terms) plus any course glossary, so Whisper is biased toward "COBE" before we even diff.

### Python bridge — `python/whisper_transcribe.py`

Stdlib + `faster-whisper` only. Reads args, transcribes, emits JSON. Exits non-zero with a JSON error object on failure (model download failure, bad audio, etc.). No network except faster-whisper's first-run model fetch (cached under the user's HF cache thereafter).

---

## Audio Fetch (CDS) — best-effort with manual fallback

```ts
// packages/canvas-design-studio/src/tools/panopto-audio.ts

export type AudioMode = 'auto' | 'manual';

export interface AudioFetchResult {
  ok: boolean;
  path?: string;             // local audio path when ok
  source?: 'panopto' | 'manual';
  reason?: 'DOWNLOAD_DISABLED' | 'NOT_FOUND' | 'NETWORK' | 'MANUAL_MISSING';
  viewerUrl?: string;        // direct Panopto viewer link for guided download
  manualInstructions?: string[]; // step-by-step web-download walkthrough when ok === false
}

export async function fetchSessionAudio(
  session: SessionManifestEntry,
  config: PanoptoConfig,
  destDir: string,
  mode: AudioMode = 'auto',
): Promise<AudioFetchResult>;
```

**Attempt order:**
1. **API/podcast download** (skipped entirely when `mode === 'manual'`). Try the authenticated podcast download URL for the session (audio-only podcast if exposed, else video podcast). **IMPLEMENTER MUST VERIFY** the exact endpoint against the institution's Panopto — the download surface is admin-gated and version-dependent; the documented candidate is `https://{domain}/Panopto/Podcast/Download/{sessionId}.mp4?mediaTargetType=audioPodcast` with the bearer token. A 403/404 means downloads are disabled for that session.
2. **Manual file already present.** Look for a professor-supplied audio file in `destDir` whose stem matches the session filename (e.g. `2026-06-01_week-03-tableau-intro.{mp3,m4a,mp4,wav}`). If present, return it with `source: 'manual'`.
3. **Guided web-interface download.** If neither succeeds, return `ok: false` with `viewerUrl` (= `buildViewerUrl(domain, sessionId)`) and a `manualInstructions` array — a per-session walkthrough the orchestrator surfaces to the professor:
   ```
   1. Open the recording: https://{domain}/Panopto/Pages/Viewer.aspx?id={sessionId}
   2. Click the settings/⋯ menu → "Download" (or the download icon below the player).
      If you see no Download option, your Panopto admin has downloads disabled —
      ask them to enable "Make available for download" for this folder, or record
      audio another way.
   3. Save the file, rename it to exactly:  {expected filename stem}.mp3  (or .m4a/.mp4/.wav)
   4. Place it in:  {destDir}
   5. Re-run compare_transcripts.
   ```
   The `{expected filename stem}` is the session's `.panopto.vtt` filename with the suffix stripped, so audio and transcript pair up automatically.

Fetched (non-manual) audio is written to the transcripts dir and deleted after transcription by the orchestrator (Approach C — don't hoard GBs). Manually-supplied audio is never deleted.

`mode` comes from `transcript-config.json.audioMode` (default `auto`). `manual` mode jumps straight to steps 2-3, never touching the API — for institutions where the professor already knows API download is blocked.

---

## Comparison (CI) — alignment, divergence, ranking

```ts
// packages/curriculum-intelligence/src/transcription/compare.ts

export interface Disagreement {
  panopto: string;          // word/phrase from Panopto
  whisper: string;          // word/phrase from Whisper
  occurrences: number;      // identical (panopto→whisper) pairs collapsed
  firstAtSec: number;       // earliest timestamp, for the deep link
  category: 'repeated' | 'caps' | 'known-term' | 'proper-noun' | 'other';
  score: number;            // ranking weight
}

export interface SuggestedCorrection {
  from: string;
  to: string;
  occurrences: number;
  confidence: 'high' | 'medium' | 'low';
}

export interface ComparisonReport {
  sessionId: string;
  title: string;
  divergenceRate: number;        // 0..1, share of aligned words that differ
  totalDisagreements: number;
  likelyVocabCount: number;
  ranked: Disagreement[];
  suggestedCorrections: SuggestedCorrection[];
}

export function compareTranscripts(
  panopto: TranscriptCue[],
  whisper: TranscriptCue[],
  opts: { knownTerms: string[]; fillerWords: string[]; domain: string; sessionId: string; title: string },
): ComparisonReport;
```

**Algorithm:**
1. **Align by time.** For each Panopto cue, gather Whisper cue text whose `[startSec,endSec]` overlaps it. Concatenate per aligned window.
2. **Word diff per window.** Tokenize both sides; run a word-level LCS diff. Substitutions = candidate disagreements (insertions/deletions are noted but weighted low — they're usually segmentation noise, not vocab errors).
3. **Collapse + count.** Group identical `(panoptoWord → whisperWord)` pairs across the whole session; count occurrences.
4. **Filter trivial.** Drop disagreements where either side is a filler word (built-in list + `panopto-vocab.json` fillers), pure punctuation, or a common stopword. These bury the signal.
5. **Categorize + score.** `repeated` (occurs ≥3×) and `caps` (one side ALL-CAPS/acronym) score highest; `known-term` (matches a `panopto-vocab.json` term) and `proper-noun` (capitalized mid-sentence) next; everything else `other`.
6. **Suggest corrections.** Disagreements scoring above a threshold become `SuggestedCorrection`s with `from` = Panopto's text, `to` = Whisper's text. Confidence from occurrences + category. (Direction assumes Panopto is the source being corrected; if `transcriptSource == whisper`, the report notes corrections would apply to the Whisper side instead.)
7. **Divergence rate** = differing aligned words / total aligned words. A relative signal across sessions, explicitly **not** an accuracy grade.

### `.comparison.md` output

Written alongside the VTTs. Per the brainstorm:

```markdown
# Comparison: Week 03 — Tableau Intro
Divergence: 6.2% of words · 41 disagreements · 9 likely vocabulary

| # | Panopto | Whisper | × | When | Category |
|---|---------|---------|---|------|----------|
| 1 | KOBE | COBE | 14 | [→ 4:10](viewer?id=...&start=250) | repeated+caps |
| 2 | tableau | Tableau | 8 | [→ 0:30](viewer?id=...&start=30) | caps |

## Suggested corrections (you approve these — nothing is written automatically)
- `KOBE → COBE` (14×, high)
- `tableau → Tableau` (8×, medium)
```

Deep links use the existing `buildViewerUrl` + `&start=` pattern from `panopto.ts` / the enrichment spec.

---

## Config — `transcript-config.json` (C&C)

Path: `join(getCcHomePath(), 'transcript-config.json')` (env override `CC_HOME`, same as the others).

```json
{ "source": "panopto", "engine": "faster-whisper", "model": "medium", "audioMode": "auto" }
```

- `source`: `"panopto"` (default) | `"whisper"`. Default keeps Whisper fully off; pipeline unchanged for non-opters.
- `engine`: engine name passed to `getTranscriptionEngine`. Default `"faster-whisper"`.
- `model`: default `"medium"` (good vocabulary accuracy at tolerable CPU speed; `small` for speed, `large-v3` for max accuracy).
- `audioMode`: `"auto"` (default) | `"manual"`. `auto` tries API download then falls back to guided web download; `manual` skips the API and goes straight to the guided web-download walkthrough.

### `setup_transcript_source` tool (C&C)

```ts
interface SetupTranscriptSourceInput {
  action: 'get' | 'set';
  source?: 'panopto' | 'whisper';
  engine?: string;
  model?: string;
  audioMode?: 'auto' | 'manual';
}
```

- `get`: return current config (or defaults if file absent — not an error).
- `set`: update provided fields; atomic write (tmp + rename, mode 0o600), same pattern as `setup_panopto`.
- `loadTranscriptConfig()` helper exported for use by `compare_transcripts` and `enrich_panopto_transcripts`. Absent file → defaults, never an error.

---

## Orchestration — `compare_transcripts` workflow (C&C)

```ts
interface CompareTranscriptsInput {
  transcriptsPath: string;     // folder bulk_fetch wrote to
  sessionIds?: string[];       // optional subset; default = all in manifest
  model?: string;              // optional one-run override of config.model
  keepAudio?: boolean;         // default false — delete fetched audio after
}
```

**Flow:**
1. Read `_sessions.json` → `MANIFEST_NOT_FOUND` if absent.
2. `loadPanoptoConfig()` → `PANOPTO_NOT_CONFIGURED` if absent.
3. `loadTranscriptConfig()` for engine + model (input `model` overrides).
4. `engine.isAvailable()` → if not, return early with `setupSteps` (no partial work).
5. `loadPanoptoVocab()` → `knownTerms` = corrections' `to` values; `fillerWords` for filtering; `vocabHints` for the engine.
6. For each selected session:
   - `fetchSessionAudio()` → on `ok:false`, push to `failed[]` with the `manualHint`, continue.
   - `engine.transcribe(audioPath, { model, vocabHints })` → write `<stem>.whisper.vtt`.
   - `compareTranscripts(panoptoCues, whisperCues, …)` → write `<stem>.comparison.md`.
   - Delete fetched (non-manual) audio unless `keepAudio`.
   - Push report summary + its `suggestedCorrections` to the result.
7. Return aggregate: per-session reports, a merged de-duplicated `suggestedCorrections` list (occurrences summed across sessions), and `failed[]`. The merged suggestions are what the professor approves in conversation; Claude then calls `setup_panopto_vocab add-correction` per approved item.

**The tool does not modify `panopto-vocab.json`.** Arbitration stays with the professor.

### Enrichment integration

`enrich_panopto_transcripts` gains one branch: call `loadTranscriptConfig()`; if `source === 'whisper'`, resolve `<stem>.whisper.vtt` instead of `<stem>.panopto.vtt`. If a session has no `.whisper.vtt` (never transcribed), fall back to `.panopto.vtt` and note it in the result's per-session status. Everything else about enrichment is unchanged.

---

## Error Handling

| Failure | Behavior |
|---|---|
| `_sessions.json` absent | `{ error: 'MANIFEST_NOT_FOUND', fix: ['Run bulk_fetch_panopto_transcripts first'] }` |
| `panopto-config.json` absent | `{ error: 'PANOPTO_NOT_CONFIGURED', fix: ['Run setup_panopto first'] }` |
| Engine deps missing (Python/faster-whisper/ffmpeg) | Return early with `EngineStatus.setupSteps`; no sessions processed |
| Panopto audio download disabled (403/404) | Per-session: check for a manual file; if absent, `failed[]` entry carrying `viewerUrl` + `manualInstructions` (guided web-download walkthrough); batch continues |
| `audioMode: manual` | API attempt skipped; manual file used if present, else guided `manualInstructions` returned |
| Manual audio absent | `failed[]` with `viewerUrl` + `manualInstructions`; batch continues |
| faster-whisper model download fails | Per-session `failed[]` with reason; batch continues |
| Transcription throws / empty output | Per-session `failed[]`; batch continues |
| VTT parse error (Panopto or Whisper side) | Per-session `failed[]`; batch continues |
| `transcript-config.json` absent | Use defaults (source=panopto, engine=faster-whisper, model=medium); not an error |
| `transcript-config.json` corrupt | `{ error: 'TRANSCRIPT_CONFIG_CORRUPT', fix: ['Delete transcript-config.json and re-run setup_transcript_source'] }` |
| All sessions fail | Result with empty reports + populated `failed[]`; does not throw |

---

## Testing

Real Whisper is too heavy for unit tests, so the engine interface is the seam: tests inject a `FakeEngine` returning canned cues.

### CI `transcription/compare.test.ts`
- Aligns overlapping-timestamp cues and word-diffs within windows
- `KOBE`/`COBE` repeated 14× → single collapsed disagreement, `occurrences: 14`, category `repeated`/`caps`, high-confidence suggestion
- Filler-word disagreements (`uh` vs ∅) are filtered out, not surfaced
- Stopword/punctuation disagreements filtered
- `divergenceRate` computed over aligned words; empty/no-overlap inputs → 0, no throw
- Suggested-correction direction note flips when `source === whisper`
- `.comparison.md` contains title, divergence line, ranked table with deep links, suggestions block

### CI `transcription/engine.test.ts`
- `getTranscriptionEngine('faster-whisper')` returns the faster-whisper impl
- `getTranscriptionEngine(unknown)` throws a clear error
- `FasterWhisperEngine.isAvailable()` returns `setupSteps` when Python/ffmpeg absent (mock the probes)
- `transcribe()` parses the Python bridge's JSON stdout into `TranscriptCue[]` (mock the subprocess)

### CDS `panopto-audio.test.ts`
- `fetchSessionAudio` returns `source: 'manual'` when a matching local file exists and the download is mocked to fail
- Returns `ok:false` with `viewerUrl` + `manualInstructions` (guided web-download steps naming the exact filename) when both download and manual are absent
- `manual` mode skips the API call entirely (fetch not invoked) and uses a present manual file
- Download success path writes audio to destDir and returns `source: 'panopto'` (mock fetch)

### C&C `setup_transcript_source.test.ts`
- `get` returns defaults when file absent
- `set` writes provided fields atomically; partial updates preserve other fields
- `loadTranscriptConfig` returns defaults when absent, throws `TRANSCRIPT_CONFIG_CORRUPT` on malformed JSON

### C&C `compare_transcripts.test.ts`
- `MANIFEST_NOT_FOUND` / `PANOPTO_NOT_CONFIGURED` short-circuit with no file I/O
- Engine-unavailable short-circuits with `setupSteps`, no audio fetched
- 3-session run with `FakeEngine` + mocked audio fetch: 2 compare successfully, 1 fails (audio missing) — merged suggestions de-duplicated and occurrence-summed
- Fetched audio deleted by default; retained when `keepAudio: true`; manual audio never deleted
- Does not write `panopto-vocab.json`

### C&C `enrich_panopto_transcripts.test.ts` (additions)
- `source === whisper` reads `.whisper.vtt`
- Missing `.whisper.vtt` falls back to `.panopto.vtt` with a per-session note

---

## File Map

| File | Change |
|---|---|
| `packages/curriculum-intelligence/src/transcription/engine.ts` | New — `TranscriptionEngine`, `TranscriptCue`, factory |
| `packages/curriculum-intelligence/src/transcription/faster_whisper_engine.ts` | New — Python-bridge engine |
| `packages/curriculum-intelligence/src/transcription/compare.ts` | New — alignment, divergence, ranking, `.comparison.md` render |
| `packages/curriculum-intelligence/python/whisper_transcribe.py` | New — faster-whisper bridge script |
| `packages/curriculum-intelligence/tests/transcription/*.test.ts` | New — compare + engine tests |
| `packages/canvas-design-studio/src/tools/panopto-audio.ts` | New — `fetchSessionAudio` |
| `packages/canvas-design-studio/tests/panopto-audio.test.ts` | New |
| `packages/command-and-control/src/tools/setup_transcript_source.ts` | New — config + `loadTranscriptConfig` |
| `packages/command-and-control/src/tools/workflows/compare_transcripts.ts` | New — orchestration |
| `packages/command-and-control/src/tools/workflows/enrich_panopto_transcripts.ts` | Modify — `transcriptSource` branch |
| `packages/command-and-control/src/index.ts` | Register `setup_transcript_source`, `compare_transcripts` |
| `packages/command-and-control/tests/...` | New + modified per Testing |

---

## Open Implementation Questions

1. **Panopto audio endpoint** — the exact authenticated download URL must be verified against a real Panopto instance during implementation. If Panopto's REST API exposes no audio download at the institution, the manual-drop fallback becomes the primary path (still fully functional). Implementer: confirm before building the fetch, and if unavailable, lead the UX with the manual instructions rather than the auto-fetch.
2. **Model default** — spec assumes `medium`. If CPU transcription proves too slow on the target hardware, drop the default to `small`. This is a config value, easily changed.
3. **`faster-whisper` vs `openai-whisper`** — spec picks `faster-whisper` (CTranslate2; faster, lighter, same accuracy). If install proves troublesome on Windows, `openai-whisper` is a drop-in alternative behind the same engine interface.
