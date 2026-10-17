---
id: "setup_lecture_answers"
description: "First-run configuration for the lecture answers bot. Auto-detects Ollama on localhost:11434. When Ollama is absent, returns guidance to either install Ollama or re-call with provider=\"transformers-js\" (in-process; requires installing @xenova/transformers in command-and-control first) or provider=\"voyage\" (cloud, requires voyageApiKey). The bot is opt-in — until this tool succeeds, `ct_ask` action `ask` and `ct_ask` action `index` report NO_CONFIG."
section: "admin"
intent_tool: "ct_setup"
intent_action: "lecture_answers"
exposure: "intent"
related: [setup_cc, setup_anthropic, setup_canvas, setup_ollama, set_courses_root, get_cc_status, setup_transcript_source, setup_spot_check]
---
<!-- generated:end -->

# setup_lecture_answers

## When to use

<!-- Hand-written guidance starts here. The generator only rewrites the frontmatter above the marker. -->

## Pitfalls
