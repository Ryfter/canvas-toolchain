---
id: "accessibility_gate"
description: "How the accessibility gate works: what blocks a Canvas publish, what only queues for human review, and the acknowledgment the professor must write to continue."
related: [accessibility_review_queue, audit_course_accessibility, generate_course, preview_course_publish, publish_course, review_accessibility_policy, wave_deep_check]
---

# The accessibility gate

Accessibility work in this toolchain has two clearly separated halves, and
confusing them is the main way to get stuck. One half **evaluates** a page and
produces findings; the other half **gates** a publish and demands a written
acknowledgment. Evaluation never blocks anything by itself. Only the publish
gate does, and only at the moment of publishing.

Everything speaks one vocabulary — WCAG success criteria — because the canonical
model lives in `@canvas-toolchain/shared-types` (`src/accessibility.ts`):
`AccessibilityFinding` carries `sc`/`severity`/`engine`/optional `margin`, and
`ConformanceReport` carries `verdict: 'pass' | 'borderline' | 'fail'`. Engines
normalize into that shape, so nothing downstream has to know a tool dialect.

## The two tiers

`evaluateAckAgainst(clearScs, hasBorderline, ack)` is the whole rule
(`packages/shared-types/src/accessibility.ts`). It returns an `AckEvaluation`
whose `tier` is `'none' | 'borderline' | 'fail'`:

- **No findings at the required level** — nothing to acknowledge; publishing just
  works.
- **Borderline only** — acknowledgment is required and `true` is sufficient. A
  finding is borderline when it has a measured margin of at least **85%** of the
  required value, or when its severity is `moderate`/`minor`
  (`isBorderlineFinding`). Borderline is "you are near the line; a human should
  look", not "this is broken".
- **Any clear failure** — `true` is explicitly **not** enough. The
  acknowledgment must be an *array naming every failing SC and no others*.
  Missing one, or adding one that is not failing here, is refused with the
  difference spelled out.

The required level defaults to **WCAG 2.1 AA** (`DEFAULT_REQUIRED_LEVEL`, the ADA
Title II baseline). `verdict` is computed against that level only; findings above
it are returned as `advisories` and can never fail a page.

## The order that works

1. [[generate_course]] — write the Canvas-safe HTML. Nothing is checked yet.
2. [[audit_course_accessibility]] — the between-semesters sweep. It walks every
   `.html` under `<courseDir>/output`, runs the full engine stack per page, and
   **refreshes the review queue**: a page that is not a clean pass is upserted as
   an open entry, a page that passes has its entry cleared. It needs generated
   output first (`NO_GENERATED_OUTPUT` otherwise).
3. [[accessibility_review_queue]] — walk the queue with human eyes, then
   `action: "resolve"` to mark a page `reviewed-by-human`. Sorting is worst-margin
   first, so the pages closest to failing come first.
4. [[preview_course_publish]] — classify every entry's warnings. Each a11y
   warning gets `a11yTier: 'borderline' | 'clear'`, plus the `sc` and a
   `marginRatio` when the criterion is measurable.
5. [[publish_course]] — per entry, `evaluateEntryA11yGate` reads those warnings
   and the professor's `a11yAcknowledgments` map. A refusal returns
   `ACCESSIBILITY_ACK_REQUIRED`, writes the snapshot's state as `partial`, and
   **stops the publish there** — the same stop-on-first-failure rule as the rest
   of publishing (see [[publish_safety]]).
6. Acknowledged publishes are appended to `.a11y/acknowledgments.json` under the
   course folder, which makes the trail auditable later.

The engine stack behind steps 2–4 is the same one everywhere: six Canvas-aware
in-house checks (`packages/canvas-design-studio/src/tools/accessibility.ts`) plus
axe-core run in jsdom (`src/tools/a11y/axe.ts`), merged and deduped by
`src/tools/a11y/conformance.ts`. axe's `color-contrast` and `target-size` rules
are **disabled** because jsdom performs no layout — the in-house contrast check is
authoritative for 1.4.3. The axe engine never throws: on failure it reports
nothing covered so criteria honestly fall back to `needs-human-review` rather
than silently passing.

## WAVE is a different lever, not a stronger one

[[wave_deep_check]] calls the paid WAVE API (~2 credits, `reporttype=2`) for a
*public* page. It is the only engine that sees rendered layout, so it is the right
tool for what jsdom cannot do — but it is not wired into the gate:

- **Spend gate.** Called without `confirm: true` it returns a preview and runs
  nothing; no credits are spent.
- **Auth-gate refusal.** It probes the URL first and refuses (`AUTH_GATED_URL`)
  when Canvas returns 401/403 or redirects to a login, because the WAVE API
  cannot log into Canvas. The fix directions point at the free WAVE browser
  extension or MS Accessibility Insights for the same WebAIM engine.
- **Its output is text.** Findings are reported to the professor; nothing from
  WAVE is persisted to `.a11y/`, so a WAVE finding can never gate a publish by
  itself. If it matters, acknowledge it at publish time or note it when resolving
  a queue entry.

## Pitfalls

- **`true` will not clear a clear failure.** The array must be exact — every
  failing SC and nothing else. The refusal message names both the missing and the
  extra criteria.
- **Acknowledgment keys are output-relative paths, not bare filenames.** The
  canonical key is `entry.relPath ?? entry.filename`
  (`src/tools/publish/approvals.ts`). A bare filename only resolves when it is
  unambiguous — two weeks each containing `overview.html` means neither resolves
  by name, by construction, so no acknowledgment can silently satisfy the wrong
  entry. Use the path.
- **Pre-Phase-2 snapshots do not gate.** Warnings without an `a11yTier` are
  ignored by the gate. If an old snapshot publishes suspiciously freely, re-run
  the preview to get tiered warnings.
- **The review queue is a worklist, not a gate.** Resolving an entry records a
  human judgment; it does not lower the required level or pre-approve a publish.
  Re-running the audit *reopens* an entry the moment fresh findings appear.
- **The gate lives in two places.** `publish_course` is the C&C course path.
  Page-level `publish_to_canvas` (Canvas Design Studio, not a C&C operation)
  runs the same two-tier check on one page; C&C's own page rendering routes
  through `lib/page-renderer.ts`, which runs the in-house audit. All three end at
  `evaluateAckAgainst`, so the semantics cannot drift apart.
- **Policy is per-professor runtime data, never repo data.**
  [[review_accessibility_policy]] writes the `accessibilityPolicy` block
  (policy URLs, required level, `recheckWeeks` default 4, the WCAG 3 advisory
  toggle) into the Design Studio institution config. The cadence nudge appears
  only once `lastVerifiedAt` is set; the WCAG 3 toggle is structurally advisory
  and cannot gate anything.

## Sources

- `packages/shared-types/src/accessibility.ts` — `DEFAULT_REQUIRED_LEVEL`,
  `isBorderlineFinding` (85% rule), `computeVerdict`, `evaluateAckAgainst`,
  `clearFailureScs`, `DEFAULT_ACCESSIBILITY_POLICY`, `policyNudge`.
- `packages/canvas-design-studio/src/tools/a11y/{inhouse,axe,conformance,records,wave,policy}.ts`
  — engines, merge/dedupe/verdict, `.a11y/` records, WAVE client, policy store.
- `packages/canvas-design-studio/src/tools/publish.ts` — `publishToCanvas` gate
  and the acknowledgment record it appends.
- `packages/command-and-control/src/tools/publish/{a11y_gate,scan_warnings,approvals}.ts`
  — per-entry gate, preview-time tiering, canonical keys.
- `packages/command-and-control/src/tools/workflows/{publish_course,preview_course_publish,audit_course_accessibility,accessibility_review_queue}.ts`
  — the publish path and the two queue-facing workflows.
- `packages/command-and-control/src/tools/{wave_deep_check,review_accessibility_policy}.ts`
  — spend gate and the policy anchor.
- `packages/command-and-control/src/lib/page-renderer.ts` — where C&C page
  rendering runs the in-house audit.
- `packages/command-and-control/src/surface/registry.ts` — the
  `a11yAcknowledgments` input schema on `publish_course`.
