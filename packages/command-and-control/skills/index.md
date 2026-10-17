---
id: "index"
kind: "index"
description: "One line per operation (86 total). Read this first, then open ops/<id>.md for the one you picked."
ops: 86
related: [modules, registry, transcripts, research, accessibility, snapshots, design, admin]
---
# Operation index

Sections: [[modules]] [[registry]] [[transcripts]] [[research]] [[accessibility]] [[snapshots]] [[design]] [[admin]]

## modules — Plug-in module discovery, install, enable/disable.

- [[set_module_enabled]] — Enable or disable a plug-in module (e.g. video) by writing modules.json. Always available so a disabled module can be re-enabled. Takes effect after the MCP client reconnects/restarts.
- [[list_modules]] — List all known plug-in modules with their id, name, enabled state, active provider, and the provider/tool types they handle.
- [[browse_module_catalog]] — List the module catalog: what exists, what is installed/enabled, which have updates, and any modules requested from the installer GUI. Read-only. Pass clearPending: true to discard stale installer requests. Also lists companion programs (e.g. Canvas Backup) that work alongside the toolchain and are installed separately.
- [[install_module]] — Install (or upgrade) a module from the catalog. Two-call gate: first call previews name/version/size/source/sha256 with NO side effects; call again with confirm: true to download, verify the pinned sha256, and install. Takes effect on the next reconnect.
- [[uninstall_module]] — Remove a channel-installed module (artifact + record) and disable it. Bundled modules cannot be uninstalled — disable those with set_module_enabled.
- [[discover_tools]] — Discover what tools the institution/professor uses: scans the Canvas instance (account → per-course → self-report cascade), matches findings against available modules, and returns detected tools, module-enable suggestions, unmatched tools, and a catalog pick-list. Read-only.

## registry — Resource registry: search, install, uninstall, lockfiles.

- [[install_resource]] — Install a template, theme, prompt, or adapter-config resource from github://, ryfter://, or file:// into the local registry.
- [[list_installed_resources]] — List resources installed in the local registry, optionally filtered by kind.
- [[uninstall_resource]] — Remove a resource from the local registry by kind and id. Bundle entries also remove their included resources.
- [[search_registry]] — Search available registry resources from the free GitHub registry or configured premium registry.
- [[install_resources_from_lockfile]] — Install resources listed in a plain-text or JSON lockfile, preserving order and skipping already-installed versions.

## transcripts — Transcript enrichment, comparison, and week mapping.

- [[bulk_fetch_panopto_transcripts]] — Download all Panopto transcripts for a folder as VTT files. Optionally auto-ingests into Curriculum Intelligence. Requires `video.setup_panopto` to be run first.
- [[enrich_panopto_transcripts]] — Generate enriched markdown from downloaded Panopto VTT files. Adds Week/Date headers, deep links every 5 minutes, strips filler words, applies vocab corrections, and highlights key statements as blockquotes. Requires `ct_import` action `transcripts_panopto` to have been run first.
- [[setup_transcript_source]] — Configure which transcript source enrichment uses (panopto default, or whisper) plus the Whisper engine, model, and audioMode. action=get reads current config; action=set updates provided fields.
- [[compare_transcripts]] — Opt-in: transcribe Panopto lecture audio locally with Whisper and compare it against the Panopto VTT. Writes a .comparison.md per session ranking disagreements, and returns suggested vocab corrections for you to approve (nothing is written to panopto-vocab.json automatically). Needs audio — auto-fetched when available, otherwise follow the returned guided web-download instructions. Requires `ct_import` action `transcripts_panopto` first.
- [[ingest_transcripts]] — Read .vtt/.srt/.md transcript files from a folder and write transcripts.json.
- [[map_transcripts_to_weeks]] — Match each ingested transcript to a course week. Writes week-map.json.
- [[download_transcripts]] — [canvas-backup] Placeholder for future bulk Panopto transcript download.

## research — News feeds, recent developments, quote banks, calendars.

- [[analyze_course]] — Answer "how stale is my course?" — ingests the Canvas archive, scores topic currency, and generates KEEP/UPDATE/DROP/ADD verdicts in one step.
- [[brainstorm_interactive]] — Propose interactive Canvas widget concepts for a given topic + learning goal. Returns 2-3 distinct widget specs (kind, purpose, content schema, initial sample data, dimensions, accessibility notes) plus rationale and pedagogical fit. Returns SPECS only — a future render step compiles a chosen spec into a hostable HTML/JS bundle. Uses the Anthropic API via `ct_setup` action `anthropic`.
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

- [[accessibility_review_queue]] — The per-course "near the edge" accessibility worklist: pages with borderline findings, needs-human-review criteria, or acknowledged publishes. Lists open entries worst-margin first with live Canvas URLs for human-eyes verification; resolve marks a page reviewed. The professor is the final arbiter.
- [[audit_course_accessibility]] — Run the full WCAG 2.2 engine stack (in-house + axe-core) across every generated page of a course project, report per-page verdicts against the required level, and refresh the borderline review queue. The regular between-semesters check.
- [[review_accessibility_policy]] — The institution accessibility policy anchor (spec §7): shows the policy URLs, required conformance level, cadence, and last-verified date; confirm: true stamps today's date after the professor re-reads the policy. Also accepts updates to urls / requiredConformance / recheckWeeks / wcag3Advisory so nobody edits JSON by hand. Default level: WCAG 2.1 AA (ADA Title II baseline).
- [[wave_deep_check]] — Deep accessibility check of a PUBLICLY-visible page via the paid WAVE API (WebAIM). Two-call spend gate: first call previews the cost (~2 credits) and runs nothing; re-call with confirm: true to spend. Auth-gated Canvas URLs are refused before any spend — use the free WAVE browser extension or MS Accessibility Insights for those. Optional apiKey is saved to the institution config on first use.

## snapshots — Publish snapshot listing and pruning.

- [[preview_course_publish]] — Generate a publish preview: per-page diffs, warnings, and a manifest. No Canvas writes occur.
- [[publish_course]] — Publish the previewed manifest to Canvas with explicit per-entry approvals. Stops on first failure.
- [[rollback_course_publish]] — Restore every successfully-published entry from a snapshot to its prior Canvas state.
- [[list_publish_snapshots]] — List all publish snapshots for a course in oldest-to-newest order, showing which is currently live in Canvas and which can be rolled back to / rolled forward to. Pipe the snapshotId from a row into `ct_publish` action `rollback` to restore that version.
- [[prune_publish_snapshots]] — Apply retention policy to a course's publish snapshots. Removes snapshots older than the configured retention window AND beyond the configured retention count (defaults: keep 3 most-recent, keep anything ≤ 30 days old). Never removes the currently-live snapshot. When dryRun is true, lists what would be pruned without taking action. Auto-pruning also runs after every successful `ct_publish` action `publish`.
- [[snapshot_course]] — Write or update a course reference markdown doc capturing course identifiers, assignment groups, modules, and an append-only Update Log. Re-running against the same outputPath regenerates the auto-managed sections (delimited by AUTO:start/AUTO:end HTML comment markers) and preserves all hand-edited prose around them.

## design — Canvas pattern catalog, previews, layout templates.

- [[show_canvas_capabilities]] — Returns the catalog of Canvas-safe design patterns. Optionally filter by category (layout, information, interactive, pedagogical, branded) or supportStatus (supported, partial, aspirational). Use this to discover what patterns exist; then call `ct_build` action `preview_pattern` to see any specific pattern rendered.
- [[preview_canvas_pattern]] — Renders a specific Canvas capability pattern to a standalone HTML file that can be opened in any browser. Use this after `ct_advanced` run `show_canvas_capabilities` to actually see a pattern in action.
- [[update_course_materials]] — Answer "update my materials and export" — drafts updated briefs for every assignment in next-plan/, runs the examples update pass, and exports to CDS format.
- [[draft_student_rubric]] — Take a faculty-facing rubric and use the Anthropic API to produce a student-facing rewrite plus worked examples per criterion. Writes a markdown file matching the CDS rubric page-type schema so `ct_build` action `course` can render it as a Canvas page + downloadable .md for students to paste into an LLM. Run `ct_setup` action `anthropic` first if not configured.
- [[review_canvas_rubric]] — Pull a rubric from Canvas (the assignment's attached rubric first; falls back to the course rubric list), detect whether it changed since your last student rewrite, and run a smart triage (acceptable / needs-update / needs-review) with specific flagged criteria. Read-only — writes nothing. When the verdict is needs-update it proposes a revised faculty rubric for your approval; feed the approved rubric to `ct_build` action `rubric`. Run `ct_setup` action `canvas` and `ct_setup` action `anthropic` first.
- [[generate_quiz]] — Author a local quiz draft markdown from course materials (books/slides/lectures) with difficulty-mix knobs. Writes under week-NN/quizzes/ (temp+rename). Manual anytime — not required for the weekly shell spot-check (use `ct_review` action `quiz` for live Canvas). Requires an active LLM (`ct_setup` action `anthropic` or Ollama). Does not publish to Canvas Quizzes.
- [[paste_layout]] — Paste raw HTML and CSS (e.g. from Stitch or Figma) to adapt it into a Canvas-safe slot layout and audit accessibility.
- [[save_layout_as_template]] — Formulate and save a successfully adapted layout as a reusable template in the local registry.
- [[draft_assignment_brief]] — LLM-draft an updated assignment brief. Sets replacement_recommended on DROP/stale.
- [[update_examples]] — Mechanical year/tool-name replacement pass + optional LLM proposed rewrites.
- [[import_course]] — [@canvas-toolchain/canvas-design-studio] Import a Canvas Backup archive into a Canvas Design Studio course folder.
- [[generate_course]] — [@canvas-toolchain/canvas-design-studio] Generate Canvas-safe HTML for every page in a Canvas Design Studio course folder.

## admin — Institution profile, dashboard, feedback, defaults.

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
