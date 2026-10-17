---
id: "modules"
kind: "section"
description: "Plug-in module discovery, install, enable/disable."
ops: 6
related: [ct_advanced]
---
# modules section

Plug-in module discovery, install, enable/disable.

## Operations (6)

- [[set_module_enabled]] — Enable or disable a plug-in module (e.g. video) by writing modules.json. Always available so a disabled module can be re-enabled. Takes effect after the MCP client reconnects/restarts.
- [[list_modules]] — List all known plug-in modules with their id, name, enabled state, active provider, and the provider/tool types they handle.
- [[browse_module_catalog]] — Module catalog: exists / installed / enabled / update state and installer-GUI requests, plus companion programs (e.g. Canvas Backup). Read-only; clearPending:true discards stale requests.
- [[install_module]] — Install/upgrade a catalog module. Two-call gate: first call previews name/version/size/source/sha256 (no side effects); re-call with confirm:true to verify the sha256 and install. Needs a reconnect.
- [[uninstall_module]] — Remove a channel-installed module (artifact + record) and disable it. Bundled modules cannot be uninstalled — disable those with set_module_enabled.
- [[discover_tools]] — Discover institutional tools: scans Canvas (account → course → self-report), matches findings to modules, and returns detected tools, enable suggestions, unmatched tools, and a pick-list. Read-only.
<!-- generated:end -->

# Notes

<!-- Hand-written. The generator regenerates everything above the marker. -->
