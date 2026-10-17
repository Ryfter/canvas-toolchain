---
id: "ct_analyze"
kind: "intent"
description: "Find what is stale: topic currency, semester diffs, off-syllabus drift."
ops: 6
related: [research]
---
# ct_analyze (intent tool)

Find what is stale: topic currency, semester diffs, off-syllabus drift.

## Operations (6)

- [[analyze_course]] — Answer "how stale is my course?" — ingests the Canvas archive, scores topic currency, and generates KEEP/UPDATE/DROP/ADD verdicts in one step.
- [[diff_semesters]] — Compute a side-by-side diff between two ingested semesters.
- [[extract_lecture_topics]] — Return lecture chunks shaped for the model to reason over.
- [[find_off_syllabus_topics]] — Compare lecture transcripts against module/page text and return novel tokens.
- [[suggest_topics]] — Merge RSS feed items and LLM scan developments into ranked topic candidates. Reads news-cache.json if no inline items are supplied.
- [[score_topic_currency]] — Classify a topic as evergreen / current / dated using news-hit count and how recently it was taught.
<!-- generated:end -->

# Notes

<!-- Hand-written. The generator regenerates everything above the marker. -->
