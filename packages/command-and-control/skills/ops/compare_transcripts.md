---
id: "compare_transcripts"
description: "Opt-in: transcribe Panopto lecture audio locally with Whisper and compare it against the Panopto VTT. Writes a .comparison.md per session ranking disagreements, and returns suggested vocab corrections for you to approve (nothing is written to panopto-vocab.json automatically). Needs audio — auto-fetched when available, otherwise follow the returned guided web-download instructions. Requires `ct_import` action `transcripts_panopto` first."
section: "transcripts"
intent_tool: ""
intent_action: ""
exposure: "advanced"
related: [bulk_fetch_panopto_transcripts, enrich_panopto_transcripts, setup_transcript_source, ingest_transcripts, map_transcripts_to_weeks, download_transcripts]
---
<!-- generated:end -->

# compare_transcripts

## When to use

<!-- Hand-written guidance starts here. The generator only rewrites the frontmatter above the marker. -->

## Pitfalls
