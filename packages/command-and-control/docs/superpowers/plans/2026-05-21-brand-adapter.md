# BrandAdapter + ManualAdapter (#22)

## Status

Implemented and tested.

## Scope

- Added the shared `BrandKitInput` and `BrandKit` contracts to `packages/shared-types`.
- Added `src/brand/brand_adapter.ts` as the pluggable C&C interface:
  - `generateBrandKit(input: BrandKitInput): Promise<BrandKit>`
- Added `src/brand/manual_adapter.ts` for the always-available passthrough path.
- Added focused tests in `tests/brand/manual_adapter.test.ts`.

## Reasoning

`BrandKit` is used by C&C today but is expected to feed theme and prompt-set workflows across package boundaries later, so it belongs in `@canvas-toolchain/shared-types` rather than being locked inside C&C. C&C owns the adapter interface and concrete adapter implementation because adapter selection is coordinator behavior.

`ManualAdapter` requires `input.kit`, fills defaults for omitted fields, and stamps `source.adapter = "manual"` with the raw input and fetch timestamp. This keeps the professor/manual paste path useful even before Pomelli or other programmatic brand services exist.

Validation is intentionally lightweight and deterministic:

- colors must be 6-digit hex values;
- string fields must be non-empty after trimming;
- `voice.formality` must be `casual`, `mixed`, or `formal`;
- avoid lists must be arrays.

The root `npm run build` now builds `packages/shared-types` before C&C so workspace type imports do not depend on stale generated output.

## Verification

```powershell
npm test --workspace=packages/command-and-control -- tests/brand/manual_adapter.test.ts
```

Result: 3 tests passed.
