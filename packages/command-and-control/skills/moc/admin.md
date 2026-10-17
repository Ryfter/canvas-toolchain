---
id: "admin"
kind: "section"
description: "Institution profile, dashboard, feedback, defaults."
ops: 34
related: [ct_setup, ct_import, ct_inspect, ct_analyze, ct_plan, ct_build, ct_review, ct_ask, ct_advanced]
---
# admin section

Institution profile, dashboard, feedback, defaults.

## Operations (34)

- [[setup_cc]] — Configure Command & Control: set mode (easy/advanced), Anthropic model, Ollama base URL and model, and routing preferences. Run this first.
- [[setup_anthropic]] — Configure the Anthropic API key used by all AI-powered tools. Validates the key against the Anthropic API before saving. Stored locally at ~/.command-and-control/anthropic-config.json with 0o600 permissions.
- [[setup_canvas]] — Configure the Canvas LMS host and API token used for direct page publishing. Validates the token against /api/v1/users/self before saving. Stored locally at ~/.command-and-control/canvas-config.json with 0o600 permissions.
- [[setup_ollama]] — Configure Ollama as the local generation LLM. Discovery mode (no model) returns the recommended-models markdown. Commit mode (with model) validates the model is pulled and writes ollama-config.json.
- [[set_active_llm_provider]] — Set the active generation LLM provider. Must be anthropic or ollama. Refuses to set a provider whose config file is absent.
- [[save_institution_profile]] — Write/merge the institution profile (the master tool library) and optional per-class tool deltas. Accretive — new tools are added, existing preserved. The profile is the payload for usage feedback (#77).
- [[submit_usage_feedback]] — Submit an anonymized inventory of your institution's tools as a GitHub issue, so the author can prioritize integrations. Opt-in. Two-call gate: call once to review the exact payload, then call again with confirm:true to submit via gh. named:true includes full identifiers (default is anonymized).
- [[set_course_aias_default]] — Set the course-wide AI Assessment Scale default for a CDS course folder. Writes defaultAiasLevel (and optional defaultAiasNote) into course-config.md. Per-page aiasLevel overrides this default at render time.
- [[set_courses_root]] — Set the root directory for course discovery used by the local dashboard. The dashboard scans this directory recursively for folders containing course-config.md.
- [[open_dashboard]] — Start the local Canvas Toolchain dashboard (read-only course health view). Returns a localhost URL the professor can open in a browser. Requires `ct_setup` action `courses_root` first.
- [[get_cc_status]] — Get a health snapshot: which domain packages are installed, whether Anthropic key and Ollama are available, active routing config, and last-run timestamps per workflow.
- [[plan_next_semester]] — Answer "get me ready to plan next semester" — imports previous shell, fetches the academic calendar, shifts all due dates, and generates a recommended outline.
- [[full_pipeline]] — Run `ct_analyze` action `course` → `ct_plan` action `semester` → `ct_build` action `materials` end-to-end. Returns results from all three phases.
- [[setup_lecture_answers]] — First-run configuration for the lecture answers bot. Auto-detects Ollama on localhost:11434. When Ollama is absent, returns guidance to either install Ollama or re-call with provider="transformers-js" (in-process; requires installing @xenova/transformers in command-and-control first) or provider="voyage" (cloud, requires voyageApiKey). The bot is opt-in — until this tool succeeds, `ct_ask` action `ask` and `ct_ask` action `index` report NO_CONFIG.
- [[index_course_for_answers]] — Build or incrementally update a per-course hybrid (FTS5 + vec) index over enriched lecture transcripts, CDS markdown, slide PDFs (under <courseDir>/slides/), and the canonical FAQ (<courseDir>/answers/canonical.md). Auto-incremental on subsequent calls based on file mtimes. Pass rebuild=true to wipe and re-embed everything (provider switch, suspected corruption).
- [[ask_course]] — Faculty-facing Q&A against the per-course hybrid index. Auto-incrementally re-indexes any changed source files before retrieving. Returns the LLM-generated answer plus citations (with deep-link URLs for transcript chunks where the source platform provided a deepLinkTemplate). Degrades to keyword-only retrieval when the embedding provider is unavailable.
- [[reembed_course_index]] — Switch embedding providers and rebuild the per-course index in one call. Convenience wrapper over `ct_setup` action `lecture_answers` + `ct_ask` action `index` --rebuild. Use when migrating from Ollama to Voyage (or vice versa), since vector dimensions are not interchangeable.
- [[check_shell_readiness]] — Advisory spot-check of a LIVE Canvas course shell. Run anytime (manual). Optional weekly cadence is opt-in via `ct_setup` action `spot_check` (recommends Saturday). Weeks: infer Week N from module titles + termStartMonday; weekMapOverrides win. Thorough = week beginning in ~2 weeks; lighter = ~1 week. Cross-checks due/unlock/lock. Emits quizCallouts for `ct_review` action `quiz` (sibling; validate-first). Read-only. `ct_setup` action `canvas` required.
- [[setup_spot_check]] — Opt in/out of a weekly shell (+ quiz validate) spot-check reminder day. Recommends Saturday. Persists weeklyCheckEnabled + weeklyCheckDay under ~/.command-and-control/spot-check.json (no secrets). Manual `ct_review` action `shell_readiness` always works. Does not install OS cron (fast-follow).
- [[validate_quiz]] — Advisory live-Canvas quiz quality check (Classic Quizzes questions API): missing keys, empty stems, duplicate stems, points mismatch, week-map date mismatches, optional LLM triage for ambiguous keys / weak distractors. Pass courseId+quizId for spot-check (source of truth = Canvas). Optional local quizPath/quizMarkdown is authoring pre-check only. Manual anytime — does not require weeklyCheckEnabled. Usable from shell readiness call-out for primary/secondary weeks. Run `ct_setup` action `canvas` first for live mode. Does not write to Canvas or gate publish.
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
- [[setup_canvas_backup]] — [canvas-backup] Generate a Canvas Backup config from the Canvas connection already configured in Command and Control. Writes ~/.command-and-control/canvas-backup.generated.toml (token stays out of the file; passed via CANVAS_TOKEN at archive time). Run this once per semester so `ct_import` action `canvas_archive_download` can find base_url / archive root / year / semester.
- [[download_canvas_archive]] — [canvas-backup] Archive a Canvas course shell locally by invoking the Canvas Backup CLI.
<!-- generated:end -->

# Notes

<!-- Hand-written. The generator regenerates everything above the marker. -->
