# KB Overview

Parent: [Canvas Design Knowledge Base](../README.md)

This knowledge base is structured around three concerns:

1. Canvas constraints: what HTML and CSS survive inside the Canvas Rich Content Editor.
2. Design systems: how to define a consistent visual language for a course.
3. Patterns and examples: reusable Canvas-safe components plus real course examples for inspiration.

## Folder Structure

```text
canvas-design-kb/
|-- README.md                  # Top-level map
|-- 00-meta/                   # KB management
|-- 01-canvas-rce/             # How Canvas handles HTML/CSS
|-- 02-design-md/              # DESIGN.md specification notes
|-- 03-design-systems/         # Design system principles and components
|-- 04-tools/                  # Canvas admin/tooling context
|-- 05-patterns/               # Page and component templates
|-- 06-accessibility/          # WCAG and inclusive design
`-- 07-resources/              # External links and references
```

## Update Cadence

| Area | When to review |
|---|---|
| HTML allowlist | When Canvas releases a major update |
| DESIGN.md spec | Monthly while the spec is evolving |
| Patterns and templates | Whenever a reusable page pattern is added |
| Accessibility | When WCAG or institutional guidance changes |
| External links | Before each public release |

## How to Use in Canvas Design Studio

1. Use [DESIGN.md Canvas Template](../02-design-md/DESIGN-MD-Canvas-Template.md) as the course design contract.
2. Treat [HTML Allowlist](../01-canvas-rce/HTML-Allowlist.md) and [CSS Inline Strategy](../01-canvas-rce/CSS-Inline-Strategy.md) as hard constraints.
3. Pull reusable snippets from [Component Library](../03-design-systems/Component-Library.md).
4. Use [Course Home Page](../05-patterns/Course-Home-Page.md) as the first page-level pattern.
5. Validate final HTML with [Accessibility Overview](../06-accessibility/Accessibility-Overview.md) and the `validate_canvas_html` MCP tool.

## Key Decisions

- Canvas strips `<style>` tags from content, so generated page CSS must be inline.
- Canvas reserves `<h1>` for the page title, so generated content starts at `<h2>`.
- The beginner workflow remains first-class: generate Canvas-safe HTML, then paste it manually into Canvas.
- Optional Canvas API publishing is a convenience, not a requirement.

See also: [Changelog](Changelog.md), [Contributing](Contributing.md)
