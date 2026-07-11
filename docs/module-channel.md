# The module channel — publishing and installing modules

Full design: [`docs/superpowers/specs/2026-07-11-plugin-module-channel-design.md`](superpowers/specs/2026-07-11-plugin-module-channel-design.md).

## 1. What this is

The module channel is how a module ships **without a new installer release**. A
module is built into a single, self-contained, hash-pinned `.mjs` artifact
attached to a GitHub Release; `module-catalog.json` on `main` is the single
source of truth for what exists and what its bytes must hash to. Professors
install conversationally through Command & Control; the installer GUI can only
*request* a module, never install one itself. Everything else about a module
— the `CanvasToolchainModule` contract, workspace package, tests, review bar —
is unchanged from the bundled (1.x) modules.

## 2. Publishing a module version

1. Bump the module's `packages/module-<id>/package.json` `version`.
2. Tag the commit `module-<id>-v<version>` (e.g. `module-announcements-v1.0.0`)
   and push the tag — **never `git push` blind; push only the tag you intend
   to release.**
3. Wait for the `release-module` workflow to go green. It builds the repo,
   runs the module workspace's tests, verifies the tag version matches
   `package.json`, runs `npm run build:module -- <id>` to produce the
   artifact and its sha256, and attaches the artifact to a new GitHub Release
   for that tag.
4. Open the workflow's job summary and copy the printed catalog-entry JSON
   (`id`, `version`, `artifactUrl`, `sha256`, `sizeBytes`). Add the fields the
   workflow can't derive — `name`, `description`, `minHostVersion`, and
   `handles` — from the module's own source/contract.
5. Commit the updated `module-catalog.json` to `main`.

**That commit to `main` IS the publish.** Nothing is live for clients until
the catalog entry lands there — the Release existing with an attached
artifact is not, by itself, a publish. Because only the repo owner can commit
to `main`, the catalog's git history doubles as the audit log of every
version ever published and by whom.

## 3. How professors install

Installation is conversational, through Command & Control, using a two-call
confirm gate (same idiom as `wave_deep_check`):

- `browse_module_catalog` (read-only) lists catalog modules merged with local
  state: installed / enabled / update available / not installed / bundled.
- `install_module` — call 1 previews (name, version, description, size,
  source URL, sha256, handles, fresh-install vs. upgrade); call 2 with
  `confirm: true` downloads, verifies the sha256 against the catalog entry
  (refusing on any mismatch), and installs.

The installer GUI's "Additional modules" picker only **requests** a module
(writes `~/.command-and-control/pending-module-installs.json`); it never
downloads or runs code. C&C surfaces pending requests in chat, and
fulfillment still goes through the same `install_module` confirm gate — the
GUI checkbox is a request, never an authorization.

## 4. Rollback

An upgrade retains the previous version's installed artifact and its pinned
hash until the new version has loaded successfully once. If a release is bad,
rollback is two parts:

- **Locally:** re-point `installed-modules.json` at the retained prior
  version (surfaced as guidance in the load-failure warning) — no re-download
  needed, since the prior artifact and hash are already on disk.
- **On the channel:** commit a catalog revert on `main` pointing `version`
  back at the prior release, so new installs and update nudges stop offering
  the bad version.

## 5. Trust model

The sha256 for every published version lives only in `module-catalog.json`
on `main`, which only the repo owner can commit to — that pinning, plus the
GitHub-Release provenance of the artifact it points at, is what "Ryfter-
published" means in 2.0. The hash is **verified twice**: once by
`install_module` at download time (refusing on any mismatch before anything
reaches its final location), and again by the loader at **every** server
startup — so a tampered release asset, a MITM'd download, and post-install
local disk corruption all fail identically, closed.
