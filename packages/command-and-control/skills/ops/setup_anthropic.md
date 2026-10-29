---
id: "setup_anthropic"
description: "Configure the Anthropic API key used by all AI tools. Validates it against the Anthropic API before saving, then stores it locally with 0o600 permissions."
section: "admin"
intent_tool: "ct_setup"
intent_action: "anthropic"
exposure: "intent"
related: [get_cc_status, set_active_llm_provider, set_courses_root, setup_canvas, setup_cc, setup_llm_provider, setup_lmstudio, setup_module_credentials, setup_ollama]
deprecated: "Deprecated — use ct_setup {action: \"anthropic\"}; removed in 2.5.0."
---
<!-- generated:end -->

# setup_anthropic

## When to use

<!-- Hand-written guidance starts here. The generator only rewrites the frontmatter above the marker. -->

## Pitfalls
