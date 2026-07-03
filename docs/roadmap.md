# Canvas Toolchain Roadmap

_Last updated: 2026-07-02. This is the planned order of work — what ships next, what release it lands in, and what is parked as an idea. Dates are intentionally absent; the order is the commitment, not the calendar._

## Where we are

**Current release: v1.9.0** (host-config fan-out for model-agnostic MCP hosts + accessibility documentation).

Since v1.9.0, **WCAG 2.2 Phase 1** shipped to `main` (unreleased): a canonical accessibility conformance system — shared WCAG 2.2 types, an in-house Canvas-aware check engine plus an axe-core engine behind one adapter, and a conformance report attached to generate, redesign, validate, and publish outputs. Phase 1 is **fully advisory**: it reports, it never blocks.

- Design spec: [`packages/command-and-control/docs/superpowers/specs/2026-07-01-wcag22-conformance-gate-design.md`](../packages/command-and-control/docs/superpowers/specs/2026-07-01-wcag22-conformance-gate-design.md)
- What the checks catch: [`docs/accessibility.md`](accessibility.md)

## Now: WCAG 2.2 Phase 2 — the publishing gate

**Status: plan complete and committed; implementation is the next work item.**
Plan: [`packages/command-and-control/docs/superpowers/plans/2026-07-02-wcag22-phase2-gate-and-queue.md`](../packages/command-and-control/docs/superpowers/plans/2026-07-02-wcag22-phase2-gate-and-queue.md) (8 TDD tasks, complete code). Branch: `feat/wcag22-phase2`.

Phase 2 turns the advisory report into a **two-tier acknowledge-to-launch gate** on both publish paths (`publish_to_canvas` and `publish_course`):

| Verdict | What publishing requires |
|---|---|
| `pass` | Nothing — publishes as today |
| `borderline` (near-miss findings only) | `acknowledgeAccessibility: true` |
| `fail` (clear failures) | An acknowledgment array naming **every** failing success criterion |

Guiding principle: **the professor is the final arbiter** — accessibility informs and gates but never permanently blocks; every gate has a recorded acknowledgment path. The FERPA and Canvas-HTML validation gates are untouched and remain absolute (they cannot be acknowledged away).

Phase 2 also adds:

- **Acknowledgment audit trail** — append-only `.a11y/acknowledgments.json` per course project recording who acknowledged what, when, and against which conformance level.
- **Borderline review queue** — pages that passed only via acknowledgment or sit near a threshold land in `.a11y/review-queue.json`, sorted worst-margin-first.
- **Two new tools:** `accessibility_review_queue` (list/resolve the queue, with links to free human-check tools) and `audit_course_accessibility` (re-scan all generated pages of a course and refresh the queue).

**Release: v1.10.0** once Phase 2 merges. Releases are held until then — Phase 1 alone would ship a report that promises a gate that doesn't exist yet.

## Next: WCAG 2.2 Phase 3 — institution policy + deeper checks

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
