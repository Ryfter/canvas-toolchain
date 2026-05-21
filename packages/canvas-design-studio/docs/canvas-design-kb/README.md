# Canvas Design Knowledge Base

This is the public reference set for creating polished Canvas LMS pages with Canvas-safe HTML, inline CSS, accessibility checks, and reusable course-design patterns.

The KB is intentionally focused on what Canvas Design Studio can generate or validate directly. External examples are included for inspiration, but production guidance should not depend on institution-specific paid add-ons.

## Contents

### Meta
- [KB Overview](00-meta/KB-Overview.md) - organization, update cadence, and maintenance rules
- [Changelog](00-meta/Changelog.md) - notable KB changes
- [Contributing](00-meta/Contributing.md) - how to update notes safely

### Canvas Rich Content Editor
- [RCE Overview](01-canvas-rce/RCE-Overview.md) - how Canvas handles rich content
- [HTML Allowlist](01-canvas-rce/HTML-Allowlist.md) - tags, attributes, and CSS properties Canvas allows
- [Canvas Built-In CSS Classes](01-canvas-rce/Canvas-Built-In-CSS-Classes.md) - grid, borders, tables, and other built-in classes
- [CSS Inline Strategy](01-canvas-rce/CSS-Inline-Strategy.md) - how to keep styling through Canvas sanitization
- [RCE Limitations and Workarounds](01-canvas-rce/RCE-Limitations-and-Workarounds.md) - what Canvas strips and what to do instead
- [Canvas Page Types](01-canvas-rce/Canvas-Page-Types.md) - pages, assignments, discussions, and syllabus differences

### DESIGN.md Specification
- [DESIGN.md Overview](02-design-md/DESIGN-MD-Overview.md) - what DESIGN.md is and why it helps
- [DESIGN.md File Structure](02-design-md/DESIGN-MD-File-Structure.md) - token and prose structure
- [DESIGN.md Canvas Template](02-design-md/DESIGN-MD-Canvas-Template.md) - Canvas-specific starter file
- [DESIGN.md Toolchain](02-design-md/DESIGN-MD-Toolchain.md) - linting, diffing, and export workflow

### Canvas Design Systems
- [Design System Principles](03-design-systems/Design-System-Principles.md) - what makes a course design system usable
- [Color and Typography](03-design-systems/Color-and-Typography.md) - palette, contrast, and font guidance
- [Component Library](03-design-systems/Component-Library.md) - copyable Canvas-safe components

### Tools and Integrations
- [Canvas Theme Editor](04-tools/Canvas-Theme-Editor.md) - admin-level CSS and JavaScript context
- [Other Canvas Design Tools](04-tools/Other-Canvas-Design-Tools.md) - external references and comparison points

### Page Patterns
- [Course Home Page](05-patterns/Course-Home-Page.md) - hero, navigation, welcome, and week-at-a-glance pattern

### Accessibility
- [Accessibility Overview](06-accessibility/Accessibility-Overview.md) - WCAG 2.1 AA guidance for Canvas pages

### External Resources
- [Official Canvas Links](07-resources/Official-Canvas-Links.md) - Instructure docs, Canvas source, and utility links
- [Inspiration and Showcases](07-resources/Inspiration-and-Showcases.md) - real Canvas examples worth studying

## Quick Reference

| Task | Start here |
|---|---|
| Check whether HTML is Canvas-safe | [HTML Allowlist](01-canvas-rce/HTML-Allowlist.md) |
| Use responsive columns without admin access | [Canvas Built-In CSS Classes](01-canvas-rce/Canvas-Built-In-CSS-Classes.md) |
| Create a course design contract | [DESIGN.md Canvas Template](02-design-md/DESIGN-MD-Canvas-Template.md) |
| Build a course home page | [Course Home Page](05-patterns/Course-Home-Page.md) |
| Fix accessibility issues | [Accessibility Overview](06-accessibility/Accessibility-Overview.md) |
| Find real examples | [Inspiration and Showcases](07-resources/Inspiration-and-Showcases.md) |

Last updated: 2026-05-10
