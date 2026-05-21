# LayoutAdapter + PasteAdapter (#26)

## Status

Implemented and tested.

## Scope

- Added `src/layout/layout_adapter.ts` with the provider-facing `LayoutAdapter` interface.
- Added `src/layout/paste_adapter.ts`.
- Added focused tests in `tests/layout/paste_adapter.test.ts`.

## Reasoning

The existing `src/tools/layout_adapter.ts` file owns the MCP paste/extract/save workflow. Issue #26 is a lower-level provider boundary, so it now lives under `src/layout/` and does not duplicate the transform logic.

`PasteAdapter.generateLayout()` always throws with instructions to use `paste_layout`. That is deliberate: paste mode is not an API-backed generator. It is a coordination shim for the current no-API reality where a professor uses Stitch, Figma, or another visual tool and then pastes HTML/CSS into the MCP tool for Canvas-safe transformation.

The adapter input uses `SlotName` from `@canvas-toolchain/shared-types` so future adapters share the same slot vocabulary as templates.

## Verification

```powershell
npm test --workspace=packages/command-and-control -- tests/layout/paste_adapter.test.ts
```

Result: 1 test passed.
