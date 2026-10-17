---
id: "ct_import"
kind: "intent"
description: "Bring course data in: Canvas archives, transcripts, prior shells."
ops: 7
related: [transcripts]
---
# ct_import (intent tool)

Bring course data in: Canvas archives, transcripts, prior shells.

## Operations (7)

- [[bulk_fetch_panopto_transcripts]] — Download all Panopto transcripts for a folder as VTT files. Optionally auto-ingests into Curriculum Intelligence. Requires `video.setup_panopto` to be run first.
- [[ingest_canvas_archive]] — Read a Canvas export folder for one semester and write a structured topic-map.json.
- [[ingest_transcripts]] — Read .vtt/.srt/.md transcript files from a folder and write transcripts.json.
- [[import_previous_shell]] — Copy last semester's content into next-plan/ with CI front matter.
- [[download_canvas_archive]] — [canvas-backup] Archive a Canvas course shell locally by invoking the Canvas Backup CLI.
- [[download_transcripts]] — [canvas-backup] Placeholder for future bulk Panopto transcript download.
- [[import_course]] — [@canvas-toolchain/canvas-design-studio] Import a Canvas Backup archive into a Canvas Design Studio course folder.
<!-- generated:end -->

# Notes

<!-- Hand-written. The generator regenerates everything above the marker. -->
