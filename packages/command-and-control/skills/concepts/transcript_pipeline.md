---
id: "transcript_pipeline"
description: "Panopto transcripts from fetch to answer: bulk download, enrichment, a Whisper cross-check, week mapping, and the lecture-answers index built on top."
related: [ask_course, build_quote_bank, bulk_fetch_panopto_transcripts, compare_transcripts, enrich_panopto_transcripts, extract_lecture_topics, find_off_syllabus_topics, index_course_for_answers, ingest_transcripts, reembed_course_index]
---

# The transcript pipeline

Lecture transcripts feed three consumers — topic analysis, the quote bank, and
the lecture-answers bot. The first two read the ingested `transcripts.json` and
`week-map.json`; the answers bot reads neither, discovering its own inputs by
walking the configured transcript sources. That is the shape of this pipeline:
fetch produces VTT files, one ingest step turns files into `transcripts.json`, and
the two analysis consumers read that instead of walking a directory. Knowing
where the boundary is tells you which step to re-run when something looks stale.

## The order that works

1. **Panopto credentials.** `video.setup_panopto` (module `video`) writes
   `~/.command-and-control/panopto-config.json` and validates them with an OAuth2
   client-credentials call. It is a plug-in operation, not a core one — see
   [[module_channel]] — and its id is host-namespaced as `video.setup_panopto`.
2. [[setup_transcript_source]] — choose what enrichment reads: `panopto` (default)
   or `whisper`, plus the Whisper engine/model and `audioMode`. Written to
   `transcript-config.json`; `action: "get"` reads it back.
3. [[bulk_fetch_panopto_transcripts]] — download every session in a folder.
4. [[ingest_transcripts]] — turn files into course data.
5. [[compare_transcripts]] — optional Whisper cross-check of the Panopto captions;
   writes `<stem>.whisper.vtt`.
6. [[enrich_panopto_transcripts]] — VTT into readable markdown, in place. When the
   configured source is `whisper` it reads the `.whisper.vtt` step 5 wrote;
   otherwise it falls back to the Panopto VTT with an explicit note.
7. [[map_transcripts_to_weeks]] (**internal** — runs inside [[analyze_course]], not
   callable directly) — attach each transcript to a course week.

Before indexing for Q&A, optionally run [[extract_lecture_topics]],
[[find_off_syllabus_topics]], and [[build_quote_bank]] off the same ingested data.

## Where things land

- [[bulk_fetch_panopto_transcripts]] writes **flat into `outputPath`**:
  `<YYYY-MM-DD>_<slug>.panopto.vtt` per session, plus `_sessions.json` describing
  them. Its `outputPath` is the folder every later step points at. Passing both
  `courseId` and `semesterId` auto-ingests the result ([[ingest_transcripts]]);
  without them, fetching and ingesting stay separate.
- [[ingest_transcripts]] reads `.vtt`, `.srt`, and `.md` — **non-recursively** —
  and writes `transcripts.json` in the semester folder.
- [[map_transcripts_to_weeks]] (internal) reads `transcripts.json` and the topic
  map and writes `week-map.json` beside it. Week matching comes from a filename
  week hint or a date hint against the term start.
- [[enrich_panopto_transcripts]] writes `<stem>.enriched.md` next to each VTT. It
  prefers `<stem>.whisper.vtt` when the configured source is `whisper`, and
  otherwise falls back to the Panopto VTT with an explicit note.
- [[compare_transcripts]] writes `<stem>.whisper.vtt` and
  `<stem>.comparison.md` per session.
- [[extract_lecture_topics]] returns lecture text (read-only);
  [[find_off_syllabus_topics]] writes `off-syllabus.json`;
  [[build_quote_bank]] writes `quote-bank.json`. All three read the ingested
  `transcripts.json`, not a transcript folder.

## The lecture-answers half

This is a separate pipeline, and its input format is narrower than it looks. The
index discovers `*.enriched.md` under its configured transcript sources, but
`chunkTranscript` only splits transcript bodies made of `[MM:SS] text` lines plus
`deepLinkTemplate` frontmatter — so the markdown `enrich_panopto_transcripts`
currently emits (headings, prose, `[→ MM:SS](url)` links, no frontmatter) yields
**0 transcript chunks** and never populates a deep link.

1. [[setup_lecture_answers]] — pick the embedding provider (auto-detected local
   Ollama, or `transformers-js`/`voyage`) and write
   `lecture-answers-config.json`.
2. [[index_course_for_answers]] — build the hybrid index under
   `<courseDir>/.canvas-toolchain/answers-index/`: `chunks.sqlite` (FTS5),
   `vectors.sqlite` (sqlite-vec), `index-meta.json`, and `chunks/`. Re-indexing is
   **incremental by mtime**, and `rebuild: true` wipes the index root first.
3. [[ask_course]] — auto-reindexes changed sources, retrieves with FTS5 + vector
   search fused by reciprocal rank, adds a small additive boost to answers that
   came from the canonical FAQ, and returns an answer with citations. A chunk
   carries a deep link only when its frontmatter supplies `deepLinkTemplate` and
   `sourceId`.
4. [[reembed_course_index]] — switch embedding provider and rebuild in one call.

The index discovers its inputs, not a single folder: `*.enriched.md` under the
configured transcript sources (default `~/.curriculum-intelligence/panopto/<courseId>`),
course markdown under the course folder, slide PDFs under `slides/`, and
`answers/canonical.md` — which is chunked separately and gets the retrieval boost.

## Pitfalls

- **`panopto-vocab.json` is never auto-written.** Enrichment only *reads*
  `~/.command-and-control/panopto-vocab.json`; the module operation
  `video.setup_panopto_vocab` is its only writer. [[compare_transcripts]] returns
  `suggestedCorrections` for you to approve — nothing is merged for you.
- **The ingest is not recursive.** Files in subfolders of the folder you pass are
  ignored. Also note the answers index reads `*.enriched.md` from *its own*
  configured sources, so enriching in a scattered layout means either copying
  files into place or passing `transcriptSources` explicitly.
- **Re-ingesting after enrichment double-counts.** `ingest_transcripts` accepts
  `.md`, so re-running it over a folder you already enriched picks up each
  `.enriched.md` as an extra `'unknown'`-source transcript.
- **Steps fail loudly on their prerequisite.** Enrichment and comparison both
  require `_sessions.json` (`MANIFEST_NOT_FOUND` → run bulk fetch first), and both
  require the Panopto config. Comparison additionally needs a *working* local
  Whisper engine and returns `ENGINE_UNAVAILABLE` with setup steps rather than
  silently degrading.
- **Vector dimensions are not interchangeable.** Switching providers forces a
  rebuild, because `ingestCourse` detects that the stored dimension no longer
  matches and wipes the index. [[reembed_course_index]] just does the config flip
  and a forced rebuild in one call.
- **Auto-reindex can fail without failing the question.** [[ask_course]] records
  a re-index failure as a warning and answers from whatever is on disk, falling
  back to keyword-only retrieval when no embedder resolves. Check the retrieval
  mode rather than assuming hybrid search ran.
- **Citations are path-based unless the source has frontmatter.** A chunk carries
  a deep link only when its transcript frontmatter supplies `deepLinkTemplate` and
  `sourceId`; markdown, slide, and canonical chunks carry a source path and
  reference but no link.
- **`compare_transcripts` deletes audio it fetched, not audio you gave it.**
  `keepAudio` defaults to false and only applies to Panopto-fetched audio.

## Sources

- `packages/module-video/src/tools.ts`, `src/panopto/{setup,client,enrich,vocab}.ts`
  — the Panopto module operations, VTT filenames and `_sessions.json`, enrichment
  output, the vocab file and its writer.
- `packages/command-and-control/src/surface/module_adapter.ts` — the host
  namespacing that produces `video.*` ids.
- `packages/command-and-control/src/tools/setup_transcript_source.ts` — config
  fields, defaults, and file location.
- `packages/command-and-control/src/tools/workflows/{bulk_fetch_panopto_transcripts,enrich_panopto_transcripts,compare_transcripts}.ts`
  — prerequisite errors, `MANIFEST_NOT_FOUND`, `.enriched.md`/`.comparison.md`
  outputs, the no-auto-write rule for corrections, the whisper/panopto source
  choice.
- `packages/curriculum-intelligence/src/tools/{ingest_transcripts,map_transcripts_to_weeks,extract_lecture_topics,find_off_syllabus_topics,build_quote_bank}.ts`
  — supported extensions, `transcripts.json`/`week-map.json`, what each
  downstream tool reads and writes.
- `packages/command-and-control/src/tools/workflows/{setup_lecture_answers,index_course_for_answers,ask_course,reembed_course_index}.ts`,
  `src/tools/answers/{paths,config}.ts`, `answers/ingest/{orchestrator,discover}.ts`,
  `answers/chunking/transcript.ts`, `answers/retrieval/hybrid.ts` — index location
  and contents, mtime incrementality, forced rebuild on dimension change, source
  discovery, the `[MM:SS]` chunk format and `deepLinkTemplate` requirement, RRF
  fusion, canonical boost, keyword-only fallback.
