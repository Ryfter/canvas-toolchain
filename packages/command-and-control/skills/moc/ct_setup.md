---
id: "ct_setup"
kind: "intent"
description: "Configure credentials, providers, and paths. Run first."
ops: 14
related: [admin]
---
# ct_setup (intent tool)

Configure credentials, providers, and paths. Run first.

## Operations (14)

- [[setup_cc]] — Configure Command & Control: set mode (easy/advanced), Anthropic model, Ollama base URL and model, and routing preferences. Run this first.
- [[setup_anthropic]] — Configure the Anthropic API key used by all AI tools. Validates it against the Anthropic API before saving, then stores it locally with 0o600 permissions.
- [[setup_canvas]] — Configure the Canvas host and API token used for direct publishing. Validates the token against /api/v1/users/self before saving, then stores it locally with 0o600 permissions.
- [[setup_ollama]] — Configure Ollama as the local generation LLM. Discovery mode (no model) returns the recommended-models markdown. Commit mode (with model) validates the model is pulled and writes ollama-config.json.
- [[setup_lmstudio]] — Configure LM Studio (OpenAI-compatible local server) as the generation LLM. Discovery mode lists loaded models from the running server; commit mode validates the model and writes lmstudio-config.json.
- [[setup_llm_provider]] — Report the active and configured LLM providers; with no arguments it also probes local Ollama and LM Studio at their default URLs. Pass provider to activate a configured one.
- [[set_courses_root]] — Set the root directory for course discovery used by the local dashboard. The dashboard scans this directory recursively for folders containing course-config.md.
- [[get_cc_status]] — Get a health snapshot: which domain packages are installed, whether Anthropic key and Ollama are available, active routing config, and last-run timestamps per workflow.
- [[setup_doctor]] — Run a read-only readiness check: what is configured, what is broken, and the ct_setup action that fixes each item. probe:true adds live Canvas and Anthropic checks.
- [[setup_transcript_source]] — Configure which transcript source enrichment uses (panopto default, or whisper) plus the Whisper engine, model, and audioMode. action=get reads current config; action=set updates provided fields.
- [[setup_lecture_answers]] — Lecture answers bot setup: auto-detects Ollama on localhost:11434, else install or pick transformers-js (in-process, needs @xenova/transformers) or voyage (cloud, key). Else ct_ask reports NO_CONFIG.
- [[setup_spot_check]] — Opt in/out of a weekly shell + quiz spot-check reminder day (recommends Saturday). Persists the setting only; no OS cron installed. Manual ct_review shell_readiness always works.
- [[setup_course]] — Register a new course in Curriculum Intelligence. Creates a course folder on disk and records its location in the app config so other tools can find it by id alone.
- [[setup_canvas_backup]] — [canvas-backup] Generate the Canvas Backup config from your Canvas connection. Writes the toml without the token (passed via CANVAS_TOKEN). Run once per semester so canvas_archive_download works.

## Concepts (1)

- [[provider_setup]] — Credentials and model backends: which file each setup too...
<!-- generated:end -->

# Notes

<!-- Hand-written. The generator regenerates everything above the marker. -->
