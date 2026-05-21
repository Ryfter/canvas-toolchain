# Template Validator Implementation Plan

Issue: [#15 Implement template schema + validator](https://github.com/Ryfter/canvas-toolchain/issues/15)

## Scope

Add the template resource validator used by the registry-backed template/theme/prompt library.

Implemented behavior:

- Runtime slot vocabulary: `hero`, `intro`, `body`, `callout`, `comparison`, `examples`, `objectives`, `resources`, `footer`, `panopto`, plus `x-*` extensions.
- `structure.html` placeholder extraction for `{{slot:name}}`.
- Template manifest validation for required fields: `schemaVersion`, `kind`, `id`, `version`, `slots`, `tags`, and `tier`.
- Validation that every `structure.html` slot is controlled or `x-*`.
- Validation that every `structure.html` slot appears in `manifest.slots`.
- `slots.json` constraint validation for `required`, `maxLength`, `fields`, and `schema`.
- Shared JSON Schema fragment validator for common keywords.

## Reasoning

The slot vocabulary already exists as types in `packages/shared-types`, but Command-and-Control does not currently depend on that package at runtime. This implementation keeps runtime validation local in `src/resources/slots.ts` to avoid adding a package dependency inside this issue. If shared runtime exports are added later, this local module should be consolidated with `@canvas-toolchain/shared-types`.

JSON Schema validation is intentionally structural rather than a full JSON Schema validator dependency. The issue only requires fragments to be valid enough for template slot constraints. This keeps the validator small and deterministic while catching malformed `type`, `required`, `enum`, length, and item-count fields.

## Verification

```powershell
npm test --workspace=packages/command-and-control -- tests/resources/template.test.ts
npm test --workspace=packages/command-and-control
npm run build --workspace=packages/command-and-control
```
