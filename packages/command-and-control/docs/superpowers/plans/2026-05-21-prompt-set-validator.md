# Prompt-Set Validator Implementation Plan

Issue: [#17 Implement prompt-set schema + validator](https://github.com/Ryfter/canvas-toolchain/issues/17)

## Scope

Add the prompt-set resource validator for registry-backed page generation prompts.

Implemented behavior:

- Prompt-set manifest validation for `schemaVersion`, `kind`, `id`, `version`, `slots`, and `tier`.
- `prompts.json` must be a non-empty object keyed by controlled slot names or `x-*` extensions.
- Every prompt key must be declared in `manifest.slots`.
- Every prompt definition must include a non-empty `prompt` string.
- Prompt placeholders must use `{{camelCase}}`.
- `outputSchema` is validated with the shared lightweight JSON Schema fragment validator.

## Reasoning

Prompt-set validation uses the same runtime slot vocabulary as template and theme validation so the three resource types remain compatible before rendering. Placeholder validation is intentionally strict because prompt substitutions happen later in the workflow; catching non-camelCase placeholders at install/validation time prevents harder-to-debug generation failures.

The `outputSchema` validator remains lightweight and structural. It accepts simple object-shaped schemas and validates common JSON Schema keywords without adding a large runtime dependency.

## Verification

```powershell
npm test --workspace=packages/command-and-control -- tests/resources/prompt_set.test.ts
npm test --workspace=packages/command-and-control
npm run build --workspace=packages/command-and-control
```
