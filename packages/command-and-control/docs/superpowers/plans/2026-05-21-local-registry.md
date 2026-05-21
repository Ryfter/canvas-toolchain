# Local Registry Implementation Plan

Issue: [#10 Implement local registry](https://github.com/Ryfter/canvas-toolchain/issues/10)

## Scope

Implement the local resource registry foundation under `packages/command-and-control/src/registry/`.

This slice owns:

- Registry root resolution under `~/.command-and-control/registry/`, with `CC_HOME` support for tests.
- Resource directory layout: `<kind>/<id>@<version>/`.
- `index.json` read/write helpers with schema version `1`.
- Shared manifest validation for `template`, `theme`, `prompt`, and `adapter-config`.
- Atomic local write helper that validates manifest and payload files before moving the resource into the registry and updating the index.

This slice does not implement URL fetching, dependency recursion, search, MCP tool registration, or bundle behavior. Those are issues `#11` through `#18`.

## Reasoning

The registry has to be below the MCP tool layer. `install_resource`, `list_installed_resources`, `search_registry`, bundle installation, brand adapters, layout adapters, and future update workflows all need one storage contract instead of separate ad hoc file writes.

The implementation uses `getCcHomePath()` so the registry follows the same local data-home convention as `config.json`. Tests isolate this with `CC_HOME`.

Payload validation is strict: installed files must exactly match `manifest.files`, and unsafe relative paths are rejected before anything is written. This keeps later network and premium resolvers from being able to write outside the registry root.

## Verification

```powershell
npm test --workspace=packages/command-and-control -- tests/registry/local_registry.test.ts
npm run build --workspace=packages/command-and-control
```
