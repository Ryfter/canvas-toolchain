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
- [[browse_module_catalog]] — List the module catalog: what exists, what is installed/enabled, which have updates, and any modules requested from the installer GUI. Read-only. Pass clearPending: true to discard stale installer requests. Also lists companion programs (e.g. Canvas Backup) that work alongside the toolchain and are installed separately.
- [[install_module]] — Install (or upgrade) a module from the catalog. Two-call gate: first call previews name/version/size/source/sha256 with NO side effects; call again with confirm: true to download, verify the pinned sha256, and install. Takes effect on the next reconnect.
- [[uninstall_module]] — Remove a channel-installed module (artifact + record) and disable it. Bundled modules cannot be uninstalled — disable those with set_module_enabled.
- [[discover_tools]] — Discover what tools the institution/professor uses: scans the Canvas instance (account → per-course → self-report cascade), matches findings against available modules, and returns detected tools, module-enable suggestions, unmatched tools, and a catalog pick-list. Read-only.
<!-- generated:end -->

# Notes

<!-- Hand-written. The generator regenerates everything above the marker. -->
