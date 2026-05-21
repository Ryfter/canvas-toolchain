# RCE Limitations and Workarounds

Parent: [Canvas Design Knowledge Base](../README.md)
Related: [RCE Overview](RCE-Overview.md), [HTML Allowlist](HTML-Allowlist.md), [CSS Inline Strategy](CSS-Inline-Strategy.md)

---

## Known Limitations

### 1. No `<style>` Blocks
**Impact:** Cannot define reusable CSS classes in-page.
**Workaround:** All CSS must be inline. Use an inliner tool for complex designs. For institution-wide classes, work with your Canvas admin to add CSS via the Theme Editor. See [CSS Inline Strategy](./CSS-Inline-Strategy.md).

### 2. No `<script>` Tags
**Impact:** No custom JavaScript in RCE content.
**Workaround:**
- Interactive behavior (accordions, tabs) must use HTML/CSS-only techniques
- Complex interactivity requires admin-level JS injection via Theme Editor
- LTI tools can embed interactive iframes

### 3. No `box-shadow`
**Impact:** Cards can't have soft drop shadows.
**Workaround:** Use `border` for visual separation. A subtle `border: 1px solid rgba(0,0,0,0.12)` provides visual card separation without shadows.

### 4. No `gap` in Flex/Grid
**Impact:** Flexbox/grid spacing requires workarounds.
**Workaround Option A (best):** Use Canvas's built-in responsive grid system — no gap needed:
```html
<div class="content-box">
  <div class="grid-row">
    <div class="col-xs-12 col-md-6">Item 1</div>
    <div class="col-xs-12 col-md-6">Item 2</div>
  </div>
</div>
```

**Workaround Option B:** Use `margin` on child elements with flex:
```html
<div style="display: flex; flex-wrap: wrap;">
  <div style="flex: 1; margin: 0 12px 12px 0;">Item</div>
  <div style="flex: 1; margin: 0 12px 12px 0;">Item</div>
</div>
```

See [Canvas Built-In CSS Classes](Canvas-Built-In-CSS-Classes.md) for full grid documentation.

### 5. No Web Fonts via `@font-face` or `@import`
**Impact:** Cannot use custom fonts hosted externally.
**Workaround:**
- Use fonts loaded by the Canvas theme (usually a system font stack)
- Some institutions load Google Fonts at the account level via Theme Editor
- Safe web fonts: `Georgia`, `Times New Roman` (serif); `Arial`, `Helvetica`, `Verdana` (sans-serif)
- Canvas itself uses Lato (loaded via theme) — `font-family: Lato, sans-serif` may work in many instances

### 6. `<h1>` is Not Allowed
**Impact:** Cannot use H1 in page body content.
**Reason:** Canvas reserves H1 for the page title (the "Title" field at the top of every page).
**Workaround:** Use H2 as your top-level heading in content. This is actually correct semantic practice — the page title is H1, content headings should start at H2.

### 7. Iframes Have Limited Attribute Support
**Allowed:** `src`, `width`, `height`, `name`, `align`, `allowfullscreen`
**NOT allowed:** `title` (accessibility concern — report this as a gap), `sandbox`, `loading`
**Workaround:** Add `aria-label` to the iframe via the `aria-label` global attribute for accessibility.

### 8. Content Stripped on API Re-Save
**Impact:** If you programmatically update a page via the Canvas API, the content is sanitized again on save. Any non-compliant HTML may be stripped.
**Workaround:** Always build from compliant HTML. Test after any API operation.

### 9. Canvas Mobile App Rendering
**Impact:** Complex CSS layouts may collapse on mobile.
**Workaround:**
- Use single-column layout as the default
- Test in Canvas mobile app before publishing
- Use `max-width: 100%` on all images
- Avoid `position: absolute` for critical content

### 10. Copy-Paste from Word or External HTML
**Impact:** Pasting from Word introduces non-compliant tags and inline styles that Canvas may partially clean.
**Workaround:** Always paste as plain text first, then add formatting via HTML editor. Never paste formatted Word content directly.

---

## Workaround Patterns

### Accordion Without JavaScript

Canvas strips JS, but the HTML5 `<details>` / `<summary>` elements work natively:

```html
<details style="border: 1px solid #ddd; border-radius: 8px; padding: 12px; margin-bottom: 8px;">
  <summary style="font-weight: bold; cursor: pointer; padding: 4px;">
    Click to expand: Week 3 Topics
  </summary>
  <div style="padding: 12px 0 0;">
    Content inside the accordion...
  </div>
</details>
```

> ⚠️ `<details>` / `<summary>` are not on the official allowlist but typically pass through. Mark as "use with awareness" — could be stripped in future updates.

### Tabs Without JavaScript

True CSS-only tabs require `:checked` pseudo-class on `<input type="radio">`, which Canvas strips. Tabs are not reliably achievable in ordinary Canvas RCE content without account-level JavaScript or an LTI tool.

Alternative: Use a visible horizontal nav bar as visual "tabs" with anchor links to sections on the same page.

```html
<div style="display: flex; border-bottom: 2px solid #0F6E56; margin-bottom: 16px;">
  <a href="#section1" style="padding: 8px 16px; text-decoration: none; color: #0F6E56; font-weight: bold;">Section 1</a>
  <a href="#section2" style="padding: 8px 16px; text-decoration: none; color: #666;">Section 2</a>
</div>
<div id="section1">
  <h2>Section 1 Content</h2>
  ...
</div>
<div id="section2">
  <h2>Section 2 Content</h2>
  ...
</div>
```

### Progress Bar / Status Indicator

```html
<div style="background: #e5e5e5; border-radius: 6px; height: 12px; margin: 8px 0;">
  <div style="background: #0F6E56; width: 65%; height: 12px; border-radius: 6px;"></div>
</div>
<p style="font-size: 12px; color: #666;">Week 9 of 15 — 65% complete</p>
```

---

## When to Escalate to Admin

Consider requesting admin-level CSS/JS injection when you need:
- Consistent institution branding across all courses
- Box shadows, animations, or other stripped properties
- Custom web fonts
- Account-wide navigation or header/footer elements
- JavaScript-powered interactivity (tabs, carousels, etc.)

See [Canvas Theme Editor](../04-tools/Canvas-Theme-Editor.md) for what admins can do.

---

## See Also

- [HTML Allowlist](HTML-Allowlist.md) - what Canvas allows
- [Canvas Built-In CSS Classes](Canvas-Built-In-CSS-Classes.md) - Canvas utility classes that solve several limitations
- [CSS Inline Strategy](CSS-Inline-Strategy.md) - how to write surviving CSS
