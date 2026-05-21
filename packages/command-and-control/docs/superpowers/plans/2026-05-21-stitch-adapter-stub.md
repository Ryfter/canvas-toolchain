# StitchAdapter Stub (#30)

## Status

Implemented and tested.

## Scope

- Added `src/layout/stitch_adapter.ts`.
- Added focused tests in `tests/layout/stitch_adapter.test.ts`.

## Reasoning

Stitch has no public programmatic API for this workflow, so the implementation must not pretend to call one. The stub keeps the `LayoutAdapter` contract stable, logs the current limitation, documents the intended future request/response shape in code comments, and delegates to `PasteAdapter`.

Delegating to `PasteAdapter` preserves the current working path: generate externally, then call `paste_layout` for Canvas-safe transformation and slot extraction.

## Verification

```powershell
npm test --workspace=packages/command-and-control -- tests/layout/stitch_adapter.test.ts
```

Result: 1 test passed.
