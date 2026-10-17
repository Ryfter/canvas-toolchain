---
id: "setup_canvas_backup"
description: "[canvas-backup] Generate a Canvas Backup config from the Canvas connection already configured in Command and Control. Writes ~/.command-and-control/canvas-backup.generated.toml (token stays out of the file; passed via CANVAS_TOKEN at archive time). Run this once per semester so `ct_import` action `canvas_archive_download` can find base_url / archive root / year / semester."
section: "admin"
intent_tool: "ct_setup"
intent_action: "backup"
exposure: "intent"
related: [setup_cc, setup_anthropic, setup_canvas, setup_ollama, set_courses_root, get_cc_status, setup_transcript_source, setup_lecture_answers]
---
<!-- generated:end -->

# setup_canvas_backup

## When to use

<!-- Hand-written guidance starts here. The generator only rewrites the frontmatter above the marker. -->

## Pitfalls
