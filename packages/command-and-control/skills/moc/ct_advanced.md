---
id: "ct_advanced"
kind: "advanced"
description: "Less common operations, reached through ct_advanced describe/run."
ops: 31
related: [modules, registry, transcripts, research, accessibility, snapshots, design, admin]
---
# ct_advanced

Less common operations, reached through ct_advanced describe/run.

## Operations (31)

- [[show_canvas_capabilities]] — Returns the catalog of Canvas-safe design patterns. Optionally filter by category (layout, information, interactive, pedagogical, branded) or supportStatus (supported, partial, aspirational). Use this to discover what patterns exist; then call `ct_build` action `preview_pattern` to see any specific pattern rendered.
- [[set_active_llm_provider]] — Set the active generation LLM provider. Must be anthropic or ollama. Refuses to set a provider whose config file is absent.
- [[set_module_enabled]] — Enable or disable a plug-in module (e.g. video) by writing modules.json. Always available so a disabled module can be re-enabled. Takes effect after the MCP client reconnects/restarts.
- [[list_modules]] — List all known plug-in modules with their id, name, enabled state, active provider, and the provider/tool types they handle.
- [[browse_module_catalog]] — List the module catalog: what exists, what is installed/enabled, which have updates, and any modules requested from the installer GUI. Read-only. Pass clearPending: true to discard stale installer requests. Also lists companion programs (e.g. Canvas Backup) that work alongside the toolchain and are installed separately.
- [[install_module]] — Install (or upgrade) a module from the catalog. Two-call gate: first call previews name/version/size/source/sha256 with NO side effects; call again with confirm: true to download, verify the pinned sha256, and install. Takes effect on the next reconnect.
- [[uninstall_module]] — Remove a channel-installed module (artifact + record) and disable it. Bundled modules cannot be uninstalled — disable those with set_module_enabled.
- [[discover_tools]] — Discover what tools the institution/professor uses: scans the Canvas instance (account → per-course → self-report cascade), matches findings against available modules, and returns detected tools, module-enable suggestions, unmatched tools, and a catalog pick-list. Read-only.
- [[save_institution_profile]] — Write/merge the institution profile (the master tool library) and optional per-class tool deltas. Accretive — new tools are added, existing preserved. The profile is the payload for usage feedback (#77).
- [[submit_usage_feedback]] — Submit an anonymized inventory of your institution's tools as a GitHub issue, so the author can prioritize integrations. Opt-in. Two-call gate: call once to review the exact payload, then call again with confirm:true to submit via gh. named:true includes full identifiers (default is anonymized).
- [[set_course_aias_default]] — Set the course-wide AI Assessment Scale default for a CDS course folder. Writes defaultAiasLevel (and optional defaultAiasNote) into course-config.md. Per-page aiasLevel overrides this default at render time.
- [[open_dashboard]] — Start the local Canvas Toolchain dashboard (read-only course health view). Returns a localhost URL the professor can open in a browser. Requires `ct_setup` action `courses_root` first.
- [[enrich_panopto_transcripts]] — Generate enriched markdown from downloaded Panopto VTT files. Adds Week/Date headers, deep links every 5 minutes, strips filler words, applies vocab corrections, and highlights key statements as blockquotes. Requires `ct_import` action `transcripts_panopto` to have been run first.
- [[compare_transcripts]] — Opt-in: transcribe Panopto lecture audio locally with Whisper and compare it against the Panopto VTT. Writes a .comparison.md per session ranking disagreements, and returns suggested vocab corrections for you to approve (nothing is written to panopto-vocab.json automatically). Needs audio — auto-fetched when available, otherwise follow the returned guided web-download instructions. Requires `ct_import` action `transcripts_panopto` first.
- [[prune_publish_snapshots]] — Apply retention policy to a course's publish snapshots. Removes snapshots older than the configured retention window AND beyond the configured retention count (defaults: keep 3 most-recent, keep anything ≤ 30 days old). Never removes the currently-live snapshot. When dryRun is true, lists what would be pruned without taking action. Auto-pruning also runs after every successful `ct_publish` action `publish`.
- [[reembed_course_index]] — Switch embedding providers and rebuild the per-course index in one call. Convenience wrapper over `ct_setup` action `lecture_answers` + `ct_ask` action `index` --rebuild. Use when migrating from Ollama to Voyage (or vice versa), since vector dimensions are not interchangeable.
- [[snapshot_course]] — Write or update a course reference markdown doc capturing course identifiers, assignment groups, modules, and an append-only Update Log. Re-running against the same outputPath regenerates the auto-managed sections (delimited by AUTO:start/AUTO:end HTML comment markers) and preserves all hand-edited prose around them.
- [[wave_deep_check]] — Deep accessibility check of a PUBLICLY-visible page via the paid WAVE API (WebAIM). Two-call spend gate: first call previews the cost (~2 credits) and runs nothing; re-call with confirm: true to spend. Auth-gated Canvas URLs are refused before any spend — use the free WAVE browser extension or MS Accessibility Insights for those. Optional apiKey is saved to the institution config on first use.
- [[brainstorm_interactive]] — Propose interactive Canvas widget concepts for a given topic + learning goal. Returns 2-3 distinct widget specs (kind, purpose, content schema, initial sample data, dimensions, accessibility notes) plus rationale and pedagogical fit. Returns SPECS only — a future render step compiles a chosen spec into a hostable HTML/JS bundle. Uses the Anthropic API via `ct_setup` action `anthropic`.
- [[install_resource]] — Install a template, theme, prompt, or adapter-config resource from github://, ryfter://, or file:// into the local registry.
- [[list_installed_resources]] — List resources installed in the local registry, optionally filtered by kind.
- [[uninstall_resource]] — Remove a resource from the local registry by kind and id. Bundle entries also remove their included resources.
- [[search_registry]] — Search available registry resources from the free GitHub registry or configured premium registry.
- [[install_resources_from_lockfile]] — Install resources listed in a plain-text or JSON lockfile, preserving order and skipping already-installed versions.
- [[save_layout_as_template]] — Formulate and save a successfully adapted layout as a reusable template in the local registry.
- [[build_quote_bank]] — Scan lecture transcripts for notable lines. Writes quote-bank.json.
- [[fetch_news_feed]] — Fetch RSS/Atom feeds and return recent items filtered by date.
- [[scan_recent_developments]] — Ask the model what's new in a given topic area since a date.
- [[recommend_for_topic]] — Return a KEEP / UPDATE / DROP / ADD verdict for a topic based on its currency class and teaching history.
- [[generate_ideas_file]] — Write ideas.md with follow-on development ideas based on what the professor used.
- [[fetch_academic_calendar]] — Parse registrar URL or accept manual dates into calendar.json.
<!-- generated:end -->

# Notes

<!-- Hand-written. The generator regenerates everything above the marker. -->
