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

- [[show_canvas_capabilities]] — Canvas-safe pattern catalog: filter by category (layout, information, interactive, pedagogical, branded) or supportStatus (supported/partial/aspirational). Then ct_build preview_pattern renders one.
- [[set_active_llm_provider]] — Set the active generation LLM provider. Must be lmstudio, ollama or anthropic. Refuses to set a provider whose config file is absent.
- [[set_module_enabled]] — Enable or disable a plug-in module (e.g. video) by writing modules.json. Always available so a disabled module can be re-enabled. Takes effect after the MCP client reconnects/restarts.
- [[list_modules]] — List all known plug-in modules with their id, name, enabled state, active provider, and the provider/tool types they handle.
- [[browse_module_catalog]] — Module catalog: exists / installed / enabled / update state and installer-GUI requests, plus companion programs (e.g. Canvas Backup). Read-only; clearPending:true discards stale requests.
- [[install_module]] — Install/upgrade a catalog module. Two-call gate: first call previews name/version/size/source/sha256 (no side effects); re-call with confirm:true to verify the sha256 and install. Needs a reconnect.
- [[uninstall_module]] — Remove a channel-installed module and disable it. With stored credentials, confirm: true is required and they are deleted too. Bundled modules: use set_module_enabled.
- [[discover_tools]] — Discover institutional tools: scans Canvas (account → course → self-report), matches findings to modules, and returns detected tools, enable suggestions, unmatched tools, and a pick-list. Read-only.
- [[save_institution_profile]] — Write/merge the institution profile (master tool library) plus optional per-class deltas. Accretive — new tools added, existing preserved. This profile is the payload for usage feedback.
- [[submit_usage_feedback]] — Submit an anonymized inventory of your institution's tools as a GitHub issue so the author can prioritize integrations. Opt-in two-call gate: review, then confirm:true via gh. named:true adds ids.
- [[set_course_aias_default]] — Set the course-wide AI Assessment Scale default for a CDS course folder, writing defaultAiasLevel (and optional defaultAiasNote) into course-config.md. Per-page aiasLevel overrides at render.
- [[open_dashboard]] — Start the local Canvas Toolchain dashboard (read-only course health view). Returns a localhost URL the professor can open in a browser. Requires `ct_setup` action `courses_root` first.
- [[enrich_panopto_transcripts]] — Enrich Panopto VTT into markdown: Week/Date headers, deep links every 5 min, filler stripped, vocab corrections, key statements as blockquotes. Requires a prior transcripts_panopto run.
- [[compare_transcripts]] — Opt-in: local Whisper-transcribe audio, diff vs Panopto VTT. Writes .comparison.md per session; returns vocab fixes for approval (none auto-written). Needs audio + prior transcripts_panopto run.
- [[prune_publish_snapshots]] — Apply retention to publish snapshots: drops those past the window and count (default keep 3, keep ≤30 days), never the live one. dryRun lists only; also runs after every successful publish.
- [[reembed_course_index]] — Switch embedding providers and rebuild the course index in one call (ct_setup lecture_answers + ct_ask index --rebuild). Use when migrating providers — vector dimensions are not interchangeable.
- [[snapshot_course]] — Write/update a course reference doc (identifiers, assignment groups, modules, append-only Update Log). Re-runs regenerate the AUTO:start/AUTO:end sections but preserve hand-edited prose around them.
- [[wave_deep_check]] — Deep a11y check of a PUBLIC page via the paid WAVE API. Spend gate: preview (~2 credits) first, then confirm:true. Auth-gated Canvas URLs refused — use the free extension. apiKey saved on first use.
- [[brainstorm_interactive]] — Propose interactive Canvas widget concepts for a topic + learning goal: 2-3 specs (kind, purpose, content schema, sample data, accessibility notes) with rationale. Returns SPECS only. Needs Anthropic.
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

## Concepts (6)

- [[accessibility_gate]] — How the accessibility gate works: what blocks a Canvas pu...
- [[module_channel]] — Plug-in modules and Canvas modules share a word, not a sy...
- [[provider_setup]] — Credentials and model backends: which file each setup too...
- [[publish_safety]] — The publish safety net: preview captures a rollback basel...
- [[semester_rollover]] — Rolling a course into a new semester: archive and ingest ...
- [[transcript_pipeline]] — Panopto transcripts from fetch to answer: bulk download, ...
<!-- generated:end -->

# Notes

<!-- Hand-written. The generator regenerates everything above the marker. -->
