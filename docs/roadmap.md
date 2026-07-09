# Canvas Toolchain Roadmap

_Last updated: 2026-07-09. This is the planned order of work — what ships next, what release it lands in, and what is parked as an idea. Dates are intentionally absent; the order is the commitment, not the calendar._

## Where we are

**Current release: v1.10.0** (WCAG 2.2 Phase 2 — the two-tier accessibility publishing gate).

**Immediate next steps, in order:**

1. **Pick the release vehicle for the merged fast-follows** (#112/#113, merged 2026-07-09 and sitting unreleased on main) — a small v1.10.1 patch, or let them ride v1.11.0 with Phase 3.
2. **Write the Phase 3 implementation plan** from the design spec (policy anchor + WCAG 3 toggle + external deep-check adapter) → build → **v1.11.0**, closing #108.
3. **v2.0 (#78)** — design conversation to decompose the umbrella; nothing buildable until then.

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

## Now: WCAG 2.2 Phase 3 — institution policy + deeper checks

Specced (same design doc, Phase 3 section) but **not yet planned**. Contents:

1. **Institution policy anchor** — the required conformance level (currently the ADA Title II baseline, WCAG 2.1 AA) becomes configurable per institution via the institution config, including a pointer to the institution's published accessibility policy.
2. **WCAG 3 opt-in advisory toggle** — early WCAG 3 guidance surfaced as advisories only, never gating.
3. **External deep-check adapter** — an opt-in engine slot for external evaluation services (e.g. WAVE), closing out issue [#108](https://github.com/Ryfter/canvas-toolchain/issues/108).

**Release: v1.11.0.** Next step when picked up: write the Phase 3 implementation plan from the spec.

## Later: v2.0 — plug-in module architecture

Tracked as umbrella issue [#78](https://github.com/Ryfter/canvas-toolchain/issues/78) under the v2.0 milestone. The idea: the base install is Canvas page editing; everything else (course intelligence, group building, rosters, third-party integrations) becomes an opt-in module that can be added **without shipping a new installer release**. The installer's workflow-selector screen already prototypes the UX.

Related platform items that ride with (or follow) the module architecture:

- **Institutional tool-discovery** — after install, detect/ask which LMS tools an institution uses and build a standardized institution profile.
- **Usage feedback via GitHub** — an opt-in flow that submits anonymized institution profiles as GitHub issues/PRs, so module priorities follow real usage.

**Status: needs a design conversation first.** Nothing here is buildable until #78 is decomposed into sub-specs.

## Ideas backlog (unscheduled)

Captured, not committed:

- **Canvas capability showcase + assisted template creator** — show professors the full design surface Canvas allows (inline-CSS-only constraints included) and generate valid pages from structured choices.
- **Information hierarchy / content priority tiers** — rank page content into at-a-glance / working-detail / deep-support tiers and let that drive layout decisions.
- **Rubric persona tie-in completion** — `draft_student_rubric` accepts personas but does not yet emit per-persona explanations.

## Housekeeping riding the next releases

- Close or update **#108** against the design spec when Phase 3 ships.
- Keep `docs/accessibility.md`, `docs/tool-overview.md`, and the module view current as each phase lands (Phase 2's plan includes its own doc task).
