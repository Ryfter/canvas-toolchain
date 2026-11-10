# Canvas Toolchain Roadmap

_Last updated: 2026-11-10. This is the planned order of work: what ships next, what release it lands in, and what is parked as an idea. Dates are intentionally absent from the plan; the order is the commitment, not the calendar. Shipped sections below carry their real dates._

## Where we are

**Current release: v2.4.2** (2026-11-10). Open issues: **#199** only (the manual fresh-machine install check). Treat `gh issue list --state open` as the source of truth, not this page.

Release line since the last version of this page:

| Release | Date | Headline |
|---|---|---|
| v2.2.0 / v2.2.1 | 2026-08-21 | Unification: `npx canvas-toolchain`, `@canvas-toolchain/*` packages, npm publish on tag (OIDC trusted publishing), model-agnostic copy |
| v2.3.0 | 2026-08-29 | One registry-driven tool surface (nine intent tools plus an advanced sidecar), quiz validate/generate, weekly shell-readiness spot-check |
| v2.4.0 | 2026-10-29 | Per-OS Windows app folders with safe migration (#200), per-module credentials on module contract v2 (#201) |
| v2.4.1 | 2026-10-29 | Windows migration race fixes, `@hono/node-server` security update |
| v2.4.2 | 2026-11-10 | Doctor no longer prints hosts (#244), offline `skipValidation` for module credentials (#245), Windows rename retry (#248) |

Also landed on `main` between v2.3.0 and v2.4.0 (shipped in v2.4.0): the **setup/readiness engine** (#151, closed): `ct_setup doctor` / `get_started` / `apply`, `npx canvas-toolchain doctor [--json]`, MCP host wiring detection, a single Canvas credential store, an LM Studio provider, a slimmed installer with no secrets or client-side build, and the generated **skill graph** (86 operations, topic maps, lint and freshness gates in CI). Specs: [`docs/2026-08-21-install-simplification.md`](2026-08-21-install-simplification.md), [`docs/skill-graph.md`](skill-graph.md), [`docs/specs/2026-10-18-paths-and-module-credentials.md`](specs/2026-10-18-paths-and-module-credentials.md).

**Health snapshot (2026-11-10):** `npm audit` reports 0 vulnerabilities; no open Dependabot alerts; all five bundled modules and the channel module are on contract v2.

## Next releases, in order

1. **#199: fresh-machine install verification** (maintainer, needs real desktops). Run the native installer on a Mac desktop and on Windows; the `npx` path is already verified on 2.4.0 through 2.4.2. Pair it with **CT-99**, the manual Windows proof of the app-folder migration (seed an old-style home, run the doctor).
2. **v2.4.3 housekeeping (no behavior change).** Rewrite this page and the `AGENTS.md` status (this PR); drop Node 20 (end of life) from the CI matrix and `engines`, then remove the `undici` override it pinned and try `juice` 12; apply the minor dependency bumps (`@modelcontextprotocol/sdk`, `axe-core`, `tsx`, `esbuild`, `fast-xml-parser`); delete merged local and remote branches; remove the leftover `release-checklist-v2.2.0.md` and `release-notes-v2.2.0.draft.md`. Major bumps (`jsdom` 31, `better-sqlite3` 13, `color` 5, `@inquirer/prompts` 8) each get their own issue and PR.
3. **v2.5.0: generation-quality eval harness, then the model and SDK refresh.** A golden-input regression suite for the LLM-generated outputs (rubric rewrites, page generation, quiz generation), so moving off the aging default model ids (`claude-haiku-4-5-20251001`, `claude-sonnet-4-6`) and the `@anthropic-ai/sdk` 0.36 line (latest is 1.x) becomes a verifiable diff instead of a judgment call. Needs a short design conversation first (what the goldens are, who grades them, cost per run).
4. **v2.6.0: module migration pilot.** Five modules are still compiled into the base install (video, oral-assessment, group-builder, roster, peerassessment) while the catalog channel has carried only the Announcements Auditor. Candidate: move `module-video` alone first, which proves the channel with a second module before moving the rest. **Decision pending (Kevin).** The open question about credential-kind lookup for disabled channel modules belongs here.
5. **v2.7.0: assisted template creator plus information hierarchy, and rubric persona explanations.** One combined design effort: the browse half exists (`show_canvas_capabilities` / `preview_canvas_pattern`); what is missing is the assisted "build a valid page from structured choices" flow, with the at-a-glance / working-detail / deep-support content tiers as the structure it asks about. `draft_student_rubric` accepts course personas but does not yet emit per-persona criterion explanations (small, well-bounded). Needs a brainstorm before any build.

## Code health backlog (unscheduled; pick up alongside the releases above)

- **`surface/registry.ts` is ~2,000 lines.** Split by intent area once the surface stops changing; the generated skill tree and CI gates make the split safe.
- **Deprecated shims still have callers:** Design Studio's `auditAccessibility` / `accessibilityWarnings` (marked "kept for C&C until Phase 2"; Phase 2 shipped, but `layout_adapter.ts` and `lib/page-renderer.ts` still call `auditAccessibility`) and the old `snapshotDir` / `createSnapshotDir` helpers in `publish/snapshot_store.ts` (still imported by `rollback_course_publish.ts` and `breadcrumbs.ts`). Move those callers to the canonical conformance report and the `*For(snapshotId, courseDir)` variants, then delete the shims.
- **Launcher edge case:** the `canvas-toolchain` bin silently starts the MCP server on an unknown first argument; a typo such as `doctr` looks like a hang. Print usage instead.
- **Release notes hygiene:** the GitHub release bodies for v2.2.0 through v2.3.0 carry the v2.1.0 text, because the notes template was not updated for those tags. Add a release-checklist step (and a CI guard) that the top of `installer-release.md` names the tag being released.
- **Doctor honesty:** `ct_setup module_credentials set` now has an offline path; consider surfacing "saved unvalidated" credentials in the doctor so they are not forgotten.


The accessibility system landed in two steps. **Phase 1** (in v1.10.0, built first) is the canonical conformance engine — shared WCAG 2.2 types, an in-house Canvas-aware check engine plus an axe-core engine behind one adapter, and a conformance report attached to generate, redesign, validate, and publish outputs. **Phase 2** (the headline of v1.10.0) turns that report into a gate at publish time. Both shipped together in v1.10.0; v1.9.0 was the prior release (host-config fan-out for model-agnostic MCP hosts + accessibility documentation).

- Design spec: [`packages/command-and-control/docs/superpowers/specs/2026-07-01-wcag22-conformance-gate-design.md`](../packages/command-and-control/docs/superpowers/specs/2026-07-01-wcag22-conformance-gate-design.md)
- What the checks catch: [`docs/accessibility.md`](accessibility.md)

## Shipped in v1.10.0: WCAG 2.2 Phase 2 — the publishing gate

The advisory report became a **two-tier acknowledge-to-launch gate** on both publish paths (`publish_to_canvas` and `publish_course`):

| Verdict | What publishing requires |
|---|---|
| `pass` | Nothing — publishes as today |
| `borderline` (near-miss findings only) | `acknowledgeAccessibility: true` |
| `fail` (clear failures) | An acknowledgment array naming **every** failing success criterion |

Guiding principle: **the professor is the final arbiter** — accessibility informs and gates but never permanently blocks; every gate has a recorded acknowledgment path. The FERPA and Canvas-HTML validation gates are untouched and remain absolute (they cannot be acknowledged away).

It also added an **acknowledgment audit trail** (append-only `.a11y/acknowledgments.json`), a **borderline review queue** (`.a11y/review-queue.json`, worst-margin-first), and **two new tools** — `accessibility_review_queue` (list/resolve the queue) and `audit_course_accessibility` (re-scan a whole course and refresh the queue). Plan: [`packages/command-and-control/docs/superpowers/plans/2026-07-02-wcag22-phase2-gate-and-queue.md`](../packages/command-and-control/docs/superpowers/plans/2026-07-02-wcag22-phase2-gate-and-queue.md).

Fast-follow polish: [#112](https://github.com/Ryfter/canvas-toolchain/issues/112) (course-path guidance when the single-page re-gate blocks) and [#113](https://github.com/Ryfter/canvas-toolchain/issues/113) (align acknowledgment-record keys on the CDS-delegated page path) — **both fixed and merged 2026-07-09** (PRs [#115](https://github.com/Ryfter/canvas-toolchain/pull/115)/[#116](https://github.com/Ryfter/canvas-toolchain/pull/116); on main, unreleased). The broader V&R-wide relative-path keying of `a11yAcknowledgments`/`approvals` maps stays with the Phase 3 spec.

## Shipped in v1.11.0: WCAG 2.2 Phase 3 — institution policy + deeper checks

Built on `feat/wcag22-phase3` per the Phase 3 implementation plan. Contents:

1. **Institution policy anchor** — an optional `accessibilityPolicy` block in the institution config (required conformance level, re-verification cadence, policy URLs). New tool `review_accessibility_policy` (view / confirm / update) reads and writes it; a cadence nudge fires once the professor has confirmed at least once and the recheck window has elapsed. The required level moves where the publish-gate line falls; every engine still runs the full WCAG 2.2 audit regardless of policy.
2. **WCAG 3 opt-in advisory toggle** — early WCAG 3 draft guidance (mapped against the 2024-12-12 working draft) surfaced as a `wcag3` report section only when `wcag3Advisory: true`. Advisory-only by construction — never gates.
3. **WAVE deep-check adapter** — new tool `wave_deep_check` runs the paid WAVE API against publicly reachable pages, gated behind an explicit two-call spend confirmation (no credits spent on preview) and a pre-flight auth-gate refusal so login-gated Canvas URLs are never sent to the API. The free WAVE browser extension remains the recommended route for gated pages. Closes issue [#108](https://github.com/Ryfter/canvas-toolchain/issues/108).

Full detail: [`docs/accessibility.md`](accessibility.md#phase-3--institution-policy-wcag-3-advisories-wave-deep-check-2026-07). Design spec: [`packages/command-and-control/docs/superpowers/specs/2026-07-01-wcag22-conformance-gate-design.md`](../packages/command-and-control/docs/superpowers/specs/2026-07-01-wcag22-conformance-gate-design.md).

## Shipped in v2.0.0: plug-in module channel

Tracked as umbrella issue [#78](https://github.com/Ryfter/canvas-toolchain/issues/78) under the v2.0 milestone. **Shipped as v2.0.0 (2026-07-11; PR #120 squash `09c63c1`).** The 1.x plug-in system (the `CanvasToolchainModule` contract, workspace module packages, `modules.json` enablement, the fail-soft loader, `list_modules`/`set_module_enabled`) stays exactly as it is — what v2.0 adds is *distribution*: a module (or a fix to one) can now ship without a new installer release.

- Modules build into single-file, hash-pinned artifacts, each version tagged and attached to its own GitHub Release; `module-catalog.json` on `main` is the single source of truth for what exists and what its bytes must hash to. **This part is superseded in v2.1.0 below** — module releases took the "Latest" badge away from real toolchain releases and silently broke the update check.
- Three new C&C tools drive it conversationally: `browse_module_catalog` (read-only), `install_module` (two-call confirm gate — preview, then `confirm: true` to download/verify/install), and `uninstall_module`.
- The installer GUI gains an "Additional modules" picker that only **requests** a module via a pending-request file — chat's confirmed `install_module` remains the only place code installation is authorized.
- The hash is verified twice — once at install, again at every server startup — so a tampered, corrupted, or mismatched artifact is refused rather than loaded; every new failure mode stays fail-soft (the server always starts).
- One channel-native proof module, **Announcements Auditor** (`packages/module-announcements`), ships only through the channel — present in the source tree, absent from `KNOWN_MODULES` — to exercise the whole path end to end.

Full design: [`docs/superpowers/specs/2026-07-11-plugin-module-channel-design.md`](superpowers/specs/2026-07-11-plugin-module-channel-design.md). Publishing/installing runbook: [`docs/module-channel.md`](module-channel.md).

Related platform items that ride with (or follow) the module channel:

- **Institutional tool-discovery** — after install, detect/ask which LMS tools an institution uses and build a standardized institution profile. (Shipped as `discover_tools`/#76; the module channel extends its `handles[]` matching to catalog modules too.)
- **Usage feedback via GitHub** — an opt-in flow that submits anonymized institution profiles as GitHub issues/PRs, so module priorities follow real usage. (Shipped as `submit_usage_feedback`/#77.)

Release sequence as it actually shipped: PR → CI green → squash-merge → tag `module-announcements-v1.0.0` → `release-module.yml` (now deleted, see v2.1.0) → commit the catalog entry to `main` → tag `v2.0.0` → `release-installer.yml` → close #78.

## Shipped in v2.1.0: one release surface (2026-07-14)

`release-module.yml` gave each module version its own tagged GitHub Release. On 2026-07-11 that caused a real outage: the module tag took the Releases page's "Latest" badge away from the actual `v2.0.0` release, and the update check — which reads `/releases/latest` — got a module tag back, couldn't parse a `vX.Y.Z` out of it, and silently reported no update. Every professor still on v1.x was never told v2.0.0 or the v2.0.1 security release existed. v2.1.0 removed the second release surface entirely:

- **Repo-hosted module artifacts.** A module version's `.mjs` artifact is now a file committed to this repo at `modules/<id>/<version>/<id>-<version>.mjs`, fetched at install time over `raw.githubusercontent.com` rather than a GitHub Release asset. `release-module.yml` is deleted. Publishing a version is a pull request: build, commit the artifact, update the catalog entry, open a PR — CI's `module-artifacts` job rebuilds the module from source and fails unless the committed bytes equal both the fresh build and the catalog's pinned sha256/sizeBytes.
- **Companion entries.** `module-catalog.json` moves to `catalogVersion: 2`, adding a `companions[]` array alongside `modules[]` for separate programs that work alongside the toolchain (Canvas Backup and friends) — `id`/`name`/`summary`/`whyYouWantIt`/`url`/`worksWithoutToolchain` only, validated default-deny so a companion entry can never carry anything runnable.
- **Hardened update check.** The only release tags that exist from here on are `vX.Y.Z`; the update check now accepts only a strictly-matching tag and ignores everything else, so no future tag (module or otherwise) can take the "Latest" badge and poison it again.
- **Generated module page.** `docs/modules.md` is generated from `module-catalog.json` via `npm run docs:modules`; a CI docs-drift step fails the PR if it's out of date. The former hand-written module-architecture page now lives at `docs/architecture-modules.md`.

**Compat break (accepted):** a v2.0.x installed toolchain cannot read a `catalogVersion: 2` catalog — its validator refuses any catalog version newer than it understands (`CATALOG_VERSION_UNSUPPORTED`) rather than guessing at an unknown shape. That refusal is deliberate fail-closed behavior; a v2.0.x install must update to v2.1.0 (the update nudge tells it so) before it can browse or install modules again.

**Sequencing as executed (order was load-bearing):** the v2.1.0 PR merged to `main` with the live catalog still `catalogVersion: 1`, so no installed toolchain was affected. The `v2.1.0` release was cut next — restoring the "Latest" badge the update nudge depends on for every v1.x/v2.0.x professor. Only then did the catalog-cutover PR merge (`catalogVersion: 2`, the Announcements artifact re-pointed at its `modules/` path using the exact already-published bytes — no rebuild, no version bump — plus `minHostVersion: "2.1.0"` and companion listings). Finally the old module release tags were deleted and the live catalog verified end to end — fetched over HTTPS from `raw.githubusercontent.com`, artifact bytes hashed against the catalog pin — before calling it done.

## Shipped in v2.2.0 to v2.4.2: unification, a single tool surface, readiness, per-OS paths

Summarized in the table under "Where we are". The design records live with the work: `docs/2026-08-21-install-simplification.md` (install path), `docs/2026-08-22-npm-oidc-decision.md` (publishing), `docs/skill-graph.md` (tool surface and skills), and `docs/specs/2026-10-18-paths-and-module-credentials.md` (app folders and module credentials, with the migration engine's guarantees: copy-only, never overwrite or delete, rename the old folder only when fully verified).


## Ideas backlog (unscheduled)

Captured, not committed. (The showcase/template-creator, information-hierarchy, and rubric-persona items graduated to "Immediate next steps" above.)

- **API cost visibility** — surface a rough per-operation cost estimate for LLM-backed tools, so a professor on their own API key is never surprised by a bill.
- **Diagnostics export** — a sanitized `export_diagnostics` bundle a professor can attach to a bug report, so support doesn't require screen-sharing.
- **Installer accessibility** — the wizard GUI itself (Fyne) has weak screen-reader support; audit it if institutional adoption becomes a goal.

## Housekeeping riding the next releases

- Keep `docs/accessibility.md`, `docs/tool-overview.md`, and the generated `docs/modules.md` current as features land (the modules page is CI-enforced; the others are manual).
- Refresh this page and the `AGENTS.md` status paragraph at every minor release; both went stale for three months because nothing prompted it.
