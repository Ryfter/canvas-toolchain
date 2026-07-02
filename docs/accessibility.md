# Accessibility checks

Canvas Toolchain runs **automated accessibility checks** on every Canvas page it
generates, validates, or publishes. The goal is to catch the accessibility mistakes
that most often slip into LMS content — low-contrast text, missing alt text, broken
heading order, uncaptioned video — *before* a page goes live to students.

This page documents **every check**: what it catches, how it works, where it runs,
whether it blocks publishing, and its limitations.

> **Standard:** [WCAG 2.1 Level AA](https://www.w3.org/WAI/WCAG21/quickref/?levels=aaa).
> **Philosophy:** the content checks are **advisory** — they warn, they never block a
> professor from publishing. The one exception is the missing-`alt` rule (see
> [Layer 2](#layer-2--the-blocking-alt-rule)), which is a hard validation failure.

---

## At a glance

| Layer | What it is | Severity |
|---|---|---|
| [1. WCAG content audit](#layer-1--the-wcag-content-audit) | Six heuristic checks over the page HTML (contrast, alt, headings, links, tables, captions) | Advisory (warnings) |
| [2. Blocking `alt` rule](#layer-2--the-blocking-alt-rule) | Every `<img>` must have an `alt` attribute | **Blocking** (validation fails) |
| [3. Widget scaffolding](#layer-3--interactive-widget-scaffolding) | Accessibility built into every interactive widget by construction | Always-on (not a check) |

Source of truth (for developers):

- `packages/canvas-design-studio/src/tools/accessibility.ts` — the WCAG audit (`auditAccessibility`)
- `packages/canvas-design-studio/src/tools/contrast.ts` — the contrast-ratio math
- `packages/canvas-design-studio/src/tools/validate.ts` — Canvas RCE validation + the blocking `alt` rule
- `packages/canvas-design-studio/src/tools/widget/a11y.ts` — widget accessibility scaffolding
- `packages/command-and-control/src/tools/publish/scan_warnings.ts` — runs the audit during the publish flow

---

## Engine architecture (Phase 1, 2026-07)

Checks now run through pluggable engines that all emit one canonical model
(`AccessibilityFinding` in `@canvas-toolchain/shared-types`), normalized to
WCAG 2.2 success criteria:

| Engine | What it covers | Notes |
|---|---|---|
| `inhouse` | The six Canvas-aware heuristics (contrast with measured margin, empty alt, heading skips, vague links, table headers, Panopto captions) | Authoritative for 1.4.3 contrast |
| `axe` | axe-core 4.x WCAG 2.0/2.1/2.2 A+AA rules in jsdom (ARIA, roles, structure, labels, and more) | `color-contrast` and `target-size` disabled — jsdom has no layout |

Every check produces a `ConformanceReport`: a verdict (`pass` / `borderline` /
`fail`) against the required conformance level (default **WCAG 2.1 AA**),
findings with severity and margins, forward-looking advisories beyond the
required level, and an honest per-criterion status — `pass`, `fail`,
`needs-human-review` (automation cannot judge ~half of WCAG; use the WAVE
browser extension or MS Accessibility Insights,
https://accessibilityinsights.io/downloads/), or `not-applicable` (Canvas
owns the page chrome and login).

Phase 1 is fully advisory: nothing blocks publishing yet. The publish gate,
acknowledgments, and the borderline review queue are Phase 2 of
`packages/command-and-control/docs/superpowers/specs/2026-07-01-wcag22-conformance-gate-design.md`.

---

## Layer 1 — the WCAG content audit

`auditAccessibility(html)` runs six independent checks and returns a list of warnings.
Each warning has a `check` id, a plain-English `message`, and a `context` snippet
showing the offending markup. HTML comments are stripped before analysis.

### 1. Contrast ratio (`contrast-ratio`)

**Catches:** body or large text whose colour does not contrast enough with its
background to be readable.

**How it works:** for each element with an inline `style` attribute, the check reads
an inline `color` (foreground) and `background-color`/`background` (background) given
as **hex** values on the *same element*. It computes the WCAG contrast ratio from each
colour's relative luminance:

```
ratio = (Llighter + 0.05) / (Ldarker + 0.05)
```

(luminance via the [`color`](https://www.npmjs.com/package/color) library, in
`contrast.ts`). It then compares against the WCAG AA threshold:

| Text size | Required ratio |
|---|---|
| Normal ("body") text | **4.5 : 1** |
| Large text — `font-size ≥ 24px`, or `≥ 18px` when `font-weight: bold`/`700` | **3.0 : 1** |

A warning fires when the measured ratio is below the threshold, e.g.
`#777 on #fff: 4.48:1 — fails WCAG AA for body text (requires 4.5:1)`.

**Limitations:** only sees inline **hex** colours declared on the *same* element. It
does **not** evaluate named colours (`gray`), `rgb()`/`hsl()`, gradients, colours set
via CSS classes, or colours inherited from a parent. When it can't find both a
foreground and a background hex on an element, it skips that element silently.

### 2. Meaningful alt text (`empty-alt`)

**Catches:** content images with an empty `alt=""` that are probably *not* decorative.

**How it works:** for each `<img>` that has both `src` and `alt`, if `alt` is empty and
the `src` does **not** look decorative (it doesn't match `spacer`, `pixel`, `blank`,
`transparent`, or `1x1`), it warns that the image needs descriptive alt text — or
explicit confirmation that it's decorative.

**Note:** an image with *no* `alt` attribute at all is caught by the **blocking** rule
in [Layer 2](#layer-2--the-blocking-alt-rule), not here. This check is specifically
about `alt=""`.

### 3. Heading hierarchy (`heading-skip`)

**Catches:** skipped heading levels that break screen-reader navigation.

**How it works:** it collects the page's `<h2>`–`<h6>` in document order and flags the
first place a level jumps by more than one (e.g. an `<h2>` followed directly by an
`<h4>`). `<h1>` is intentionally excluded — Canvas reserves H1 for the page title, so
body content starts at H2.

### 4. Descriptive link text (`vague-link`)

**Catches:** links whose visible text doesn't say where they go.

**How it works:** it strips inner tags from each `<a>…</a>`, lowercases the text, and
warns if it exactly matches a known vague phrase: *click here, here, read more, more,
link, this link, learn more*.

### 5. Table headers (`table-no-headers`)

**Catches:** data tables with no header cells.

**How it works:** for each `<table>`, if it contains no `<th>` element at all, it warns
that screen readers can't associate data cells with row/column headers.

### 6. Video captions (`video-no-captions`)

**Catches:** Panopto video embeds that don't have captions switched on.

**How it works:** for each `<iframe>` whose `src` points at Panopto, if the URL does
not contain `captions=true`, it warns to add `&captions=true` to the embed URL.

---

## Layer 2 — the blocking `alt` rule

Separately from the advisory audit, `validateCanvasHtml(html)` (the Canvas RCE
validator) enforces one accessibility rule as a **hard failure**:

> **Every `<img>` must have an `alt` attribute.**

An image with no `alt` at all makes validation return `valid: false`, which surfaces as
an error (not just a warning) — `validate_canvas_html` reports `isError: true`. Use
`alt=""` for genuinely decorative images and descriptive text for everything else.
(An *empty* `alt` then gets a gentle advisory nudge from check #2 above unless the
`src` looks decorative.)

This rule lives alongside the Canvas sanitizer constraints (no `<style>`, `<script>`,
`box-shadow`, etc.) in `validate.ts`.

---

## Layer 3 — interactive widget scaffolding

Interactive widgets (card-flip reveals, drag-to-categorize, branching scenarios, etc.)
get accessibility built in **by construction** rather than checked after the fact.
Every rendered widget includes (`widget/a11y.ts`):

- **A screen-reader live region** — a visually hidden `aria-live="polite"` status
  element, seeded with a summary of the widget. Renderers call a global
  `__announce(text)` helper after every user-visible state change so screen-reader
  users hear updates.
- **Minimum touch targets** — a `.touch-target` utility enforcing a 44 × 44px hit area.
- **Visible focus** — a `:focus-visible` outline (2px brand-blue) so keyboard users can
  always see where they are.
- **Reduced-motion support** — a `prefers-reduced-motion: reduce` media query that
  disables transitions and animations for users who ask for less motion.
- **An `.sr-only` pattern** for screen-reader-only text.

---

## Where the checks run

| Tool / workflow | RCE validation (blocking) | WCAG audit (advisory) |
|---|---|---|
| `validate_canvas_html` | ✅ sets `isError` on failure | ✅ reported as advisory |
| `generate_canvas_page` / `generate_page` / `generate_week` / `generate_course` | ✅ | ✅ appended to warnings |
| `redesign_canvas_page` | — | ✅ carried in `accessibilityWarnings` |
| `publish_to_canvas` / course publish (V&R) | ✅ | ✅ via `scanWarnings` (`kind: 'a11y'`, `severity: 'warn'`) |

In the **publish / Versioning & Rollback** flow, the audit runs as part of the
pre-publish warning scan, so the preview surfaces accessibility issues before any page
is written to Canvas.

### Reading the output

```
✓ Accessibility (WCAG 2.1 AA): No issues found.
```

or

```
⚠ Accessibility (WCAG 2.1 AA — advisory): 2 issue(s) found:

1. contrast-ratio: #777777 on #ffffff: 4.48:1 — fails WCAG AA for body text (requires 4.5:1)
   Context: color:#777777;background:#ffffff;font-size:16px
2. vague-link: "click here" is not descriptive — use text that explains where the link goes
   Context: <a href="...">click here</a>
```

---

## How to fix the common findings

| Check | Fix |
|---|---|
| `contrast-ratio` | Darken the text or lighten the background until the ratio meets 4.5:1 (3:1 for large/bold). The brand `Text-primary #1A1A1A` on white is ~17:1 and always passes. |
| `empty-alt` | Replace `alt=""` with a short description of what the image shows, or confirm it's decorative (then `alt=""` is correct). |
| `heading-skip` | Don't jump levels — go H2 → H3 → H4. Use heading level for structure, not for font size. |
| `vague-link` | Rewrite link text to name the destination: "Download the rubric (PDF)" instead of "click here". |
| `table-no-headers` | Add a header row using `<th>` cells (the `ic-Table` class styles them). |
| `video-no-captions` | Add `&captions=true` to the Panopto embed URL, and confirm the video actually has a caption track. |
| Missing `alt` (blocking) | Add an `alt` attribute to every `<img>` — descriptive text, or `alt=""` if decorative. |

---

## Limitations (read this)

These checks are **fast heuristics, not a full accessibility engine**. They use pattern
matching over the HTML source, not a rendered DOM or an engine like
[axe-core](https://github.com/dequelabs/axe-core). They are designed to catch the
*common, high-frequency* mistakes cheaply and never block a professor's workflow.

They **do not** check, among other things:

- Contrast for non-inline / non-hex colours, gradients, or inherited/computed colours
- ARIA attribute correctness or misuse
- Form field labels and input associations
- Keyboard focus order and tab traps
- Reading / DOM order vs. visual order
- Text resize / reflow, motion beyond Panopto captions, or audio descriptions

A clean accessibility report means "no *detected* issues," not "fully WCAG-conformant."
For anything student-facing and high-stakes, pair these checks with a manual review and
your institution's accessibility tooling.
