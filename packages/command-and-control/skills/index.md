---
id: "index"
kind: "index"
description: "Full catalog: one line per operation (88 total), grouped by section. To act, start from moc/<intent tool>.md (e.g. moc/ct_build.md), then open ops/<id>.md for the one you picked."
ops: 88
related: [modules, registry, transcripts, research, accessibility, snapshots, design, admin]
---
# Operation index

Sections: [[modules]] [[registry]] [[transcripts]] [[research]] [[accessibility]] [[snapshots]] [[design]] [[admin]]

## modules — Plug-in module discovery, install, enable/disable.

- [[set_module_enabled]] — Enable or disable a plug-in module (e.g. video) by writing modules.json. Always available so a disabled module can be re-enabled. Takes effect after the MCP client reconnects/restarts.
- [[list_modules]] — List all known plug-in modules with their id, name, enabled state, active provider, and the provider/tool types they handle.
- [[browse_module_catalog]] — Module catalog: exists / installed / enabled / update state and installer-GUI requests, plus companion programs (e.g. Canvas Backup). Read-only; clearPending:true discards stale requests.
- [[install_module]] — Install/upgrade a catalog module. Two-call gate: first call previews name/version/size/source/sha256 (no side effects); re-call with confirm:true to verify the sha256 and install. Needs a reconnect.
- [[uninstall_module]] — Remove a channel-installed module (artifact + record) and disable it. Bundled modules cannot be uninstalled — disable those with set_module_enabled.
- [[discover_tools]] — Discover institutional tools: scans Canvas (account → course → self-report), matches findings to modules, and returns detected tools, enable suggestions, unmatched tools, and a pick-list. Read-only.

## registry — Resource registry: search, install, uninstall, lockfiles.

- [[install_resource]] — Install a template, theme, prompt, or adapter-config resource from github://, ryfter://, or file:// into the local registry.
- [[list_installed_resources]] — List resources installed in the local registry, optionally filtered by kind.
- [[uninstall_resource]] — Remove a resource from the local registry by kind and id. Bundle entries also remove their included resources.
- [[search_registry]] — Search available registry resources from the free GitHub registry or configured premium registry.
- [[install_resources_from_lockfile]] — Install resources listed in a plain-text or JSON lockfile, preserving order and skipping already-installed versions.

## transcripts — Transcript enrichment, comparison, and week mapping.

- [[bulk_fetch_panopto_transcripts]] — Download all Panopto transcripts for a folder as VTT files. Optionally auto-ingests into Curriculum Intelligence. Requires `video.setup_panopto` to be run first.
- [[enrich_panopto_transcripts]] — Enrich Panopto VTT into markdown: Week/Date headers, deep links every 5 min, filler stripped, vocab corrections, key statements as blockquotes. Requires a prior transcripts_panopto run.
- [[setup_transcript_source]] — Configure which transcript source enrichment uses (panopto default, or whisper) plus the Whisper engine, model, and audioMode. action=get reads current config; action=set updates provided fields.
- [[compare_transcripts]] — Opt-in: local Whisper-transcribe audio, diff vs Panopto VTT. Writes .comparison.md per session; returns vocab fixes for approval (none auto-written). Needs audio + prior transcripts_panopto run.
- [[ingest_transcripts]] — Read .vtt/.srt/.md transcript files from a folder and write transcripts.json.
- [[map_transcripts_to_weeks]] — Match each ingested transcript to a course week. Writes week-map.json.
- [[download_transcripts]] — [canvas-backup] Placeholder for future bulk Panopto transcript download.

## research — News feeds, recent developments, quote banks, calendars.

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

## accessibility — Deep accessibility checks beyond the standard audit.

- [[accessibility_review_queue]] — Course "near the edge" a11y worklist: borderline findings, needs-review criteria, and acknowledged publishes, worst-margin first, live Canvas URLs. resolve marks a page reviewed; professor is arbiter.
- [[audit_course_accessibility]] — Run the full WCAG 2.2 stack (in-house + axe-core) over every generated page, report per-page verdicts vs the required level, and refresh the borderline queue. The between-semesters check.
- [[review_accessibility_policy]] — Accessibility policy anchor: shows policy URLs, required level, cadence, last-verified; confirm:true stamps a re-read. Updates urls/requiredConformance/recheckWeeks/wcag3Advisory. Default WCAG 2.1 AA.
- [[wave_deep_check]] — Deep a11y check of a PUBLIC page via the paid WAVE API. Spend gate: preview (~2 credits) first, then confirm:true. Auth-gated Canvas URLs refused — use the free extension. apiKey saved on first use.

## snapshots — Publish snapshot listing and pruning.

- [[preview_course_publish]] — Generate a publish preview: per-page diffs, warnings, and a manifest. No Canvas writes occur.
- [[publish_course]] — Publish the previewed manifest to Canvas with explicit per-entry approvals. Stops on first failure.
- [[rollback_course_publish]] — Restore every successfully-published entry from a snapshot to its prior Canvas state.
- [[list_publish_snapshots]] — List a course's publish snapshots oldest-to-newest, marking the one live in Canvas and which can be rolled back/forward. Feed a row's snapshotId to ct_publish rollback.
- [[prune_publish_snapshots]] — Apply retention to publish snapshots: drops those past the window and count (default keep 3, keep ≤30 days), never the live one. dryRun lists only; also runs after every successful publish.
- [[snapshot_course]] — Write/update a course reference doc (identifiers, assignment groups, modules, append-only Update Log). Re-runs regenerate the AUTO:start/AUTO:end sections but preserve hand-edited prose around them.

## design — Canvas pattern catalog, previews, layout templates.

- [[show_canvas_capabilities]] — Canvas-safe pattern catalog: filter by category (layout, information, interactive, pedagogical, branded) or supportStatus (supported/partial/aspirational). Then ct_build preview_pattern renders one.
- [[preview_canvas_pattern]] — Render a Canvas capability pattern to a standalone HTML file openable in any browser. Use after `ct_advanced` run `show_canvas_capabilities` to see a pattern in action.
- [[update_course_materials]] — Answer "update my materials and export" — drafts updated briefs for every assignment in next-plan/, runs the examples update pass, and exports to CDS format.
- [[draft_student_rubric]] — Rewrite a faculty rubric into student-facing language with worked examples per criterion. Writes CDS rubric markdown for ct_build course to render as a Canvas page + student .md. Needs Anthropic.
- [[review_canvas_rubric]] — Pull a Canvas rubric (attached, else course list), diff since last rewrite, triage acceptable/needs-update/needs-review. Read-only; needs-update proposes a rubric for ct_build rubric. Needs Canvas+AI.
- [[generate_quiz]] — Author a local quiz draft (books/slides/lectures) with difficulty-mix knobs, written under week-NN/quizzes/. Needs an LLM. Does not publish to Canvas — use ct_review quiz for live checks.
- [[paste_layout]] — Paste raw HTML and CSS (e.g. from Stitch or Figma) to adapt it into a Canvas-safe slot layout and audit accessibility.
- [[save_layout_as_template]] — Formulate and save a successfully adapted layout as a reusable template in the local registry.
- [[draft_assignment_brief]] — LLM-draft an updated assignment brief. Sets replacement_recommended on DROP/stale.
- [[update_examples]] — Mechanical year/tool-name replacement pass + optional LLM proposed rewrites.
- [[import_course]] — [@canvas-toolchain/canvas-design-studio] Import a Canvas Backup archive into a Canvas Design Studio course folder.
- [[generate_course]] — [@canvas-toolchain/canvas-design-studio] Generate Canvas-safe HTML for every page in a Canvas Design Studio course folder.

## admin — Institution profile, dashboard, feedback, defaults.

- [[setup_cc]] — Configure Command & Control: set mode (easy/advanced), Anthropic model, Ollama base URL and model, and routing preferences. Run this first.
- [[setup_anthropic]] — Configure the Anthropic API key used by all AI tools. Validates it against the Anthropic API before saving, then stores it locally with 0o600 permissions.
- [[setup_canvas]] — Configure the Canvas host and API token used for direct publishing. Validates the token against /api/v1/users/self before saving, then stores it locally with 0o600 permissions.
- [[setup_ollama]] — Configure Ollama as the local generation LLM. Discovery mode (no model) returns the recommended-models markdown. Commit mode (with model) validates the model is pulled and writes ollama-config.json.
- [[setup_lmstudio]] — Configure LM Studio (OpenAI-compatible local server) as the generation LLM. Discovery mode lists loaded models from the running server; commit mode validates the model and writes lmstudio-config.json.
- [[set_active_llm_provider]] — Set the active generation LLM provider. Must be anthropic, ollama or lmstudio. Refuses to set a provider whose config file is absent.
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

## Concepts (7)

- [[accessibility_gate]] — How the accessibility gate works: what blocks a Canvas pu...
- [[module_channel]] — Plug-in modules and Canvas modules share a word, not a sy...
- [[provider_setup]] — Credentials and model backends: which file each setup too...
- [[publish_safety]] — The publish safety net: preview captures a rollback basel...
- [[quiz_migration]] — Classic Quizzes still work, but Canvas is migrating them:...
- [[semester_rollover]] — Rolling a course into a new semester: archive and ingest ...
- [[transcript_pipeline]] — Panopto transcripts from fetch to answer: bulk download, ...
<!-- generated:end -->

# Notes

<!-- Hand-written. The generator regenerates everything above the marker. -->
