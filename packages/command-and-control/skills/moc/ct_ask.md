---
id: "ct_ask"
kind: "intent"
description: "Index a course and answer questions from its own materials."
ops: 2
related: [admin]
---
# ct_ask (intent tool)

Index a course and answer questions from its own materials.

## Operations (2)

- [[index_course_for_answers]] — Build/update a per-course hybrid (FTS5 + vec) index over transcripts, CDS markdown, slides/ PDFs, and answers/canonical.md. Incremental by mtime; rebuild:true wipes and re-embeds all.
- [[ask_course]] — Faculty Q&A over the course hybrid index: auto-reindexes changed sources, returns an LLM answer + citations (deep links where available), falling back to keyword-only if the embedder is missing.

## Concepts (1)

- [[transcript_pipeline]] — Panopto transcripts from fetch to answer: bulk download, ...
<!-- generated:end -->

# Notes

<!-- Hand-written. The generator regenerates everything above the marker. -->
