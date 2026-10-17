---
id: "setup_canvas_backup"
description: "[canvas-backup] Generate the Canvas Backup config from your Canvas connection. Writes the toml without the token (passed via CANVAS_TOKEN). Run once per semester so canvas_archive_download works."
section: "admin"
intent_tool: "ct_setup"
intent_action: "backup"
exposure: "intent"
related: [download_canvas_archive, get_cc_status, set_courses_root, setup_anthropic, setup_canvas, setup_cc, setup_doctor, setup_ollama, setup_transcript_source]
deprecated: "Deprecated — use ct_setup {action: \"backup\"}; removed in 2.5.0."
---
<!-- generated:end -->

# setup_canvas_backup

## When to use

<!-- Hand-written guidance starts here. The generator only rewrites the frontmatter above the marker. -->

## Pitfalls
