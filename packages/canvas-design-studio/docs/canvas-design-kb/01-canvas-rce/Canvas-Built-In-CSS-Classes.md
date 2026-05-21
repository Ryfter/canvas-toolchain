# Canvas Built-In CSS Classes

Parent: [Canvas Design Knowledge Base](../README.md)
Related: [HTML Allowlist](HTML-Allowlist.md), [CSS Inline Strategy](CSS-Inline-Strategy.md), [RCE Limitations and Workarounds](RCE-Limitations-and-Workarounds.md)
>
> **Source:** [HowToCanvas — Page Separations](https://www.howtocanvas.com/create-amazing-pages-in-canvas/page-separations) | [Fleximode Canvas Cheat Sheet](https://fleximode.manukau.ac.nz/cheat-sheet-for-canvas/)
>
> ⚠️ **Important caveat:** These classes are part of Canvas's internal stylesheet and are **not officially documented by Instructure**. They work reliably across most Canvas instances but could theoretically change in a future Canvas update. Test after major Canvas releases.

---

## Why This Matters

The Canvas RCE strips `<style>` blocks and disallows many CSS properties like `box-shadow`, `gap`, and `transition`. But Canvas ships with its own internal stylesheet that exposes **reusable utility classes** you can reference via `class=""` attributes in the RCE HTML.

This means you can use these classes without admin access or Theme Editor changes. They work in ordinary Canvas courses for ordinary instructors.

---

## The Core Utility Classes

### Border Classes

```html
<!-- Simple bordered box with rounded corners -->
<div class="border border-trbl border-round" style="background: #f5f5f5; padding: 15px;">
  Your callout content here
</div>
```

| Class | Effect |
|---|---|
| `border` | Applies a border to the element |
| `border-trbl` | Border on **T**op, **R**ight, **B**ottom, **L**eft (all sides) |
| `border-round` | Rounds the corners of the border |
| `border-t` | Border on top only |
| `border-b` | Border on bottom only |
| `border-l` | Border on left only |
| `border-r` | Border on right only |

**Practical use:** These border classes create the rounded box shape that normally requires `border-radius` (which is allowed but these classes handle it without inline style code):

```html
<div class="border border-trbl border-round" style="padding: 16px; background: #e1f5ee;">
  <strong>Tip:</strong> This callout uses Canvas's built-in border classes.
</div>
```

---

### Content Box and Grid System

Canvas ships with a responsive grid system. This is the **most powerful** built-in class set — it provides true responsive multi-column layouts that adapt to screen width, solving the mobile layout problem without complex inline CSS.

```html
<!-- Two-column responsive layout -->
<div class="content-box">
  <div class="grid-row">
    <div class="col-xs-12 col-md-6">
      Left column content here. Full-width on mobile (xs), half-width on medium+ screens.
    </div>
    <div class="col-xs-12 col-md-6">
      Right column content here.
    </div>
  </div>
</div>
```

```html
<!-- Three-column responsive layout -->
<div class="content-box">
  <div class="grid-row">
    <div class="col-xs-12 col-md-4">Column one</div>
    <div class="col-xs-12 col-md-4">Column two</div>
    <div class="col-xs-12 col-md-4">Column three</div>
  </div>
</div>
```

```html
<!-- Four-column responsive layout -->
<div class="content-box">
  <div class="grid-row">
    <div class="col-xs-12 col-md-3">Column 1</div>
    <div class="col-xs-12 col-md-3">Column 2</div>
    <div class="col-xs-12 col-md-3">Column 3</div>
    <div class="col-xs-12 col-md-3">Column 4</div>
  </div>
</div>
```

**Column width classes:**
- `col-xs-12` = full width on all screens
- `col-md-6` = half width on medium+ screens
- `col-md-4` = one-third width on medium+ screens
- `col-md-3` = one-quarter width on medium+ screens

**Combining with inline styles:**
```html
<div class="content-box">
  <div class="grid-row">
    <div class="col-xs-12 col-md-6">
      <div class="border border-trbl border-round" style="padding: 16px; background: #fff; height: 100%;">
        Card content in a bordered box
      </div>
    </div>
    <div class="col-xs-12 col-md-6">
      <div class="border border-trbl border-round" style="padding: 16px; background: #fff; height: 100%;">
        Second card
      </div>
    </div>
  </div>
</div>
```

---

### Table Classes

Canvas provides pre-styled table classes that produce professional-looking data tables:

```html
<!-- Striped table with hover effect -->
<table class="ic-Table ic-Table--hover-row" style="width: 100%;">
  <thead>
    <tr>
      <th>Column 1</th>
      <th>Column 2</th>
      <th>Column 3</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Data</td>
      <td>Data</td>
      <td>Data</td>
    </tr>
    <tr>
      <td>Data</td>
      <td>Data</td>
      <td>Data</td>
    </tr>
  </tbody>
</table>
```

| Class | Effect |
|---|---|
| `ic-Table` | Base Canvas table styling — adds padding, borders, clean typography |
| `ic-Table--hover-row` | Adds a background highlight when hovering over a row |
| `ic-Table--condensed` | Tighter row padding for compact tables |
| `ic-Table--striped` | Alternating row background colors |

---

### Other Utility Classes

| Class | Effect | Use case |
|---|---|---|
| `pad-box` | Adds padding around content | Quick padding without inline style |
| `pad-box-mini` | Smaller padding variant | Compact contexts |
| `element-invisible` | Visually hides element (still in DOM) | Screen-reader-only content |
| `screenreader-only` | Hides from visual display, visible to screen readers | Accessibility labels |

---

## Combined Example: Section Separator

The original use case from howtocanvas.com — a styled heading separator:

```html
<div class="border border-trbl border-round" style="background: #0F6E56; padding: 10px; text-align: center; color: #ffffff; font-size: large;">
  <strong>Module 3 — AI Automation Tools</strong>
</div>
```

---

## Grid + Cards: The Most Powerful Pattern

Combining the built-in grid with inline-styled cards gives you **responsive multi-column layouts that actually work on mobile without complex CSS math:**

```html
<div class="content-box">
  <div class="grid-row">

    <div class="col-xs-12 col-md-4">
      <div style="border: 1px solid #e0e0d8; border-radius: 10px; padding: 18px; background: #fff; margin-bottom: 14px;">
        <div style="font-size: 24px; margin-bottom: 10px;">🧠</div>
        <h4 style="margin: 0 0 6px; font-size: 14px;">AI Harnesses</h4>
        <p style="font-size: 13px; color: #666; line-height: 1.55; margin: 0;">Design prompt systems and orchestration layers for repeatable tasks.</p>
      </div>
    </div>

    <div class="col-xs-12 col-md-4">
      <div style="border: 1px solid #e0e0d8; border-radius: 10px; padding: 18px; background: #fff; margin-bottom: 14px;">
        <div style="font-size: 24px; margin-bottom: 10px;">🔗</div>
        <h4 style="margin: 0 0 6px; font-size: 14px;">Automation Flows</h4>
        <p style="font-size: 13px; color: #666; line-height: 1.55; margin: 0;">Build n8n and Zapier workflows that connect APIs and trigger actions.</p>
      </div>
    </div>

    <div class="col-xs-12 col-md-4">
      <div style="border: 1px solid #e0e0d8; border-radius: 10px; padding: 18px; background: #fff; margin-bottom: 14px;">
        <div style="font-size: 24px; margin-bottom: 10px;">🚀</div>
        <h4 style="margin: 0 0 6px; font-size: 14px;">Capstone Launch</h4>
        <p style="font-size: 13px; color: #666; line-height: 1.55; margin: 0;">Ship a working AI tool to demonstrate to a real business audience.</p>
      </div>
    </div>

  </div>
</div>
```

**Why this is better than pure flex:** The `col-xs-12 col-md-*` classes handle the breakpoint logic — on a phone, all three columns stack to full width automatically. With pure flex you need `min-width` workarounds.

---

## When to Use Built-In Classes vs. Inline CSS

| Situation | Use |
|---|---|
| Multi-column responsive layout | `content-box` + `grid-row` + `col-*` classes |
| Data table | `ic-Table` + `ic-Table--hover-row` |
| Simple bordered box | `border border-trbl border-round` + inline `style` |
| Hero banner with gradient | Inline `style` only (classes don't provide this) |
| Custom colors | Inline `style` only (classes use Canvas defaults) |
| Callout box with brand color | Mix: `border` class + inline `style` for color |

---

## Canvas Style Guide Reference

Instructure maintains (or maintained) a Canvas Style Guide that documents these classes more formally. The guide was at `canvas.instructure.com/styleguide` but availability varies by institution. It's worth checking `[your-canvas-domain]/styleguide` to see if your instance exposes it.

---

## See Also

- [HTML Allowlist](./HTML-Allowlist.md) — Allowed tags and inline CSS properties
- [CSS Inline Strategy](./CSS-Inline-Strategy.md) — When and how to use inline styles
- [Component Library](../03-design-systems/Component-Library.md) — Full component library mixing classes and inline styles
- [Official Canvas Links](../07-resources/Official-Canvas-Links.md) — HowToCanvas tutorials
