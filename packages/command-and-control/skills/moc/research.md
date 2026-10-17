---
id: "research"
kind: "section"
description: "News feeds, recent developments, quote banks, calendars."
ops: 12
related: [ct_analyze, ct_advanced]
---
# research section

News feeds, recent developments, quote banks, calendars.

## Operations (12)

- [[analyze_course]] — Answer "how stale is my course?" — ingests the Canvas archive, scores topic currency, and generates KEEP/UPDATE/DROP/ADD verdicts in one step.
- [[brainstorm_interactive]] — Propose interactive Canvas widget concepts for a topic + learning goal: 2-3 specs (kind, purpose, content schema, sample data, accessibility notes) with rationale. Returns SPECS only. Needs Anthropic.
- [[extract_lecture_topics]] — Return lecture chunks shaped for the model to reason over.
- [[find_off_syllabus_topics]] — Compare lecture transcripts against module/page text and return novel tokens.
- [[build_quote_bank]] — Scan lecture transcripts for notable lines. Writes quote-bank.json.
- [[fetch_news_feed]] — Fetch RSS/Atom feeds and return recent items filtered by date.
- [[scan_recent_developments]] — Ask the model what's new in a given topic area since a date.
- [[suggest_topics]] — Merge RSS feed items and LLM scan developments into ranked topic candidates. Reads news-cache.json if no inline items are supplied.
- [[score_topic_currency]] — Classify a topic as evergreen / current / dated using news-hit count and how recently it was taught.
- [[recommend_for_topic]] — Return a KEEP / UPDATE / DROP / ADD verdict for a topic based on its currency class and teaching history.
- [[generate_ideas_file]] — Write ideas.md with follow-on development ideas based on what the professor used.
- [[fetch_academic_calendar]] — Parse registrar URL or accept manual dates into calendar.json.

## Concepts (2)

- [[semester_rollover]] — Rolling a course into a new semester: archive and ingest ...
- [[transcript_pipeline]] — Panopto transcripts from fetch to answer: bulk download, ...
<!-- generated:end -->

# Notes

<!-- Hand-written. The generator regenerates everything above the marker. -->
