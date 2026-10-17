---
id: "transcript_pipeline"
description: "Panopto transcripts from fetch to answer: bulk download, enrichment, a Whisper cross-check, week mapping, and the lecture-answers index built on top."
related: [ask_course, build_quote_bank, bulk_fetch_panopto_transcripts, compare_transcripts, enrich_panopto_transcripts, extract_lecture_topics, index_course_for_answers, ingest_transcripts, map_transcripts_to_weeks, reembed_course_index, setup_lecture_answers, setup_transcript_source]
---

# The transcript pipeline

Lecture transcripts feed three different consumers — topic analysis, the quote
bank, and the lecture-answers bot — and they all read the *same* two JSON files.
That is the shape of this pipeline: fetch produces VTT files, one ingest step
turns files into `transcripts.json`, and everything downstream reads that instead
of walking a directory. Knowing where the boundary is tells you which step to
re-run when something looks stale.

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
5. [[enrich_panopto_transcripts]] — VTT into readable markdown, in place.
6. [[compare_transcripts]] — optional Whisper cross-check of the Panopto captions.
7. [[map_transcripts_to_weeks]] — attach each transcript to a course week.

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

This is a separate pipeline fed by the enriched markdown:

1. [[setup_lecture_answers]] — pick the embedding provider (auto-detected local
   Ollama, or `transformers-js`/`voyage`) and write
   `lecture-answers-config.json`.
2. [[index_course_for_answers]] — build the hybrid index under
   `<courseDir>/.canvas-toolchain/answers-index/`: `chunks.sqlite` (FTS5),
   `vectors.sqlite` (sqlite-vec), `index-meta.json`, and `chunks/`. Re-indexing is
   **incremental by mtime**, and `rebuild: true` wipes the index root first.
3. [[ask_course]] — auto-re-indexes changed sources, retrieves with FTS5 + vector
   search fused by reciprocal rank, adds a small additive boost to answers that
   came from the canonical FAQ, and returns an answer with citations (transcripts
   carry deep links back into Panopto).
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
- **Steps fail loudly on their prerequisite.** Enrichment and comparison both
  require `_sessions.json` (`MANIFEST_NOT_FOUND` → run bulk fetch first), and both
  require the Panopto config. Comparison additionally needs a *working* local
  Whisper engine and returns `ENGINE_UNAVAILABLE` with setup steps rather than
  silently degrading.
- **Vector dimensions are not interchangeable.** Switching providers forces a
  rebuild because the stored dimension no longer matches; that is why
  [[reembed_course_index]] exists rather than letting you flip a config value.
- **Auto-reindex can fail without failing the question.** [[ask_course]] records
  a re-index failure as a warning and answers from whatever is on disk, falling
  back to keyword-only retrieval when no embedder resolves. Check the retrieval
  mode rather than assuming hybrid search ran.
- **Transcript-backed citations are narrower than they look.** `ask_course`
  citations carry a deep link for transcripts; markdown, slide, and canonical
  chunks carry a source path and reference but no link.
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
  outputs, the no-auto-write rule for corrections.
- `packages/curriculum-intelligence/src/tools/{ingest_transcripts,map_transcripts_to_weeks,extract_lecture_topics,find_off_syllabus_topics,build_quote_bank}.ts`
  — supported extensions, `transcripts.json`/`week-map.json`, what each
  downstream tool reads and writes.
- `packages/command-and-control/src/tools/workflows/{setup_lecture_answers,index_course_for_answers,ask_course,reembed_course_index}.ts`,
  `src/tools/answers/{paths,config}.ts`, `answers/ingest/{orchestrator,discover}.ts`,
  `answers/retrieval/hybrid.ts` — index location and contents, mtime
  incrementality, forced rebuild on dimension change, source discovery, RRF
  fusion, canonical boost, keyword-only fallback.
