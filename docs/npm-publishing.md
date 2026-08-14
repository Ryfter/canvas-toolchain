# npm publishing — runbook

Canvas Toolchain publishes 12 packages to npm on every `vX.Y.Z` tag: the unscoped
[`canvas-toolchain`](https://www.npmjs.com/package/canvas-toolchain) entrypoint plus the
`@canvas-toolchain/*` workspace packages that are not channel-only. Channel-distributed
modules (e.g. `@canvas-toolchain/module-announcements`, marked `"private": true`) version
independently via `module-catalog.json` and are excluded from npm publish and the
tag version-lockstep guard. The workflow is `.github/workflows/release-npm.yml`; it runs
alongside the installer release on the same tag.

## One-time setup (repo owner)

1. Create the free **canvas-toolchain** organization on npmjs.com (owns the
   `@canvas-toolchain` scope): npmjs.com → profile → Add Organization.
2. Create a **granular access token**: npmjs.com → Access Tokens → Generate New Token →
   Granular; permissions *Read and write* scoped to the `canvas-toolchain` org **and** the
   `canvas-toolchain` package; no IP allowlist (Actions IPs rotate); expiry ≤ 1 year
   (calendar the renewal).
3. Add it to the repo: GitHub → Settings → Secrets and variables → Actions →
   `NPM_TOKEN`.

## Every release

Nothing manual — pushing the `vX.Y.Z` tag publishes. Versions are locked: CI fails
the publish unless every **non-private** workspace `package.json` version **and** every
intra-workspace dependency pin (`@canvas-toolchain/*` or `canvas-toolchain`) equals
the tag version exactly (no `*`, no ranges). Workspaces with `"private": true` are
skipped by the guard (and by `npm publish --workspaces`).

## Post-publish smoke (run once after each release)

```bash
cd "$(mktemp -d)"
npx canvas-toolchain@latest &   # should start silently (MCP server on stdio)
```

Or wire `npx canvas-toolchain` into an MCP client and confirm the tool list loads.

The workflow already publishes with `--access public --provenance` (OIDC
`id-token: write` plus `NODE_AUTH_TOKEN` from the `NPM_TOKEN` repo secret). If
the first run 403s or 401s, the org or token is not ready — do **not** publish
the same versions from a laptop, and do **not** delete or retag `vX.Y.Z`. A
local publish occupies the versions and blocks the provenance job. Confirm the
org exists, `gh secret list` shows `NPM_TOKEN`, and the granular token can write
the `canvas-toolchain` org **and** the unscoped `canvas-toolchain` package; wait
a few minutes if the org was just created; then **Re-run** the failed
"Release npm packages" workflow on the same tag.

## Token expiry / rotation

Regenerate the granular token, update the `NPM_TOKEN` secret. No code changes.
