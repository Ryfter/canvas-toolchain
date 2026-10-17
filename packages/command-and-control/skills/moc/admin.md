---
id: "admin"
kind: "section"
description: "Institution profile, dashboard, feedback, defaults."
ops: 35
related: [ct_setup, ct_import, ct_inspect, ct_analyze, ct_plan, ct_build, ct_review, ct_ask, ct_advanced]
---
# admin section

Institution profile, dashboard, feedback, defaults.

## Operations (35)

- [[setup_cc]] — Configure Command & Control: set mode (easy/advanced), Anthropic model, Ollama base URL and model, and routing preferences. Run this first.
- [[setup_anthropic]] — Configure the Anthropic API key used by all AI tools. Validates it against the Anthropic API before saving, then stores it locally with 0o600 permissions.
- [[setup_canvas]] — Configure the Canvas host and API token used for direct publishing. Validates the token against /api/v1/users/self before saving, then stores it locally with 0o600 permissions.
- [[setup_ollama]] — Configure Ollama as the local generation LLM. Discovery mode (no model) returns the recommended-models markdown. Commit mode (with model) validates the model is pulled and writes ollama-config.json.
- [[set_active_llm_provider]] — Set the active generation LLM provider. Must be anthropic or ollama. Refuses to set a provider whose config file is absent.
- [[save_institution_profile]] — Write/merge the institution profile (master tool library) plus optional per-class deltas. Accretive — new tools added, existing preserved. This profile is the payload for usage feedback.
- [[submit_usage_feedback]] — Submit an anonymized inventory of your institution's tools as a GitHub issue so the author can prioritize integrations. Opt-in two-call gate: review, then confirm:true via gh. named:true adds ids.
- [[set_course_aias_default]] — Set the course-wide AI Assessment Scale default for a CDS course folder, writing defaultAiasLevel (and optional defaultAiasNote) into course-config.md. Per-page aiasLevel overrides at render.
- [[set_courses_root]] — Set the root directory for course discovery used by the local dashboard. The dashboard scans this directory recursively for folders containing course-config.md.
- [[open_dashboard]] — Start the local Canvas Toolchain dashboard (read-only course health view). Returns a localhost URL the professor can open in a browser. Requires `ct_setup` action `courses_root` first.
- [[get_cc_status]] — Get a health snapshot: which domain packages are installed, whether Anthropic key and Ollama are available, active routing config, and last-run timestamps per workflow.
- [[setup_doctor]] — Run a read-only readiness check: what is configured, what is broken, and the ct_setup action that fixes each item. probe:true adds live Canvas and Anthropic checks.
- [[plan_next_semester]] — Answer "get me ready to plan next semester" — imports previous shell, fetches the academic calendar, shifts all due dates, and generates a recommended outline.
- [[full_pipeline]] — Run `ct_analyze` action `course` → `ct_plan` action `semester` → `ct_build` action `materials` end-to-end. Returns results from all three phases.
- [[setup_lecture_answers]] — Lecture answers bot setup: auto-detects Ollama on localhost:11434, else install or pick transformers-js (in-process, needs @xenova/transformers) or voyage (cloud, key). Else ct_ask reports NO_CONFIG.
- [[index_course_for_answers]] — Build/update a per-course hybrid (FTS5 + vec) index over transcripts, CDS markdown, slides/ PDFs, and answers/canonical.md. Incremental by mtime; rebuild:true wipes and re-embeds all.
- [[ask_course]] — Faculty Q&A over the course hybrid index: auto-reindexes changed sources, returns an LLM answer + citations (deep links where available), falling back to keyword-only if the embedder is missing.
- [[reembed_course_index]] — Switch embedding providers and rebuild the course index in one call (ct_setup lecture_answers + ct_ask index --rebuild). Use when migrating providers — vector dimensions are not interchangeable.
- [[check_shell_readiness]] — LIVE Canvas shell check: Week N from module titles+termStartMonday (overrides win); ~2w thorough, ~1w lighter; cross-check due/unlock/lock; ct_review quiz callouts. Anytime. Read-only; needs Canvas.
- [[setup_spot_check]] — Opt in/out of a weekly shell + quiz spot-check reminder day (recommends Saturday). Persists the setting only; no OS cron installed. Manual ct_review shell_readiness always works.
- [[validate_quiz]] — Advisory quiz check (Classic Quizzes): missing keys, empty/dup stems, points mismatch, week-map dates, optional LLM triage. Live via courseId+quizId (Canvas) or local quizPath/quizMarkdown. Read-only.
- [[setup_course]] — Register a new course in Curriculum Intelligence. Creates a course folder on disk and records its location in the app config so other tools can find it by id alone.
- [[get_course_state]] — List registered courses with their on-disk paths, semester history, and feed counts.
- [[ingest_canvas_archive]] — Read a Canvas export folder for one semester and write a structured topic-map.json.
- [[list_assignments]] — List assignments for a course/semester from its ingested topic map.
- [[list_pages]] — List pages for a course/semester from its ingested topic map.
- [[list_canvas_modules]] — List modules for a course/semester. Pass expandItems=true to include item details.
- [[list_resources]] — List external resource links referenced in pages, assignments, and discussions.
- [[diff_semesters]] — Compute a side-by-side diff between two ingested semesters.
- [[import_previous_shell]] — Copy last semester's content into next-plan/ with CI front matter.
- [[shift_dates]] — Apply target calendar to all due: fields in next-plan/ briefs.
- [[generate_recommended_outline]] — Generate a week-by-week outline from diff + optional currency-report.
- [[export_course_folder]] — Strip CI fields and write CDS course/ format; one folder per section.
- [[setup_canvas_backup]] — [canvas-backup] Generate the Canvas Backup config from your Canvas connection. Writes the toml without the token (passed via CANVAS_TOKEN). Run once per semester so canvas_archive_download works.
- [[download_canvas_archive]] — [canvas-backup] Archive a Canvas course shell locally by invoking the Canvas Backup CLI.

## Concepts (4)

- [[provider_setup]] — Credentials and model backends: which file each setup too...
- [[quiz_migration]] — Classic Quizzes still work, but Canvas is migrating them:...
- [[semester_rollover]] — Rolling a course into a new semester: archive and ingest ...
- [[transcript_pipeline]] — Panopto transcripts from fetch to answer: bulk download, ...
<!-- generated:end -->

# Notes

<!-- Hand-written. The generator regenerates everything above the marker. -->
