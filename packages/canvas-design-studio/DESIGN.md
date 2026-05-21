---
name: Canvas Course Design System
version: "1.0"
target: Canvas LMS Rich Content Editor
colors:
  primary: "#0033A0"
  primary-dark: "#002277"
  primary-light: "#E6ECF9"
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
  info-text: "#0C447C"
  success-bg: "#EAF3DE"
  success-border: "#3B6D11"
  success-text: "#27500A"
  warning-bg: "#FAEEDA"
  warning-border: "#854F0B"
  warning-text: "#633806"
  danger-bg: "#FCEBEB"
  danger-border: "#A32D2D"
  danger-text: "#791F1F"
typography:
  h2:
    fontFamily: Lato, sans-serif
    fontSize: 1.75rem
    fontWeight: "600"
    lineHeight: "1.2"
  h3:
    fontFamily: Lato, sans-serif
    fontSize: 1.375rem
    fontWeight: "600"
    lineHeight: "1.2"
  h4:
    fontFamily: Lato, sans-serif
    fontSize: 1.125rem
    fontWeight: "600"
  body:
    fontFamily: Lato, sans-serif
    fontSize: 1rem
    lineHeight: "1.65"
    fontWeight: "400"
  small:
    fontFamily: Lato, sans-serif
    fontSize: 0.875rem
  label:
    fontFamily: Lato, sans-serif
    fontSize: 0.6875rem
    fontWeight: "600"
    letterSpacing: "0.08em"
    textTransform: uppercase
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
    background: "linear-gradient(135deg, {colors.primary-dark} 0%, {colors.primary} 60%, #1A5BCC 100%)"
    color: "{colors.white}"
    borderRadius: "{rounded.xl}"
    padding: "48px"
  callout-info:
    backgroundColor: "{colors.info-bg}"
    borderLeft: "3px solid {colors.info-border}"
    borderRadius: "0 {rounded.md} {rounded.md} 0"
    padding: "14px 18px"
    labelColor: "{colors.info-text}"
    textColor: "{colors.info-border}"
  callout-success:
    backgroundColor: "{colors.success-bg}"
    borderLeft: "3px solid {colors.success-border}"
    borderRadius: "0 {rounded.md} {rounded.md} 0"
    padding: "14px 18px"
    labelColor: "{colors.success-text}"
    textColor: "{colors.success-border}"
  callout-warning:
    backgroundColor: "{colors.warning-bg}"
    borderLeft: "3px solid {colors.warning-border}"
    borderRadius: "0 {rounded.md} {rounded.md} 0"
    padding: "14px 18px"
    labelColor: "{colors.warning-text}"
    textColor: "{colors.warning-border}"
  callout-danger:
    backgroundColor: "{colors.danger-bg}"
    borderLeft: "3px solid {colors.danger-border}"
    borderRadius: "0 {rounded.md} {rounded.md} 0"
    padding: "14px 18px"
    labelColor: "{colors.danger-text}"
    textColor: "{colors.danger-border}"
  button-primary:
    backgroundColor: "{colors.primary}"
    color: "{colors.white}"
    borderRadius: "{rounded.md}"
    padding: "10px 22px"
    fontWeight: "600"
    fontSize: 0.875rem
    textDecoration: none
    display: inline-block
  button-ghost:
    border: "1.5px solid rgba(255,255,255,0.5)"
    color: "{colors.white}"
    borderRadius: "{rounded.md}"
    padding: "9px 22px"
    fontWeight: "500"
    fontSize: 0.875rem
    textDecoration: none
    display: inline-block
  button-outline:
    border: "1.5px solid {colors.primary}"
    color: "{colors.primary}"
    borderRadius: "{rounded.md}"
    padding: "9px 22px"
    fontWeight: "500"
    fontSize: 0.875rem
    textDecoration: none
    display: inline-block
  pill-success:
    backgroundColor: "{colors.success-bg}"
    color: "{colors.success-border}"
    borderRadius: "{rounded.pill}"
    padding: "3px 10px"
    fontSize: 0.6875rem
    fontWeight: "600"
  pill-info:
    backgroundColor: "{colors.info-bg}"
    color: "{colors.info-border}"
    borderRadius: "{rounded.pill}"
    padding: "3px 10px"
    fontSize: 0.6875rem
    fontWeight: "600"
  pill-warning:
    backgroundColor: "{colors.warning-bg}"
    color: "{colors.warning-border}"
    borderRadius: "{rounded.pill}"
    padding: "3px 10px"
    fontSize: 0.6875rem
    fontWeight: "600"
  pill-danger:
    backgroundColor: "{colors.danger-bg}"
    color: "{colors.danger-border}"
    borderRadius: "{rounded.pill}"
    padding: "3px 10px"
    fontSize: 0.6875rem
    fontWeight: "600"
  footer-bar:
    backgroundColor: "{colors.primary-dark}"
    borderRadius: "{rounded.lg}"
    padding: "20px 28px"
    color: "rgba(255,255,255,0.75)"
    linkColor: "#7BA7E0"
  week-row-complete:
    borderColor: "{colors.neutral-dark}"
    stripColor: "{colors.primary}"
  week-row-current:
    borderColor: "{colors.primary}"
    borderWidth: "2px"
    stripColor: "{colors.primary}"
  week-row-upcoming:
    borderColor: "{colors.neutral-dark}"
    stripColor: "#b4b2a9"
---

## Overview

Professional academic design for active learners in business and technology programs. Clean, modern, and content-forward. The visual language reduces cognitive load through consistent component patterns across all course pages.

Tone: structured but human. Not cold corporate, not casual chaotic. Think "thoughtful faculty who cares about the student experience." The design should feel like a well-run tech company's internal learning platform — not a textbook, not a startup's marketing page.

## Colors

The palette is anchored by BSU's institutional blue (primary) with warm neutral backgrounds and semantic accent colors.

- **Primary (#0033A0):** BSU blue. Hero banners, section labels, active nav states, left-border callout accents, primary CTA buttons, and the week-row color strip. Contrast on white: 7.2:1 (passes WCAG AA).
- **Primary-dark (#002277):** Footer bars, hover states, text on primary-light backgrounds.
- **Primary-light (#E6ECF9):** Light blue tint for info/tip callout backgrounds.
- **Neutral (#F4F3EF):** Warm off-white page background. All cards sit on this.
- **White (#ffffff):** Card fill. Provides contrast against the neutral page background.
- **Text-primary (#1A1A1A):** Near-black body text. Softer than pure black on screens.
- **Semantic pairs:** Info (blue), success (green), warning (amber), danger (red). Always used as a light background + darker text/border pair. Never swap the pair.

**Canvas constraint:** `box-shadow` is not allowed in the RCE. Depth is achieved through background contrast (white card on neutral page) and border outlines only.

## Typography

Canvas LMS at Boise State loads Lato via the institutional theme. Always declare `Lato, sans-serif` as the font stack.

**Canvas constraint:** `<h1>` is reserved for the page title. All content headings start at `<h2>`. Heading hierarchy: H2 → H3 → H4. Never skip levels.

**Minimum body font size:** 14px. Never go smaller in generated content.

## Layout

Canvas page content renders inside a ~860px max-width content area on desktop. Plan for ~680px effective content width in constrained contexts (e.g., sidebar-open views).

**Mobile is real.** Students frequently access Canvas on phones. All layouts must be functional in a single column. Preferred approach: use Canvas's built-in `content-box` + `grid-row` + `col-xs-12 col-md-*` classes, which handle breakpoints automatically.

**Column limits:** 1 column default; 2 for complementary pairs; 3 for card grids; never 4+ on layouts that need to work on phones.

**Spacing rhythm:** 24px between major sections. 16px internal padding. 8px for compact contexts.

## Elevation & Depth

No `box-shadow` in Canvas RCE. Depth through:
- **Background contrast:** White (#ffffff) cards on neutral (#F4F3EF) background
- **Border:** 1px solid #e0e0d8 outlines on cards
- **Color fill:** Hero banners use full primary gradient for top-of-page visual weight
- **Left-border accent:** 3–4px solid semantic color on callout left edge

## Shapes

- Cards: `border-radius: 10px`
- Hero banners: `border-radius: 14px`
- Buttons: `border-radius: 8px`
- Pills/tags: `border-radius: 20px`
- Callout left-border style: `border-radius: 0 8px 8px 0`
- Images: `border-radius: 8px`

## Components

**card:** White bg, 1px neutral border, 10px radius, 18–20px padding. Use for module features, resource items, activity descriptions.

**hero-banner:** Full-width primary gradient background, white text, 48px vertical padding, 14px radius. Use for course home page and module landing pages only. Never use for mid-page sections.

**callout boxes:** 3px left border + light semantic background + 0 radius on left, 8px on right. Always include a `<strong>` label as the first child. Four variants: info, success, warning, danger.

**week-row:** Full-width card with colored left strip (a narrow div with primary background). Three states: complete (muted green strip + complete pill), current (highlighted border + danger pill), upcoming (gray strip + warning pill).

**pill labels:** 11px uppercase, semantic color pair. Do not use for body content — only for status and category tagging.

**footer-bar:** Dark primary-dark (#002277) background, full width, 12px radius, flex layout for text + link.

**navigation bar:** Horizontal flex row of anchor links. Active state: primary background + white text. Inactive: neutral background + dark text. Pill-radius on all buttons.

## Agents

**Hard constraints for Canvas RCE — these are non-negotiable. Violating them produces broken output:**

1. No `<style>` blocks — all CSS must be `style=""` inline attributes
2. No `<script>` tags — no JavaScript of any kind
3. No `box-shadow` — stripped by Canvas sanitizer
4. No `filter`, `transform`, `transition`, `animation`, `opacity` — all stripped
5. No `gap` in flex/grid — use `margin` on children OR use Canvas built-in grid classes
6. No `<h1>` in body HTML — Canvas uses H1 for the page title
7. No `@font-face` or `@import` — declare `Lato, sans-serif` and nothing else
8. No event attributes (`onclick`, `onload`, `onmouseover`, etc.) — all stripped
9. All external image URLs must use `https://`
10. `border-radius` IS allowed — use it on all cards, buttons, and pills

**Preferred layout approach:**
- Multi-column layouts → Canvas built-in `content-box` + `grid-row` + `col-xs-12 col-md-*` classes
- These handle mobile breakpoints automatically — no media query workarounds needed

**Generation checklist (run mentally before outputting any Canvas HTML):**
- [ ] No `<style>` block anywhere in the output
- [ ] No `<script>` tag anywhere in the output
- [ ] No disallowed CSS properties in any `style=""` attribute
- [ ] All headings start at H2 or lower
- [ ] Every `<img>` has an `alt=""` attribute
- [ ] All links have descriptive text (no "click here")
- [ ] Color contrast verified: text on colored backgrounds must meet 4.5:1
- [ ] Flex/grid uses margin instead of gap (or uses Canvas built-in classes)
- [ ] Content wrapped in a max-width div if it's a full page

**Course-specific context:**
- Institution: Boise State University
- Primary courses: ITM 310 (Business Intelligence), ITM 370 (AI Augmented Projects), BusApp 105
- Student audience: Business/IT undergraduate and graduate students
- Canvas theme: Loads Lato font at institutional level
- External add-ons: not required; pages must work as Canvas-safe HTML in the standard editor
