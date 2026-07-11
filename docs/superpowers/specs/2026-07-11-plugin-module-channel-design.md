# Plug-in Module Channel (v2.0) — Design

**Date:** 2026-07-11
**Issue:** [#78](https://github.com/Ryfter/canvas-toolchain/issues/78) — feat: plug-in module architecture (2.0)
**Status:** Approved design, pending implementation plan

## 1. Summary

Version 2.0 makes modules **drop-in**: a new module (or a fix to an existing one) can be
published and installed **without shipping a new installer release**. The 1.x plug-in
system stays exactly as it is — the `CanvasToolchainModule` contract, the workspace
module packages, `~/.command-and-control/modules.json` enablement, the fail-soft
loader, `list_modules` / `set_module_enabled`. What 1.x lacks is distribution: the
registry is a static compiled-in map (`KNOWN_MODULES`), so every module ships inside
the installer bundle. 2.0 adds the missing channel:

- modules are built into **single-file, hash-pinned artifacts** attached to GitHub Releases,
- a **catalog** on `main` is the single source of truth for what exists and what its
  bytes must hash to,
- a professor installs conversationally through a **two-call confirmed `install_module`**
  tool, and
- the installer GUI gains a **picker** that *requests* modules via a pending file — chat
  remains the only place code installation is authorized.

One deliberately small, genuinely useful module (**Announcements Auditor**) ships
*only* through the channel to prove the whole path end to end and serve as the
reference module implementation.

## 2. Decisions locked during brainstorming

| Question | Decision |
| --- | --- |
| Who writes modules? | **Ryfter-only trust in 2.0**; the seam (catalog entry fields + one verification choke point) is designed so third-party publishing can be added later without rearchitecture. |
| Scope of 2.0 | **Channel only.** Core packages are untouched; no existing capability is extracted into a module. The five bundled modules stay bundled. |
| Install UX | **Conversational (MCP tools)** is the install path. The GUI lists additional modules and can *request* them, but never downloads or installs code itself. |
| GUI ↔ chat handoff | **Pending-request file** written by the GUI, surfaced by C&C in chat, fulfilled through the normal confirmed install flow. |
| Proof of the channel | **One small channel-native module** (Announcements Auditor), never bundled, doubles as the reference example. |
| Distribution mechanism | **Purpose-built channel over GitHub Releases** (single-file esbuild artifacts + hash-pinned catalog). Not the Resource Registry (designed for passive content, not code), not npm (runtime dependency resolution is a supply-chain surface). |
| Version | Ships as **v2.0.0**. |

Guiding constraint, stated by Kevin during design: this toolchain is career-critical.
Every choice below prefers **fail-closed, conservative, auditable** over convenient.

## 3. Artifact and packaging

A distributable module remains a normal npm workspace package (`packages/module-<id>`)
with the same contract, tests, and review bar as today. New is a build step:

- **esbuild** bundles the package **and all runtime dependencies** into one
  self-contained ESM file: `module-<id>-<version>.mjs`.
- Format: ESM, `platform: node`, target matching the bundled Node runtime. No
  externals — the artifact must import cleanly in a host that has nothing but Node.
- The artifact default-exports the same `CanvasToolchainModule` object the workspace
  package does; the contract is unchanged.
- A repo script (`npm run build:module -- <id>`) produces the artifact
  deterministically and prints its sha256, so what CI attaches and what the catalog
  pins are trivially comparable.

Single-file bundling is a trust decision, not just a convenience: there is no
install-time dependency resolution, so the bytes the catalog hash pins are the
*entire* code that will run.

## 4. The catalog

`module-catalog.json` at the repo root of `Ryfter/canvas-toolchain`, on `main`,
fetched by clients from the raw GitHub URL. Shape:

```json
{
  "catalogVersion": 1,
  "modules": [
    {
      "id": "announcements",
      "name": "Announcements Auditor",
      "description": "Find scheduled Canvas announcements with stale fire dates after a course copy and recreate them with corrected dates.",
      "version": "1.0.0",
      "minHostVersion": "2.0.0",
      "artifactUrl": "https://github.com/Ryfter/canvas-toolchain/releases/download/module-announcements-v1.0.0/module-announcements-1.0.0.mjs",
      "sha256": "<hex>",
      "sizeBytes": 123456,
      "handles": ["announcements"],
      "bundled": false
    }
  ]
}
```

- `minHostVersion` — lowest C&C version the module supports; installs into older
  hosts are refused with a "update the toolchain first" message.
- `handles[]` — feeds `discover_tools` (#76) so discovery can suggest *catalog*
  modules, not only bundled ones.
- `bundled` — marks the five 1.x modules once they gain catalog entries (see §9);
  informational for `browse_module_catalog` display.
- The catalog lives in the **main repo**, not a separate registry repo: one less thing
  to maintain, and its git history is the audit log of every published hash.
- Forward compatibility: clients ignore unknown fields; a `catalogVersion` bump
  signals a breaking format change (clients refuse newer catalog versions with a
  clear "update the toolchain" error rather than guessing).

## 5. Release workflow

A new `release-module.yml` GitHub Actions workflow, triggered by tags of the form
`module-<id>-v<semver>`:

1. Build the workspace (existing test + build jobs must pass — same bar as
   `release-installer.yml`).
2. Run `build:module` for the tagged module; compute sha256.
3. Create the GitHub Release for the tag and attach the `.mjs` artifact.
4. Print the catalog entry (URL + hash) in the job summary for the catalog commit.

Publishing a module version is therefore: **tag → CI release → one reviewed catalog
commit on `main`**. Deliberately separate from `release-installer.yml`: module
cadence never touches installer cadence — that is the entire point of #78.

## 6. Trust model

"Ryfter-published" is enforced by **provenance plus pinning**, with one verification
choke point:

- The sha256 for every version lives in `module-catalog.json` on `main`, which only
  the repo owner can commit to.
- `install_module` downloads the artifact, computes its sha256, and **refuses on any
  mismatch** — a tampered release asset, a MITM'd download, and a truncated file all
  fail identically, before anything reaches its final location.
- The loader **re-verifies the hash at every startup** (§8), so post-install local
  tampering or disk corruption also fails closed.
- `minHostVersion` prevents a module from loading into a host missing APIs it needs.

Third-party seam (explicitly *not* built in 2.0, only kept possible): a future
catalog entry gains `publisher` and `signature` fields, and the same choke point
gains a key-verification step. No rearchitecture required; nothing in 2.0 assumes
there is exactly one publisher except the absence of those fields.

## 7. C&C tools and the install path

Three new tools, all following existing house idioms:

### `browse_module_catalog` (read-only)

Fetches the catalog (5 s timeout, 24 h cache — same discipline as the update nudge)
and merges it with local state. Each module is reported as one of:
**installed / enabled / update available / not installed / bundled**. Shows any
pending GUI requests (§10). Catalog unreachable → clear structured error; nothing
local is affected. Optional `clearPending: true` empties the pending-request file.

### `install_module` (two-call confirm gate)

Same idiom as `wave_deep_check` and `submit_usage_feedback` — downloading executable
code is the most security-sensitive act in the toolchain and gets the same
deliberateness as spending money:

- **Call 1 (preview, no side effects):** name, version, description, size, source
  URL, sha256, `handles`, credentials/requirements, and whether this is a fresh
  install or an upgrade from an installed version.
- **Call 2 (`confirm: true`):** executes the install path below.

The install path — single choke point, fail-closed at every step:

1. Fetch catalog; validate the entry (schema + known `catalogVersion`).
2. Check `minHostVersion` against the running host; refuse with upgrade guidance.
3. Download to a temp file under `~/.command-and-control/modules/.tmp/`.
4. Compute sha256; compare to the catalog. **Mismatch → delete temp file, refuse,
   report the expected vs actual hash.**
5. Atomic rename to `~/.command-and-control/modules/<id>/<version>/module.mjs`.
6. Record `{ id, version, sha256, installedAt }` in
   `~/.command-and-control/installed-modules.json` (atomic tmp+rename write, 0o600,
   house idiom). On upgrade, the replaced entry is kept as
   `previous: { version, sha256 }` so rollback (§9) still has a pinned hash to
   verify against — a rolled-back-to artifact is never loaded unverified.
7. Enable the module in the existing `modules.json` (reusing `set_module_enabled`'s
   merge-preserving write).
8. Remove the id from the pending-request file if present.
9. Report success + "takes effect on the next Claude reconnect" (same activation
   story as `set_module_enabled` today; **no hot-reload**).

Upgrades are the same flow with the same id and a newer version; the previous
version's directory is retained until the new version loads successfully once (§9).

### `uninstall_module`

Removes the installed artifact directory and its `installed-modules.json` entry, and
disables it in `modules.json`. **Bundled modules cannot be uninstalled** — only
disabled via the existing `set_module_enabled`.

## 8. Loader changes

`loadModules()` in `packages/command-and-control/src/modules/registry.ts` gains one
phase after the static `KNOWN_MODULES` pass:

1. Read `installed-modules.json` (missing/corrupt file → warn, skip phase entirely;
   the server always starts).
2. For each entry enabled in `modules.json`:
   - **Re-hash the artifact file and compare to the recorded sha256.** Mismatch →
     skip with a loud warning, never import. (One file; hashing is cheap.)
   - Dynamic-import the file URL.
   - Run the same `isCanvasToolchainModule` guard; failure → skip with warning.
   - Register tools exactly as bundled modules do.
3. **Precedence:** if an id exists both bundled and installed, the **semver-newer
   version wins** and the choice is logged. This is precisely how a module fix ships
   without an installer release. Equal versions → bundled wins (no download needed).

The fail-soft invariant is unchanged and extends to every new failure mode: a
missing, corrupt, tampered, contract-violating, or throwing dynamic module can
never take down the host server.

## 9. Updates and rollback

- The existing 24 h GitHub update check extends to the catalog: when an installed
  module has a newer catalog version, the same one-line response nudge that
  announces host updates announces the module update.
- Upgrade = `install_module` with the newer version. The previous version's
  directory is kept until the new version completes one successful load, then
  pruned; a bad release is rolled back by re-pointing `installed-modules.json` at
  the retained prior version (surfaced as guidance in the load-failure warning).
- The five bundled 1.x modules gain catalog entries over time (marked
  `bundled: true`), which lets the channel deliver *newer versions* of bundled
  modules between installer releases via the §8 precedence rule. Adding those
  entries is content work, post-2.0.0, not a blocker.

## 10. GUI picker and the pending-request file

The Go + Fyne installer/updater gains an **"Additional modules"** section:

- Fetches `module-catalog.json` (5 s timeout). Unreachable → the section shows
  "catalog unavailable" and setup proceeds; the section never blocks.
- Lists non-installed catalog modules with name, description, and a checkbox.
- On finish, writes chosen ids to
  `~/.command-and-control/pending-module-installs.json`:
  `{ "requestedAt": "<ISO8601>", "modules": ["announcements"] }`
- Shows the fallback sentence on the same screen: *"Next time you open Claude it
  will offer to install these — or just ask: 'install the announcements module'."*
- **No download or install logic exists in Go.** The file is the entire handoff;
  the one auditable install path lives only in TypeScript.

C&C consumption: the response-notice path (which already carries the update nudge)
checks the pending file; if it names modules not yet installed, successful tool
responses get a one-liner — *"You requested Announcements Auditor in the installer —
say 'install it' to proceed."* Fulfillment always goes through the two-call
`install_module` gate: **the GUI checkbox is a request, never an authorization.**
Installed ids are pruned automatically; `browse_module_catalog({ clearPending: true })`
discards stale requests.

## 11. Proof module: Announcements Auditor (`module-announcements`)

Small, real, channel-native — never bundled into the installer. Solves a genuine
recurring problem: after a Canvas course copy, scheduled announcements silently keep
the previous section's fire dates, so students get announcements timed for a term
that already ended.

- **Tools:** `audit_announcements` (read-only: list a course's announcements with
  fire dates; flag ones that look stale — delayed posts dated in the past, or dates
  outside the current term when term dates are known) and
  `recreate_announcement` (propose→confirm: create a corrected copy of a stale
  scheduled announcement; the professor deletes the stale one in Canvas — the
  toolchain keeps its no-delete posture).
- Uses the existing Canvas token; **no new credentials**.
- Follows every module idiom: workspace package, contract default-export, provider-
  free, fail-soft, TDD.
- Serves as the **reference implementation** for future channel modules and, later,
  third-party authors.

Scope discipline: the auditor is deliberately minimal. If it grows ideas (bulk
recreation, term-date inference from the academic calendar), they are post-2.0
module releases — which is exactly what the channel is for.

## 12. Testing

House invariant: **no live network in tests.**

- **Unit:** catalog schema validation; semver compare + precedence; hash
  computation/verification; pending-file parse (missing/corrupt/stale); host-version
  gate; `installed-modules.json` read/write.
- **Integration (C&C):** a fixture catalog + a real esbuild-built fixture artifact
  served from a local HTTP server / `file://`; exercises install happy path,
  hash-mismatch refusal (tampered artifact), `minHostVersion` refusal, load-time
  re-hash skip (corrupt the file after install), broken-module fail-soft
  (contract-violating and throwing artifacts), bundled-vs-installed precedence,
  upgrade + prior-version retention, uninstall, pending-file lifecycle end to end.
- **Go:** unit tests for the pending-file write and catalog parse with a mocked
  fetch; the "catalog unavailable" path.
- **CI:** `release-module.yml` itself, plus a smoke job proving the built
  Announcements Auditor artifact dynamic-imports and passes the contract guard in a
  clean host.

## 13. Out of scope for 2.0

- Third-party module publishing, signatures, publisher keys (seam only).
- Paid/premium modules (`ryfter://` stays a Resource Registry concern).
- Functional install from the GUI (the picker only requests).
- Extracting existing core capabilities into modules.
- Hot-reload (reconnect remains the activation step).
- Catalog entries for the five bundled modules (post-2.0.0 content work, §9).

## 14. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Malicious/tampered artifact executes in a host holding Canvas tokens and rosters | Hash pinned in owner-controlled catalog; verified at install **and** at every load; single choke point; two-call human confirmation. |
| Bad module release breaks a professor's server | Fail-soft loader (never crashes the host); prior version retained for rollback; `minHostVersion` gate. |
| Catalog format evolves and strands old clients | `catalogVersion` with refuse-on-newer; clients ignore unknown fields. |
| GUI and chat flows drift | GUI has zero install logic; the pending file is a one-way request; one install path to maintain. |
| Channel ships untested against real cargo | Announcements Auditor is channel-only from day one; CI smoke-loads the real artifact. |
