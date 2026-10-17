---
id: "transcripts"
kind: "section"
description: "Transcript enrichment, comparison, and week mapping."
ops: 7
related: [ct_setup, ct_import, ct_advanced]
---
# transcripts section

Transcript enrichment, comparison, and week mapping.

## Operations (7)

- [[bulk_fetch_panopto_transcripts]] — Download all Panopto transcripts for a folder as VTT files. Optionally auto-ingests into Curriculum Intelligence. Requires `video.setup_panopto` to be run first.
- [[enrich_panopto_transcripts]] — Enrich Panopto VTT into markdown: Week/Date headers, deep links every 5 min, filler stripped, vocab corrections, key statements as blockquotes. Requires a prior transcripts_panopto run.
- [[setup_transcript_source]] — Configure which transcript source enrichment uses (panopto default, or whisper) plus the Whisper engine, model, and audioMode. action=get reads current config; action=set updates provided fields.
- [[compare_transcripts]] — Opt-in: Whisper-transcribe lecture audio, diff it against the Panopto VTT. Writes .comparison.md per session; returns vocab corrections for approval (none auto-written). Needs audio, prior fetch.
- [[ingest_transcripts]] — Read .vtt/.srt/.md transcript files from a folder and write transcripts.json.
- [[map_transcripts_to_weeks]] — Match each ingested transcript to a course week. Writes week-map.json.
- [[download_transcripts]] — [canvas-backup] Placeholder for future bulk Panopto transcript download.
<!-- generated:end -->

# Notes

<!-- Hand-written. The generator regenerates everything above the marker. -->
