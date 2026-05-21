# Search Registry Implementation Plan

Issue: [#13 Implement search_registry tool](https://github.com/Ryfter/canvas-toolchain/issues/13)

## Scope

Add `search_registry` for discovering installable resources before calling `install_resource`.

Implemented behavior:

- Free-tier search uses public GitHub registry indexes.
- Premium-tier search calls the configured premium registry with bearer auth.
- Search input supports `query`, optional `kind`, and optional `tier`.
- Results include `kind`, `id`, `version`, `name`, `description`, `tags`, `tier`, and `installUrl`.
- `setup_cc` accepts `registryGithubOrg` to override the free registry org.
- MCP tool `search_registry` is registered in `src/index.ts`.

## Decision: GitHub Search Shape

The issue left the GitHub org name as an open decision. This implementation defaults to the spec value, `canvas-toolchain`, and makes it configurable through `setup_cc({ registryGithubOrg })`.

The implementation also chooses a deterministic `index.json` convention instead of GitHub code search:

```text
https://raw.githubusercontent.com/<org>/<collection>/main/index.json
```

Collections are:

- `templates`
- `themes`
- `prompts`
- `adapter-configs`
- `bundles`

Reasoning:

- GitHub code search often requires auth and has rate-limit/indexing behavior that makes professor-facing search unreliable.
- A small public `index.json` is easy to host, cache, version, and test.
- The returned `installUrl` still uses the existing install convention, for example `github://canvas-toolchain/templates/comparison-layout@1.0.0`.

## Premium Search

Premium search calls:

```text
<premiumRegistryBaseUrl>/search?query=<query>&kind=<kind>
```

with:

```text
Authorization: Bearer <registry token>
```

The registry token is configured through `setup_cc`, stored locally, and redacted from setup responses.

## Verification

```powershell
npm test --workspace=packages/command-and-control -- tests/registry/search_registry.test.ts
npm test --workspace=packages/command-and-control
npm run build --workspace=packages/command-and-control
```
