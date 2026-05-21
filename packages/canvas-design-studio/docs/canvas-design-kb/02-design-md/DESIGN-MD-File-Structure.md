# DESIGN.md File Structure

> **Parent:** [README](../README.md) | **Related:** [DESIGN.md Overview](./DESIGN-MD-Overview.md), [DESIGN.md Canvas Template](./DESIGN-MD-Canvas-Template.md)
>
> **Source:** [Official spec at google-labs-code/design.md/docs/spec.md](https://github.com/google-labs-code/design.md/blob/main/docs/spec.md)

---

## Complete Section Reference

A DESIGN.md file consists of:
1. Optional YAML front matter (between `---` fences)
2. A Markdown body with named `##` sections

Sections can be omitted if not relevant, but when present must appear in the order listed below.

---

### Front Matter (YAML Tokens)

```yaml
---
name: Project Name
colors:
  primary: "#hex"
  secondary: "#hex"
  # Additional named colors as needed
typography:
  h1:               # Note: h1 reserved — use h2 as your top-level in Canvas
    fontFamily: Font Name
    fontSize: value
  body-md:
    fontFamily: Font Name
    fontSize: value
  label-caps:
    fontFamily: Font Name
    fontSize: value
rounded:
  sm: 4px
  md: 8px
  lg: 12px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 48px
components:
  button-primary:
    backgroundColor: "{colors.primary}"   # Reference syntax
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: 10px 20px
  button-primary-hover:
    backgroundColor: "{colors.primary}"   # Darkened shade
  card:
    backgroundColor: "#ffffff"
    borderColor: "{colors.neutral}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
---
```

**Token reference syntax:** Use `{section.token-name}` to reference previously defined tokens within the same file. This prevents value drift when you change a base color.

---

### ## Overview (required)

Also known as "Brand & Style." A holistic description of the product's look and feel. Defines:
- Brand personality
- Target audience
- Emotional response the UI should evoke (playful vs. professional, dense vs. spacious)

This section provides foundational context for AI agents when no specific rule applies.

```markdown
## Overview

Academic design for busy adult learners. Professional without being cold.
Content-forward with clear hierarchy. Designed to reduce cognitive load and
help students navigate efficiently. Think structured clarity, not corporate formality.
```

---

### ## Colors

Defines color palettes. Must include at least the primary palette. Additional palettes (e.g., semantic colors, dark mode) may be added.

```markdown
## Colors

The palette uses Boise State institutional colors as anchors.

- **Primary (#0033A0):** Deep blue for headings, hero banners, and primary CTA.
  High contrast — works on white and light gray backgrounds.
- **Secondary (#D64309):** BSU orange — used *only* for the single most important
  action on a page. Never decorative.
- **Neutral (#F5F5F5):** Page background and card backgrounds. Slightly warm.
- **Text (#1A1A1A):** Near-black for body text. Softer than pure black on screen.
- **Success (#1D6F42):** Positive feedback, completion indicators.
- **Warning (#D4860A):** Important notes requiring attention.
- **Danger (#C0392B):** Deadlines, overdue items, errors.
```

---

### ## Typography

Describes the type system: fonts, scale, and usage rules.

```markdown
## Typography

Canvas courses at BSU inherit the Lato typeface from the institutional theme.
All Canvas content uses Lato; do not specify other fonts unless confirmed available.

**Scale (Canvas H2 is effectively H1 — page title takes H1):**
- H2: 1.75rem / 500 weight — major section headings
- H3: 1.375rem / 500 weight — sub-section headings
- H4: 1.125rem / 600 weight — component headings (card titles, callout headers)
- Body: 1rem / 400 weight / 1.65 line-height

**Rules:**
- Minimum font size: 14px (accessibility)
- Line height: 1.65 for body, 1.2 for headings
- Never use all-caps for body text; use for labels only
```

---

### ## Layout

Describes grid, margins, safe areas, and spacing strategy.

```markdown
## Layout

Canvas page content renders inside a constrained content area (~860px max-width
on desktop, fluid on mobile). The Canvas chrome (sidebar nav, global nav) takes
significant viewport space.

**Grid model:** Single-column base. Two-column flex layouts for complementary
content (objectives + deadlines). Three-column grids for card collections.
Never more than three columns to maintain mobile usability.

**Spacing scale:** Uses 8px base unit. Margins between major sections: 24px.
Internal component padding: 16px. Compact variant: 12px.

**Mobile:** Assume students frequently access Canvas on phones. All layouts
must be functional in a single column. Use `flex-wrap: wrap` and
`min-width: 200px` on flex children for responsive behavior.
```

---

### ## Elevation & Depth

Describes how visual hierarchy is conveyed without shadows.

```markdown
## Elevation & Depth

**Canvas constraint:** `box-shadow` is not allowed in the RCE. Depth is
conveyed through:

- **Background contrast:** Cards use white (#FFFFFF) on a light gray
  page background (#F5F5F5)
- **Border:** 1px solid rgba(0,0,0,0.10) outlines cards
- **Color fill:** Hero banners use primary blue as a solid fill to establish
  top-of-page visual weight
- **Left border accent:** Callout boxes use a 3–4px left border in a semantic
  color for visual hierarchy without depth tricks
```

---

### ## Shapes

Describes border-radius and shape language.

```markdown
## Shapes

- **Cards:** `border-radius: 10px` — modern, friendly
- **Buttons/tags/pills:** `border-radius: 6px` (buttons), `border-radius: 20px` (pills)
- **Hero banners:** `border-radius: 12px` or `14px`
- **Callout boxes:** `border-radius: 0 8px 8px 0` when using left-border accent
- **Images:** `border-radius: 8px` for embedded inline images
```

---

### ## Components

Maps component names to their design tokens. Key for AI-generated code consistency.

```markdown
## Components

- **card:** White background, 1px neutral border, 10px border-radius, 18px padding
- **hero-banner:** Primary color background, white text, 14px border-radius, 48px vertical padding
- **callout-info:** Light blue background (#E6F1FB), 3px left border (primary blue), 14px padding
- **callout-warning:** Light amber background (#FAEEDA), 3px left border (#D4860A), 14px padding
- **callout-success:** Light green background (#EAF3DE), 3px left border (#1D6F42), 14px padding
- **button-primary:** Primary blue background, white text, 6px border-radius, 10px 20px padding
- **pill-label:** Inline tag, semantic background, 20px border-radius, 3px 10px padding, 11px font
- **week-row:** White card with colored left-strip (3px border or colored first column), flex layout
```

---

### ## Agents (Optional)

Tool-specific guidance for AI agents. This is where you document Canvas-specific constraints.

```markdown
## Agents

**Canvas RCE constraints (hard rules — do not violate):**
- No `<style>` blocks — all CSS must be inline
- No `<script>` tags
- No `box-shadow`, `filter`, `transform`, `transition`, `animation`, `opacity`
- No `gap` in flex/grid — use `margin` on children
- No `<h1>` — page title uses H1; start content headings at H2
- No `@font-face` or `@import` — use web-safe fonts or Lato
- No JavaScript event attributes (onclick, onload, etc.)
- `border-radius` is allowed and should be used for all card shapes

**Preferred patterns:**
- Always wrap page content in `<div class="canvas-page-content">` for scoping
- Use flex layouts for multi-column, never table-based layout
- Cards: white bg + neutral border + border-radius + padding
- Callouts: colored left border (4px) + light semantic bg + padding
```

---

## See Also

- [DESIGN.md Overview](./DESIGN-MD-Overview.md) — Why DESIGN.md exists
- [DESIGN.md Canvas Template](./DESIGN-MD-Canvas-Template.md) — A complete, ready-to-use Canvas DESIGN.md
- [DESIGN.md Toolchain](./DESIGN-MD-Toolchain.md) — CLI commands for validation and export
