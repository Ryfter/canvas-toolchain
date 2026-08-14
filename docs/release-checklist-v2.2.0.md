# v2.2.0 release checklist

For the maintainer. One page, copy-pasteable. **This document does not tag or publish.**

Verified 2026-08-14 against `main` (`eb396ac`) and `.github/workflows/release-npm.yml` / `release-installer.yml`:

| Check | Result |
| --- | --- |
| Version lockstep at `GITHUB_REF_NAME=v2.2.0` | **PASS** — 12 publishable workspaces + root `package.json` are exact `2.2.0`; every intra-workspace pin is exact `2.2.0`. Private `@canvas-toolchain/module-announcements@1.1.0` skipped (channel-versioned). **No offenders.** |
| Both workflows trigger on `v*.*.*` | **Yes.** `release-npm.yml` publishes the 12 workspaces (`npm publish --workspaces --access public --provenance`). `release-installer.yml` uploads four assets to the GitHub Release (Windows + macOS installers and updaters) and uses `.github/RELEASE_TEMPLATE/installer-release.md` as the body. |
| `docs/npm-publishing.md` vs the workflow | Runbook matched except the first-publish 403 advice (it told the maintainer to publish locally and re-tag; the workflow already uses `--access public --provenance`). That paragraph was corrected in this branch. |
| `NPM_TOKEN` | **Missing.** `gh secret list` shows only `CLAUDE_CODE_OAUTH_TOKEN`. |
| Live registry | `canvas-toolchain` and `@canvas-toolchain/command-and-control` both **404**. Issue #150 stays open until step 9. |

Do not push `v2.2.0` until steps 1–3 are done. Tagging now would pass the version guard, run `npm ci` + `npm test`, then fail at publish.

## One-time setup

1. Create the free **canvas-toolchain** organization on npmjs.com (owns the `@canvas-toolchain` scope): npmjs.com → profile → Add Organization.
2. Create a **granular access token**: npmjs.com → Access Tokens → Generate New Token → Granular; *Read and write* on the `canvas-toolchain` org **and** the unscoped `canvas-toolchain` package; no IP allowlist; expiry ≤ 1 year.
3. GitHub → Settings → Secrets and variables → Actions → new secret named exactly `NPM_TOKEN`. Confirm with `gh secret list` (must list `NPM_TOKEN`). Full runbook: [`docs/npm-publishing.md`](npm-publishing.md).

## Cut the release (from `main`, after this PR is merged)

4. Review [`docs/release-notes-v2.2.0.draft.md`](release-notes-v2.2.0.draft.md). Paste the approved **What's new in v2.2.0** section at the **top** of [`.github/RELEASE_TEMPLATE/installer-release.md`](../.github/RELEASE_TEMPLATE/installer-release.md) and commit that to `main` **before** the tag (the installer workflow reads the template from the tagged commit).
5. On `main` at the commit that should ship:

   ```bash
   git tag v2.2.0
   git push origin v2.2.0
   ```

   Both workflows start from that one push. Do not retag. Do not use `--force`.
6. Watch [Release npm packages](https://github.com/Ryfter/canvas-toolchain/actions/workflows/release-npm.yml) and [Release Installer](https://github.com/Ryfter/canvas-toolchain/actions/workflows/release-installer.yml) on tag `v2.2.0`.
7. Confirm the GitHub Release **v2.2.0** is Latest and has all four assets:

   - `canvas-toolchain-installer-windows-x64.exe`
   - `canvas-toolchain-updater-windows-x64.exe`
   - `canvas-toolchain-installer-macos-arm64.pkg`
   - `canvas-toolchain-updater-macos-arm64`

## If the npm job 403s or 401s

The workflow already passes `--access public --provenance`. A 403 is almost always “org or token not ready,” not a missing flag.

- Confirm the org exists, `gh secret list` shows `NPM_TOKEN`, and the token can write both the org and the unscoped package. If the org was created minutes ago, wait and retry.
- **Re-run** the failed “Release npm packages” workflow on the same tag.
- Do **not** `npm publish` 2.2.0 from a laptop (that occupies the versions and blocks provenance).
- Do **not** delete or move the `v2.2.0` tag. If the installer job already succeeded, the GitHub Release can stay; only the npm job needs a re-run.

## Post-publish smoke (required)

From a directory that is **not** this repo:

```bash
cd "$(mktemp -d)"          # Windows: cd $env:TEMP; mkdir ct-smoke; cd ct-smoke
npx --yes canvas-toolchain@latest
```

Expect a silent MCP server on stdio (not an interactive CLI). Wire it into any MCP client and confirm the tool list loads. Then:

```bash
npm view canvas-toolchain version    # must print 2.2.0
```

Close [#150](https://github.com/Ryfter/canvas-toolchain/issues/150) only after that smoke passes.
