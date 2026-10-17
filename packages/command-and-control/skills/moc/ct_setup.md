---
id: "ct_setup"
kind: "intent"
description: "Configure credentials, providers, and paths. Run first."
ops: 11
related: [admin]
---
# ct_setup (intent tool)

Configure credentials, providers, and paths. Run first.

## Operations (11)

- [[setup_cc]] — Configure Command & Control: set mode (easy/advanced), Anthropic model, Ollama base URL and model, and routing preferences. Run this first.
- [[setup_anthropic]] — Configure the Anthropic API key used by all AI-powered tools. Validates the key against the Anthropic API before saving. Stored locally at ~/.command-and-control/anthropic-config.json with 0o600 permissions.
- [[setup_canvas]] — Configure the Canvas LMS host and API token used for direct page publishing. Validates the token against /api/v1/users/self before saving. Stored locally at ~/.command-and-control/canvas-config.json with 0o600 permissions.
- [[setup_ollama]] — Configure Ollama as the local generation LLM. Discovery mode (no model) returns the recommended-models markdown. Commit mode (with model) validates the model is pulled and writes ollama-config.json.
- [[set_courses_root]] — Set the root directory for course discovery used by the local dashboard. The dashboard scans this directory recursively for folders containing course-config.md.
- [[get_cc_status]] — Get a health snapshot: which domain packages are installed, whether Anthropic key and Ollama are available, active routing config, and last-run timestamps per workflow.
- [[setup_transcript_source]] — Configure which transcript source enrichment uses (panopto default, or whisper) plus the Whisper engine, model, and audioMode. action=get reads current config; action=set updates provided fields.
- [[setup_lecture_answers]] — First-run configuration for the lecture answers bot. Auto-detects Ollama on localhost:11434. When Ollama is absent, returns guidance to either install Ollama or re-call with provider="transformers-js" (in-process; requires installing @xenova/transformers in command-and-control first) or provider="voyage" (cloud, requires voyageApiKey). The bot is opt-in — until this tool succeeds, `ct_ask` action `ask` and `ct_ask` action `index` report NO_CONFIG.
- [[setup_spot_check]] — Opt in/out of a weekly shell (+ quiz validate) spot-check reminder day. Recommends Saturday. Persists weeklyCheckEnabled + weeklyCheckDay under ~/.command-and-control/spot-check.json (no secrets). Manual `ct_review` action `shell_readiness` always works. Does not install OS cron (fast-follow).
- [[setup_course]] — Register a new course in Curriculum Intelligence. Creates a course folder on disk and records its location in the app config so other tools can find it by id alone.
- [[setup_canvas_backup]] — [canvas-backup] Generate a Canvas Backup config from the Canvas connection already configured in Command and Control. Writes ~/.command-and-control/canvas-backup.generated.toml (token stays out of the file; passed via CANVAS_TOKEN at archive time). Run this once per semester so `ct_import` action `canvas_archive_download` can find base_url / archive root / year / semester.
<!-- generated:end -->

# Notes

<!-- Hand-written. The generator regenerates everything above the marker. -->
