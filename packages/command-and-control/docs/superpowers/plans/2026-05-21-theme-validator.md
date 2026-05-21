# Theme Validator Implementation Plan

Issue: [#16 Implement theme schema + validator](https://github.com/Ryfter/canvas-toolchain/issues/16)

## Scope

Add the theme resource validator for the registry-backed template/theme/prompt library.

Implemented behavior:

- Theme manifest validation for `schemaVersion`, `kind`, `id`, `version`, `compatibleSlots`, `tags`, and `tier`.
- `compatibleSlots`, `slotStyles`, and `imageAssets` keys use the same controlled slot vocabulary and `x-*` extension rule as templates.
- Every `slotStyles` and `imageAssets` key must be declared in `manifest.compatibleSlots`.
- `theme.json.colors` must be a non-empty object with camelCase keys and non-empty string values.
- Every slot style must provide non-empty `css` and `imagePrompt`.
- Image prompts support `{{topic}}`, `{{semester}}`, and `{{colors.camelCaseColorKey}}`.
- `imageAssets[slot]` may be `null` or a safe relative asset path.

## Reasoning

The validator enforces prompt-first image behavior without requiring image generation. A theme can provide `imagePrompt` for every styled slot, and `imageAssets` can override generation when a pre-rendered asset exists.

Color substitution is constrained to `{{colors.<key>}}` so themes can keep visual variables explicit and easy to audit. Unsupported placeholders are rejected now because they would otherwise fail later in the render pipeline.

## Verification

```powershell
npm test --workspace=packages/command-and-control -- tests/resources/theme.test.ts
npm test --workspace=packages/command-and-control
npm run build --workspace=packages/command-and-control
```
