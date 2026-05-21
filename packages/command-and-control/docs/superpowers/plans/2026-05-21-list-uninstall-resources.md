# List And Uninstall Resources Implementation Plan

Issue: [#12 Implement list_installed_resources + uninstall_resource tools](https://github.com/Ryfter/canvas-toolchain/issues/12)

## Scope

Add registry query and removal behavior on top of the `index.json` foundation from issue `#10`.

Implemented behavior:

- `listInstalledResources({ kind? })` returns installed index entries sorted by `kind:id:version`.
- `uninstallResource({ kind, id, version? })` removes matching index entries and resource directories.
- Omitting `version` removes every installed version for the requested `kind` and `id`.
- `bundle` is now a supported registry index kind because `#12` needs bundle removal semantics even though bundle installation is tracked by `#18`.
- Bundle uninstall cascades to entries listed in the bundle entry's `includes` metadata.
- Uninstall refuses to remove any path that resolves outside the registry root.
- MCP tools `list_installed_resources` and `uninstall_resource` are registered in `src/index.ts`.

## Reasoning

List and uninstall are local index operations. They do not need resolver logic, network access, or premium registry configuration. Keeping them in `local_registry.ts` gives later MCP handlers and workflow code a single index contract.

Bundle cascade is implemented at the index-entry level now because the install behavior for bundles has not landed yet. Issue `#18` can populate `includes` when a bundle is installed; uninstall already knows how to honor it.

## Verification

```powershell
npm test --workspace=packages/command-and-control -- tests/registry/resource_tools.test.ts
npm test --workspace=packages/command-and-control
npm run build --workspace=packages/command-and-control
```
