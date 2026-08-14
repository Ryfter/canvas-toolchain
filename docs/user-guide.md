# Canvas Toolchain — User Guide & Tutorial

> A narrative, end-to-end guide: **what you can do**, **how to use it**, a **hands-on tutorial**, and a task-by-task command catalog where every command gets *what it is · how it works · why you'd use it*.
>
> Companion docs: the [Commands & Credentials reference](commands-and-credentials.md) is the dry lookup table; the [Module view](architecture-modules.md) explains the code's building blocks; the [Visual guide](visual-guide/README.md) is the picture-first tour. **This document is the one to read first if you want to actually use the toolchain.**

---

## Table of contents

1. [What this is, in one minute](#1-what-this-is-in-one-minute)
2. [What you can do with it](#2-what-you-can-do-with-it)
3. [How you actually talk to it](#3-how-you-actually-talk-to-it)
4. [Install & first-run setup](#4-install--first-run-setup)
5. [Tutorial: refresh a course end to end](#5-tutorial-refresh-a-course-end-to-end)
6. [The command catalog (what · how · why)](#6-the-command-catalog-what--how--why)
7. [Common recipes](#7-common-recipes)
8. [Where your data and credentials live](#8-where-your-data-and-credentials-live)
9. [Troubleshooting](#9-troubleshooting)

---

## 1. What this is, in one minute

Canvas Toolchain helps a professor **refresh a Canvas LMS course every semester** instead of rebuilding it by hand. It reads last semester's course, tells you what's gone stale, helps you plan and rewrite the new semester, turns your drafts into polished Canvas-safe web pages, and (optionally) pushes them straight into Canvas — with a one-click rollback if you change your mind.

The flow it automates:

```text
Canvas Backup archive                         download last semester's shell
   →  Canvas Toolchain — Curriculum Intelligence   analyze what's stale · plan next semester
   →  Canvas Toolchain — Design Studio             generate beautiful, Canvas-safe HTML
   →  Canvas-safe HTML
   →  optional Canvas publishing                   push pages back to Canvas (or paste by hand)
```

**Two promises that shape everything:**

- **Publishing to Canvas is always optional.** With zero credentials you can still download, analyze, plan, and generate HTML — then paste it into Canvas yourself. The "generate-and-paste" path is first-class forever.
- **Your local course folder is the source of truth.** The toolchain reads and writes plain files on your disk. Cloud services (Canvas, Anthropic, Panopto, etc.) are optional enhancements layered on top.

---

## 2. What you can do with it

Think in terms of goals, not tools. Here's the full surface area, grouped by what you're trying to accomplish:

| You want to… | The toolchain gives you |
| --- | --- |
| **Get last semester's course onto your machine** | A structured local archive of every page, assignment, quiz, module, and file (`download_canvas_archive`), then an importable course folder (`import_course` / `ingest_canvas_archive`). |
| **Know what's out of date** | A staleness report that scores every topic *evergreen / current / dated* and emits a **KEEP / UPDATE / DROP / ADD** verdict per item (`analyze_course`), plus a multi-semester churn history (`get_course_trajectory`). |
| **Plan the new semester** | Auto-imported prior shell, academic-calendar-aware due-date shifting, and a generated week-by-week outline (`plan_next_semester`). |
| **Rewrite assignments and examples** | LLM-drafted assignment briefs and a two-pass "update the stale examples" sweep (`update_course_materials`). |
| **Make it look good in Canvas** | Canvas-safe HTML pages with your brand colors and accessibility baked in (`generate_course` from C&C). Design critique and auto-redesign (`critique_canvas_page`, `redesign_canvas_page`) require the Design Studio server. |
| **Add interactive elements** | Brainstorm interactive widget concepts and render them to embeddable Canvas widgets (`brainstorm_interactive`, `render_widget`, `publish_widget`). |
| **Work with lecture video** | Pull Panopto transcripts, enrich them into readable markdown with deep links, and embed videos accessibly (`bulk_fetch_panopto_transcripts`, `enrich_panopto_transcripts`, `video_embed`). |
| **Compare auto-captions to reality** | Locally re-transcribe lecture audio with Whisper and diff it against Panopto's captions (`compare_transcripts`). |
| **Answer "where did I cover X?"** | A private Q&A bot over your own transcripts, slides, and pages, with deep-linked citations (`setup_lecture_answers`, `ask_course`). |
| **Publish safely** | Preview every change as a diff, approve page-by-page, publish, and roll back from a snapshot if needed (`preview_course_publish`, `publish_course`, `rollback_course_publish`). |
| **Tag AI policy on assignments** | Per-page AI Assessment Scale labels (levels 1–5) rendered as inline callouts (`set_course_aias_default`). |
| **See course health at a glance** | A local read-only dashboard scoring each course green/yellow/red on freshness and transcript coverage (`open_dashboard`). |
| **Reuse templates & themes** | A resource registry for installing/sharing templates, themes, prompts, and brand adapters (`search_registry`, `install_resource`). |
| **Extend the toolchain** | Opt-in plug-in modules (Lecture Video, Oral Assessment, Group Builder, Roster & Identity Manager, PeerAssessment Export); enable/disable without reinstalling (`list_modules`, `set_module_enabled`). |

You don't have to use all of it. Most professors live in three or four commands. The tutorial below walks the **golden path**; section 6 documents everything.

---

## 3. How you actually talk to it

There is **no command line to memorize.** Every capability is an **MCP tool**, and you invoke it by talking to an AI client in plain English. You say *"analyze how stale my ITM 310 course is from last fall's archive,"* and the client picks the matching tool (`analyze_course`) and fills in the parameters from your sentence.

- **Single entry point:** **Canvas Toolchain — Command & Control (C&C)** MCP server (`npx canvas-toolchain` / the installer). C&C re-exports Curriculum Intelligence's tools and **exactly two** Design Studio tools — `import_course` and `generate_course`. The rest of Design Studio is only reachable by connecting the **Canvas Design Studio** MCP server separately. Do not add more passthroughs here — that is issue #151 (design pending).
- **Works in any MCP-capable client.** The installer auto-wires Claude Desktop, Claude Code, Codex CLI, Gemini CLI, Cursor, VS Code, Kiro, and Antigravity. Any other MCP-capable client works via the manual JSON snippet in the README — it is not auto-wired.
- **The tools have descriptions.** Your AI client reads them, so you rarely need exact tool names — but this guide lists them so you can be explicit when you want to ("use `preview_course_publish`, not `publish_course`").

When a command needs a credential you haven't set up, it tells you exactly which `setup_*` tool to run first and degrades gracefully where it can (e.g., analysis still runs offline, just with less web-currency signal).

---

## 4. Install & first-run setup

### Install

Download the native installer (Windows x64 / macOS arm64) from [Releases](https://github.com/Ryfter/canvas-toolchain/releases). The five-screen wizard bundles Node, the toolchain, and an auto-updater, and wires C&C into your AI client. Screen 3 optionally collects credentials (all masked, all optional).

### First-run setup (in your AI client)

The absolute minimum is **nothing** — you can import and generate with zero credentials. To unlock the AI-powered and publishing features, run these once by asking your client:

```text
setup_cc          { mode: "easy" }                 # one-time top-level config; run first
setup_anthropic   { apiKey: "sk-ant-..." }          # unlocks LLM drafting/analysis/rubrics
setup_canvas      { host: "school.instructure.com", token: "..." }   # unlocks direct publishing
```

Optional, only if you need them:

```text
setup_panopto         { domain, clientId, clientSecret }   # Lecture Video module
setup_ollama          { baseUrl: "http://localhost:11434", model: "..." }   # local LLM instead of Anthropic
setup_lecture_answers { provider: "ollama" }               # the course Q&A bot
```

Every credential is **validated against the live service before it's saved**, written to `~/.command-and-control/` with `0o600` (owner-only) permissions, and **never echoed back**. See [section 8](#8-where-your-data-and-credentials-live) and the [credentials reference](commands-and-credentials.md#3-api-keys--secrets--what-s-asked-for-and-why).

Check everything is wired up:

```text
get_cc_status     # shows which packages, keys, and providers are live
```

---

## 5. Tutorial: refresh a course end to end

This is the **golden path** — the workflow the whole toolchain is built around. We'll refresh a fictional *ITM 310* course from last fall (`fall-2025`) into next fall (`fall-2026`). Type each step to your AI client in plain English; the tool it calls is shown in `code`.

> **Setup assumed:** you've run `setup_anthropic` (for the LLM steps) and, if you want to publish at the end, `setup_canvas`. Skip those and the generate-and-paste path still works.

### Step 1 — Get last semester onto disk

> *"Download my Canvas course 20255 as the fall-2025 archive."*
> → `download_canvas_archive`

This runs the Python Canvas Backup downloader and writes a structured archive (pages, assignments, quizzes, modules, files) to a local folder. **Why:** everything downstream reads from this local archive, not from Canvas live — so it's fast, repeatable, and offline-safe.

### Step 2 — See what's stale

> *"Analyze how stale ITM 310 is, using that fall-2025 archive."*
> → `analyze_course`

You get a report: each topic scored *evergreen / current / dated*, with a **KEEP / UPDATE / DROP / ADD** verdict and rationale. **Why:** this is the heart of the tool — it turns "I should probably update this someday" into a concrete, prioritized worklist. (Have lecture transcripts? Ingest them first with `ingest_transcripts` so analysis can spot topics you covered in lecture that never made it onto the syllabus.)

### Step 3 — Plan the new semester

> *"Plan ITM 310 for fall-2026 from fall-2025. The academic calendar is at <url>."*
> → `plan_next_semester`

This imports the prior shell into a `next-plan/` working folder, fetches the academic calendar, **shifts every due date** onto the new term (handling holidays/breaks), and drafts a week-by-week outline. **Why:** date-shifting by hand across 15 weeks and three sections is the single most error-prone part of a refresh. This does it deterministically.

### Step 4 — Update the materials

> *"Update my assignment materials and export them."*
> → `update_course_materials`

For every assignment, the LLM drafts an updated brief and runs a two-pass examples sweep (fixing year references and renamed tools first, then flagging deeper staleness for your review). It exports the approved plan into a CDS-ready `course/` folder. **Why:** it does the tedious "find every `2024` and every dead product name" work, while leaving judgment calls to you.

### Step 5 — Generate Canvas-safe HTML

> *"Generate the whole course."*
> → `generate_course`

Turns your `course/` folder of markdown into polished, **Canvas-safe HTML** — your brand colors, TL;DR cards, AI-policy callouts, accessible markup, all applied automatically. **Why:** Canvas's editor silently strips much of what normal HTML/CSS does; this generates markup that survives Canvas's sanitizer and passes WCAG 2.1 AA.

Optionally, sharpen the look — these two tools live on the **Design Studio** server, not C&C:

> *"Critique the week 1 overview page, then apply the fixes."*
> → `critique_canvas_page` → `redesign_canvas_page` *(Design Studio only)*

### Step 6 — Preview the publish

> *"Preview publishing this course folder to Canvas course 20255."*
> → `preview_course_publish`

You get a **per-page diff**, a list of warnings, and a manifest — and **nothing is written to Canvas yet.** **Why:** you see exactly what would change before a single page moves. This is your safety gate.

### Step 7 — Publish, with approvals

> *"Publish that preview — approve the week 1 and week 2 pages, skip the syllabus."*
> → `publish_course`

Publishes only the entries you approve, stopping on the first failure, and saving a **snapshot** of the prior Canvas state. **Why:** page-by-page approval means you're never surprised, and the snapshot is what makes the next step possible.

### Step 8 — Roll back if needed

> *"Roll back that last publish."*
> → `rollback_course_publish`

Restores every published page to its prior Canvas state from the snapshot. **Why:** the entire publish path is reversible — which is what makes it safe to use on a live course.

That's the full loop. Everything else in section 6 is either a richer version of one of these steps or an optional capability (video, Q&A, widgets, registry) layered alongside.

---

## 6. The command catalog (what · how · why)

Every command, organized by the job it does. For each: **what it is**, **how it works**, and **why you'd use it**. (For exact parameter lists, see the [Commands & Credentials reference](commands-and-credentials.md). Tools marked *passthrough* are owned by another package but callable through C&C.)

### 6.1 Setup & configuration

| Command | What · How · Why |
| --- | --- |
| `setup_cc` | **What:** top-level C&C config (mode, model routing, downloader path, registry token). **How:** writes `config.json`; "easy" mode picks sensible defaults. **Why:** run it once, first, so every other tool knows your preferences. |
| `setup_anthropic` | **What:** store your Anthropic API key. **How:** sends a 1-token test message to validate, then saves to `anthropic-config.json` (0o600). **Why:** unlocks all AI generation — analysis, drafting, rubrics, brainstorming. Without it those tools fall back to keyword/offline behavior. |
| `setup_canvas` | **What:** store Canvas host + API token. **How:** validates against `/api/v1/users/self` before saving. **Why:** unlocks direct publishing and course listing. Skip it and use generate-and-paste. |
| `setup_ollama` | **What:** point at a local Ollama server as your LLM. **How:** no-model call returns a recommended-models list; with a model it checks the model is pulled, then saves. **Why:** run generation locally/offline instead of via Anthropic. |
| `set_active_llm_provider` | **What:** switch between Anthropic and Ollama. **How:** flips the active provider; refuses if that provider isn't configured. **Why:** move between cloud and local without re-running setup. |
| `get_cc_status` | **What:** a health snapshot. **How:** reports installed packages, key/provider availability, routing, last-run times. **Why:** your first stop when something "isn't working" — it tells you what's actually configured. |

### 6.2 Getting a course in

| Command | What · How · Why |
| --- | --- |
| `setup_canvas_backup` *(passthrough)* | **What:** one-time-per-term setup for archiving. **How:** writes Canvas Backup's config from the Canvas connection you already gave `setup_canvas` — you supply the semester (and optionally the archive folder and year). Your API token is not written into that file. **Why:** Canvas Backup refuses to start without a base URL, archive folder, year, and semester; this fills them in so you never hand-edit a config file. |
| `download_canvas_archive` *(passthrough)* | **What:** archive a live Canvas course to disk. **How:** drives the Python Canvas Backup CLI (pages, assignments, quizzes, modules, files); uses the config from `setup_canvas_backup`. **Why:** creates the local source-of-truth archive everything else reads. |
| `import_course` *(CDS, passthrough)* | **What:** scaffold an editable course folder from an archive. **How:** reads modules/pages/assignments and writes a pre-filled `course/` folder; unclear content becomes `[NEEDS REVIEW]`. Works at full-course, single-week, or single-assignment granularity. **Why:** turns a raw backup into something you can edit and regenerate. Reachable from C&C. |
| `ingest_canvas_archive` *(CI, passthrough)* | **What:** parse an archive into a structured `topic-map.json`. **How:** idempotent — re-running overwrites the map. **Why:** the machine-readable form the analysis tools work on. |

### 6.3 Analyzing what's stale

| Command | What · How · Why |
| --- | --- |
| `analyze_course` | **What:** the one-shot "how stale is my course?" report. **How:** ingest → diff against prior semesters → score topic currency → emit KEEP/UPDATE/DROP/ADD verdicts → log a trajectory entry. **Why:** converts a vague sense of staleness into a concrete, prioritized worklist. |
| `get_course_trajectory` *(CI)* | **What:** the multi-semester churn view. **How:** reads the trajectory log for churn rate, unstable (verdict-flipping) topics, and true evergreens. **Why:** see which parts of your course are stable vs. perennially in flux. |
| `diff_semesters` *(CI)* | **What:** side-by-side diff of two ingested semesters. **How:** classifies items added / removed / reused verbatim / rewritten. **Why:** "what actually changed between fall and spring?" in one view. |
| `score_topic_currency` *(CI)* | **What:** classify one topic evergreen/current/dated. **How:** combines news-hit count with how recently you taught it. **Why:** the signal behind each verdict; call it directly to interrogate a single topic. |
| `recommend_for_topic` *(CI)* | **What:** the KEEP/UPDATE/DROP/ADD verdict for one topic. **How:** maps currency class + teaching history to a verdict + rationale. **Why:** a focused second opinion on a topic you're unsure about. |
| `fetch_news_feed` / `scan_recent_developments` / `suggest_topics` *(CI)* | **What:** the topic-currency intake. **How:** `fetch_news_feed` caches RSS/Atom items; `scan_recent_developments` asks the LLM (with web search) what's new in an area; `suggest_topics` merges both into ranked candidates. **Why:** feed real-world signal into the staleness scoring so "dated" means dated against the field, not just the calendar. |

### 6.4 Working with lecture transcripts (analysis inputs)

| Command | What · How · Why |
| --- | --- |
| `ingest_transcripts` *(CI)* | **What:** read `.vtt/.srt/.md` transcripts into `transcripts.json`. **How:** tags each transcript's source and pulls week/date hints from filenames. **Why:** lets analysis compare what you *said* in lecture against what's *on* the syllabus. |
| `map_transcripts_to_weeks` *(CI)* | **What:** attach each transcript to a course week. **How:** filename hints + term-start date math; reports unmatched files. **Why:** so per-week analysis (off-syllabus topics, quote bank) lines up correctly. |
| `extract_lecture_topics` *(CI)* | **What:** shape lecture chunks for LLM reasoning. **How:** returns chunks with week/source/duration/text; does no LLM call itself. **Why:** the prep step that feeds topic extraction without spending tokens prematurely. |
| `find_off_syllabus_topics` *(CI)* | **What:** surface things you lectured on but never put on the syllabus. **How:** diffs lecture vocabulary against that week's pages. **Why:** find tacit content worth formalizing into materials. |
| `build_quote_bank` *(CI)* | **What:** collect notable lecture lines. **How:** matches "key idea / takeaway / always-never" trigger phrases. **Why:** mine pull-quotes for course pages. |

### 6.5 Planning the next semester

| Command | What · How · Why |
| --- | --- |
| `plan_next_semester` | **What:** the one-shot "get me ready for next semester." **How:** imports the prior shell, fetches the calendar, shifts all due dates, drafts an outline. **Why:** collapses the most tedious, error-prone parts of planning into one call. |
| `import_previous_shell` *(CI)* | **What:** build a `next-plan/` skeleton from the last archive or CDS folder. **How:** writes CI front matter to each brief + a `plan-config.json`. **Why:** the editable starting point for the new semester. |
| `fetch_academic_calendar` *(CI)* | **What:** get the new term's dates. **How:** scrapes a calendar URL, accepts manual dates, or applies a US-convention `semesterPattern`. **Why:** the date source that drives `shift_dates`. |
| `shift_dates` *(CI)* | **What:** move every `due:` field onto the new calendar. **How:** applies the target calendar with per-section offsets and break-collision handling. **Why:** deterministic, no-mistakes date math across weeks and sections. |
| `generate_recommended_outline` *(CI)* | **What:** a week-by-week outline for the new term. **How:** informed by diff + verdict data; writes `plan-outline.md`. **Why:** a structured starting scaffold instead of a blank page. |
| `generate_ideas_file` *(CI)* | **What:** capture deferred scope and next prompts. **How:** writes `ideas.md`. **Why:** park "not this semester" ideas without losing them. |

### 6.6 Updating materials

| Command | What · How · Why |
| --- | --- |
| `update_course_materials` | **What:** the one-shot brief-and-examples refresh. **How:** drafts updated briefs for every assignment, runs the examples sweep, exports to CDS format. **Why:** does the bulk rewriting work in one pass. |
| `draft_assignment_brief` *(CI)* | **What:** LLM-draft one updated brief. **How:** flags `replacement_recommended` when the verdict is DROP or it's gone 6+ semesters stale. **Why:** a focused rewrite of a single assignment. |
| `update_examples` *(CI)* | **What:** refresh stale references in a brief. **How:** pass 1 fixes year refs and tool names mechanically; pass 2 (opt-in) has the LLM flag deeper staleness for review. **Why:** kill the "this says 2023" problem everywhere without rewriting good content. |
| `export_course_folder` *(CI)* | **What:** turn the approved `next-plan/` into a CDS `course/` folder. **How:** strips CI front matter; one folder per section for multi-section courses. **Why:** hand the plan off to the HTML generator. |

### 6.7 Designing & generating Canvas pages

C&C registers Curriculum Intelligence's `setup_course` and passes through **exactly two** Design Studio tools: `import_course` and `generate_course`. Everything else in this section lives on the **Canvas Design Studio** MCP server and is **not** reachable from C&C.

#### Reachable from C&C

| Command | What · How · Why |
| --- | --- |
| `setup_course` *(CI, passthrough)* | **What:** register a course in Curriculum Intelligence. **How:** takes **id** + **title** (optional *courseRoot*); creates the CI course folder and records its location. **Why:** later CI tools can find the course by id. This is **not** Design Studio's folder-scaffolding `setup_course`. |
| `import_course` *(CDS, passthrough)* | **What:** scaffold an editable course folder from an archive. **How:** reads modules/pages/assignments and writes a pre-filled `course/` folder; unclear content becomes `[NEEDS REVIEW]`. Works at full-course, single-week, or single-assignment granularity. **Why:** turns a raw backup into something you can edit and regenerate. |
| `generate_course` *(CDS, passthrough)* | **What:** render every page in a course folder to Canvas-safe HTML. **How:** reads `course-config.md` for colors and active page types; writes HTML to `output/`. **Why:** the C&C-reachable "make the whole course look good in Canvas" step. |

#### Design Studio only — connect the Design Studio server

These tools require the **Canvas Design Studio** MCP server. Asking C&C for them will fail.

| Command | What · How · Why |
| --- | --- |
| `setup_course` *(CDS only)* | **What:** scaffold a full Design Studio course folder. **How:** writes `course-config.md`, week folders, and template `.md` files per active page type. **Why:** the structured home for your content, with brand colors and page types chosen up front. Same *name* as CI's tool; different server, different arguments. |
| `generate_page` / `generate_week` *(CDS only)* | **What:** render markdown → Canvas-safe HTML at page or week scope. **How:** same renderer as `generate_course`; write HTML to `output/`. **Why:** iterate on one page or week without regenerating the whole course. |
| `generate_canvas_page` *(CDS only)* | **What:** one page from a free-form brief (not a course folder). **How:** returns HTML + a hero-image prompt + a suggested filename. **Why:** quick one-off page without scaffolding a whole course. |
| `ingest_assignment_folder` *(CDS only)* | **What:** generate a page from a folder of assignment materials. **How:** simple mode (a few files) or advanced mode (per-assignment subfolders with inherited rubric/shell). **Why:** go straight from your existing assignment files to a page. |
| `validate_canvas_html` *(CDS only)* | **What:** check HTML against Canvas + accessibility rules. **How:** returns violations with the offending snippets. **Why:** confirm a page is safe *before* you paste or publish. |
| `critique_canvas_page` *(CDS only)* | **What:** score a page's visual design. **How:** quick (structural) or comprehensive (full review) mode; prioritized findings. **Why:** an objective design read before students see it. |
| `redesign_canvas_page` *(CDS only)* | **What:** apply critique fixes. **How:** mechanical fixes automatically; re-runs the WCAG check on the output. **Why:** close the loop from critique to a better page in one step. |
| `load_canvas_page` / `save_canvas_page` *(CDS only)* | **What:** load/save generated HTML in `output/`. **How:** save auto-creates a `.bak`. **Why:** safe round-tripping while you iterate on a page. |
| `fetch_brand_colors` *(CDS only)* | **What:** extract brand colors from a standards page. **How:** returns ranked candidates with a suggested primary/secondary. **Why:** match your institution's palette without eyedropping by hand. |
| `setup_institution` / `get_setup_worksheet` / `validate_worksheet` *(CDS only)* | **What:** institution config (brand, Canvas URL, token) at `~/.canvas-design-mcp/institution.json`. **How:** fill a worksheet then submit it, or run the wizard; validate before applying. **Why:** set brand + connection once and reuse across courses. **Not on C&C** — from C&C use `setup_canvas` for the Canvas token. |
| `get_started` *(CDS only)* | **What:** a tailored Design Studio orientation. **How:** reads your current CDS config and suggests next steps. **Why:** the "where do I begin?" command **on the Design Studio server**. From C&C, ask for `get_cc_status` instead. |

### 6.8 Teaching-philosophy & student-persona context

These four tools are **Design Studio only** — they are not registered on C&C.

| Command | What · How · Why |
| --- | --- |
| `get_philosophy_kb` / `update_philosophy_kb` *(CDS only)* | **What:** your teaching-philosophy knowledge base. **How:** load it into context, or append a new entry (never overwrites). **Why:** make generated pages reflect *your* tone and pedagogy, not a generic voice. |
| `get_student_personas` / `generate_student_personas` *(CDS only)* | **What:** demographically grounded student personas. **How:** generate from real distributions across ~23 dimensions; load saved sets. **Why:** evaluate pages against the students you actually teach (accessibility, tone, prior knowledge). |

### 6.9 Lecture video (Module Video — enable first)

These require the **Lecture Video module** enabled and `setup_panopto` run.

| Command | What · How · Why |
| --- | --- |
| `setup_panopto` *(module)* | **What:** store Panopto OAuth creds. **How:** validates against the OAuth token endpoint before saving. **Why:** unlocks transcript download and video search. |
| `video_search` *(module)* | **What:** browse your lecture library. **How:** queries the active provider (Panopto first); omit the query to list all. **Why:** find the clip/lecture you want to embed or caption. |
| `video_embed` *(module)* | **What:** Canvas-safe embed HTML for a video. **How:** iframe when whitelisted, accessible fallback link otherwise; works without API creds if you supply ID + title. **Why:** drop a lecture into a page without fighting Canvas's iframe rules. |
| `video_fetch_captions` *(module)* | **What:** download a video's captions as plain text. **How:** strips timestamps; needs provider creds. **Why:** get a transcript you can search, quote, or feed the Q&A bot. |
| `setup_panopto_vocab` *(module)* | **What:** manage vocabulary corrections + filler words. **How:** add/remove term mappings used during enrichment. **Why:** fix systematic mis-transcriptions (names, jargon) once, everywhere. |
| `bulk_fetch_panopto_transcripts` | **What:** download a whole folder's transcripts as VTT. **How:** optionally auto-ingests into CI. **Why:** get a semester of transcripts in one call. |
| `enrich_panopto_transcripts` | **What:** turn VTT into readable markdown. **How:** adds week/date headers, deep links every 5 min, strips fillers, highlights key statements. **Why:** transcripts you'd actually link students to, not raw caption dumps. |
| `setup_transcript_source` | **What:** choose Panopto vs. Whisper + engine/model. **How:** `get` reads config, `set` updates it. **Why:** control where transcripts come from and how they're produced. |
| `compare_transcripts` | **What:** Whisper-vs-Panopto caption diff. **How:** locally re-transcribes audio, writes a `.comparison.md` ranking disagreements, suggests vocab fixes (writes nothing automatically). **Why:** catch where auto-captions got your domain terms wrong. |

### 6.10 Lecture answers (course Q&A bot)

| Command | What · How · Why |
| --- | --- |
| `setup_lecture_answers` | **What:** first-run config for the Q&A bot. **How:** auto-detects Ollama; otherwise guides you to transformers-js (in-process) or Voyage (cloud). **Why:** stand up a private bot over your own course corpus. |
| `index_course_for_answers` | **What:** build/update the search index. **How:** hybrid FTS5 + vector index over transcripts, CDS markdown, slide PDFs, and a canonical FAQ; auto-incremental on file changes. **Why:** make your course content searchable with both keyword and semantic recall. |
| `ask_course` | **What:** ask a question against your course. **How:** re-indexes changed files, retrieves, and returns an answer **with deep-linked citations**. Degrades to keyword-only if embeddings are down. **Why:** "where did I cover X, and in which lecture?" answered in seconds. |
| `reembed_course_index` | **What:** switch embedding providers and rebuild. **How:** one call wrapping setup + rebuild (vector dims aren't interchangeable). **Why:** migrate Ollama↔Voyage cleanly. |

### 6.11 Publishing to Canvas

| Command | What · How · Why |
| --- | --- |
| `preview_course_publish` | **What:** a dry-run of a course publish. **How:** generates per-page diffs, warnings, and a manifest; **no Canvas writes.** **Why:** see exactly what would change before anything moves. |
| `publish_course` | **What:** publish the previewed manifest. **How:** per-entry approve/skip, stop-on-first-failure, saves a prior-state snapshot, can git-commit/push and add Canvas breadcrumbs. **Why:** controlled, reversible publishing — never an all-or-nothing leap. |
| `rollback_course_publish` | **What:** undo a publish. **How:** restores every published entry from the snapshot to its prior Canvas state. **Why:** makes publishing to a live course safe. |
| `list_publish_snapshots` | **What:** list a course's snapshots. **How:** oldest→newest, marking which is live and what you can roll back/forward to. **Why:** find the exact version to restore. |
| `prune_publish_snapshots` | **What:** apply snapshot retention. **How:** keeps the 3 most recent + anything ≤30 days; never removes the live one; `dryRun` previews. **Why:** keep the snapshot store tidy without risking the live state. |
| `publish_to_canvas` *(CDS)* | **What:** publish a single HTML page. **How:** runs FERPA + validation + title-collision checks before writing. **Why:** push one page without the full course-publish flow. |
| `list_canvas_courses` *(CDS)* | **What:** list courses you can publish to. **How:** semester filter + favorites. **Why:** pick the right course id. |

### 6.12 Interactive widgets

| Command | What · How · Why |
| --- | --- |
| `brainstorm_interactive` | **What:** propose interactive widget concepts. **How:** LLM returns 2–3 specs (kind, content schema, sample data, a11y notes) for a topic + goal. **Why:** ideate engaging interactives without designing them from scratch. |
| `render_widget` *(CDS)* | **What:** compile a spec into an embeddable widget. **How:** writes a self-contained `<spec-id>.html`; `allowExperimental` for non-catalog kinds. **Why:** turn a concept into a real, hostable Canvas widget. |
| `publish_widget` *(CDS)* | **What:** upload a widget to Canvas Files. **How:** returns iframe embed code; usually called for you by `publish_course`. **Why:** get a widget live in Canvas with a working embed. |

### 6.13 Resource registry & layout adapters

| Command | What · How · Why |
| --- | --- |
| `search_registry` | **What:** find templates/themes/prompts/adapters. **How:** searches the free GitHub registry or a configured premium one. **Why:** reuse instead of reinventing. |
| `install_resource` / `install_resources_from_lockfile` | **What:** install resources. **How:** from `github://`, `ryfter://`, or `file://`; the lockfile variant installs a whole set in order. **Why:** add a template/theme to your local registry (or reproduce a known-good set). |
| `list_installed_resources` / `uninstall_resource` | **What:** manage what's installed. **How:** list by kind; remove by kind+id. **Why:** keep your registry curated. |
| `paste_layout` | **What:** adapt raw HTML/CSS (Stitch, Figma) into a Canvas-safe slot layout. **How:** restructures into slots and audits accessibility. **Why:** bring an external design into Canvas without it breaking. |
| `save_layout_as_template` | **What:** save an adapted layout for reuse. **How:** stores it in the local registry. **Why:** turn a one-off layout into a repeatable template. |

### 6.14 Modules & institution discovery

| Command | What · How · Why |
| --- | --- |
| `list_modules` | **What:** list plug-in modules. **How:** shows id, name, enabled state, active provider, handled types. **Why:** see what capabilities are installed and on. |
| `set_module_enabled` | **What:** enable/disable a module post-install. **How:** writes `modules.json`; takes effect on client reconnect. **Why:** turn capabilities on/off without reinstalling. |
| `discover_tools` | **What:** detect what tools your institution uses. **How:** read-only Canvas scan (account → course → self-report) matched against modules; suggests which to enable. **Why:** get a tailored "enable these modules" recommendation. |
| `save_institution_profile` | **What:** record your institution's tool library. **How:** accretive merge of a master profile + per-class deltas. **Why:** the inventory that powers discovery and (opt-in) usage feedback. |
| `submit_usage_feedback` | **What:** share an **anonymized** tool inventory with the author. **How:** two-call confirm gate; opens a GitHub issue via `gh`; never sends tokens or student data. **Why:** help prioritize which integrations get built — entirely optional. |

### 6.15 Dashboard, course reference & AI policy

| Command | What · How · Why |
| --- | --- |
| `set_courses_root` | **What:** tell the dashboard where your courses live. **How:** sets the root scanned for `course-config.md` folders. **Why:** prerequisite for the dashboard. |
| `open_dashboard` | **What:** the local course-health dashboard. **How:** starts a read-only `localhost` server scoring each course green/yellow/red on freshness + transcript coverage. **Why:** see the state of all your courses at a glance. |
| `snapshot_course` | **What:** a living course reference doc. **How:** writes/updates auto-managed sections (identifiers, groups, modules, an append-only update log) while preserving your hand-edited prose. **Why:** one markdown file that always reflects the live course. |
| `set_course_aias_default` | **What:** set the course-wide AI Assessment Scale default. **How:** writes a default level (1–5) into `course-config.md`; per-page overrides win at render. **Why:** make your AI-use policy explicit and visible on assignments. |
| `show_canvas_capabilities` / `preview_canvas_pattern` | **What:** browse and preview the Canvas design-pattern catalog. **How:** list patterns (filter by category/support), then render one to a standalone HTML preview. **Why:** discover what's possible in Canvas-safe HTML before you build. |

> **Scope note:** this catalog covers the professor-facing commands. A handful of internal/standalone helpers (e.g. CDS `update_canvas_kb`, CI `get_course_state`) are documented in the [reference table](commands-and-credentials.md). In total the toolchain registers **120+ MCP tools** across the four packages; in everyday use you'll touch a dozen.

---

## 7. Common recipes

**"I just want to update one assignment, not the whole course."**
From C&C: `import_course { assignmentName }` → edit the markdown → `generate_course` → paste the HTML from `output/` (or `publish_course`). Page-scope `generate_page` / `validate_canvas_html` / `publish_to_canvas` require the Design Studio server.

**"No API keys, ever — I'll paste everything myself."**
Skip all `setup_*` credential tools. Use `import_course` → `generate_course` → copy the HTML from `output/` into Canvas's HTML editor. Fully supported.

**"Refresh dates only — content's fine."**
`import_previous_shell` → `fetch_academic_calendar` → `shift_dates` → `export_course_folder`.

**"Make my lectures searchable."**
`setup_lecture_answers` → `bulk_fetch_panopto_transcripts` → `enrich_panopto_transcripts` → `index_course_for_answers` → `ask_course`.

**"Check the whole course's health before the term starts."**
`set_courses_root` → `open_dashboard`, then read the green/yellow/red per course.

**"Publish, but carefully."**
`preview_course_publish` (read the diffs) → `publish_course { approvals }` → spot-check in Canvas → `rollback_course_publish` if anything's off.

---

## 8. Where your data and credentials live

- **Course content** lives in plain files on your disk — the local archive and `course/` folders are the source of truth. Cloud services are optional.
- **Credentials** live under `~/.command-and-control/` (relocate with the `CC_HOME` env var), each written **atomically with `0o600`** (owner read/write only):
  - `anthropic-config.json`, `canvas-config.json`, `ollama-config.json`, `panopto-config.json`, `lecture-answers-config.json`, and `config.json` (the registry token, redacted in responses).
- **Validation before save:** every key is checked against the live service (Anthropic `/v1/messages`, Canvas `/users/self`, Panopto OAuth, Voyage `/v1/embeddings`, Ollama `/api/tags`) before it's written.
- **Never echoed, never transmitted:** keys are not printed back in tool output, and `submit_usage_feedback` is opt-in and anonymized and refuses to send tokens or student data.
- **Two sensitive env vars** (`ANTHROPIC_API_KEY`, `BRAVE_SEARCH_API_KEY`) are read from the environment for CI-direct/advanced use; the rest of the env vars are path/behavior overrides.

Full detail, including the env-var table and validation endpoints, is in the [Commands & Credentials reference](commands-and-credentials.md#3-api-keys--secrets--what-s-asked-for-and-why).

---

## 9. Troubleshooting

| Symptom | Likely cause / fix |
| --- | --- |
| A tool says it needs a credential | Run the `setup_*` tool it names. Check overall state with `get_cc_status`. |
| AI generation is weak or keyword-only | Anthropic key missing/invalid, or you're on Ollama with a small model. Re-run `setup_anthropic` or `set_active_llm_provider`. |
| Publishing fails midway | `publish_course` stops on first failure by design. Fix the flagged entry and re-run with `resume`, or `rollback_course_publish` and start clean. |
| `import_course` left `[NEEDS REVIEW]` blocks | Quiz questions, LTI links, and external tools can't be cleanly extracted. Fill those blocks in by hand — everything else imported. |
| The Q&A bot returns nothing useful | Run `index_course_for_answers` first; if you switched embedding providers, `reembed_course_index` (vector dimensions aren't interchangeable). |
| Video tools aren't available | The Lecture Video module is off. `set_module_enabled { module: "video", enabled: true }`, reconnect your client, then `setup_panopto`. |
| Dashboard is empty | Run `set_courses_root` pointing at the folder that contains your `course-config.md` directories. |
| Canvas page looks broken after pasting | On the **Design Studio** server, run `validate_canvas_html` — Canvas strips disallowed markup. Regenerate with Design Studio's `generate_page`, or from C&C re-run `generate_course`. |

---

*Last reconciled against the source tree on 2026-08-13 for: C&C vs Design Studio tool reachability (`import_course` / `generate_course` are the only CDS passthroughs; `get_started`, `setup_institution`, `get_setup_worksheet`, and CDS's `setup_course` are Design Studio only; C&C's `setup_course` is Curriculum Intelligence's `id`+`title` tool); and installer-wired hosts vs other MCP clients. Not a full parameter-by-parameter reconciliation of every tool. For exact parameters see the [Commands & Credentials reference](commands-and-credentials.md); for the code's building blocks see the [Module view](architecture-modules.md); for diagrams see the [Visual guide](visual-guide/README.md).*
