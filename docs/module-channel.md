# The module channel — publishing and installing modules

Full design: [`docs/superpowers/specs/2026-07-11-plugin-module-channel-design.md`](superpowers/specs/2026-07-11-plugin-module-channel-design.md)
(module channel) and [`docs/superpowers/specs/2026-07-12-one-release-module-directory-design.md`](superpowers/specs/2026-07-12-one-release-module-directory-design.md)
(repo-hosted artifacts + the one-release-surface fix).

## 1. Trust model

The sha256 for every published version lives only in `module-catalog.json` on
`main`, which only the repo owner can commit to — that pinning, plus the
artifact being a file reviewed on `main`, is what "Ryfter-published" means.
The hash is **verified twice**: once by `install_module` at download time
(refusing on any mismatch before anything reaches its final location), and
again by the loader at **every** server startup — so a tampered download and
post-install local disk corruption both fail identically, closed. Nothing
auto-installs: the installer GUI's "Additional modules" picker only
*requests* a module (writes `~/.command-and-control/pending-module-installs.json`);
chat's confirmed `install_module` call is the only place code installation is
ever authorized.

## 2. Publishing a module version

Module artifacts are **files committed to this repo**, not release assets —
see §3 for why. A module version's artifact lives at
`modules/<id>/<version>/<id>-<version>.mjs` and is fetched at install time
over `raw.githubusercontent.com`. Publishing a version is a **pull request**,
not a tag push.

```bash
# 1. Bump the module's package.json version and src/index.ts version to match.
# 2. Build the artifact.
npm run build:module -- announcements     # prints {"sha256": "...", "sizeBytes": N}

# 3. Commit it at its versioned path (never overwrite an existing version directory —
#    the path is content-immutable by construction; a new version is a new path).
mkdir -p modules/announcements/1.1.1
cp dist-channel/module-announcements-1.1.1.mjs modules/announcements/1.1.1/announcements-1.1.1.mjs

# 4. Update module-catalog.json: version, artifactUrl, sha256, sizeBytes.
#    artifactUrl must be exactly:
#    https://raw.githubusercontent.com/Ryfter/canvas-toolchain/main/modules/<id>/<version>/<id>-<version>.mjs

# 5. Regenerate the human page. Never hand-edit docs/modules.md — it is generated
#    and CI's docs-drift check will fail the PR if it doesn't match the catalog.
npm run docs:modules

# 6. Prove it locally before you push.
npm run verify:modules

# 7. Open a PR against main. CI's module-artifacts job reruns verify:modules
#    (rebuilds the module from source and checks the committed bytes match both
#    the fresh build and the catalog's sha256/sizeBytes) and the docs-drift check.
#    A normal code review approves and merges it — that merge commit to main
#    IS the publish. Because only reviewed PRs land on main, the catalog's git
#    history doubles as the audit log of every version ever published and by whom.
```

Rollback works the same way it always has: the previous version's artifact
and hash stay on disk and pinned in an older commit, so reverting the
catalog's `version`/`artifactUrl`/`sha256` to the prior entry (a normal PR)
points new installs and update nudges back at it. An already-installed
module needs no re-download to roll back locally — it already retains the
prior version's artifact and hash until the new one has loaded successfully
once (surfaced as guidance in the load-failure warning).

## 3. Why there is no module release

The old model tagged each module version (`module-<id>-v<version>`) and
attached the built artifact to its own GitHub Release. That caused a real
outage of the update path: a module release takes GitHub's "Latest" badge by
recency, and the toolchain's update check asked `/releases/latest` for the
newest **toolchain** version. When a module release was newer than the last
toolchain release, the check got a module tag back, couldn't parse a
`vX.Y.Z` out of it, and silently concluded no update existed — professors on
old toolchain versions were never told a new one shipped. A GitHub Release is
an announcement, not a file host. The Releases page on this repo is Canvas
Toolchain and nothing else: **the only release tags that exist are
`vX.Y.Z`**, and the update check now accepts only a strictly-matching tag,
ignoring everything else, so no future tag can poison it again.

## 4. Adding a companion

A companion is a separate program that works alongside the toolchain (Canvas
Backup and friends) — not something the toolchain installs. Add one entry to
`companions[]` in `module-catalog.json`:

```json
{
  "id": "canvas-backup",
  "name": "Canvas Backup",
  "summary": "...",
  "whyYouWantIt": "...",
  "url": "https://github.com/Ryfter/canvas-backup",
  "worksWithoutToolchain": true
}
```

then `npm run docs:modules` to regenerate `docs/modules.md`. Validation of
`companions[]` is **default-deny**: only `id`, `name`, `summary`,
`whyYouWantIt`, `url`, and `worksWithoutToolchain` are accepted, and `url`
must be a canonical `https://github.com/...` URL. A companion entry can
**never** carry a command, script, or anything runnable — there is no field
for it, and an unrecognized key fails validation outright.

## 5. How professors install

Installation is conversational, through Command & Control, using a two-call
confirm gate (same idiom as `wave_deep_check`):

- `browse_module_catalog` (read-only) lists catalog modules and companions
  merged with local state: installed / enabled / update available / not
  installed / bundled.
- `install_module` — call 1 previews (name, version, description, size,
  source URL, sha256, handles, fresh-install vs. upgrade); call 2 with
  `confirm: true` downloads, verifies the sha256 against the catalog entry
  (refusing on any mismatch), and installs.

The installer GUI's "Additional modules" picker only **requests** a module
(writes `~/.command-and-control/pending-module-installs.json`); it never
downloads or runs code. C&C surfaces pending requests in chat, and
fulfillment still goes through the same `install_module` confirm gate — the
GUI checkbox is a request, never an authorization.
