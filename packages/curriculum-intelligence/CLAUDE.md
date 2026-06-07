# Curriculum Intelligence — Claude Code Instructions

## Project Purpose

This project is a **Curriculum Intelligence MCP Server** — a tool for analyzing past course archives, scoring topic currency, and planning the next semester.

It's part of a three-app toolchain built for fast-moving courses:

```text
Canvas Backup archive
  -> Curriculum Intelligence analysis and next-plan
  -> Canvas Design Studio course folder
  -> Canvas-safe HTML
  -> optional Canvas publishing
```

CI specializes in:
- **Ingesting** past Canvas archives and lecture transcripts
- **Analyzing** what was taught, what aged out, and what's new
- **Planning** the next semester's curriculum with updated materials and recommended updates
- **Scoring** topic currency (evergreen vs. current vs. dated)

CI feeds its output (course plan, topic recommendations, updated material briefs) to Canvas Design Studio, which generates the presentation layer.

---

## MCP Tools Overview

CI exposes 27 MCP tools. Key categories:

| Category | Tools |
|---|---|
| Setup & ingest | `setup_course`, `get_course_state`, `ingest_canvas_archive` |
| Analysis | `list_assignments`, `list_pages`, `list_modules`, `list_resources`, `diff_semesters` |
| Transcripts | `ingest_transcripts`, `map_transcripts_to_weeks`, `extract_lecture_topics`, `find_off_syllabus_topics`, `build_quote_bank` |
| Currency signals | `fetch_news_feed`, `scan_recent_developments`, `suggest_topics`, `score_topic_currency`, `recommend_for_topic` |
| Output | `generate_ideas_file`, `generate_recommended_outline`, `draft_assignment_brief`, `import_previous_shell`, `shift_dates`, `update_examples`, `export_course_folder` |

See `README.md` for full details.

---

## Hard Rules for CI Data Processing

1. **Preserve front matter across analysis steps** — if a page or assignment already has metadata (from Canvas or prior CI runs), do not discard it
2. **Degrade gracefully on parse failures** — per-item failures should warn but not crash the whole pipeline
3. **Atomic writes** — if a file write fails, the command should fail before updating any state on disk
4. **Never overwrite user edits without a lock** — see "Content Priority Tiers" section below
5. **Always document data origins** — if a recommendation comes from a feed, news scan, or lecture analysis, tag it

---

## Typical Workflow

```
1. setup_course               → register ITM370
2. ingest_canvas_archive     → parse Spring2025 export
3. ingest_canvas_archive     → parse Fall2024 export (for diff)
4. diff_semesters            → what changed between semesters?
5. ingest_transcripts        → load .vtt files from Canvas Downloader
6. map_transcripts_to_weeks
7. find_off_syllabus_topics  → what did the lecture cover beyond the syllabus?
8. build_quote_bank          → pull notable lines for course materials
9. fetch_news_feed           → pull Simon Willison, AI news blogs
10. scan_recent_developments → ask Claude what's new in "Prompt engineering"
11. suggest_topics           → merge signals into ranked candidates
12. score_topic_currency     → classify each topic
13. recommend_for_topic      → get KEEP/UPDATE/DROP/ADD verdicts
14. generate_ideas_file      → capture what to build next
15. generate_recommended_outline → draft next-semester module sequence
16. draft_assignment_brief   → redraft assignment with updated context
17. export_course_folder     → write to Design Studio course folder
```

---

## Content Priority Tiers (#66)

`analyze_course` accepts an optional `courseDir` input. When provided, after the
existing trajectory analysis, the tier-assignment phase iterates the CDS course
folder's `*.md` pages (excluding `course-config.md`), splits each into H2/H3
sections, and calls the configured LLM to assign:

- `tier`: 1 (at-a-glance), 2 (working-detail), or 3 (deep-support)
- `summary`: one-line, max 12 words

Results write to each page's front matter as a `tiers:` block. Set
`tiers.locked: true` to preserve manual edits — re-analysis skips locked pages.

Failures degrade gracefully: per-section validation drops the section + warns,
per-page failures skip the page + warn. Atomic writes throughout.
