# CSS Inline Strategy for Canvas

> **Parent:** [README](../README.md) | **Related:** [HTML Allowlist](./HTML-Allowlist.md), [RCE Overview](./RCE-Overview.md)

---

## The Core Constraint

Canvas strips `<style>` blocks from the RCE on save. **Every CSS declaration must live in a `style=""` attribute on the element it affects.**

This is non-negotiable at the page level unless your institution has a Canvas admin who can inject global CSS via the Theme Editor (see [Canvas Theme Editor](../04-tools/Canvas-Theme-Editor.md)).

---

## Writing Inline Styles That Survive

### ✅ Reliable Patterns

```html
<!-- Basic block with border and padding -->
<div style="border: 2px solid #0F6E56; padding: 16px; margin-bottom: 16px;">
  Content here
</div>

<!-- Colored background callout -->
<div style="background: #e1f5ee; border-left: 4px solid #0F6E56; padding: 14px 18px;">
  <strong>Tip:</strong> Important note here.
</div>

<!-- Two-column flex layout -->
<div style="display: flex; margin-bottom: 20px;">
  <div style="flex: 1; padding: 12px; border: 1px solid #ddd;">Left column</div>
  <div style="flex: 1; padding: 12px; border: 1px solid #ddd; margin-left: 12px;">Right column</div>
</div>

<!-- Card with border-radius -->
<div style="border: 1px solid #e0e0d8; border-radius: 10px; padding: 18px; margin-bottom: 16px;">
  Card content
</div>

<!-- Styled button link -->
<a href="#" style="display: inline-block; background: #0F6E56; color: #ffffff; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: bold;">
  Button Label
</a>
```

### ❌ Things That Will Be Stripped

```html
<!-- STRIPPED: <style> block -->
<style>
  .my-card { border-radius: 8px; }
</style>

<!-- STRIPPED: box-shadow -->
<div style="box-shadow: 0 2px 8px rgba(0,0,0,0.15);">

<!-- STRIPPED: transform -->
<div style="transform: rotate(3deg);">

<!-- STRIPPED: transition -->
<div style="transition: all 0.3s ease;">

<!-- STRIPPED: gap (use margin instead) -->
<div style="display: flex; gap: 16px;">
```

---

## Color Strategy

Since `opacity` is stripped, use **RGBA colors** for semi-transparent effects:

```html
<!-- Semi-transparent background -->
<div style="background: rgba(15, 110, 86, 0.1); padding: 16px;">

<!-- Border with transparency -->
<div style="border: 1px solid rgba(0,0,0,0.15); padding: 16px;">
```

---

## Flex Layout Without `gap`

Since `gap` isn't reliable, use negative margins on the parent + margins on children:

```html
<!-- Flex grid with spacing -->
<div style="display: flex; flex-wrap: wrap; margin-right: -12px;">
  <div style="flex: 1; min-width: 200px; margin-right: 12px; margin-bottom: 12px; border: 1px solid #ddd; padding: 16px; border-radius: 8px;">
    Item 1
  </div>
  <div style="flex: 1; min-width: 200px; margin-right: 12px; margin-bottom: 12px; border: 1px solid #ddd; padding: 16px; border-radius: 8px;">
    Item 2
  </div>
</div>
```

---

## Using CSS Inliner Tools

For complex layouts built externally (e.g., in a local HTML file with a `<style>` block), use an **inliner tool** to convert all CSS to inline styles before pasting into Canvas:

| Tool | URL | Notes |
|---|---|---|
| Juice (CLI) | https://github.com/Automattic/juice | Best for automation |
| CSS Inliner (web) | https://htmlemail.io/inline/ | Good for one-off use |
| Premailer | https://premailer.dialect.ca/ | Email-focused but works |

**Workflow:**
1. Write HTML with a `<style>` block (readable, maintainable)
2. Run through inliner
3. Paste resulting inline-only HTML into Canvas RCE HTML view
4. Save and verify

---

## Account-Level CSS (Admin Only)

If you have Canvas admin access, you can inject global CSS via:

**Admin → Account → Themes → Upload JS/CSS**

This allows `<style>` classes to work across all courses in the account. Useful for institution-wide design systems.

See [Canvas Theme Editor](../04-tools/Canvas-Theme-Editor.md) for details.

---

## Property Reference Cheat Sheet

| CSS Property | Canvas Allowed? | Notes |
|---|---|---|
| `background` | ✅ | Includes `background-color` shorthand |
| `border` | ✅ | All border shorthand works |
| `border-radius` | ✅ | Works reliably |
| `color` | ✅ | Text color |
| `display` | ✅ | `flex`, `grid`, `block`, `inline-block` all work |
| `flex` | ✅ | Shorthand works; individual flex properties vary |
| `font` | ✅ | Shorthand; `font-size`, `font-weight`, `font-family` all survive |
| `height` / `width` | ✅ | Including `%` and `px` values |
| `margin` / `padding` | ✅ | All variants |
| `max-width` / `min-width` | ✅ | Responsive containment |
| `overflow` | ✅ | Useful for layout containment |
| `position` | ✅ | `relative`, `absolute` work |
| `text-align` | ✅ | |
| `text-decoration` | ✅ | |
| `vertical-align` | ✅ | |
| `z-index` | ✅ | |
| `box-shadow` | ❌ | Stripped |
| `filter` | ❌ | Stripped |
| `transform` | ❌ | Stripped |
| `transition` | ❌ | Stripped |
| `animation` | ❌ | Stripped |
| `opacity` | ❌ | Use `rgba()` colors instead |
| `gap` | ❌ | Use `margin` on children |

---

## See Also

- [HTML Allowlist](./HTML-Allowlist.md) — Master reference for all allowed tags and properties
- [RCE Limitations And Workarounds](./RCE-Limitations-and-Workarounds.md) — Edge cases and institutional escalations
- [Component Library](../03-design-systems/Component-Library.md) — Pre-built components using only allowed CSS
