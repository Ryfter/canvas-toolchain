---
id: "setup_ollama"
description: "Configure Ollama as the local generation LLM. Discovery mode (no model) returns the recommended-models markdown. Commit mode (with model) validates the model is pulled and writes ollama-config.json."
section: "admin"
intent_tool: "ct_setup"
intent_action: "ollama"
exposure: "intent"
related: [get_cc_status, set_active_llm_provider, set_courses_root, setup_anthropic, setup_canvas, setup_cc, setup_doctor, setup_llm_provider, setup_lmstudio]
deprecated: "Deprecated — use ct_setup {action: \"ollama\"}; removed in 2.5.0."
---
<!-- generated:end -->

# setup_ollama

## When to use

<!-- Hand-written guidance starts here. The generator only rewrites the frontmatter above the marker. -->

## Pitfalls
