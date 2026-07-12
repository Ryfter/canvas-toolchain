# Canvas Toolchain Roadmap

_Last updated: 2026-07-11. This is the planned order of work — what ships next, what release it lands in, and what is parked as an idea. Dates are intentionally absent; the order is the commitment, not the calendar._

## Where we are

**Current release: v2.0.0** (plug-in module channel — hash-pinned drop-in modules, `browse_module_catalog`/`install_module`/`uninstall_module`, Announcements Auditor as the first channel module; PR #120, closed #78, released 2026-07-11). Prior: v1.11.x (WCAG 2.2 Phase 3 + hardening).

**Immediate next steps, in order:**

1. **v2.0 plug-in module channel (#78)** — **SHIPPED as v2.0.0 (2026-07-11).** Announcements Auditor 1.0.0 published to the catalog same day (first live `release-module.yml` run). Open follow-ups: #121 (artifactUrl host pin), #122 (Fyne ≥2.6 / fyne.Do), #123 (dispatch testability).

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

## Now: v2.0 — plug-in module channel

Tracked as umbrella issue [#78](https://github.com/Ryfter/canvas-toolchain/issues/78) under the v2.0 milestone. **Shipped as v2.0.0 (2026-07-11; PR #120 squash `09c63c1`).** The 1.x plug-in system (the `CanvasToolchainModule` contract, workspace module packages, `modules.json` enablement, the fail-soft loader, `list_modules`/`set_module_enabled`) stays exactly as it is — what v2.0 adds is *distribution*: a module (or a fix to one) can now ship without a new installer release.

- Modules build into single-file, hash-pinned artifacts attached to GitHub Releases; `module-catalog.json` on `main` is the single source of truth for what exists and what its bytes must hash to.
- Three new C&C tools drive it conversationally: `browse_module_catalog` (read-only), `install_module` (two-call confirm gate — preview, then `confirm: true` to download/verify/install), and `uninstall_module`.
- The installer GUI gains an "Additional modules" picker that only **requests** a module via a pending-request file — chat's confirmed `install_module` remains the only place code installation is authorized.
- The hash is verified twice — once at install, again at every server startup — so a tampered, corrupted, or mismatched artifact is refused rather than loaded; every new failure mode stays fail-soft (the server always starts).
- One channel-native proof module, **Announcements Auditor** (`packages/module-announcements`), ships only through the channel — present in the source tree, absent from `KNOWN_MODULES` — to exercise the whole path end to end.

Full design: [`docs/superpowers/specs/2026-07-11-plugin-module-channel-design.md`](superpowers/specs/2026-07-11-plugin-module-channel-design.md). Publishing/installing runbook: [`docs/module-channel.md`](module-channel.md).

Related platform items that ride with (or follow) the module channel:

- **Institutional tool-discovery** — after install, detect/ask which LMS tools an institution uses and build a standardized institution profile. (Shipped as `discover_tools`/#76; the module channel extends its `handles[]` matching to catalog modules too.)
- **Usage feedback via GitHub** — an opt-in flow that submits anonymized institution profiles as GitHub issues/PRs, so module priorities follow real usage. (Shipped as `submit_usage_feedback`/#77.)

**Status: implementation complete on the feature branch, verification green, release not yet cut.** Release sequence: PR → CI green → squash-merge → tag `module-announcements-v1.0.0` → `release-module.yml` → commit the catalog entry to `main` → tag `v2.0.0` → `release-installer.yml` → close #78.

## Ideas backlog (unscheduled)

Captured, not committed:

- **Canvas capability showcase + assisted template creator** — show professors the full design surface Canvas allows (inline-CSS-only constraints included) and generate valid pages from structured choices.
- **Information hierarchy / content priority tiers** — rank page content into at-a-glance / working-detail / deep-support tiers and let that drive layout decisions.
- **Rubric persona tie-in completion** — `draft_student_rubric` accepts personas but does not yet emit per-persona explanations.

## Housekeeping riding the next releases

- Close **#108** on merge (Phase 3 PR body ends `Closes #108`).
- Keep `docs/accessibility.md`, `docs/tool-overview.md`, and the module view current as each phase lands (Phase 3's plan includes its own doc task — this one).
