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

- [[index_course_for_answers]] — Build or incrementally update a per-course hybrid (FTS5 + vec) index over enriched lecture transcripts, CDS markdown, slide PDFs (under <courseDir>/slides/), and the canonical FAQ (<courseDir>/answers/canonical.md). Auto-incremental on subsequent calls based on file mtimes. Pass rebuild=true to wipe and re-embed everything (provider switch, suspected corruption).
- [[ask_course]] — Faculty-facing Q&A against the per-course hybrid index. Auto-incrementally re-indexes any changed source files before retrieving. Returns the LLM-generated answer plus citations (with deep-link URLs for transcript chunks where the source platform provided a deepLinkTemplate). Degrades to keyword-only retrieval when the embedding provider is unavailable.
<!-- generated:end -->

# Notes

<!-- Hand-written. The generator regenerates everything above the marker. -->
