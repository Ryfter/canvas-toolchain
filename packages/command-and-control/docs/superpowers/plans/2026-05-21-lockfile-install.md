# Lockfile Install Implementation Plan

Issue: [#14 Implement install_resources_from_lockfile tool](https://github.com/Ryfter/canvas-toolchain/issues/14)

## Scope

Add reproducible registry setup from a lockfile of resource URLs.

Implemented behavior:

- Plain-text lockfiles: one URL per line, blank lines ignored, `#` comments ignored.
- JSON lockfiles: array of URL strings.
- Installs resources in lockfile order.
- Calls `installResource()` for each resource that is not already installed at the same `kind`, `id`, and `version`.
- Reports per-resource status: `installed`, `skipped`, or `failed`.
- Continues after a failed resource so a user gets a full report instead of losing all progress.
- Registers MCP tool `install_resources_from_lockfile`.

## Reasoning

Lockfile install is an orchestration layer. It should not duplicate resolver behavior, payload validation, dependency recursion, or atomic writes. Those remain owned by `installResource()` and `local_registry.ts`.

Idempotency is based on identity, not path: if the same `kind`, `id`, and `version` already exists in `index.json`, the lockfile entry is skipped. For `file://` URLs, identity is read from `manifest.json`; for `github://` and `ryfter://`, identity is parsed from the URL convention.

Failures are captured per item because lockfiles are intended for colleague handoff. A complete success/failure report is more useful than stopping at the first missing or premium-gated resource.

## Verification

```powershell
npm test --workspace=packages/command-and-control -- tests/registry/lockfile_install.test.ts
npm test --workspace=packages/command-and-control
npm run build --workspace=packages/command-and-control
```
