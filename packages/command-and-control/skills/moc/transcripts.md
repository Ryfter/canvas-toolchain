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
- [[enrich_panopto_transcripts]] — Generate enriched markdown from downloaded Panopto VTT files. Adds Week/Date headers, deep links every 5 minutes, strips filler words, applies vocab corrections, and highlights key statements as blockquotes. Requires `ct_import` action `transcripts_panopto` to have been run first.
- [[setup_transcript_source]] — Configure which transcript source enrichment uses (panopto default, or whisper) plus the Whisper engine, model, and audioMode. action=get reads current config; action=set updates provided fields.
- [[compare_transcripts]] — Opt-in: transcribe Panopto lecture audio locally with Whisper and compare it against the Panopto VTT. Writes a .comparison.md per session ranking disagreements, and returns suggested vocab corrections for you to approve (nothing is written to panopto-vocab.json automatically). Needs audio — auto-fetched when available, otherwise follow the returned guided web-download instructions. Requires `ct_import` action `transcripts_panopto` first.
- [[ingest_transcripts]] — Read .vtt/.srt/.md transcript files from a folder and write transcripts.json.
- [[map_transcripts_to_weeks]] — Match each ingested transcript to a course week. Writes week-map.json.
- [[download_transcripts]] — [canvas-backup] Placeholder for future bulk Panopto transcript download.
<!-- generated:end -->

# Notes

<!-- Hand-written. The generator regenerates everything above the marker. -->
