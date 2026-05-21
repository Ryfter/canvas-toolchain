# Accessibility Overview

Parent: [Canvas Design Knowledge Base](../README.md)
Key reference: [Canvas Course Accessibility Checklist](https://community.instructure.com/en/kb/articles/529364-canvas-course-accessibility-checklist)

## Why Accessibility Matters in Canvas

- Most U.S. institutions are covered by Section 508, ADA, and WCAG expectations.
- Students with visual, motor, cognitive, or learning differences rely on accessible structure.
- Canvas includes a built-in accessibility checker in the Rich Content Editor.
- Canvas Design Studio adds static accessibility checks through `validate_canvas_html`.

## WCAG 2.1 AA Requirements for Canvas Content

### Perceivable

| Requirement | Canvas-specific guidance |
|---|---|
| Alt text for images | Every content image needs descriptive `alt`; decorative images use `alt=""`. |
| Color not sole conveyor | Do not communicate meaning only through color. |
| Contrast ratio | Normal text should meet 4.5:1; large text and UI indicators should meet 3:1. |
| Captions for video | Embedded video should include captions or an accessible transcript. |

### Operable

| Requirement | Canvas-specific guidance |
|---|---|
| Keyboard access | Links and controls must be reachable and usable by keyboard. |
| No flashing content | Avoid flashing or seizure-triggering effects. |
| Clear link text | Link text should describe the destination, not say "click here." |

### Understandable

| Requirement | Canvas-specific guidance |
|---|---|
| Plain language | Match the wording to the student audience and assignment stakes. |
| Consistent navigation | Keep module and page navigation patterns predictable. |
| Error identification | When describing requirements, make missing work and due dates explicit. |

### Robust

| Requirement | Canvas-specific guidance |
|---|---|
| Valid markup | Avoid broken or unclosed tags. |
| Semantic HTML | Use headings, lists, tables, and captions for their intended purpose. |

## Canvas RCE Accessibility Checker

The built-in Canvas accessibility checker flags common issues:

- Missing image alt text
- Heading structure problems
- Basic color contrast problems
- Table header issues
- Non-descriptive link text

Run the Canvas checker before publishing important pages. Also run `validate_canvas_html` so Canvas Design Studio can flag known WCAG and Canvas RCE issues before the content reaches students.

## Heading Hierarchy

Canvas uses the page title as the page-level heading. Content generated for the page body should start at `<h2>`.

```text
Canvas page title
|-- h2 Major section
|   |-- h3 Sub-section
|   `-- h3 Another sub-section
`-- h2 Another major section
```

Do not skip heading levels. For example, do not move directly from `<h2>` to `<h4>`.

## Color Contrast Quick Reference

Minimum WCAG 2.1 AA ratios:

- Normal text: 4.5:1
- Large text: 3:1
- UI components and meaningful icons: 3:1

Recommended tool: [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)

## Common Canvas Accessibility Mistakes

### Decorative image without empty alt

```html
<!-- Wrong -->
<img src="divider.png">

<!-- Correct -->
<img src="divider.png" alt="">
```

### Non-descriptive link text

```html
<!-- Wrong -->
<a href="/modules">Click here</a>

<!-- Correct -->
<a href="/modules">View all course modules</a>
```

### Color as the only meaning

```html
<!-- Wrong -->
<p style="color: red;">Required: Submit by Friday</p>

<!-- Better -->
<p><strong>Required:</strong> <span style="color: #A32D2D;">Submit by Friday</span></p>
```

### Tables used for layout

```html
<!-- Wrong -->
<table><tr><td>Left</td><td>Right</td></tr></table>

<!-- Better -->
<div style="display: flex;">
  <div style="flex: 1;">Left</div>
  <div style="flex: 1; margin-left: 16px;">Right</div>
</div>
```

See also: [HTML Allowlist](../01-canvas-rce/HTML-Allowlist.md), [Component Library](../03-design-systems/Component-Library.md)
