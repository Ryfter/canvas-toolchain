# Install Resource Implementation Plan

Issue: [#11 Implement install_resource tool](https://github.com/Ryfter/canvas-toolchain/issues/11)

## Scope

Add the `install_resource` MCP tool and resolver layer on top of the local registry foundation from issue `#10`.

Implemented behavior:

- `file://` resolver for local development resources.
- `github://` resolver mapped to `raw.githubusercontent.com`.
- `ryfter://` resolver for premium resources, gated by a locally stored registry token.
- Manifest fetch and validation through the local registry validator.
- Premium resources rejected when fetched from GitHub.
- Recursive dependency installation with cycle detection.
- Payload validation by resource kind before atomic registry write.
- MCP registration in `src/index.ts`.

## Reasoning

The resolver layer stays separate from `local_registry.ts` so the registry remains a storage contract. Future tools such as lockfile install, search, and bundle install can reuse `installResource()` without duplicating URL parsing or payload validation.

The premium registry token is configured through `setup_cc`, stored in `~/.command-and-control/config.json`, and redacted from `setup_cc` responses. The local config still remains the source of truth for later premium registry calls.

## Verification

```powershell
npm test --workspace=packages/command-and-control -- tests/registry/install_resource.test.ts
npm test --workspace=packages/command-and-control -- tests/tools/setup_cc.test.ts
npm test --workspace=packages/command-and-control
npm run build --workspace=packages/command-and-control
```
