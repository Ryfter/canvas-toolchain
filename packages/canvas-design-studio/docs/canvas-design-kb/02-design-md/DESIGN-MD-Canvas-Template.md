# DESIGN.md — Canvas Template

> **Parent:** [README](../README.md) | **Related:** [DESIGN.md Overview](./DESIGN-MD-Overview.md), [DESIGN.md File Structure](./DESIGN-MD-File-Structure.md)
>
> This is a complete, ready-to-use `DESIGN.md` tailored for Canvas LMS course design. Copy this file, rename it `DESIGN.md`, and customize the values for your institution or course. Feed it to any AI agent to generate Canvas-compliant HTML.

---

## ⬇ Copy From Here ⬇

```markdown
---
name: Canvas Course Design System
colors:
  primary: "#0F6E56"
  primary-dark: "#085041"
  primary-light: "#e1f5ee"
  secondary: "#D64309"
  secondary-light: "#faeeda"
  neutral: "#F4F3EF"
  neutral-dark: "#e0e0d8"
  text-primary: "#1A1A1A"
  text-secondary: "#555550"
  text-muted: "#888780"
  white: "#ffffff"
  info-bg: "#E6F1FB"
  info-border: "#185FA5"
  success-bg: "#EAF3DE"
  success-border: "#3B6D11"
  warning-bg: "#FAEEDA"
  warning-border: "#854F0B"
  danger-bg: "#FCEBEB"
  danger-border: "#A32D2D"
typography:
  h2:
    fontFamily: Lato, sans-serif
    fontSize: 1.75rem
    fontWeight: "600"
  h3:
    fontFamily: Lato, sans-serif
    fontSize: 1.375rem
    fontWeight: "600"
  h4:
    fontFamily: Lato, sans-serif
    fontSize: 1.125rem
    fontWeight: "600"
  body:
    fontFamily: Lato, sans-serif
    fontSize: 1rem
    lineHeight: "1.65"
  small:
    fontFamily: Lato, sans-serif
    fontSize: 0.875rem
  label:
    fontFamily: Lato, sans-serif
    fontSize: 0.6875rem
    fontWeight: "600"
    letterSpacing: "0.08em"
    textTransform: "uppercase"
rounded:
  sm: 4px
  md: 8px
  lg: 10px
  xl: 14px
  pill: 20px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 48px
components:
  card:
    backgroundColor: "{colors.white}"
    border: "1px solid {colors.neutral-dark}"
    borderRadius: "{rounded.lg}"
    padding: "{spacing.lg} 20px"
  hero-banner:
    backgroundColor: "{colors.primary}"
    color: "{colors.white}"
    borderRadius: "{rounded.xl}"
    padding: "48px"
  callout-info:
    backgroundColor: "{colors.info-bg}"
    borderLeft: "3px solid {colors.info-border}"
    borderRadius: "0 {rounded.md} {rounded.md} 0"
    padding: "14px 18px"
  callout-success:
    backgroundColor: "{colors.success-bg}"
    borderLeft: "3px solid {colors.success-border}"
    borderRadius: "0 {rounded.md} {rounded.md} 0"
    padding: "14px 18px"
  callout-warning:
    backgroundColor: "{colors.warning-bg}"
    borderLeft: "3px solid {colors.warning-border}"
    borderRadius: "0 {rounded.md} {rounded.md} 0"
    padding: "14px 18px"
  callout-danger:
    backgroundColor: "{colors.danger-bg}"
    borderLeft: "3px solid {colors.danger-border}"
    borderRadius: "0 {rounded.md} {rounded.md} 0"
    padding: "14px 18px"
  button-primary:
    backgroundColor: "{colors.primary}"
    color: "{colors.white}"
    borderRadius: "{rounded.md}"
    padding: "10px 20px"
    fontWeight: "600"
    fontSize: "0.875rem"
    textDecoration: none
  button-ghost:
    border: "1.5px solid rgba(255,255,255,0.5)"
    color: "{colors.white}"
    borderRadius: "{rounded.md}"
    padding: "9px 20px"
    fontWeight: "500"
    fontSize: "0.875rem"
    textDecoration: none
  pill:
    borderRadius: "{rounded.pill}"
    padding: "3px 10px"
    fontSize: "0.6875rem"
    fontWeight: "500"
  nav-bar:
    display: flex
    gap: use margin
    background: "{colors.neutral}"
    borderRadius: "{rounded.md}"
    padding: "6px"
  week-row:
    backgroundColor: "{colors.white}"
    border: "0.5px solid {colors.neutral-dark}"
    borderRadius: "{rounded.lg}"
    overflow: hidden
    marginBottom: "12px"
---

## Overview

Professional academic design for active learners. Clean, modern, and
content-forward. The visual language reduces cognitive load by using consistent
component patterns across all course pages. Design prioritizes readability,
clear navigation, and mobile usability.

Tone: structured but human. Not cold corporate, not casual chaotic. Think
"thoughtful faculty who cares about the student experience."

## Colors

The palette is anchored by a deep institutional green (primary) with warm
neutral backgrounds and semantic accent colors for alerts and status indicators.

- **Primary (#0F6E56):** Deep forest green. Used for hero banners, section
  headers, active nav states, left-border callout accents, and primary buttons.
  High contrast on white (4.8:1).
- **Primary-dark (#085041):** Deeper shade for hover states, footer bars,
  and text on light green backgrounds.
- **Primary-light (#e1f5ee):** Very light green tint. Used for info/tip
  callout backgrounds, hover states on nav items.
- **Neutral (#F4F3EF):** Warm off-white. Used as page background and nav
  container background.
- **Text-primary (#1A1A1A):** Near-black body text. Softer than pure black
  on screen — reduces fatigue for long reading.
- **Semantic colors:** Info (blue), success (green), warning (amber), danger
  (red) — always used as pairs (light bg + darker border/text).

**Canvas constraint:** `box-shadow` is not allowed. Depth is achieved
through background contrast (white card on neutral page) and border outlines.

## Typography

Canvas LMS at most institutions loads Lato via the institutional theme.
Always specify `Lato, sans-serif` with a safe fallback.

**Canvas constraint:** `<h1>` is reserved for the page title field. All
content headings start at `<h2>`. Never use H1 in body HTML.

**Scale:**
- H2: 1.75rem — major page sections
- H3: 1.375rem — sub-sections
- H4: 1.125rem — component headers (card titles, callout headings)
- Body: 1rem / 1.65 line-height
- Small: 0.875rem — metadata, timestamps, captions
- Label: 0.6875rem / uppercase / tracked — category tags, section labels

**Minimum:** Never use font-size below 13px in generated content.

## Layout

Canvas content renders inside a ~860px max-width content area on desktop.
The Canvas navigation chrome consumes left sidebar space. Plan for ~680px
effective content width in constrained contexts.

**Column rules:**
- 1 column: default for all body text, instructions, rubrics
- 2 columns: objectives + deadlines pairings, feature comparisons
- 3 columns: card grids (module features, assignment types)
- 4 columns: icon stat rows — use sparingly, never on mobile-first layouts

**Mobile:** Students frequently use Canvas on phones. All flex layouts must
use `flex-wrap: wrap` with `min-width` on children. Two-column layouts
should wrap to single column on narrow viewports.

**Spacing rhythm:** 24px between major sections. 16px internal padding.
8px for compact/tight contexts.

## Elevation & Depth

No `box-shadow` allowed in Canvas RCE. Depth through:
- **Background contrast:** White cards on `#F4F3EF` neutral background
- **Border:** `1px solid #e0e0d8` on cards
- **Color weight:** Hero banners use full primary color fill for visual hierarchy
- **Left-border accent:** 3–4px solid color on callout left edge

## Shapes

- Cards: `border-radius: 10px`
- Hero banners: `border-radius: 14px`
- Buttons: `border-radius: 8px`
- Pills/tags: `border-radius: 20px`
- Callout left-border style: `border-radius: 0 8px 8px 0`
- Images: `border-radius: 8px`

## Components

### Card
White background, 1px neutral border, 10px radius, 18–20px padding.
Use for: module features, resource items, content blocks.

### Hero Banner
Full-width primary color background, white text, generous padding (48px),
14px border-radius. May include overlay circles for depth (pseudo-element
workaround not available in Canvas — omit or use explicit div layers).
Use for: course home page, module landing pages.

### Callout Boxes
Colored left border (3px) + light semantic background + 0 radius on left,
8px on right. Include a `<strong>` label as the first element.
Use for: tips, warnings, deadlines, important notes.

### Navigation Bar
Horizontal flex row of anchor links. Pill-shaped active state in primary color.
Inactive state: text on neutral background.
Use for: course home page top nav, module navigation.

### Week Row
Full-width card with colored left column (either wide left-border or a narrow
div with background color). Right section contains title, description, pills.
Use for: course schedule on home page.

### Pill Labels
Small rounded tags indicating status or category. Use semantic color pairs.
Colors: green (complete), blue (activity type), amber (quiz/assessment), red (due/urgent).

## Agents

**Hard constraints for Canvas RCE — these are non-negotiable:**

1. No `<style>` blocks — all CSS must be `style=""` inline attributes
2. No `<script>` tags — no JavaScript
3. No `box-shadow` — stripped by Canvas sanitizer
4. No `filter`, `transform`, `transition`, `animation`, `opacity` — all stripped
5. No `gap` in flex/grid — use `margin` on children instead
6. No `<h1>` in body HTML — Canvas uses H1 for the page title
7. No `@font-face` or `@import` — use `Lato, sans-serif`
8. No event attributes (onclick, onload, etc.)
9. All external image URLs must use https://
10. `border-radius` IS allowed — use it freely

**Generation rules:**
- Wrap all page content in `<div style="max-width: 860px; margin: 0 auto; font-family: Lato, sans-serif;">`
- Always provide `alt=""` attributes on all images
- Use semantic HTML: `<header>`, `<nav>`, `<section>`, `<article>`, `<footer>` are all allowed
- Heading hierarchy: H2 → H3 → H4 — never skip levels
- Color contrast: primary (#0F6E56) on white = 4.8:1 — passes AA. Text on colored backgrounds must meet 4.5:1.
- Test all generated HTML mentally for mobile single-column collapse
```

---

## Customization Guide

### Change the Color Scheme

Replace the hex values in the YAML front matter. Update the prose in the `## Colors` section to reflect the new palette and its rationale.

For Example University:
- Primary: `#0033A0` (University Blue)
- Secondary: `#D64309` (University Orange)

For a neutral institutional theme:
- Primary: `#1A3A5C` (deep navy)
- Secondary: `#C8922A` (warm gold)

### Add Your Institution's Font

If your Canvas theme loads a custom font at the account level, update:
```yaml
typography:
  body:
    fontFamily: "Your Font, sans-serif"
```

And update the prose rationale accordingly.

### Add Course-Specific Components

Add to the `components:` YAML and document in `## Components`:
```yaml
  rubric-row:
    backgroundColor: "{colors.white}"
    borderBottom: "1px solid {colors.neutral-dark}"
    padding: "{spacing.sm} {spacing.md}"
```

---

## See Also

- [DESIGN.md Overview](./DESIGN-MD-Overview.md) — What DESIGN.md is and why it matters
- [DESIGN.md File Structure](./DESIGN-MD-File-Structure.md) — Detailed spec section reference
- [DESIGN.md Toolchain](./DESIGN-MD-Toolchain.md) — CLI validation and export
- [Component Library](../03-design-systems/Component-Library.md) — HTML snippets matching these tokens
