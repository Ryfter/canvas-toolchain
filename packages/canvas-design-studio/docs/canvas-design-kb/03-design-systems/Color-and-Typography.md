# Color and Typography for Canvas

> **Parent:** [README](../README.md) | **Related:** [Design System Principles](./Design-System-Principles.md), [DESIGN.md Canvas Template](../02-design-md/DESIGN-MD-Canvas-Template.md), [Accessibility Overview](../06-accessibility/Accessibility-Overview.md)

---

## Color Strategy

### Institutional Colors First

If your institution has Canvas branding set at the admin level (via Theme Editor), your course colors should align. Common examples:

| Institution | Primary | Secondary |
|---|---|---|
| Boise State University | `#0033A0` (blue) | `#D64309` (orange) |
| University of Utah | `#CC0000` (red) | `#000000` (black) |
| Generic "safe" palette | `#0F6E56` (green) | `#D64309` (amber) |

### Minimum Viable Palette

A Canvas page only needs 4–5 colors:

1. **Primary** — hero banners, active navigation, primary buttons, left-border accents
2. **Primary-light** — callout backgrounds, hover states
3. **Neutral** — page background and nav bar background
4. **Text** — body text (near-black, not pure black)
5. **White** — card backgrounds

Semantic colors (info/warning/danger/success) can use standard palette values rather than custom colors.

### Standard Semantic Color Pairs

These are canvas-tested and WCAG-compliant:

| State | Background | Text/Border |
|---|---|---|
| Info | `#E6F1FB` | `#185FA5` / border: `#185FA5` |
| Success | `#EAF3DE` | `#3B6D11` / border: `#3B6D11` |
| Warning | `#FAEEDA` | `#854F0B` / border: `#854F0B` |
| Danger | `#FCEBEB` | `#A32D2D` / border: `#A32D2D` |

---

## Typography

### What Fonts Are Available in Canvas?

Canvas doesn't let you load custom fonts via `@font-face` or `@import` in the RCE. Available options:

1. **Institution theme font** — Many Canvas instances load Lato, Open Sans, or another custom font via the Theme Editor. Check what your Canvas uses by inspecting the page CSS.

2. **Web-safe fallbacks** — Always work, no theme required:
   - Sans-serif: `Arial, Helvetica, sans-serif` or `Verdana, sans-serif`
   - Serif: `Georgia, 'Times New Roman', serif`
   - Monospace: `'Courier New', monospace`

3. **Lato** — The most common Canvas theme font. `font-family: Lato, sans-serif` works at most institutions.

**Safe declaration for most Canvas instances:**
```css
font-family: Lato, 'Open Sans', Arial, sans-serif;
```

### Type Scale

Use this scale for all Canvas page content (remember: H1 is used by Canvas for the page title):

| Element | Size | Weight | Use |
|---|---|---|---|
| `<h2>` | `1.75rem` | `600` | Major page sections |
| `<h3>` | `1.375rem` | `600` | Sub-sections |
| `<h4>` | `1.125rem` | `600` | Component headers |
| Body `<p>` | `1rem` (16px) | `400` | Standard content |
| Small `<small>`, captions | `0.875rem` (14px) | `400` | Metadata, captions |
| Labels/tags | `0.6875rem` (11px) | `600` | Uppercase pill labels |

**Minimum font size:** 13px. Never go smaller in course content.

### Line Height

- Headings: `line-height: 1.2`
- Body paragraphs: `line-height: 1.65`
- Lists: `line-height: 1.55`

### Font Weight in Canvas

Canvas's inline CSS supports `font-weight` values. Practical values:
- `400` — regular/normal
- `600` — semi-bold (visually bold in Lato)
- `700` — bold (strong emphasis)

---

## Color in Practice

### Background Colors

```html
<!-- Page-level wrapper (neutral bg) -->
<div style="background: #F4F3EF; padding: 24px;">

<!-- Card (white on neutral) -->
<div style="background: #ffffff; border: 1px solid #e0e0d8; border-radius: 10px; padding: 18px;">

<!-- Hero (primary gradient) -->
<div style="background: linear-gradient(135deg, #085041, #1D9E75);">
```

### Text on Colored Backgrounds

Always verify contrast. Use the darkest available shade of a color family for text on light backgrounds:

```html
<!-- Info callout: light blue bg, dark blue text -->
<div style="background: #E6F1FB;">
  <span style="color: #0C447C;">Dark blue text on light blue — passes AA (≈7:1)</span>
</div>

<!-- Warning callout: light amber bg, dark amber text -->
<div style="background: #FAEEDA;">
  <span style="color: #633806;">Dark amber text on light amber — passes AA (≈6:1)</span>
</div>
```

### Links

Default Canvas link styles may override your inline link colors. For clearly styled links use:

```html
<a href="#" style="color: #0F6E56; font-weight: 500; text-decoration: underline;">Link text</a>
```

Or for button-style links, `text-decoration: none` with a background:

```html
<a href="#" style="display: inline-block; background: #0F6E56; color: #ffffff; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: 600;">Button link</a>
```

---

## See Also

- [DESIGN.md Canvas Template](../02-design-md/DESIGN-MD-Canvas-Template.md) — Color and typography tokens
- [Accessibility Overview](../06-accessibility/Accessibility-Overview.md) — WCAG contrast requirements
- [Component Library](./Component-Library.md) — Components using these values
- [Official Canvas Links](../07-resources/Official-Canvas-Links.md) — Color and font tools
