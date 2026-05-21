# PomelliAdapter Stub (#25)

## Status

Implemented and tested.

## Scope

- Added `src/brand/pomelli_adapter.ts`.
- Added focused tests in `tests/brand/pomelli_adapter.test.ts`.

## Reasoning

Pomelli does not have a public programmatic API for this workflow yet, so this adapter deliberately avoids inventing an integration surface. It implements the same `BrandAdapter` interface callers will use later, logs the no-API status, and delegates to a fallback adapter.

The default fallback is `ManualAdapter` because it is available now and supports professor-provided kits from Pomelli UI, manual design work, or any other source. When a Pomelli API exists, the implementation can change inside `PomelliAdapter` without changing callers.

## Verification

```powershell
npm test --workspace=packages/command-and-control -- tests/brand/pomelli_adapter.test.ts
```

Result: 1 test passed.
