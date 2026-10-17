---
id: "setup_canvas"
description: "Configure the Canvas host and API token used for direct publishing. Validates the token against /api/v1/users/self before saving, then stores it locally with 0o600 permissions."
section: "admin"
intent_tool: "ct_setup"
intent_action: "canvas"
exposure: "intent"
related: [check_shell_readiness, get_cc_status, preview_course_publish, publish_course, set_courses_root, setup_anthropic, setup_canvas_backup, setup_cc, setup_doctor, setup_lecture_answers, setup_ollama, setup_transcript_source]
deprecated: "Deprecated — use ct_setup {action: \"canvas\"}; removed in 2.5.0."
---
<!-- generated:end -->

# setup_canvas

## When to use

<!-- Hand-written guidance starts here. The generator only rewrites the frontmatter above the marker. -->

## Pitfalls
