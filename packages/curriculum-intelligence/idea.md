# Curriculum Intelligence — Idea File

**Started:** 2026-05-17  
**Status:** Brainstorming — not yet scoped or implemented

---

## The Problem It Solves

Every semester, a professor teaching a fast-moving subject like AI-augmented work faces the same set of questions:

- What did I actually teach last semester? (Memory is unreliable — the transcripts know.)
- Is this topic still relevant, or did it age out? (Sam Altman getting fired was a big deal in Fall 2023. By Spring 2025 it's a footnote.)
- What's new in AI that I should be covering that I'm not?
- What can I reuse and what needs to be rebuilt from scratch?
- How do I shift all the assignment dates for the new semester without doing it by hand?

Canvas Design Studio makes the pages look good. This app answers the *what should be on those pages* question.

---

## Vision

A tool that reads past course archives, synthesizes what was actually taught (including from lecture recordings), scores topic currency, and produces a recommended outline and updated course shell for the next semester — ready to hand off to Canvas Design Studio for production.

**Workflow position:** Runs after Canvas Downloader, before Canvas Design Studio.

```
Canvas Downloader → Curriculum Intelligence → Canvas Design Studio
```

---

## Core Capabilities (rough, unordered)

### 1. Past Course Reading
- Read a Canvas export archive or a downloaded course folder
- Extract: week topics, assignment briefs, discussion prompts, quiz questions, resource links
- Build a structured "what was taught" map — one entry per week, per topic, per assignment type

### 2. Lecture Transcript Synthesis
- Ingest Panopto transcript files (downloaded by Canvas Downloader or this app)
- Extract topics actually covered in each lecture
- Identify what was in the syllabus vs. what was actually said in class
- Surface recurring themes, phrases, frameworks the professor used
- Flag lectures that spent significant time on something not in the official materials

### 3. Topic Currency Scoring
- Maintain a topic list across semesters (what was taught when)
- Classify each topic: **evergreen** (prompt engineering fundamentals), **current** (specific model releases), **dated** (specific incidents like Altman removal — fine as a footnote, not a centerpiece)
- Pull from AI news / recent developments to suggest new topics worth adding
- Flag topics that were prominent two semesters ago but are now superseded

### 4. Semester-to-Semester Diff
- Compare two semesters side by side: what was added, what was dropped, what changed in depth
- Show which assignments got reused vs. rewritten
- Track which topics expanded or contracted over time
- Identify patterns: "You've been meaning to cover X for two semesters but keep dropping it"

### 5. Next Semester Planning
- Given past courses and current topic landscape, generate a recommended topic list
- Flag what to keep, what to update, what to drop, what to add
- Suggest which weeks are over-packed and which have room
- Draft updated assignment briefs that reflect current examples

### 6. Shell Update and Date Shifting
- Take an existing Canvas shell and update it for the new semester
- Shift all assignment due dates by the correct number of days/weeks
- Update topic references and current examples in-place
- Output a ready-to-fill course folder for Canvas Design Studio

---

## Panopto — Belongs Here, Not in Canvas Design Studio

Canvas Design Studio currently has three Panopto tools:
- `embed_panopto_video` — stays in Canvas Design Studio (it's a page design tool)
- `search_panopto_videos` — could go either way; useful when building pages
- `fetch_panopto_captions` — **belongs here** — downloading and synthesizing transcripts is curriculum intelligence, not page design

The full Panopto workflow for curriculum purposes:
1. Canvas Downloader (or this app) downloads transcript files in bulk for all lectures in a semester
2. Curriculum Intelligence ingests and synthesizes them
3. Output: topic map, key quote bank, "what you actually taught" summary

Separately, Canvas Design Studio embeds individual videos into pages using `embed_panopto_video` — that stays there.

---

## ITM 370 — Specific Use Case

ITM 370 is AI-Augmented Projects. AI changes faster than any other subject area. The course needs to:
- Retire examples that are now historical (specific GPT-3 limitations, early ChatGPT novelty demos)
- Update examples with current capabilities
- Add topics that didn't exist when the course was last revised
- Decide which "current events" moments are worth keeping as case studies vs. dropping

This tool should be able to look at the full ITM 370 archive, produce a topic evolution timeline, and give Kevin a defensible recommendation for what the course should look like this semester — not just what it looked like last semester.

---

## Open Questions (to resolve during design)

1. **Where do the raw files live?** Google Drive? Local disk? Both?
2. **Is this an MCP server, a standalone CLI, a web app, or something else?**
3. **Does this connect to any external news/trend sources, or is it purely retrospective?** (If news: which sources? RSS? Perplexity? Google Trends?)
4. **How opinionated should the "drop this topic" recommendations be?** Some professors want data, not opinions. Others want the tool to tell them what to do.
5. **Does this replace the course planning conversation with Claude, or enhance it?** (Likely: provides structured context so that conversation is much richer)
6. **Does the Canvas shell update happen here or in Canvas Design Studio?** (Current lean: here — this app knows the content, Design Studio just handles presentation)

---

## What This Is Not

- Not a page design tool — that's Canvas Design Studio
- Not a Canvas publisher — that's Canvas Design Studio
- Not a raw file downloader — that's Canvas Downloader (though transcript fetching might live here or there)
- Not an LMS replacement — it reads Canvas data, it doesn't run courses

---

## Relationship to the Other Apps

| App | Job | Inputs | Outputs |
|-----|-----|--------|---------|
| Canvas Downloader | Get the data | Canvas API, Panopto API | Local files, Google Drive |
| **Curriculum Intelligence** | **Understand the data** | **Course archives, transcripts** | **Topic map, recommendations, updated shell** |
| Canvas Design Studio | Make it look good | Content briefs, topic outlines | Polished Canvas HTML, published pages |
