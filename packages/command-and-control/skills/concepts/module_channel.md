---
id: "module_channel"
description: "Plug-in modules and Canvas modules share a word, not a system: installing and enabling a tool bundle is nothing like reading a Canvas course's modules."
related: [browse_module_catalog, discover_tools, install_module, list_modules, set_module_enabled, uninstall_module]
---

# Two things called "module"

The registry splits one word into two systems, and the split is deliberate:

- A **plug-in module** is a bundle of MCP tools identified by an id. `video`,
  `oral-assessment`, `group-builder`, `roster`, and `peerassessment` are the
  **bundled** ones — pre-installed and not uninstallable — while `announcements`
  is the module the channel currently installs. Module operations land in the
  `modules` topic map. [[list_modules]], [[set_module_enabled]],
  [[browse_module_catalog]], [[install_module]], [[uninstall_module]].
- A **Canvas module** is a course container (Week 01, "Resources", …).
  [[list_canvas_modules]] reads them from the locally ingested `topic-map.json`
  for a `courseId` + `semesterId` — no Canvas call — and
  [[check_shell_readiness]] takes numeric Canvas module ids as input.

Nothing is shared between them: different ids, different files on disk, different
parameters. The collision that matters is a *tool named `list_modules`* — which is
exactly what the plug-in section is called, so the Canvas-native reader is
`list_canvas_modules` instead.

## The plug-in lifecycle

1. [[browse_module_catalog]] — see what is installable, what is installed, what is
   enabled, and whether the installer GUI has left a pending request. Read-only
   except for `clearPending: true`, which deletes the pending-request file.
2. [[install_module]] — a **two-call gate**. The first call previews name,
   version, size, source, and sha256 and downloads nothing; re-calling with
   `confirm: true` downloads, verifies the artifact's sha256, installs it, and
   sets `enabled: true` in `modules.json`.
3. **Reconnect the MCP client.** Module artifacts are loaded at server startup, so
   a freshly installed module's tools do not exist in the running session.
4. [[set_module_enabled]] — turn a *bundled* module on or off in `modules.json`.
   It accepts only the five bundled ids, so it cannot enable a channel-installed
   module — [[install_module]] already did that.
5. [[uninstall_module]] — remove a channel-installed module's artifact and record,
   and set `enabled: false` in `modules.json`.

[[discover_tools]] is the shortcut into step 1 for a new institution: it scans
Canvas for known LTI tools and suggests the modules that would handle what it
finds.

## Why ids are namespaced

Module operations are adapted onto the operation registry as
`<moduleId>.<toolName>`, always in section `modules`, always exposure
`advanced` (`packages/command-and-control/src/surface/module_adapter.ts`). The
host namespaces them — never the module author — which is what makes a
`list_modules` collision structurally impossible. So `setup_panopto` from the
`video` module is reached as `video.setup_panopto` through `ct_advanced`, and its
`related:` links come from the section seed rather than a curated cross-tool edge.
The adapter also rejects duplicate tool names within a module, and the loader skips
a module that throws rather than failing the server.

A consequence worth internalizing: **module operations are not in the committed
skill tree.** The generated graph is core-only (86 operations), because module ops
exist only on a machine where the module is enabled and a tree that depended on
the local `modules.json` would not be reproducible. `--include-modules` exists for
local inspection only.

## What the channel enforces

The channel is a supply-chain surface, so its checks are deliberately tight
(`packages/command-and-control/src/channel/catalog.ts`):

- **The artifact URL must be canonical and allow-listed** — parsing and
  re-serializing it must be a no-op, it must be https, and it must sit under the
  repo's own `modules/` prefix. A non-canonical URL (dot segments, odd encoding)
  is refused outright rather than normalized.
- **Redirects are confined** to the `githubusercontent.com` domain. This is a
  lesson paid for in a shipped bug: release downloads are served from
  `release-assets.githubusercontent.com`, and an allow-list naming one host
  refused every install.
- **A size ceiling** applies to the artifact's declared size and again while
  downloading, and the catalog's `catalogVersion` must not be newer than the
  toolchain supports — an older catalog stays readable, a newer one is refused
  loudly instead of being mis-parsed.
- **The installed ledger is re-validated.** Its `id` and `version` become path
  segments, so both are re-checked against their exact shapes before a load or a
  prune touches the filesystem.
- **Bundled modules cannot be uninstalled.** `uninstall_module` refuses with
  `BUNDLED_MODULE` and points at [[set_module_enabled]] — disabling is the
  supported way to remove a bundled module from the surface.

## Pitfalls

- **`module` and `moduleId` are different parameters.** [[set_module_enabled]]
  takes `module`; [[install_module]] and [[uninstall_module]] take `moduleId`.
  Neither is a Canvas module id, and neither takes a `courseId`.
- **Numeric module ids belong to Canvas.** `check_shell_readiness` accepts
  `moduleIds` as *numbers* — those are Canvas module ids, used to resolve which
  week a module belongs to. Passing a plug-in id there is meaningless.
- **Enabled ≠ installed ≠ working.** `list_modules` reports each of the five
  **bundled** modules' id, name, enabled state, active provider where it has one,
  and a `loadError` if it failed to load — fail-soft. Channel-installed modules
  are not listed at all; [[browse_module_catalog]] is where those appear. A
  module can be enabled and still report a load error, which is the case worth
  reading.
- **Enabling takes effect on reconnect.** Anything you change in `modules.json`
  is invisible to the running session, which is why the tools say so.
- **The catalog is a cross-language contract.** The same
  `module-catalog.json` is read by the TypeScript channel and by the Go
  installer's picker; raising the catalog schema without teaching the installer
  breaks its picker while the CLI keeps working.

## Sources

- `packages/command-and-control/src/surface/module_adapter.ts` — host
  namespacing, forced section/exposure, duplicate-name rejection.
- `packages/command-and-control/src/modules/registry.ts` — `KNOWN_MODULES`
  (the bundled five), load-fail-soft behavior, bundled vs channel-installed
  precedence.
- `packages/command-and-control/src/modules/manifest.ts` and
  `src/channel/installed.ts` — `modules.json` and `installed-modules.json`
  locations, `0o600` atomic writes, ledger path-segment revalidation.
- `packages/command-and-control/src/channel/{catalog,install,hash,pending}.ts` —
  canonical URL / prefix / redirect / size / catalog-version rules, the
  two-call preview-then-confirm gate, sha256 verification, `BUNDLED_MODULE`,
  the `modules.json` enable/disable writes, and the pending-request file.
- `packages/command-and-control/src/tools/{list_modules,set_module_enabled,module_channel_tools}.ts`
  — the plug-in operations and their parameters.
- `packages/command-and-control/src/surface/registry.ts` and
  `packages/curriculum-intelligence/src/tools/list_modules.ts` —
  `list_canvas_modules`, which reads the local topic map, and the split from
  `list_modules`.
- `packages/command-and-control/src/tools/shell_ready/types.ts` and
  `workflows/check_shell_readiness.ts` — numeric Canvas `moduleIds`.
- `packages/command-and-control/tests/surface-historical-coverage.test.ts` — the
  recorded decision to split `list_modules` from `list_canvas_modules`.
