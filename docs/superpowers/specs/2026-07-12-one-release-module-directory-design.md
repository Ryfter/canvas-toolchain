# One Release, One Module Directory — Design

**Date:** 2026-07-12
**Status:** Approved (Kevin, 2026-07-12)
**Supersedes:** the release/hosting half of [`2026-07-11-plugin-module-channel-design.md`](2026-07-11-plugin-module-channel-design.md). The trust model from that spec — catalog-as-trust-root, sha256 pinning, two-call install gate, load-time re-hash — is unchanged and still governs.
**Ships as:** Canvas Toolchain **v2.1.0**

---

## The problem

v2.0 shipped module artifacts as GitHub Releases (`module-announcements-v1.1.0`). A GitHub Release is not a file host; it is an announcement. Three consequences:

1. **The Releases page lies.** A professor visiting the repo is told the latest release of Canvas Toolchain is a 10 KB `.mjs` file with no installer in it.
2. **The update nudge is dead.** `src/update/check.ts` asks GitHub for `/releases/latest`, receives `module-announcements-v1.1.0`, cannot parse a version out of it, silently treats it as `0.1.0`, concludes no update exists, and says nothing. Every professor on v1.11.1 or earlier is currently *not* being told v2.0.0 exists — including the v2.0.1 security hardening. This is a live defect, not a cosmetic one.
3. **The module artifact is unreviewable.** A workflow builds a blob and staples it to a release. Nobody diffs it; nothing proves the published bytes correspond to the source.

The product is **one product**: Canvas Toolchain. Modules are things it can load; companions are things it works alongside. Neither is a release.

## Goals

- Exactly one line of releases: `vX.Y.Z`, Canvas Toolchain.
- Modules keep independent version numbers, so a module fix ships without a toolchain release. (This property delivered the Announcements 1.1.0 security fix with no installer release; it is not negotiable.)
- Module artifacts become reviewable, reproducible files in the repository.
- The update check becomes structurally immune to whatever else appears on the Releases page.
- One list of modules with two faces: a human page and a machine catalog, generated from the same source so they cannot drift.
- Startup tells the professor what is available. It never acts.

## Non-goals

- The toolchain never downloads or executes a companion program. A companion entry is prose and a link.
- No hot-reload. Modules still load at startup.
- No third-party module registry. The catalog on `main` remains the sole trust root.

---

## Global constraints

These bind every task.

- **The catalog never carries an executable payload.** No `installCommand`, no script, no shell string, in any entry of any kind. The catalog is the trust root; a command line in it that anything auto-ran would make every hash-pin decorative. The validator is **default-deny**: unknown fields on a companion entry are a validation failure, not an ignored extra.
- **Fail-closed on install, fail-soft on startup.** A bad hash, an off-allowlist URL, or a malformed entry refuses. A network failure at startup is silent — never a crash, never a blocked server start.
- **Nothing auto-installs.** Installation remains behind the two-call confirm gate (`install_module`), where the professor sees name, version, size, source, and sha256 before any byte is written.
- **Public repo.** No PII, no institution-specific values, in code, tests, fixtures, docs, or catalog content.
- **State writes are atomic** (tmp + rename) with mode `0o600`, asserted in tests behind `platform() !== 'win32'`.
- **Refusals are structured** `{ error, message, fix }`.

---

## 1. Artifact hosting: files on `main`

Module artifacts live in the repository:

```
module-catalog.json
modules/announcements/1.1.0/announcements-1.1.0.mjs
```

The version is a **path segment**, so a published artifact's URL is content-immutable by construction: `modules/announcements/1.1.0/…` is written once and never rewritten. Publishing 1.1.1 creates a new directory; it does not touch 1.1.0.

The catalog's `artifactUrl` points at the raw file:

```
https://raw.githubusercontent.com/Ryfter/canvas-toolchain/main/modules/announcements/1.1.0/announcements-1.1.0.mjs
```

**Download allowlist** (`src/channel/catalog.ts`) changes from the Releases prefix to:

```
ALLOWED_ARTIFACT_URL_PREFIX = 'https://raw.githubusercontent.com/Ryfter/canvas-toolchain/main/modules/'
```

The redirect allowlist (`isAllowedRedirectHost`, domain `githubusercontent.com` + subdomains, lookalikes rejected) is unchanged and already covers `raw.githubusercontent.com`. The size ceiling (`MAX_ARTIFACT_BYTES`), the `sizeBytes` validation, and the sha256 verification at download and at every startup are all unchanged. **The sha256 remains the actual guarantee.** The URL allowlist is defence in depth, not the trust anchor.

`release-module.yml` is deleted. Publishing a module version becomes a pull request: build, commit the artifact, update the catalog entry.

### The reproducibility gate (new)

A CI job runs on any change touching `modules/**` or `module-catalog.json`:

1. Rebuild each catalog-referenced module from source at that commit.
2. Assert the rebuilt bytes are byte-identical to the committed artifact.
3. Assert the committed artifact's sha256 equals the catalog's `sha256`, and its size equals `sizeBytes`.

Failure blocks the merge. This is the check that was impossible under the Releases model: it proves the shipped bytes are what the source produces, in the pull request, before anything is public.

---

## 2. Update check hardening

`src/update/check.ts` currently trusts GitHub's `/releases/latest` and a lenient version parser that turns unparseable text into zeros. Both are replaced.

- Fetch `GET /repos/Ryfter/canvas-toolchain/releases?per_page=30`.
- Keep only releases that are not drafts, not prereleases, and whose `tag_name` matches **`^v\d+\.\d+\.\d+$`** exactly.
- Select the highest by semver comparison. If none match, report no update — silently.
- A new `parseToolchainTag(tag): string | null` returns `null` for anything that is not a strict toolchain tag. `compareVersions` is never handed a string it cannot parse.

Effect: any non-toolchain tag on the Releases page becomes invisible to the update check rather than poisoning it. Fixing the release policy alone would leave the code fragile to the same class of mistake; this makes the mistake unable to recur.

The 24h cache, 5s timeout, and fail-silent-on-error behaviour are retained.

---

## 3. Catalog: two kinds of entry

`module-catalog.json` gains a second top-level array and a **`catalogVersion` bump to 2**.

```jsonc
{
  "catalogVersion": 2,
  "modules": [
    {
      "id": "announcements",
      "name": "Announcements Auditor",
      "description": "Audit scheduled announcements after a course copy…",
      "version": "1.1.0",
      "minHostVersion": "2.1.0",
      "artifactUrl": "https://raw.githubusercontent.com/Ryfter/canvas-toolchain/main/modules/announcements/1.1.0/announcements-1.1.0.mjs",
      "sha256": "821aae56e774b10c4ce643ca358052264e52d0db9491e8692370a461bb0aae35",
      "sizeBytes": 9757,
      "handles": ["announcements"]
    }
  ],
  "companions": [
    {
      "id": "canvas-backup",
      "name": "Canvas Backup",
      "summary": "Downloads a complete local archive of a Canvas course.",
      "whyYouWantIt": "Canvas Toolchain reads a Canvas Backup archive as the starting point of the course-refresh pipeline. It also works entirely on its own as a backup tool.",
      "url": "https://github.com/Ryfter/Canvas-Download",
      "worksWithoutToolchain": true
    }
  ]
}
```

**`modules[]`** — installable. Shape unchanged from v2.0 apart from `artifactUrl`'s new prefix.

**`companions[]`** — separate programs, described and linked. The permitted field set is exactly `id`, `name`, `summary`, `whyYouWantIt`, `url`, `worksWithoutToolchain`. **Any other field is a validation error.** `url` must be `https:` and must match a host allowlist (`github.com`). A companion entry can never carry something to run.

`catalogVersion: 2` is deliberate. Installs of v2.0.x will refuse the new catalog with `CATALOG_VERSION_UNSUPPORTED` — a legible "your toolchain is too old" refusal rather than a confusing `CATALOG_INVALID`. See §7.

### `browse_module_catalog`

Reports both kinds. Installable entries keep their existing status vocabulary (bundled / not installed / installed / update available). Companion entries render as an "also available, installed separately" section with the summary, the reason, and the link. The tool never offers to install a companion, and returns no field a caller could execute.

---

## 4. Startup notices

`checkChannelNotices()` (`src/channel/notices.ts`) already composes module-update and pending-request notices, and `checkForUpdates()` already composes the app-update notice. Both are appended to successful tool responses via the existing `getNotice` path in `src/lib/call_tool_dispatch.ts`. This design extends that rail; it does not add a second one.

After this change, startup can surface up to four notices:

| Condition | Notice |
| --- | --- |
| Newer toolchain release exists | *Canvas Toolchain v2.1.0 is available — click the Canvas Toolchain Updater shortcut to upgrade.* |
| Installed module has a newer catalog version | *Announcements Auditor 1.1.1 is available — say "install announcements" to upgrade.* |
| Installer-GUI module request still pending | (existing) *You requested … — say "install …" to proceed.* |
| Installable modules exist that are not installed | *There are modules you don't have yet — say "browse modules" to see them.* |

**Throttling.** The discovery notice is the only one that could nag, because its condition is true forever for a professor who simply doesn't want the other modules. It fires only when the set of available-but-not-installed module ids **differs from the set last shown**, persisted in the channel state file (atomic, `0o600`). A professor who declines is not asked again until a genuinely new module appears.

All checks are best-effort: offline is silent, and no notice path can throw or delay server start.

---

## 5. The human module page

`docs/modules.md` is **generated** from `module-catalog.json` by `npm run docs:modules`. CI regenerates it and fails if the checked-in file differs — the same idiom as the artifact reproducibility gate. The page and the catalog are two faces of one list and cannot drift.

Content: one section per installable module (what it does, what it needs, current version) and one per companion (what it is, why you'd want it, where to get it, that it works standalone). Linked from `README.md` and from every release's notes.

Adding Answer-Bot or ASR-Bench later is a content-only pull request: one entry in `companions[]`, no TypeScript.

---

## 6. What gets deleted

- `.github/workflows/release-module.yml`
- The `module-announcements-v1.0.0` and `module-announcements-v1.1.0` releases **and their tags**.
- The `docs/module-channel.md` publish runbook is rewritten for the pull-request flow.

Module version history is not lost: it lives in `modules/<id>/<version>/` and in git.

---

## 7. Compatibility break — accepted knowingly

Moving `artifactUrl` off Releases and bumping `catalogVersion` means **installs of v2.0.0 and v2.0.1 cannot read the new catalog.**

- Already-installed modules keep working. They are on disk and verified against their locally recorded hash at every startup; no network path is involved.
- `browse_module_catalog` and `install_module` on a v2.0.x host will refuse with `CATALOG_VERSION_UNSUPPORTED` until the professor updates the app.
- Deleting the old module releases 404s the old `artifactUrl`s, so a v2.0.x fresh install of Announcements fails closed rather than silently doing something surprising.

This is acceptable because the v2.0.x install base is one day old and effectively limited to the author and any immediate colleagues — and because §2 is what restores the update prompt that these users are currently, silently, not receiving.

## 8. Sequencing

Order matters; the Releases page must never have a broken top entry.

1. Merge v2.1.0 (§1–§5) — new catalog reader, new hosting, hardened update check, generated module page. The catalog on `main` is **not** yet changed.
2. Cut the **v2.1.0 release**. It becomes GitHub's Latest by recency, and the update nudge starts working again for everyone on v1.x and v2.0.x.
3. Commit the artifact + `catalogVersion: 2` catalog to `main`. Verify the committed `announcements-1.1.0.mjs` hashes to `821aae56…` — the same bytes already published, so **no module version bump is needed**; only its URL moves.
4. Delete the two `module-announcements-*` releases and tags.
5. Verify end-to-end against the live catalog: fresh install of Announcements on a v2.1.0 host, and a `raw.githubusercontent.com` download that actually resolves.

Step 5 is not optional. The v2.0 release shipped a redirect allowlist that refused every install because its test fixture encoded the assumed GitHub host instead of the real one; only running the real install engine against the live catalog caught it. A mocked fixture proves an assumption, not the world.

---

## 9. Testing

- **Catalog validator:** `catalogVersion: 2` accepted, `3` refused; installable entries with the old Releases `artifactUrl` refused; companion entries with any unpermitted field refused (explicitly including `installCommand`, `script`, `cmd`, `exec`); companion `url` non-https or off-host refused; duplicate ids across `modules` and `companions` refused.
- **Update check:** a Releases list containing `module-announcements-v1.1.0`, a draft, a prerelease, and `v2.1.0` selects `v2.1.0`; a list containing *only* non-toolchain tags reports no update rather than a bogus one; `parseToolchainTag` returns `null` for `module-announcements-v1.1.0`, `nightly`, `v2.1`, and `v2.1.0-rc1`. This is the regression test for the live defect.
- **Notices:** discovery notice fires on a new available module and does not re-fire on the next startup with an unchanged set; state file is `0o600`.
- **Install:** unchanged fail-closed suite, re-pointed at the raw-host allowlist; an `artifactUrl` on `github.com/.../releases/download/` is now refused.
- **Docs generation:** `docs:modules` output matches the checked-in file.
- **Reproducibility gate:** a deliberately corrupted committed artifact fails CI.

---

## Decision record

To be filed in Grimdex (`projects/canvas-toolchain/`) on merge: *a release is an announcement, not a file host.* Using GitHub Releases to host machine-consumed artifacts put a non-product entry on the product's front door, took the "Latest" badge, and silently killed the update-notification path that depended on it. Artifacts consumed by software belong in the repository, where they are reviewable, diffable, and reproducible; releases belong to humans.
